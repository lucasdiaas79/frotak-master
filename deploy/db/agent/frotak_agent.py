#!/usr/bin/env python3
"""Agente provisionador da VPS de banco.

E o unico com acesso de administrador ao Postgres. Cria o banco de cada cliente, migra, roda os
disparos agendados e apaga. Escuta so no IP da WireGuard e exige token. Nunca registra segredo.

    frotak_agent.py serve         API para o Master e o TMS
    frotak_agent.py render-kong   regenera as rotas do portao
    frotak_agent.py migrate       aplica migrations no modelo, no Central e em cada cliente
    frotak_agent.py restore-client CLIENTE PASTA_DO_BACKUP CLIENTE
                                  restaura um cliente; repetir o nome confirma a substituicao
"""
import base64
import concurrent.futures
import contextlib
import datetime
import hashlib
import hmac
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ETC = Path("/etc/frotak")
CLIENTS_DIR = ETC / "clients"
KONG_DIR = ETC / "kong"
STORAGE_ROOT = Path("/var/lib/frotak/clients")
# A sentinela nao mexe nos servicos de um cliente marcado aqui.
MAINTENANCE_DIR = Path("/run/frotak/maintenance")
DEPLOY_DB = Path(__file__).resolve().parent.parent
MIGRATIONS = Path("/opt/frotak/supabase/migrations")

CENTRAL_DB = "frotak_central"
TEMPLATE_DB = "frotak_template"
JOBS_DB = "frotak_jobs"
PORT = 9100

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")
RESERVED_SLUGS = {
    "admin", "api", "app", "auth", "central", "db", "ftp", "jobs", "kong", "login", "mail",
    "master", "postgres", "realtime", "rest", "storage", "template", "www",
}
MODULE_CODE_RE = re.compile(r"^[a-z_]{2,40}$")

provision_lock = threading.RLock()


@contextlib.contextmanager
def maintenance(slug):
    """Avisa a sentinela: os servicos deste cliente vao parar de proposito."""
    MAINTENANCE_DIR.mkdir(parents=True, exist_ok=True)
    marker = MAINTENANCE_DIR / slug
    marker.touch()
    try:
        yield
    finally:
        marker.unlink(missing_ok=True)


class AgentError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def log(message):
    print(f"[agente] {message}", flush=True)


def scrub(text):
    return re.sub(r"(?i)(password\s+)'[^']*'", r"\1'***'", str(text or ""))[-600:]


def read_env(path):
    values = {}
    if not Path(path).exists():
        return values
    for line in Path(path).read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def settings():
    return {**read_env(ETC / "hosts.env"), **read_env(ETC / "db.env"), **read_env(ETC / "agent.env")}


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def psql(database, statement, user="supabase_admin"):
    cmd = [
        "docker", "exec", "-i", "frotak-db", "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1",
        "-U", user, "-h", "127.0.0.1", "-d", database,
    ]
    result = subprocess.run(cmd, input=statement, text=True, capture_output=True, timeout=300)
    if result.returncode != 0:
        raise AgentError(500, "SQL_FAILED", f"SQL falhou em {database}: {scrub(result.stderr)}")
    return result.stdout.strip()


def jwt(secret, role):
    def b64(raw):
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    def part(value):
        return b64(json.dumps(value, separators=(",", ":")).encode())

    now = int(time.time())
    head = part({"alg": "HS256", "typ": "JWT"})
    body = part({"role": role, "iss": "supabase", "iat": now, "exp": now + 10 * 365 * 86400})
    signature = hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
    return f"{head}.{body}.{b64(signature)}"


# ---------------------------------------------------------------- clientes


def names_for(slug):
    base = "frotak_" + slug.replace("-", "_")
    return {
        "db": base,
        "auth": f"{base}_auth",
        "rest": f"{base}_rest",
        "storage": f"{base}_storage",
    }


def validate_slug(slug):
    if not isinstance(slug, str) or not SLUG_RE.match(slug) or slug in RESERVED_SLUGS:
        raise AgentError(400, "INVALID_SLUG", "Endereço de cliente inválido ou reservado.")
    return slug


def env_path(slug):
    return CLIENTS_DIR / f"{slug}.env"


def meta_path(slug):
    return CLIENTS_DIR / f"{slug}.json"


def client_slugs():
    if not CLIENTS_DIR.exists():
        return []
    return sorted(path.stem for path in CLIENTS_DIR.glob("*.env"))


def client_env(slug):
    validate_slug(slug)
    if not env_path(slug).exists():
        raise AgentError(404, "CLIENT_NOT_FOUND", "Cliente não encontrado.")
    return read_env(env_path(slug))


def client_meta(slug):
    path = meta_path(slug)
    return json.loads(path.read_text()) if path.exists() else {}


def write_private(path, text):
    temporary = Path(f"{path}.tmp")
    temporary.touch(mode=0o600)
    temporary.write_text(text)
    os.replace(temporary, path)


def compose(slug, *args, env_file=None):
    cmd = [
        "docker", "compose", "-p", f"frotak-c-{slug}", "-f", str(DEPLOY_DB / "client.compose.yml"),
        "--env-file", str(env_file or env_path(slug)), *args,
    ]
    result = subprocess.run(cmd, text=True, capture_output=True, timeout=420)
    if result.returncode != 0:
        raise AgentError(500, "COMPOSE_FAILED", f"Serviços de {slug}: {scrub(result.stderr)}")


def api(slug, method, path, body=None, timeout=30):
    env = client_env(slug)
    cfg = settings()
    url = f"http://{cfg['WG_DB']}:8000/c/{slug}{path}"
    key = env["SERVICE_ROLE_KEY"]
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        url,
        method=method,
        data=data,
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode(errors="replace")
        try:
            return error.code, json.loads(raw)
        except ValueError:
            return error.code, raw[:300]


def wait_for_api(slug, seconds=90):
    deadline = time.time() + seconds
    last = None
    while time.time() < deadline:
        try:
            status, _ = api(slug, "GET", "/auth/v1/health", timeout=5)
            last = status
            if status == 200:
                return
        except (urllib.error.URLError, OSError) as error:
            last = str(error)
        time.sleep(1.5)
    raise AgentError(500, "API_TIMEOUT", f"API de {slug} não respondeu: {last}")


def realtime_request(method, path, body=None):
    cfg = settings()
    cmd = [
        "docker", "exec", "-i", "realtime-dev.supabase-realtime", "curl", "-sS", "-m", "60",
        "-o", "-", "-w", "\n%{http_code}", "-X", method,
        "-H", f"Authorization: Bearer {cfg['SERVICE_ROLE_KEY']}",
        "-H", "Content-Type: application/json",
        f"http://127.0.0.1:4000{path}",
    ]
    if body is not None:
        cmd += ["--data-binary", "@-"]
    result = subprocess.run(
        cmd,
        input=None if body is None else json.dumps(body),
        text=True,
        capture_output=True,
        timeout=90,
    )
    if result.returncode != 0:
        raise AgentError(500, "REALTIME_FAILED", f"Realtime: {scrub(result.stderr)}")
    output, _, code = result.stdout.rpartition("\n")
    return int(code or 0), output


def register_realtime(slug):
    cfg = settings()
    env = client_env(slug)
    names = names_for(slug)
    status, output = realtime_request(
        "POST",
        "/api/tenants",
        {
            "tenant": {
                "name": slug,
                "external_id": slug,
                "jwt_secret": env["JWT_SECRET"],
                "extensions": [
                    {
                        "type": "postgres_cdc_rls",
                        "settings": {
                            "db_name": names["db"],
                            "db_host": "frotak-db",
                            "db_user": "supabase_admin",
                            "db_password": cfg["POSTGRES_PASSWORD"],
                            "db_port": "5432",
                            "region": "us-east-1",
                            "poll_interval_ms": 100,
                            "poll_max_record_bytes": 1048576,
                            "ssl_enforced": False,
                            # Slot de replicacao tem nome unico no servidor inteiro.
                            "slot_name": f"frotak_rt_{slug.replace('-', '_')}",
                        },
                    }
                ],
            }
        },
    )
    if status >= 300:
        raise AgentError(500, "REALTIME_FAILED", f"Realtime recusou {slug}: HTTP {status} {scrub(output)}")


# ---------------------------------------------------------------- portao (Kong)


def api_services(label, prefix, hosts, groups):
    acl = {"name": "acl", "config": {"hide_groups_header": True, "allow": groups}}
    cors = {"name": "cors"}

    def route(name, *paths):
        return [{"name": f"{label}-{name}", "strip_path": True, "paths": [prefix + p for p in paths]}]

    def key_auth(hide):
        return {"name": "key-auth", "config": {"hide_credentials": hide}}

    auth = f"http://{hosts['auth']}:9999"
    realtime = {"host": hosts["realtime"], "port": 4000}

    services = [
        {"name": f"{label}-auth-verify", "url": f"{auth}/verify", "routes": route("auth-verify", "/auth/v1/verify"), "plugins": [cors]},
        {"name": f"{label}-auth-callback", "url": f"{auth}/callback", "routes": route("auth-callback", "/auth/v1/callback"), "plugins": [cors]},
        {"name": f"{label}-auth-authorize", "url": f"{auth}/authorize", "routes": route("auth-authorize", "/auth/v1/authorize"), "plugins": [cors]},
        {"name": f"{label}-auth", "url": f"{auth}/", "routes": route("auth", "/auth/v1/"), "plugins": [cors, key_auth(False), acl]},
        {"name": f"{label}-rest", "url": f"http://{hosts['rest']}:3000/", "routes": route("rest", "/rest/v1/"), "plugins": [cors, key_auth(True), acl]},
        # O Kong 2.8 nao tem protocolo "ws": servico http repassa o upgrade do WebSocket.
        {"name": f"{label}-realtime-ws", "protocol": "http", **realtime, "path": "/socket", "routes": route("realtime-ws", "/realtime/v1/"), "plugins": [cors, key_auth(False), acl]},
        # Administracao interna do Realtime nunca sai pelo portao.
        {
            "name": f"{label}-realtime-internal",
            "protocol": "http",
            **realtime,
            "path": "/api/tenants",
            "routes": route("realtime-internal", "/realtime/v1/api/tenants", "/realtime/v1/api/openapi"),
            "plugins": [{"name": "request-termination", "config": {"status_code": 403, "message": "Access is forbidden."}}],
        },
        {"name": f"{label}-realtime-rest", "protocol": "http", **realtime, "path": "/api", "routes": route("realtime-rest", "/realtime/v1/api"), "plugins": [cors, key_auth(False), acl]},
        # O Storage confere o JWT sozinho, como no compose oficial.
        {"name": f"{label}-storage", "url": f"http://{hosts['storage']}:5000/", "routes": route("storage", "/storage/v1/"), "plugins": [cors]},
    ]
    return services


def render_kong():
    cfg = settings()
    REALTIME_HOST = "realtime-dev.supabase-realtime"
    config = {
        "_format_version": "2.1",
        "_transform": True,
        "consumers": [
            {"username": "anon", "keyauth_credentials": [{"key": cfg["ANON_KEY"]}]},
            {"username": "service_role", "keyauth_credentials": [{"key": cfg["SERVICE_ROLE_KEY"]}]},
        ],
        "acls": [
            {"consumer": "anon", "group": "anon"},
            {"consumer": "service_role", "group": "admin"},
        ],
        "upstreams": [],
        "services": api_services(
            "central",
            "",
            {"auth": "frotak-auth", "rest": "frotak-rest", "storage": "frotak-storage", "realtime": REALTIME_HOST},
            ["admin", "anon"],
        ),
    }
    for slug in client_slugs():
        env = read_env(env_path(slug))
        upstream = f"rt-{slug}"
        # O Realtime descobre o cliente pelo primeiro pedaco do Host.
        config["upstreams"].append(
            {
                "name": upstream,
                "host_header": f"{slug}.realtime",
                "targets": [{"target": f"{REALTIME_HOST}:4000"}],
            }
        )
        config["consumers"] += [
            {"username": f"anon-{slug}", "keyauth_credentials": [{"key": env["ANON_KEY"]}]},
            {"username": f"service-{slug}", "keyauth_credentials": [{"key": env["SERVICE_ROLE_KEY"]}]},
        ]
        config["acls"] += [
            {"consumer": f"anon-{slug}", "group": f"anon-{slug}"},
            {"consumer": f"service-{slug}", "group": f"admin-{slug}"},
        ]
        config["services"] += api_services(
            f"c-{slug}",
            f"/c/{slug}",
            {
                "auth": f"frotak-{slug}-auth",
                "rest": f"frotak-{slug}-rest",
                "storage": f"frotak-{slug}-storage",
                "realtime": upstream,
            },
            [f"admin-{slug}", f"anon-{slug}"],
        )
    KONG_DIR.mkdir(parents=True, exist_ok=True)
    temporary = KONG_DIR / "kong.json.tmp"
    temporary.write_text(json.dumps(config))
    temporary.chmod(0o644)
    os.replace(temporary, KONG_DIR / "kong.json")
    running = subprocess.run(
        ["docker", "ps", "-q", "--filter", "name=^frotak-kong$", "--filter", "status=running"],
        text=True,
        capture_output=True,
    )
    if running.stdout.strip():
        result = subprocess.run(
            ["docker", "exec", "frotak-kong", "kong", "reload"], text=True, capture_output=True, timeout=120
        )
        if result.returncode != 0:
            raise AgentError(500, "KONG_FAILED", f"Portão: {scrub(result.stderr)}")


# ---------------------------------------------------------------- criar e apagar


def create_database(slug, env):
    names = names_for(slug)
    psql("postgres", f'CREATE DATABASE "{names["db"]}" TEMPLATE {TEMPLATE_DB} OWNER postgres;')
    psql(
        "postgres",
        f"""
        REVOKE CONNECT ON DATABASE "{names['db']}" FROM PUBLIC;

        CREATE ROLE "{names['auth']}" LOGIN PASSWORD {literal(env['AUTH_DB_PASSWORD'])};
        GRANT supabase_auth_admin TO "{names['auth']}";
        ALTER ROLE "{names['auth']}" SET role = 'supabase_auth_admin';
        ALTER ROLE "{names['auth']}" SET search_path = 'auth';
        ALTER ROLE "{names['auth']}" SET idle_in_transaction_session_timeout = '60s';

        CREATE ROLE "{names['rest']}" LOGIN NOINHERIT PASSWORD {literal(env['REST_DB_PASSWORD'])};
        GRANT anon, authenticated, service_role TO "{names['rest']}";
        ALTER ROLE "{names['rest']}" SET session_preload_libraries = supautils, safeupdate;
        ALTER ROLE "{names['rest']}" SET statement_timeout = '8s';
        ALTER ROLE "{names['rest']}" SET lock_timeout = '8s';

        CREATE ROLE "{names['storage']}" LOGIN PASSWORD {literal(env['STORAGE_DB_PASSWORD'])};
        GRANT supabase_storage_admin TO "{names['storage']}";
        ALTER ROLE "{names['storage']}" SET role = 'supabase_storage_admin';
        ALTER ROLE "{names['storage']}" SET search_path = 'storage';
        """,
    )
    grant_connect(slug)


def grant_connect(slug):
    names = names_for(slug)
    psql(
        "postgres",
        f"""GRANT CONNECT ON DATABASE "{names['db']}" TO "{names['auth']}", "{names['rest']}",
        "{names['storage']}", postgres, pgbouncer, supabase_admin;
        GRANT CREATE ON DATABASE "{names['db']}" TO supabase_storage_admin;""",
    )


def schedule_jobs(slug):
    names = names_for(slug)
    jobs = [
        ("financial-recurring", "15 3 * * *", "select public.run_financial_recurring_cron(current_date);"),
        ("financial-integrations", "*/5 * * * *", "select private.run_financial_integration_reconciliation(200);"),
        ("positions-retention", "7 * * * *", "select public.purge_old_vehicle_positions(interval '24 hours');"),
    ]
    for name, schedule, command in jobs:
        psql(
            JOBS_DB,
            f"select cron.schedule_in_database({literal(f'{slug}:{name}')}, {literal(schedule)}, "
            f"{literal(command)}, {literal(names['db'])}, 'postgres');",
        )


def unschedule_jobs(slug):
    psql(
        JOBS_DB,
        f"select cron.unschedule(jobid) from cron.job where jobname like {literal(slug + ':%')};",
    )


def drop_client_database(database):
    # O Realtime mantem slots de replicacao ativos, e banco com slot ativo nao pode ser apagado.
    # Quem chama ja tirou o cliente do Realtime; ele so pode demorar um pouco a soltar.
    for attempt in range(10):
        psql(
            "postgres",
            "select pg_terminate_backend(active_pid) from pg_replication_slots "
            f"where database = {literal(database)} and active_pid is not null;",
        )
        time.sleep(1)
        try:
            psql(
                "postgres",
                "select pg_drop_replication_slot(slot_name) from pg_replication_slots "
                f"where database = {literal(database)};",
            )
            psql("postgres", f'DROP DATABASE IF EXISTS "{database}" WITH (FORCE);')
            return
        except AgentError:
            if attempt == 9:
                raise
            time.sleep(2)


def create_auth_user(slug, email, password, metadata):
    status, user = api(
        slug,
        "POST",
        "/auth/v1/admin/users",
        {"email": email, "password": password, "email_confirm": True, "user_metadata": metadata},
    )
    if status != 200 or not isinstance(user, dict) or not user.get("id"):
        detail = user.get("msg") if isinstance(user, dict) else user
        if isinstance(detail, str) and "password" in detail.lower():
            raise AgentError(400, "WEAK_PASSWORD", "A senha temporária não atende às regras atuais.")
        raise AgentError(500, "AUTH_FAILED", f"Auth de {slug} recusou o usuário: HTTP {status} {scrub(detail)}")
    return user["id"]


def create_client(payload):
    slug = validate_slug(payload.get("slug"))
    required = ["legalName", "ownerName", "ownerEmail", "ownerPassword"]
    missing = [field for field in required if not payload.get(field)]
    if missing:
        raise AgentError(400, "INVALID_INPUT", "Dados incompletos: " + ", ".join(missing))

    cfg = settings()
    names = names_for(slug)
    with provision_lock, maintenance(slug):
        if env_path(slug).exists():
            raise AgentError(409, "CLIENT_EXISTS", "Já existe um banco para este cliente.")
        started = time.time()
        log(f"criando {slug}")
        CLIENTS_DIR.mkdir(parents=True, exist_ok=True)
        storage_dir = STORAGE_ROOT / slug / "storage"
        secret = secrets.token_hex(32)
        env = {
            "CLIENT_SLUG": slug,
            "CLIENT_DB": names["db"],
            "API_HOST": cfg["API_HOST"],
            "CLIENT_BASE_DOMAIN": cfg["CLIENT_BASE_DOMAIN"],
            "JWT_SECRET": secret,
            "ANON_KEY": jwt(secret, "anon"),
            "SERVICE_ROLE_KEY": jwt(secret, "service_role"),
            "AUTH_DB_USER": names["auth"],
            "AUTH_DB_PASSWORD": secrets.token_hex(24),
            "REST_DB_USER": names["rest"],
            "REST_DB_PASSWORD": secrets.token_hex(24),
            "STORAGE_DB_USER": names["storage"],
            "STORAGE_DB_PASSWORD": secrets.token_hex(24),
            "CLIENT_STORAGE_DIR": str(storage_dir),
        }
        try:
            write_private(env_path(slug), "".join(f"{k}={v}\n" for k, v in env.items()))
            storage_dir.mkdir(parents=True, mode=0o700, exist_ok=True)
            create_database(slug, env)
            compose(slug, "up", "-d", "--wait", "--wait-timeout", "240")
            register_realtime(slug)
            render_kong()
            wait_for_api(slug)

            # Autor dos comandos do Central neste banco. Sem 2FA nem senha conhecida, nao entra.
            system_user = create_auth_user(
                slug, "agente@frotak.internal", secrets.token_urlsafe(32), {"system": True}
            )
            psql(
                names["db"],
                "insert into public.platform_users (user_id, platform_role, active) "
                f"values ({literal(system_user)}::uuid, 'operations', true);",
            )
            owner = create_auth_user(
                slug,
                str(payload["ownerEmail"]).strip().lower(),
                str(payload["ownerPassword"]),
                {"full_name": payload["ownerName"], "must_change_password": True},
            )
            now = datetime.datetime.now(datetime.timezone.utc)
            ends = payload.get("endsAt") or (now + datetime.timedelta(days=31)).isoformat()
            status, rows = api(
                slug,
                "POST",
                "/rest/v1/rpc/provision_tenant",
                {
                    "p_owner_user_id": owner,
                    "p_owner_full_name": payload["ownerName"],
                    "p_legal_name": payload["legalName"],
                    "p_trade_name": payload.get("tradeName") or None,
                    "p_cnpj": payload.get("cnpj") or None,
                    "p_tenant_slug": slug,
                    "p_workspace_name": payload.get("workspaceName") or payload["legalName"],
                    "p_workspace_slug": slug,
                    "p_plan_code": payload.get("planCode") or "BASIC",
                    "p_starts_at": payload.get("startsAt") or now.isoformat(),
                    "p_ends_at": ends,
                    "p_subscription_period": payload.get("subscriptionPeriod") or "Mensal",
                    "p_max_vehicles": int(payload.get("maxVehicles") or 1),
                    "p_enabled_module_codes": payload.get("modules") or [],
                    "p_actor_user_id": system_user,
                },
            )
            if status >= 300:
                raise AgentError(500, "PROVISION_FAILED", f"provision_tenant: HTTP {status} {scrub(rows)}")
            row = rows[0] if isinstance(rows, list) else rows
            meta = {
                "name": payload.get("tradeName") or payload["legalName"],
                "tenantId": row["tenant_id"],
                "workspaceId": row["workspace_id"],
                "systemUserId": system_user,
                "ownerEmail": str(payload["ownerEmail"]).strip().lower(),
                "createdAt": now.isoformat(),
            }
            write_private(meta_path(slug), json.dumps(meta))

            for product in payload.get("products") or []:
                if product != "tms":
                    set_entitlement(slug, {"kind": "product", "code": product, "enabled": True})
            schedule_jobs(slug)
        except Exception as error:
            log(f"falha ao criar {slug}: {scrub(error)}; desfazendo")
            try:
                remove_client(slug)
            except Exception as cleanup_error:
                log(f"falha ao desfazer {slug}: {scrub(cleanup_error)}")
            raise
        log(f"{slug} criado em {time.time() - started:.0f}s")
        return {
            "slug": slug,
            "tenantId": meta["tenantId"],
            "workspaceId": meta["workspaceId"],
            "databaseName": names["db"],
            "clientUrl": f"https://{slug}.{cfg['CLIENT_BASE_DOMAIN']}",
        }


def remove_client(slug):
    validate_slug(slug)
    names = names_for(slug)
    with provision_lock, maintenance(slug):
        log(f"apagando {slug}")
        if env_path(slug).exists():
            try:
                compose(slug, "down", "-v", "--remove-orphans")
            except AgentError as error:
                log(f"servicos de {slug}: {scrub(error)}")
        try:
            realtime_request("DELETE", f"/api/tenants/{slug}")
        except AgentError as error:
            log(f"realtime de {slug}: {scrub(error)}")
        try:
            unschedule_jobs(slug)
        except AgentError as error:
            log(f"agendamentos de {slug}: {scrub(error)}")
        drop_client_database(names["db"])
        for key in ("auth", "rest", "storage"):
            psql("postgres", f'DROP ROLE IF EXISTS "{names[key]}";')
        env_path(slug).unlink(missing_ok=True)
        meta_path(slug).unlink(missing_ok=True)
        subprocess.run(["rm", "-rf", "--", str(STORAGE_ROOT / slug)], check=False)
        render_kong()


# ---------------------------------------------------------------- operacao


def connection(slug):
    env = client_env(slug)
    cfg = settings()
    meta = client_meta(slug)
    if not meta:
        raise AgentError(404, "CLIENT_NOT_READY", "Cliente em provisionamento.")
    return {
        "slug": slug,
        "name": meta.get("name"),
        "tenantId": meta.get("tenantId"),
        "workspaceId": meta.get("workspaceId"),
        "internalUrl": f"http://{cfg['WG_DB']}:8000/c/{slug}",
        "publicUrl": f"https://{cfg['API_HOST']}/c/{slug}",
        "anonKey": env["ANON_KEY"],
        "serviceRoleKey": env["SERVICE_ROLE_KEY"],
    }


def set_entitlement(slug, payload):
    client_env(slug)
    meta = client_meta(slug)
    code = str(payload.get("code") or "")
    if not MODULE_CODE_RE.match(code) or not isinstance(payload.get("enabled"), bool):
        raise AgentError(400, "INVALID_INPUT", "Liberação inválida.")
    function = {"module": "master_set_tenant_module", "product": "master_set_tenant_product"}.get(payload.get("kind"))
    if not function:
        raise AgentError(400, "INVALID_INPUT", "Liberação inválida.")
    enabled = "true" if payload["enabled"] else "false"
    psql(
        names_for(slug)["db"],
        f"select public.{function}({literal(meta['tenantId'])}::uuid, {literal(code)}, "
        f"{enabled}, {literal(meta['systemUserId'])}::uuid);",
    )
    return {"ok": True}


def set_status(slug, payload):
    client_env(slug)
    meta = client_meta(slug)
    status = payload.get("status")
    if status not in ("active", "trial", "suspended", "cancelled"):
        raise AgentError(400, "INVALID_INPUT", "Situação inválida.")
    psql(
        names_for(slug)["db"],
        f"update public.tenants set status = {literal(status)} where id = {literal(meta['tenantId'])}::uuid;",
    )
    return {"ok": True}


OWNER_SQL = """
select json_build_object(
  'userId', m.user_id,
  'email', p.email
)
from public.workspace_memberships m
join public.profiles p on p.id = m.user_id
where m.is_owner and m.status = 'active'
order by m.created_at
limit 1;
"""


def owner_of(slug):
    client_env(slug)
    raw = psql(names_for(slug)["db"], OWNER_SQL)
    return json.loads(raw) if raw else None


def support_login(slug):
    cfg = settings()
    owner = owner_of(slug)
    if not owner or not owner.get("email"):
        raise AgentError(404, "OWNER_NOT_FOUND", "Este cliente não tem um administrador ativo para acessar.")
    status, link = api(slug, "POST", "/auth/v1/admin/generate_link", {"type": "magiclink", "email": owner["email"]})
    token = link.get("hashed_token") if isinstance(link, dict) else None
    if status >= 300 or not token:
        raise AgentError(500, "AUTH_FAILED", f"Auth de {slug} não gerou a credencial: HTTP {status}")
    return {
        "tokenHash": token,
        "userId": owner["userId"],
        "email": owner["email"],
        "clientName": client_meta(slug).get("name"),
        "clientUrl": f"https://{slug}.{cfg['CLIENT_BASE_DOMAIN']}",
    }


USAGE_SQL = """
select json_build_object(
  'usage', (select row_to_json(u) from public.master_tenant_usage() u limit 1),
  'users', (select count(*) from public.workspace_memberships where status = 'active'),
  'ownerEmail', (
    select p.email
    from public.workspace_memberships m
    join public.profiles p on p.id = m.user_id
    where m.is_owner and m.status = 'active'
    order by m.created_at
    limit 1
  )
);
"""

usage_cache = {"at": 0.0, "value": None}
usage_lock = threading.Lock()


def usage_of(slug):
    try:
        return slug, json.loads(psql(names_for(slug)["db"], USAGE_SQL))
    except (AgentError, ValueError) as error:
        log(f"uso de {slug}: {scrub(error)}")
        return slug, None


def usage_all():
    with usage_lock:
        if usage_cache["value"] is not None and time.time() - usage_cache["at"] < 30:
            return usage_cache["value"]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        value = dict(pool.map(usage_of, client_slugs()))
    with usage_lock:
        usage_cache.update(at=time.time(), value=value)
    return value


def restore_client(slug, backup_dir):
    """Substitui so este cliente pelo backup. Os outros bancos nao sao tocados."""
    env = client_env(slug)
    names = names_for(slug)
    backup = Path(backup_dir)
    dump = backup / "clients" / f"{slug}.dump"
    files = backup / "clients" / f"{slug}.storage.tar.gz"
    if not dump.exists():
        raise AgentError(404, "BACKUP_NOT_FOUND", f"Backup de {slug} nao encontrado em {backup}.")
    check = subprocess.run(
        ["sha256sum", "-c", "--quiet", "--ignore-missing", "SHA256SUMS"], cwd=backup, text=True, capture_output=True
    )
    if check.returncode != 0:
        raise AgentError(500, "BACKUP_CORRUPT", f"Backup corrompido: {scrub(check.stderr or check.stdout)}")

    with provision_lock, maintenance(slug):
        compose(slug, "stop")
        realtime_request("DELETE", f"/api/tenants/{slug}")
        try:
            drop_client_database(names["db"])
            psql("postgres", f'CREATE DATABASE "{names["db"]}" TEMPLATE template0 OWNER postgres;')
            with open(dump, "rb") as source:
                # Avisos sobre objetos do proprio Supabase sao esperados; quem decide e a conferencia.
                restored = subprocess.run(
                    ["docker", "exec", "-i", "frotak-db", "pg_restore", "-U", "supabase_admin", "-h", "127.0.0.1",
                     "-d", names["db"], "--no-comments"],
                    stdin=source,
                    capture_output=True,
                    text=True,
                    timeout=1800,
                )
            warnings = restored.stderr.count("pg_restore: error")
            psql("postgres", f'REVOKE CONNECT ON DATABASE "{names["db"]}" FROM PUBLIC;')
            grant_connect(slug)
            if files.exists():
                storage_dir = Path(env["CLIENT_STORAGE_DIR"])
                subprocess.run(["rm", "-rf", "--", str(storage_dir)], check=True)
                storage_dir.mkdir(parents=True, mode=0o700)
                subprocess.run(["tar", "-xzf", str(files), "-C", str(storage_dir)], check=True)
        finally:
            # Falhe o que falhar, o cliente nao fica sem os servicos.
            compose(slug, "up", "-d", "--wait", "--wait-timeout", "180")
            register_realtime(slug)
        wait_for_api(slug)
    counts = psql(
        names["db"],
        "select (select count(*) from auth.users) || ' usuarios, ' || "
        "(select count(*) from public.vehicles) || ' veiculos';",
    )
    return {"warnings": warnings, "counts": counts}


def run_migrations(database):
    result = subprocess.run(
        [str(DEPLOY_DB / "migrate.sh"), str(MIGRATIONS), database], text=True, capture_output=True, timeout=900
    )
    if result.returncode != 0:
        raise AgentError(500, "MIGRATE_FAILED", f"Migrations em {database}: {scrub(result.stderr)}")
    return result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ""


def migrate_all():
    report = {}
    with provision_lock:
        psql("postgres", f"ALTER DATABASE {TEMPLATE_DB} ALLOW_CONNECTIONS true;")
        try:
            report[TEMPLATE_DB] = run_migrations(TEMPLATE_DB)
        finally:
            psql("postgres", f"ALTER DATABASE {TEMPLATE_DB} ALLOW_CONNECTIONS false;")
        report[CENTRAL_DB] = run_migrations(CENTRAL_DB)
        for slug in client_slugs():
            report[names_for(slug)["db"]] = run_migrations(names_for(slug)["db"])
    return report


# ---------------------------------------------------------------- painel do Master (leitura)


PANEL_DB_RE = re.compile(r"^[a-z][a-z0-9_]{0,62}$")
PANEL_IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_$]{0,62}$")
# Mostrar linhas exige Master com papel de administrador e fica na auditoria. Mesmo assim, estas
# colunas nunca saem do banco: credenciais e documentos pessoais aparecem mascarados.
SENSITIVE_COLUMN_RE = re.compile(
    r"(?i)(password|passwd|senha|secret|token|hash|salt|api_?key|_key$|^key$|private|credential|"
    r"certificate|certificado|encrypted|cipher|otp|recovery|p256dh|^auth$|cpf|cnh)"
)
PANEL_ROW_SCHEMAS = {"public"}
PANEL_MAX_ROWS = 100
PANEL_RELATIONS = "('r', 'p', 'v', 'm', 'f')"

panel_lock = threading.Lock()
panel_cache = {}


def panel_cached(key, ttl, compute):
    with panel_lock:
        entry = panel_cache.get(key)
        if entry and time.time() - entry[0] < ttl:
            return entry[1]
    value = compute()
    with panel_lock:
        panel_cache[key] = (time.time(), value)
    return value


def psql_json(database, statement):
    output = psql(database, statement)
    return json.loads(output) if output else None


def quote_identifier(name):
    return '"' + name.replace('"', '""') + '"'


def database_kind(name, slugs_by_database):
    if name == CENTRAL_DB:
        return "central"
    if name == JOBS_DB:
        return "jobs"
    if name == TEMPLATE_DB:
        return "template"
    if name == "postgres":
        return "system"
    return "client" if name in slugs_by_database else "other"


def database_details(name):
    try:
        return name, psql_json(
            name,
            """
            select json_build_object(
              'publicTables', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                               where n.nspname = 'public' and c.relkind in ('r', 'p')),
              'migrations', (select count(*) from supabase_migrations.schema_migrations),
              'lastMigration', (select max(version) from supabase_migrations.schema_migrations));
            """,
        )
    except (AgentError, ValueError) as error:
        log(f"painel, banco {name}: {scrub(error)}")
        return name, None


def panel_databases():
    def compute():
        server = psql_json(
            "postgres",
            """
            select json_build_object(
              'version', current_setting('server_version'),
              'startedAt', pg_postmaster_start_time(),
              'maxConnections', current_setting('max_connections')::int,
              'connections', (select count(*) from pg_stat_activity where backend_type = 'client backend'),
              'sharedBuffers', current_setting('shared_buffers'),
              'slots', (select coalesce(json_agg(json_build_object(
                  'name', slot_name, 'database', database, 'active', active,
                  'lagBytes', pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) order by slot_name), '[]')
                from pg_replication_slots),
              'databases', (select coalesce(json_agg(json_build_object(
                  'name', d.datname,
                  'sizeBytes', pg_database_size(d.oid),
                  'connections', coalesce(s.numbackends, 0),
                  'allowConnections', d.datallowconn,
                  'commits', coalesce(s.xact_commit, 0),
                  'rollbacks', coalesce(s.xact_rollback, 0),
                  'deadlocks', coalesce(s.deadlocks, 0),
                  'cacheHitPercent', case when coalesce(s.blks_hit + s.blks_read, 0) > 0
                    then round(100.0 * s.blks_hit / (s.blks_hit + s.blks_read), 1) end) order by d.datname), '[]')
                from pg_database d left join pg_stat_database s on s.datid = d.oid
                where d.datname not in ('template0', 'template1')));
            """,
        )
        slugs = {names_for(slug)["db"]: slug for slug in client_slugs()}
        with_ledger = [row["name"] for row in server["databases"] if row["name"] == CENTRAL_DB or row["name"] in slugs]
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            details = dict(pool.map(database_details, with_ledger))
        for row in server["databases"]:
            row["kind"] = database_kind(row["name"], slugs)
            row["clientSlug"] = slugs.get(row["name"])
            row.update(details.get(row["name"]) or {})
        return server

    return panel_cached("databases", 20, compute)


def panel_database(name):
    if not isinstance(name, str) or not PANEL_DB_RE.match(name):
        raise AgentError(400, "INVALID_INPUT", "Banco inválido.")
    allowed = psql(
        "postgres",
        f"select datallowconn from pg_database where datname = {literal(name)} and datname not in ('template0', 'template1');",
    )
    if allowed == "":
        raise AgentError(404, "NOT_FOUND", "Banco não encontrado.")
    if allowed != "t":
        raise AgentError(400, "NOT_READABLE", "Este banco não aceita conexão. É o modelo dos clientes.")
    return name


def panel_identifier(name):
    if not isinstance(name, str) or not PANEL_IDENTIFIER_RE.match(name):
        raise AgentError(400, "INVALID_INPUT", "Nome inválido.")
    return name


def panel_tables(database):
    panel_database(database)
    return {
        "database": database,
        "rowSchemas": sorted(PANEL_ROW_SCHEMAS),
        "tables": psql_json(
            database,
            f"""
            select coalesce(json_agg(t order by t."totalBytes" desc, t.schema, t.name), '[]') from (
              select n.nspname as schema, c.relname as name, c.relkind::text as kind,
                     greatest(c.reltuples::bigint, coalesce(s.n_live_tup, 0)) as "estimatedRows",
                     pg_total_relation_size(c.oid) as "totalBytes",
                     c.relrowsecurity as rls,
                     (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
                     (select count(*) from pg_index i where i.indrelid = c.oid) as indexes,
                     (select count(*) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns,
                     coalesce(s.n_dead_tup, 0) as "deadRows",
                     greatest(s.last_vacuum, s.last_autovacuum) as "lastVacuum",
                     obj_description(c.oid, 'pg_class') as comment
              from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
              left join pg_stat_user_tables s on s.relid = c.oid
              where c.relkind in {PANEL_RELATIONS}
                and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
                and n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast_temp%'
            ) t;
            """,
        ),
    }


def panel_table(database, schema, table):
    panel_database(database)
    panel_identifier(schema)
    panel_identifier(table)
    detail = psql_json(
        database,
        f"""
        select json_build_object(
          'schema', n.nspname, 'name', c.relname, 'kind', c.relkind::text,
          'rls', c.relrowsecurity, 'rlsForced', c.relforcerowsecurity,
          'comment', obj_description(c.oid, 'pg_class'),
          'totalBytes', pg_total_relation_size(c.oid),
          'columns', (select coalesce(json_agg(json_build_object(
              'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'nullable', not a.attnotnull,
              'default', pg_get_expr(d.adbin, d.adrelid), 'comment', col_description(c.oid, a.attnum))
              order by a.attnum), '[]')
            from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
          'constraints', (select coalesce(json_agg(json_build_object(
              'name', con.conname, 'type', con.contype::text, 'definition', pg_get_constraintdef(con.oid))
              order by con.contype, con.conname), '[]')
            from pg_constraint con where con.conrelid = c.oid),
          'indexes', (select coalesce(json_agg(json_build_object(
              'name', i.relname, 'definition', pg_get_indexdef(x.indexrelid), 'unique', x.indisunique,
              'primary', x.indisprimary, 'bytes', pg_relation_size(i.oid), 'scans', coalesce(st.idx_scan, 0))
              order by i.relname), '[]')
            from pg_index x join pg_class i on i.oid = x.indexrelid
            left join pg_stat_user_indexes st on st.indexrelid = x.indexrelid
            where x.indrelid = c.oid),
          'policies', (select coalesce(json_agg(json_build_object(
              'name', p.policyname, 'command', p.cmd, 'roles', p.roles, 'permissive', p.permissive,
              'using', p.qual, 'check', p.with_check) order by p.policyname), '[]')
            from pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname),
          'triggers', (select coalesce(json_agg(json_build_object(
              'name', t.tgname, 'definition', pg_get_triggerdef(t.oid)) order by t.tgname), '[]')
            from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal))
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = {literal(schema)} and c.relname = {literal(table)} and c.relkind in {PANEL_RELATIONS};
        """,
    )
    if not detail:
        raise AgentError(404, "NOT_FOUND", "Tabela não encontrada.")
    for column in detail["columns"]:
        column["masked"] = bool(SENSITIVE_COLUMN_RE.search(column["name"]))
    detail["rowsReadable"] = schema in PANEL_ROW_SCHEMAS
    detail["exactRows"] = exact_row_count(database, schema, table)
    return detail


def exact_row_count(database, schema, table):
    target = f"{quote_identifier(schema)}.{quote_identifier(table)}"
    try:
        output = psql(
            database,
            f"begin read only; set local statement_timeout = '3s'; select count(*) from {target}; commit;",
        )
        return int(output) if output.isdigit() else None
    except AgentError:
        return None


def panel_rows(database, schema, table, limit, offset):
    panel_database(database)
    panel_identifier(schema)
    panel_identifier(table)
    if schema not in PANEL_ROW_SCHEMAS:
        raise AgentError(400, "NOT_READABLE", "Dados de login, arquivos e sistema não aparecem no painel: só a estrutura.")
    limit = max(1, min(limit, PANEL_MAX_ROWS))
    offset = max(0, offset)
    columns = psql_json(
        database,
        f"""
        select json_build_object(
          'columns', (select coalesce(json_agg(json_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod)) order by a.attnum), '[]')
                      from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
          'primaryKey', (select coalesce(json_agg(a.attname order by k.ord), '[]')
                         from pg_index x
                         cross join lateral unnest(x.indkey) with ordinality as k(attnum, ord)
                         join pg_attribute a on a.attrelid = x.indrelid and a.attnum = k.attnum
                         where x.indrelid = c.oid and x.indisprimary))
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = {literal(schema)} and c.relname = {literal(table)} and c.relkind in {PANEL_RELATIONS};
        """,
    )
    if not columns or not columns["columns"]:
        raise AgentError(404, "NOT_FOUND", "Tabela não encontrada.")

    selected, described = [], []
    for column in columns["columns"]:
        name = quote_identifier(column["name"])
        masked = bool(SENSITIVE_COLUMN_RE.search(column["name"]))
        expression = f"case when {name} is null then null else '••••' end" if masked else f"left(({name})::text, 300)"
        selected.append(f"{expression} as {name}")
        described.append({**column, "masked": masked})
    order = ", ".join(quote_identifier(key) for key in columns["primaryKey"]) or "1"
    target = f"{quote_identifier(schema)}.{quote_identifier(table)}"
    rows = psql_json(
        database,
        f"""
        begin read only;
        set local statement_timeout = '8s';
        set local lock_timeout = '1s';
        select coalesce(json_agg(row_to_json(t)), '[]') from (
          select {", ".join(selected)} from {target} order by {order} limit {limit} offset {offset}
        ) t;
        commit;
        """,
    )
    return {
        "columns": described,
        "rows": rows,
        "limit": limit,
        "offset": offset,
        "total": exact_row_count(database, schema, table),
    }


def panel_jobs():
    def compute():
        return psql_json(
            JOBS_DB,
            """
            select coalesce(json_agg(r order by r.name), '[]') from (
              select j.jobname as name, j.schedule, j.database, j.active,
                     last.status as "lastStatus", last.start_time as "lastRunAt",
                     left(last.return_message, 200) as "lastMessage",
                     (select count(*) from cron.job_run_details d
                      where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '24 hours') as "failures24h"
              from cron.job j
              left join lateral (select status, start_time, return_message from cron.job_run_details d
                                 where d.jobid = j.jobid order by d.start_time desc limit 1) last on true
            ) r;
            """,
        )

    return panel_cached("jobs", 30, compute)


def panel_client(slug):
    def probe(path):
        started = time.time()
        try:
            status, _ = api(slug, "GET", path, timeout=6)
        except (urllib.error.URLError, OSError):
            status = None
        return {"status": status, "ms": int((time.time() - started) * 1000)}

    try:
        realtime, _ = realtime_request("GET", f"/api/tenants/{slug}")
    except (AgentError, subprocess.TimeoutExpired):
        realtime = None
    return {
        "slug": slug,
        "auth": probe("/auth/v1/health"),
        "rest": probe("/rest/v1/"),
        "storage": probe("/storage/v1/status"),
        "realtimeRegistered": realtime == 200,
    }


def panel_clients():
    def compute():
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            return {"clients": list(pool.map(panel_client, client_slugs()))}

    return panel_cached("clients", 15, compute)


def panel_route(method, parts, query):
    if method != "GET":
        raise AgentError(405, "METHOD_NOT_ALLOWED", "O painel só lê.")
    if parts == ["databases"]:
        return 200, panel_databases()
    if parts == ["jobs"]:
        return 200, {"jobs": panel_jobs()}
    if parts == ["clients"]:
        return 200, panel_clients()
    if len(parts) == 3 and parts[0] == "databases" and parts[2] == "tables":
        return 200, panel_tables(parts[1])
    if len(parts) in (5, 6) and parts[0] == "databases" and parts[2] == "tables":
        database, schema, table = parts[1], parts[3], parts[4]
        if len(parts) == 5:
            return 200, panel_table(database, schema, table)
        if parts[5] == "rows":
            limit = query.get("limit", ["50"])[0]
            offset = query.get("offset", ["0"])[0]
            return 200, panel_rows(
                database, schema, table, int(limit) if limit.isdigit() else 50, int(offset) if offset.isdigit() else 0
            )
    raise AgentError(404, "NOT_FOUND", "Rota inexistente.")


# ---------------------------------------------------------------- disparos agendados


def post_to_tms(slug, path, body, headers):
    cfg = settings()
    request = urllib.request.Request(
        f"https://{slug}.{cfg['CLIENT_BASE_DOMAIN']}{path}",
        method="POST",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **headers},
    )
    try:
        with urllib.request.urlopen(request, timeout=55) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except (urllib.error.URLError, OSError) as error:
        log(f"disparo para {slug}{path}: {scrub(error)}")
        return 0


def dispatch_tick(now):
    cfg = settings()
    push_time = now.hour == 11 and now.minute == 0
    for slug in client_slugs():
        if not meta_path(slug).exists():
            continue
        database = names_for(slug)["db"]
        try:
            active = psql(
                database,
                "select coalesce(string_agg(workspace_id::text, ','), '') from public.workspace_integrations "
                "where provider = 'sascar' and status = 'active';",
            )
        except AgentError as error:
            log(f"integracoes de {slug}: {scrub(error)}")
            continue
        for workspace in filter(None, active.split(",")):
            post_to_tms(
                slug,
                "/api/sascar/sync",
                {"workspaceId": workspace, "source": "cron"},
                {"x-sascar-sync-token": cfg["SASCAR_SYNC_TOKEN"]},
            )
        if push_time:
            post_to_tms(
                slug,
                "/api/frotak-ia/push-dispatch",
                {},
                {"x-frotak-push-token": cfg["FROTAK_PUSH_CRON_TOKEN"]},
            )


def dispatch_loop():
    while True:
        started = time.time()
        try:
            dispatch_tick(datetime.datetime.now(datetime.timezone.utc))
        except Exception as error:
            log(f"disparos: {scrub(error)}")
        time.sleep(max(1, 60 - (time.time() - started)))


# ---------------------------------------------------------------- API


class Handler(BaseHTTPRequestHandler):
    server_version = "frotak-agent"

    def log_message(self, fmt, *args):
        # Sem query string nem corpo: so metodo, caminho e resposta.
        log(f"{self.command} {self.path.split('?')[0]} {args[1] if len(args) > 1 else ''}")

    def respond(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length))
        except ValueError as error:
            raise AgentError(400, "INVALID_JSON", "Corpo inválido.") from error

    def route(self):
        path = self.path.split("?")[0].rstrip("/")
        parts = path.split("/")[1:]
        method = self.command
        if path == "/clients" and method == "POST":
            return 201, create_client(self.body())
        if path == "/clients" and method == "GET":
            return 200, {"clients": client_slugs()}
        if path == "/clients/usage" and method == "GET":
            return 200, usage_all()
        if path == "/migrate" and method == "POST":
            return 200, migrate_all()
        if parts and parts[0] == "panel":
            query = urllib.parse.parse_qs(self.path.split("?", 1)[1]) if "?" in self.path else {}
            return panel_route(method, parts[1:], query)
        if len(parts) >= 2 and parts[0] == "clients":
            slug = validate_slug(parts[1])
            action = parts[2] if len(parts) > 2 else ""
            if method == "GET" and action == "connection":
                return 200, connection(slug)
            if method == "GET" and action == "owner":
                return 200, owner_of(slug) or {}
            if method == "POST" and action == "entitlements":
                return 200, set_entitlement(slug, self.body())
            if method == "POST" and action == "status":
                return 200, set_status(slug, self.body())
            if method == "POST" and action == "support-login":
                return 200, support_login(slug)
            if method == "DELETE" and not action:
                if self.body().get("confirm") != slug:
                    raise AgentError(400, "CONFIRM_REQUIRED", "Confirme o cliente a apagar.")
                client_env(slug)
                remove_client(slug)
                return 200, {"ok": True}
        raise AgentError(404, "NOT_FOUND", "Rota inexistente.")

    def handle_request(self):
        token = settings().get("FROTAK_AGENT_TOKEN", "")
        sent = (self.headers.get("Authorization") or "").replace("Bearer ", "", 1)
        if self.path == "/health":
            return self.respond(200, {"ok": True})
        if not token or not hmac.compare_digest(sent, token):
            return self.respond(401, {"code": "UNAUTHORIZED", "message": "Token inválido."})
        try:
            status, body = self.route()
            self.respond(status, body)
        except AgentError as error:
            if error.status >= 500:
                log(f"{self.command} {self.path}: {scrub(error.message)}")
            self.respond(error.status, {"code": error.code, "message": error.message if error.status < 500 else "Falha no agente."})
        except Exception as error:
            log(f"{self.command} {self.path}: {scrub(error)}")
            self.respond(500, {"code": "INTERNAL", "message": "Falha no agente."})

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()

    def do_DELETE(self):
        self.handle_request()


def serve():
    cfg = settings()
    threading.Thread(target=dispatch_loop, daemon=True).start()
    server = ThreadingHTTPServer((cfg["WG_DB"], PORT), Handler)
    log(f"escutando em {cfg['WG_DB']}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "serve":
        serve()
    elif command == "render-kong":
        render_kong()
    elif command == "migrate":
        print(json.dumps(migrate_all(), indent=2))
    elif command == "restore-client":
        if len(sys.argv) != 5 or sys.argv[2] != sys.argv[4]:
            print("uso: frotak_agent.py restore-client CLIENTE PASTA_DO_BACKUP CLIENTE")
            sys.exit(2)
        print(json.dumps(restore_client(sys.argv[2], sys.argv[3])))
    else:
        print(__doc__)
        sys.exit(2)
