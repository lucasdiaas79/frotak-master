#!/usr/bin/env python3
"""Sentinela: o vigia de cada VPS.

Roda nas duas VPS, como root, escutando so no IP da WireGuard e exigindo token. Faz tres coisas:
- mede a maquina, os servicos e os conteineres, e guarda o historico em SQLite;
- conserta sozinha o que sabe consertar (auto-heal), com limite de tentativas;
- responde ao painel do Master.

Nunca devolve variaveis de ambiente de conteiner e limpa segredos dos logs.
"""
import hmac
import json
import os
import re
import shutil
import socket
import sqlite3
import ssl
import subprocess
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ETC = Path("/etc/frotak")
CLIENTS_DIR = ETC / "clients"
STATE_DIR = Path("/var/lib/frotak-sentinel")
DB_PATH = STATE_DIR / "sentinel.db"
# O agente marca aqui o cliente cujos servicos vao parar de proposito (restauracao, por exemplo).
MAINTENANCE_DIR = Path("/run/frotak/maintenance")
DEPLOY_DB = Path("/opt/frotak/deploy/db")
PORT = 9101

HEAL_INTERVAL = 30
COLLECT_INTERVAL = 60
FAILS_BEFORE_ACTION = 3  # 3 verificacoes de 30 s: cerca de 90 s com problema antes de agir.
MAX_ATTEMPTS = 3
ATTEMPT_WINDOW = 1800
MAINTENANCE_MAX_AGE = 1800
HANDSHAKE_STALE = 300
CLEANUP_COOLDOWN = 6 * 3600
BACKUP_MAX_AGE = 26 * 3600

HOST_RETENTION = 7 * 86400
CONTAINER_RETENTION = 2 * 86400
EVENT_RETENTION = 90 * 86400

DISK_WARNING, DISK_CRITICAL = 80, 90
MEMORY_WARNING, MEMORY_CRITICAL = 85, 95
CPU_CRITICAL = 90

PROTECTED_CONTAINER = "frotak-db"
# Conteiner compartilhado -> servico no docker-compose.yml.
CENTRAL_CONTAINERS = {
    "frotak-auth": "auth",
    "frotak-rest": "rest",
    "frotak-storage": "storage",
    "frotak-kong": "kong",
    "realtime-dev.supabase-realtime": "realtime",
}
CLIENT_SERVICES = {"auth": "c-auth", "rest": "c-rest", "storage": "c-storage"}

NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.@-]{0,120}$")

RULES = {
    "db": [
        {
            "target": "Login, API e arquivos do Central e de cada cliente; Kong; Realtime",
            "watches": "Container parado, sumido ou unhealthy por cerca de 90 s",
            "action": "Reinicia ou recria só aquele container",
            "limit": "3 tentativas em 30 min; depois para e avisa",
        },
        {
            "target": "Postgres",
            "watches": "Container parado ou unhealthy",
            "action": "Só avisa. Reiniciar derruba todos os clientes e pode atrapalhar uma recuperação",
            "limit": "Decisão de uma pessoa",
        },
        {
            "target": "Agente, PgBouncer, Docker e WireGuard",
            "watches": "Serviço inativo ou sem resposta por cerca de 90 s",
            "action": "Reinicia o serviço",
            "limit": "3 tentativas em 30 min; depois para e avisa",
        },
        {
            "target": "Disco",
            "watches": "Uso de 90% ou mais",
            "action": "Limpa logs antigos do sistema e imagens Docker sem uso. Nunca toca em dados nem em backups",
            "limit": "Uma vez a cada 6 h",
        },
        {
            "target": "Memória, CPU, backup e teste de restauração",
            "watches": "Limites de uso, backup com mais de 26 h ou última execução com falha",
            "action": "Só avisa",
            "limit": "—",
        },
    ],
    "service": [
        {
            "target": "Master e TMS",
            "watches": "Serviço inativo, travado ou com erro 5xx por cerca de 90 s",
            "action": "Reinicia o serviço",
            "limit": "3 tentativas em 30 min; depois para e avisa",
        },
        {
            "target": "Caddy, Redis e WireGuard",
            "watches": "Serviço inativo ou porta sem resposta por cerca de 90 s",
            "action": "Reinicia o serviço",
            "limit": "3 tentativas em 30 min; depois para e avisa",
        },
        {
            "target": "Disco",
            "watches": "Uso de 90% ou mais",
            "action": "Limpa logs antigos do sistema. Nunca toca em dados nem em backups",
            "limit": "Uma vez a cada 6 h",
        },
        {
            "target": "Memória, CPU, certificado HTTPS e VPS de banco",
            "watches": "Limites de uso, certificado a menos de 14 dias do fim, VPS de banco sem resposta",
            "action": "Só avisa",
            "limit": "—",
        },
    ],
}

SERVICES = {
    "db": ["docker", "frotak-agent", "pgbouncer", "wg-quick@wg0", "frotak-sentinel"],
    "service": ["frotak-app@master", "frotak-app@tms", "caddy", "redis-server", "wg-quick@wg0", "frotak-sentinel"],
}
# Reiniciar pelo painel: Docker derrubaria tudo de uma vez, e a sentinela nao se reinicia a si mesma.
NOT_RESTARTABLE = {"docker", "frotak-sentinel"}
DIRECTORIES = {
    "db": ["/var/lib/docker", "/var/lib/frotak", "/var/backups/frotak", "/var/log", "/opt/frotak"],
    "service": ["/var/backups/frotak-db", "/opt/frotak", "/var/lib/frotak-app", "/var/log", "/var/lib/caddy"],
}

lock = threading.RLock()
heal_states = {}
stats_cache = {"at": 0, "value": {}}
cache = {}
last_cycle = {"at": time.time()}


def log(message):
    print(f"[sentinela] {message}", flush=True)


# ---------------------------------------------------------------- regras puras (testadas)


@dataclass
class HealState:
    fails: int = 0
    attempts: list = field(default_factory=list)
    gave_up: bool = False
    acted: bool = False


def decide(state, failing, now, threshold=FAILS_BEFORE_ACTION, limit=MAX_ATTEMPTS, window=ATTEMPT_WINDOW):
    """Decide o que fazer com um alvo nesta verificacao: ok, wait, restart, give_up ou recovered."""
    if not failing:
        recovered = state.acted
        state.fails = 0
        state.gave_up = False
        state.acted = False
        return "recovered" if recovered else "ok"

    state.fails += 1
    if state.fails < threshold:
        return "wait"

    state.attempts = [moment for moment in state.attempts if now - moment < window]
    if len(state.attempts) >= limit:
        if state.gave_up:
            return "wait"
        state.gave_up = True
        state.acted = True
        return "give_up"

    state.attempts.append(now)
    state.fails = 0
    state.gave_up = False
    state.acted = True
    return "restart"


def container_failing(container):
    """Parado, sumido ou unhealthy conta como falha. Ainda subindo (starting) nao conta."""
    if container is None:
        return True, "não existe"
    state = container.get("state")
    if state != "running":
        return True, f"estado {state}"
    if container.get("health") == "unhealthy":
        return True, "unhealthy"
    return False, ""


def scrub_logs(text):
    """Tira segredos de uma linha de log antes de sair da VPS."""
    text = re.sub(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*", "***", text)
    text = re.sub(r"://([^:/\s@]+):([^@\s/]+)@", r"://\1:***@", text)
    text = re.sub(
        r"(?i)(password|passwd|pwd|secret|token|api_?key|authorization)(\\?[\"']?\s*[:=]\s*\\?[\"']?)(bearer\s+)?[^\s\"',&\\}]+",
        r"\1\2***",
        text,
    )
    text = re.sub(r"(?i)(password\s+)'[^']*'", r"\1'***'", text)
    return re.sub(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}", "Bearer ***", text)


def parse_size(text):
    match = re.match(r"^\s*([\d.]+)\s*([kKMGTP]?i?)B?\s*$", text or "")
    if not match:
        return 0
    units = {"": 1, "k": 1000, "K": 1000, "M": 10**6, "G": 10**9, "T": 10**12, "P": 10**15,
             "Ki": 1024, "ki": 1024, "Mi": 1024**2, "Gi": 1024**3, "Ti": 1024**4, "Pi": 1024**5}
    return int(float(match.group(1)) * units.get(match.group(2), 1))


def exposure(address, wireguard_ip):
    if address.startswith("127.") or address in ("::1", "[::1]"):
        return "local"
    if address == wireguard_ip:
        return "wireguard"
    return "public"


# ---------------------------------------------------------------- utilitarios


def read_env(path):
    values = {}
    if Path(path).exists():
        for line in Path(path).read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip()
    return values


def role():
    return os.environ.get("FROTAK_SENTINEL_ROLE", "service")


def hosts():
    return read_env(ETC / "hosts.env")


def wireguard_ip():
    return os.environ.get("FROTAK_SENTINEL_BIND", "")


def run(cmd, timeout=30):
    try:
        result = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout, errors="replace")
        return result.returncode, result.stdout, result.stderr
    except (subprocess.TimeoutExpired, OSError) as error:
        return 1, "", str(error)


def memoize(key, ttl, compute):
    with lock:
        entry = cache.get(key)
        if entry and time.time() - entry[0] < ttl:
            return entry[1]
    value = compute()
    with lock:
        cache[key] = (time.time(), value)
    return value


def db():
    connection = sqlite3.connect(DB_PATH, timeout=15)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    with db() as connection:
        connection.execute("pragma journal_mode=wal")
        connection.executescript(
            """
            create table if not exists host_metrics (
              ts integer primary key, cpu real, mem_used integer, mem_total integer, swap_used integer,
              disk_used integer, disk_total integer, load1 real, net_rx real, net_tx real);
            create table if not exists container_metrics (
              ts integer, name text, cpu real, mem integer, primary key (ts, name));
            create table if not exists events (
              id integer primary key autoincrement, ts integer, level text, kind text, target text,
              title text, detail text);
            create index if not exists events_ts on events (ts);
            create table if not exists alerts (
              key text primary key, since integer, level text, title text, detail text);
            create table if not exists settings (key text primary key, value text);
            """
        )


def record_event(level, kind, target, title, detail=""):
    log(f"{kind} {target}: {title} {detail}".strip())
    with db() as connection:
        connection.execute(
            "insert into events (ts, level, kind, target, title, detail) values (?, ?, ?, ?, ?, ?)",
            (int(time.time()), level, kind, target, title, scrub_logs(detail)[:600]),
        )


def set_alert(key, active, level="warning", title="", detail=""):
    """Registra so a abertura e o fim do alerta: problema longo nao vira uma fila de eventos."""
    with db() as connection:
        current = connection.execute("select level, title from alerts where key = ?", (key,)).fetchone()
        if active and current is None:
            connection.execute(
                "insert into alerts (key, since, level, title, detail) values (?, ?, ?, ?, ?)",
                (key, int(time.time()), level, title, scrub_logs(detail)[:600]),
            )
        elif active:
            connection.execute(
                "update alerts set level = ?, title = ?, detail = ? where key = ?",
                (level, title, scrub_logs(detail)[:600], key),
            )
        elif current is not None:
            connection.execute("delete from alerts where key = ?", (key,))
    if active and current is None:
        record_event(level, "alert", key, title, detail)
    elif not active and current is not None:
        record_event("info", "cleared", key, f"Resolvido: {current['title']}")


def heal_enabled():
    with db() as connection:
        row = connection.execute("select value from settings where key = 'heal_enabled'").fetchone()
    return row is None or row["value"] == "1"


def set_heal_enabled(enabled, actor):
    with db() as connection:
        connection.execute(
            "insert into settings (key, value) values ('heal_enabled', ?) "
            "on conflict (key) do update set value = excluded.value",
            ("1" if enabled else "0",),
        )
    record_event(
        "warning" if not enabled else "info",
        "toggle",
        "auto-heal",
        "Auto-heal ligado" if enabled else "Auto-heal pausado",
        f"por {actor}",
    )


# ---------------------------------------------------------------- medicoes da maquina


cpu_previous = {"total": 0, "idle": 0, "percent": 0.0}
net_previous = {"at": 0, "rx": 0, "tx": 0, "rxRate": 0.0, "txRate": 0.0}


def sample_cpu():
    with open("/proc/stat") as source:
        values = [int(value) for value in source.readline().split()[1:]]
    total, idle = sum(values), values[3] + values[4]
    delta = total - cpu_previous["total"]
    if cpu_previous["total"] and delta > 0:
        cpu_previous["percent"] = round(100 * (1 - (idle - cpu_previous["idle"]) / delta), 1)
    cpu_previous.update(total=total, idle=idle)
    return cpu_previous["percent"]


def meminfo():
    values = {}
    with open("/proc/meminfo") as source:
        for line in source:
            key, _, rest = line.partition(":")
            values[key] = int(rest.split()[0]) * 1024
    return {
        "total": values["MemTotal"],
        "used": values["MemTotal"] - values["MemAvailable"],
        "swapTotal": values.get("SwapTotal", 0),
        "swapUsed": values.get("SwapTotal", 0) - values.get("SwapFree", 0),
    }


def sample_network():
    rx = tx = 0
    with open("/proc/net/dev") as source:
        for line in source.readlines()[2:]:
            name, _, rest = line.partition(":")
            name = name.strip()
            if name == "lo" or name.startswith(("veth", "br-", "docker", "wg")):
                continue
            columns = rest.split()
            rx += int(columns[0])
            tx += int(columns[8])
    now = time.time()
    if net_previous["at"]:
        elapsed = max(now - net_previous["at"], 1)
        net_previous["rxRate"] = max(rx - net_previous["rx"], 0) / elapsed
        net_previous["txRate"] = max(tx - net_previous["tx"], 0) / elapsed
    net_previous.update(at=now, rx=rx, tx=tx)
    return net_previous["rxRate"], net_previous["txRate"]


def disks():
    code, out, _ = run(["df", "-PT", "-B1", "-x", "tmpfs", "-x", "devtmpfs", "-x", "overlay", "-x", "squashfs", "-x", "efivarfs"])
    rows = []
    if code == 0:
        for line in out.splitlines()[1:]:
            parts = line.split()
            if len(parts) >= 7:
                rows.append({"device": parts[0], "type": parts[1], "total": int(parts[2]), "used": int(parts[3]), "mount": parts[6]})
    return rows


def root_disk():
    usage = shutil.disk_usage("/")
    return usage.used, usage.total


def directories():
    def compute():
        rows = []
        for path in DIRECTORIES.get(role(), []):
            if Path(path).exists():
                code, out, _ = run(["nice", "-n", "15", "du", "-sb", "--one-file-system", path], timeout=120)
                rows.append({"path": path, "bytes": int(out.split()[0]) if out.split() else 0, "complete": code == 0})
        return rows

    return memoize("directories", 600, compute)


def host_info():
    usage = meminfo()
    release = read_env("/etc/os-release").get("PRETTY_NAME", "").strip('"')
    with open("/proc/uptime") as source:
        uptime = float(source.read().split()[0])
    used, total = root_disk()
    cfg = hosts()
    return {
        "hostname": socket.gethostname(),
        "os": release,
        "kernel": os.uname().release,
        "cores": os.cpu_count(),
        "uptimeSeconds": int(uptime),
        "load": list(os.getloadavg()),
        "cpuPercent": cpu_previous["percent"],
        "memory": usage,
        "disk": {"used": used, "total": total},
        "networkRate": {"rx": net_previous["rxRate"], "tx": net_previous["txRate"]},
        "publicIp": cfg.get("DB_PUBLIC_IP" if role() == "db" else "SERVICE_PUBLIC_IP", ""),
        "wireguardIp": wireguard_ip(),
        "dockerVersion": docker_version(),
    }


def docker_version():
    if not shutil.which("docker"):
        return None

    def compute():
        code, out, _ = run(["docker", "version", "--format", "{{.Server.Version}}"], timeout=10)
        return out.strip() if code == 0 else None

    return memoize("docker-version", 3600, compute)


# ---------------------------------------------------------------- servicos


SERVICE_PROPERTIES = "ActiveState,SubState,UnitFileState,MainPID,MemoryCurrent,ActiveEnterTimestamp,NRestarts,Result,Description"


def service_state(unit):
    _, out, _ = run(["systemctl", "show", unit, "--no-pager", f"--property={SERVICE_PROPERTIES}"], timeout=10)
    values = dict(line.split("=", 1) for line in out.splitlines() if "=" in line)
    memory = values.get("MemoryCurrent", "")
    return {
        "name": unit,
        "description": values.get("Description", ""),
        "active": values.get("ActiveState", "unknown"),
        "sub": values.get("SubState", ""),
        "enabled": values.get("UnitFileState", ""),
        "pid": int(values.get("MainPID") or 0),
        "memoryBytes": int(memory) if memory.isdigit() and int(memory) < 2**62 else None,
        "since": values.get("ActiveEnterTimestamp", ""),
        "restarts": int(values.get("NRestarts") or 0),
        "result": values.get("Result", ""),
        "restartable": unit not in NOT_RESTARTABLE,
    }


def http_probe(url, timeout=8):
    started = time.time()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            status = response.status
    except urllib.error.HTTPError as error:
        status = error.code
    except (urllib.error.URLError, OSError, ValueError) as error:
        return {"ok": False, "status": None, "ms": int((time.time() - started) * 1000), "error": str(error)[:120]}
    return {"ok": status < 500, "status": status, "ms": int((time.time() - started) * 1000)}


def tcp_probe(host, port, timeout=5):
    started = time.time()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return {"ok": True, "ms": int((time.time() - started) * 1000)}
    except OSError as error:
        return {"ok": False, "ms": int((time.time() - started) * 1000), "error": str(error)[:120]}


def service_probes():
    wg = wireguard_ip()
    if role() == "db":
        return {
            "frotak-agent": lambda: http_probe(f"http://{wg}:9100/health"),
            "pgbouncer": lambda: tcp_probe(wg, 6432),
        }
    return {
        "frotak-app@master": lambda: http_probe("http://127.0.0.1:3001/login", timeout=15),
        "frotak-app@tms": lambda: http_probe("http://127.0.0.1:3002/__frotak/health", timeout=15),
        "caddy": lambda: tcp_probe("127.0.0.1", 443),
        "redis-server": lambda: tcp_probe("127.0.0.1", 6379),
    }


def wireguard_state():
    if not shutil.which("wg"):
        return None
    code, out, _ = run(["wg", "show", "wg0", "dump"], timeout=10)
    if code != 0:
        return {"up": False, "peers": []}
    peers = []
    for line in out.splitlines()[1:]:
        parts = line.split("\t")
        if len(parts) >= 7:
            handshake = int(parts[4] or 0)
            peers.append(
                {
                    "endpoint": parts[2],
                    "allowedIps": parts[3],
                    "handshakeAgeSeconds": int(time.time()) - handshake if handshake else None,
                    "rxBytes": int(parts[5]),
                    "txBytes": int(parts[6]),
                }
            )
    return {"up": True, "peers": peers}


def peer_probe():
    peer = os.environ.get("FROTAK_SENTINEL_PEER", "")
    return http_probe(f"{peer}/health", timeout=6) if peer else {"ok": True}


def listening_ports():
    code, out, _ = run(["ss", "-H", "-ltnup"], timeout=10)
    rows, seen = [], set()
    if code != 0:
        return rows
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        address, _, port = parts[4].rpartition(":")
        address = address.split("%")[0]
        process = re.search(r'\(\("([^"]+)"', line)
        name = process.group(1) if process else ""
        key = (parts[0], address, port, name)
        if key in seen:
            continue
        seen.add(key)
        rows.append({"protocol": parts[0], "address": address, "port": int(port) if port.isdigit() else 0,
                     "process": name, "exposure": exposure(address.strip("[]"), wireguard_ip())})
    return sorted(rows, key=lambda row: (row["port"], row["address"]))


def firewall_rules():
    def compute():
        code, out, _ = run(["ufw", "status"], timeout=10)
        return [line.rstrip() for line in out.splitlines() if line.strip()] if code == 0 else []

    return memoize("firewall", 120, compute)


def certificates():
    if role() != "service":
        return []

    def compute():
        cfg, rows = hosts(), []
        for name in filter(None, [cfg.get("MASTER_HOST"), cfg.get("API_HOST")]):
            try:
                context = ssl.create_default_context()
                with socket.create_connection((name, 443), timeout=8) as raw:
                    with context.wrap_socket(raw, server_hostname=name) as secure:
                        expires = ssl.cert_time_to_seconds(secure.getpeercert()["notAfter"])
                rows.append({"host": name, "expiresAt": int(expires), "valid": True})
            except (OSError, ValueError, KeyError) as error:
                rows.append({"host": name, "expiresAt": None, "valid": False, "error": str(error)[:120]})
        return rows

    return memoize("certificates", 6 * 3600, compute)


def backups_state():
    def timer_info(unit):
        _, out, _ = run(["systemctl", "show", unit, "--no-pager", "--property=Result,ExecMainExitTimestamp,ExecMainStatus,UnitFileState,ActiveState"], timeout=10)
        return dict(line.split("=", 1) for line in out.splitlines() if "=" in line)

    def compute():
        root = Path("/var/backups/frotak" if role() == "db" else "/var/backups/frotak-db")
        rows = []
        if root.exists():
            for path in sorted((item for item in root.iterdir() if item.is_dir()), reverse=True)[:30]:
                _, out, _ = run(["du", "-sb", str(path)], timeout=60)
                clients = path / "clients"
                rows.append(
                    {
                        "name": path.name,
                        "bytes": int(out.split()[0]) if out.split() else 0,
                        "at": int(path.stat().st_mtime),
                        "clients": len(list(clients.glob("*.dump"))) if clients.exists() else 0,
                        "verified": (path / "SHA256SUMS").exists(),
                    }
                )
        state = {"location": str(root), "copies": rows}
        if role() == "db":
            backup = timer_info("frotak-backup.service")
            test = timer_info("frotak-restore-test.service")
            state["lastRun"] = {"result": backup.get("Result", ""), "finishedAt": backup.get("ExecMainExitTimestamp", "")}
            state["lastRestoreTest"] = {"result": test.get("Result", ""), "finishedAt": test.get("ExecMainExitTimestamp", "")}
            state["scheduled"] = timer_info("frotak-backup.timer").get("UnitFileState") == "enabled"
        return state

    return memoize("backups", 120, compute)


# ---------------------------------------------------------------- conteineres


def inspect_containers():
    if not shutil.which("docker"):
        return []
    code, out, _ = run(["docker", "ps", "-aq"], timeout=20)
    identifiers = out.split()
    if code != 0 or not identifiers:
        return []
    code, out, _ = run(["docker", "inspect", *identifiers], timeout=30)
    if code != 0:
        return []
    rows = []
    for item in json.loads(out or "[]"):
        state = item.get("State") or {}
        health = state.get("Health") or {}
        labels = (item.get("Config") or {}).get("Labels") or {}
        attempts = health.get("Log") or []
        ports = []
        for private, bindings in ((item.get("NetworkSettings") or {}).get("Ports") or {}).items():
            for binding in bindings or []:
                ports.append(f"{binding.get('HostIp', '')}:{binding.get('HostPort', '')}->{private}")
        rows.append(
            {
                "name": (item.get("Name") or "").lstrip("/"),
                "image": (item.get("Config") or {}).get("Image", ""),
                "state": state.get("Status", "unknown"),
                "health": health.get("Status"),
                "healthOutput": scrub_logs(str(attempts[-1].get("Output", "")))[:300] if attempts and health.get("Status") == "unhealthy" else "",
                "startedAt": state.get("StartedAt", ""),
                "exitCode": state.get("ExitCode", 0),
                "oomKilled": bool(state.get("OOMKilled")),
                "restartCount": item.get("RestartCount", 0),
                "restartPolicy": ((item.get("HostConfig") or {}).get("RestartPolicy") or {}).get("Name", ""),
                "project": labels.get("com.docker.compose.project", ""),
                "service": labels.get("com.docker.compose.service", ""),
                "ports": sorted(set(ports)),
                "mounts": sorted(mount.get("Destination", "") for mount in item.get("Mounts") or []),
                "networks": sorted(((item.get("NetworkSettings") or {}).get("Networks") or {}).keys()),
            }
        )
    return rows


def client_slugs():
    return sorted(path.stem for path in CLIENTS_DIR.glob("*.env")) if CLIENTS_DIR.exists() else []


def expected_containers():
    """Nome do conteiner -> como recria-lo. Modelo em construcao e descartaveis ficam de fora."""
    expected = {name: {"slug": None, "service": service} for name, service in CENTRAL_CONTAINERS.items()}
    for slug in client_slugs():
        for suffix, service in CLIENT_SERVICES.items():
            expected[f"frotak-{slug}-{suffix}"] = {"slug": slug, "service": service}
    return expected


def in_maintenance(slug):
    if not slug:
        return False
    marker = MAINTENANCE_DIR / slug
    try:
        return time.time() - marker.stat().st_mtime < MAINTENANCE_MAX_AGE
    except OSError:
        return False


def sample_container_stats():
    if not shutil.which("docker"):
        return {}
    code, out, _ = run(["docker", "stats", "--no-stream", "--format", "{{json .}}"], timeout=45)
    rows = {}
    if code != 0:
        return rows
    for line in out.splitlines():
        try:
            item = json.loads(line)
        except ValueError:
            continue
        net = (item.get("NetIO") or "0B / 0B").split(" / ")
        rows[item.get("Name", "")] = {
            "cpuPercent": float((item.get("CPUPerc") or "0").rstrip("%") or 0),
            "memBytes": parse_size((item.get("MemUsage") or "0B").split(" / ")[0]),
            "memPercent": float((item.get("MemPerc") or "0").rstrip("%") or 0),
            "pids": int(item.get("PIDs") or 0) if str(item.get("PIDs") or "").isdigit() else 0,
            "netRx": parse_size(net[0]),
            "netTx": parse_size(net[-1]),
        }
    return rows


def containers_view():
    expected = expected_containers() if role() == "db" else {}
    stats = stats_cache["value"]
    rows = []
    for container in inspect_containers():
        name = container["name"]
        info = expected.get(name)
        group = "Compartilhado"
        if info and info["slug"]:
            group = info["slug"]
        elif not info and name != PROTECTED_CONTAINER:
            group = "Outros"
        rows.append(
            {
                **container,
                "group": group,
                "clientSlug": info["slug"] if info else None,
                "managed": bool(info),
                "protected": name == PROTECTED_CONTAINER,
                "restartable": bool(info) or name == PROTECTED_CONTAINER,
                "maintenance": in_maintenance(info["slug"]) if info else False,
                "stats": stats.get(name),
            }
        )
    return rows


# ---------------------------------------------------------------- remedios


def compose_up(name, info):
    if info["slug"]:
        env_file = CLIENTS_DIR / f"{info['slug']}.env"
        cmd = ["docker", "compose", "-p", f"frotak-c-{info['slug']}", "-f", str(DEPLOY_DB / "client.compose.yml"),
               "--env-file", str(env_file), "up", "-d", info["service"]]
    else:
        cmd = ["docker", "compose", "--project-directory", str(DEPLOY_DB), "-f", str(DEPLOY_DB / "docker-compose.yml"),
               "--env-file", str(ETC / "hosts.env"), "--env-file", str(ETC / "db.env"), "up", "-d", info["service"]]
    return run(cmd, timeout=180)


def restart_container(name, current, info):
    if current is None:
        return compose_up(name, info)
    if current.get("state") == "paused":
        run(["docker", "unpause", name], timeout=30)
    return run(["docker", "restart", "--time", "20", name], timeout=120)


def restart_service(unit):
    return run(["systemctl", "restart", unit], timeout=120)


def disk_cleanup():
    """So o que sempre pode sair: log antigo do sistema e imagem Docker sem uso. Nunca dados."""
    before, _ = root_disk()
    run(["journalctl", "--vacuum-size=200M"], timeout=120)
    if shutil.which("docker"):
        run(["docker", "image", "prune", "-f"], timeout=180)
    run(["apt-get", "clean"], timeout=60)
    after, _ = root_disk()
    return max(before - after, 0)


# ---------------------------------------------------------------- auto-heal


def apply_decision(key, label, failing, detail, remedy, enabled):
    """Aplica a regra a um alvo. Com o auto-heal pausado, so avisa."""
    state = heal_states.setdefault(key, HealState())
    if not enabled:
        set_alert(key, failing, "critical", f"{label} com problema (auto-heal pausado)", detail)
        return
    action = decide(state, failing, time.time())
    if action == "restart":
        code, _, error = remedy()
        attempt = len(state.attempts)
        if code == 0:
            record_event("warning", "restart", key, f"{label} reiniciado (tentativa {attempt} de {MAX_ATTEMPTS})", detail)
        else:
            record_event("critical", "restart_failed", key, f"Falha ao reiniciar {label}", error)
    elif action == "give_up":
        record_event("critical", "give_up", key, f"{label} continua com problema depois de {MAX_ATTEMPTS} tentativas", detail)
        set_alert(key, True, "critical", f"{label} precisa de uma pessoa", detail)
    elif action == "recovered":
        record_event("info", "recovered", key, f"{label} voltou ao normal")
        set_alert(key, False)
    elif not failing:
        set_alert(key, False)


def heal_containers(enabled):
    if not shutil.which("docker"):
        return
    code, _, _ = run(["docker", "info", "--format", "{{.ServerVersion}}"], timeout=15)
    if code != 0:
        return  # O Docker fora do ar e tratado como servico; os conteineres esperam por ele.

    current = {container["name"]: container for container in inspect_containers()}
    database = current.get(PROTECTED_CONTAINER)
    database_failing, database_detail = container_failing(database)
    # Postgres nunca e reiniciado sozinho: derrubaria todos e pode estar em recuperacao.
    set_alert(f"container:{PROTECTED_CONTAINER}", database_failing, "critical", "Postgres com problema", database_detail)
    if database_failing:
        return  # Reiniciar o que depende dele nao resolve e so piora.

    for name, info in expected_containers().items():
        if in_maintenance(info["slug"]):
            continue
        container = current.get(name)
        failing, detail = container_failing(container)
        key = f"container:{name}"
        label = f"Container {name}"
        apply_decision(key, label, failing, detail, lambda n=name, c=container, i=info: restart_container(n, c, i), enabled)


def heal_services(enabled):
    probes = service_probes()
    for unit in SERVICES.get(role(), []):
        if unit in ("frotak-sentinel",):
            continue
        state = service_state(unit)
        if state["enabled"] not in ("enabled", "enabled-runtime", "linked"):
            continue  # Instalacao ainda em andamento: nao liga o que ninguem habilitou.
        failing, detail = False, ""
        if state["active"] != "active":
            failing, detail = True, f"estado {state['active']}/{state['sub']}"
        elif unit in probes:
            probe = probes[unit]()
            if not probe.get("ok"):
                failing, detail = True, f"sem resposta: {probe.get('status') or probe.get('error', '')}"
        elif unit.startswith("wg-quick"):
            peer = peer_probe()
            wg = wireguard_state() or {"peers": []}
            age = min((p["handshakeAgeSeconds"] or 10**9 for p in wg["peers"]), default=10**9)
            if not peer.get("ok") and age > HANDSHAKE_STALE:
                failing, detail = True, f"túnel sem tráfego há {age if age < 10**9 else 'muito'} s"
        apply_decision(f"service:{unit}", f"Serviço {unit}", failing, detail, lambda u=unit: restart_service(u), enabled)


def check_disk(enabled):
    used, total = root_disk()
    percent = 100 * used / total if total else 0
    level = "critical" if percent >= DISK_CRITICAL else "warning"
    set_alert("disk", percent >= DISK_WARNING, level, f"Disco em {percent:.0f}%", "")
    if percent >= DISK_CRITICAL and enabled:
        with db() as connection:
            row = connection.execute("select value from settings where key = 'last_cleanup'").fetchone()
        if row is None or time.time() - float(row["value"]) > CLEANUP_COOLDOWN:
            freed = disk_cleanup()
            with db() as connection:
                connection.execute(
                    "insert into settings (key, value) values ('last_cleanup', ?) "
                    "on conflict (key) do update set value = excluded.value",
                    (str(time.time()),),
                )
            record_event("warning", "cleanup", "disk", f"Limpeza de disco liberou {freed // (1024 * 1024)} MB")


def check_resources():
    usage = meminfo()
    percent = 100 * usage["used"] / usage["total"]
    level = "critical" if percent >= MEMORY_CRITICAL else "warning"
    set_alert("memory", percent >= MEMORY_WARNING, level, f"Memória em {percent:.0f}%", "")
    with db() as connection:
        samples = [row["cpu"] for row in connection.execute("select cpu from host_metrics order by ts desc limit 5")]
    high = len(samples) == 5 and min(samples) >= CPU_CRITICAL
    set_alert("cpu", high, "warning", "CPU acima de 90% há 5 minutos", "")


def check_backups():
    if role() != "db":
        return
    state = backups_state()
    if not state.get("scheduled"):
        return
    newest = max((copy["at"] for copy in state["copies"]), default=0)
    stale = time.time() - newest > BACKUP_MAX_AGE
    set_alert("backup:age", stale, "critical", "Nenhum backup nas últimas 26 h", "")
    set_alert(
        "backup:result",
        state["lastRun"]["result"] not in ("success", ""),
        "critical",
        "Último backup falhou",
        state["lastRun"]["result"],
    )
    set_alert(
        "backup:restore-test",
        state["lastRestoreTest"]["result"] not in ("success", ""),
        "critical",
        "Último teste de restauração falhou",
        state["lastRestoreTest"]["result"],
    )


def check_peer():
    probe = peer_probe()
    other = "VPS de Serviço" if role() == "db" else "VPS de banco"
    set_alert("peer", not probe.get("ok"), "critical", f"{other} sem resposta pela rede privada", str(probe.get("error", "")))


def check_certificates():
    soon = time.time() + 14 * 86400
    for row in certificates():
        problem = not row["valid"] or row["expiresAt"] < soon
        set_alert(f"certificate:{row['host']}", problem, "warning", f"Certificado de {row['host']} vence em menos de 14 dias ou é inválido", row.get("error", ""))


def heal_tick():
    enabled = heal_enabled()
    for step in (
        lambda: heal_containers(enabled) if role() == "db" else None,
        lambda: heal_services(enabled),
        lambda: check_disk(enabled),
        check_resources,
        check_backups,
        check_peer,
        check_certificates,
    ):
        try:
            step()
        except Exception as error:  # Uma verificacao quebrada nao pode parar as outras.
            log(f"verificacao falhou: {error}")


def heal_loop():
    while True:
        heal_tick()
        last_cycle["at"] = time.time()
        time.sleep(HEAL_INTERVAL)


# ---------------------------------------------------------------- historico


def collect_tick():
    now = int(time.time())
    cpu = sample_cpu()
    rx, tx = sample_network()
    usage = meminfo()
    used, total = root_disk()
    load1 = os.getloadavg()[0]
    stats = sample_container_stats()
    stats_cache.update(at=now, value=stats)
    with db() as connection:
        connection.execute(
            "insert or replace into host_metrics values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (now, cpu, usage["used"], usage["total"], usage["swapUsed"], used, total, load1, rx, tx),
        )
        connection.executemany(
            "insert or replace into container_metrics values (?, ?, ?, ?)",
            [(now, name, row["cpuPercent"], row["memBytes"]) for name, row in stats.items()],
        )
        connection.execute("delete from host_metrics where ts < ?", (now - HOST_RETENTION,))
        connection.execute("delete from container_metrics where ts < ?", (now - CONTAINER_RETENTION,))
        connection.execute("delete from events where ts < ?", (now - EVENT_RETENTION,))


def collect_loop():
    sample_cpu()
    sample_network()
    time.sleep(5)
    while True:
        try:
            collect_tick()
        except Exception as error:
            log(f"coleta falhou: {error}")
        time.sleep(COLLECT_INTERVAL)


def bucket_for(hours):
    if hours <= 6:
        return 60
    if hours <= 24:
        return 300
    return 1800


def host_metrics(hours):
    bucket = bucket_for(hours)
    since = int(time.time()) - hours * 3600
    with db() as connection:
        rows = connection.execute(
            f"""
            select (ts / {bucket}) * {bucket} as ts, avg(cpu) as cpu, avg(mem_used) as mem_used, max(mem_total) as mem_total,
                   avg(disk_used) as disk_used, max(disk_total) as disk_total, avg(load1) as load1,
                   avg(net_rx) as net_rx, avg(net_tx) as net_tx
            from host_metrics where ts >= ? group by 1 order by 1
            """,
            (since,),
        ).fetchall()
    return {"bucketSeconds": bucket, "points": [dict(row) for row in rows]}


def container_metrics(name, hours):
    bucket = bucket_for(hours)
    since = int(time.time()) - hours * 3600
    with db() as connection:
        rows = connection.execute(
            f"""
            select (ts / {bucket}) * {bucket} as ts, avg(cpu) as cpu, avg(mem) as mem
            from container_metrics where name = ? and ts >= ? group by 1 order by 1
            """,
            (name, since),
        ).fetchall()
    return {"bucketSeconds": bucket, "points": [dict(row) for row in rows]}


def recent_events(limit):
    with db() as connection:
        rows = connection.execute(
            "select id, ts, level, kind, target, title, detail from events order by id desc limit ?", (limit,)
        ).fetchall()
    return [dict(row) for row in rows]


def open_alerts():
    with db() as connection:
        rows = connection.execute("select key, since, level, title, detail from alerts order by since desc").fetchall()
    return [dict(row) for row in rows]


def heal_view():
    day_ago = int(time.time()) - 86400
    with db() as connection:
        actions = connection.execute(
            "select count(*) from events where ts >= ? and kind in ('restart', 'cleanup')", (day_ago,)
        ).fetchone()[0]
    attention = [
        {"target": key, "attempts": len(state.attempts), "gaveUp": state.gave_up, "fails": state.fails}
        for key, state in heal_states.items()
        if state.gave_up or state.fails
    ]
    return {
        "enabled": heal_enabled(),
        "rules": RULES.get(role(), []),
        "actionsLast24h": actions,
        "attention": attention,
        "lastCycleAt": int(last_cycle["at"]),
        "intervalSeconds": HEAL_INTERVAL,
    }


def overview():
    def compute():
        return {
            "role": role(),
            "capturedAt": int(time.time()),
            "host": host_info(),
            "services": [service_state(unit) for unit in SERVICES.get(role(), [])],
            "containers": containers_view(),
            "wireguard": wireguard_state(),
            "listening": listening_ports(),
            "firewall": firewall_rules(),
            "disks": disks(),
            "directories": directories(),
            "certificates": certificates(),
            "backups": backups_state(),
            "heal": heal_view(),
            "alerts": open_alerts(),
        }

    return memoize("overview", 8, compute)


# ---------------------------------------------------------------- acoes e logs


def logs(kind, name, lines):
    lines = max(10, min(lines, 500))
    if kind == "container":
        known = {container["name"] for container in inspect_containers()}
        if name not in known:
            raise ApiError(404, "NOT_FOUND", "Container não encontrado.")
        _, out, error = run(["docker", "logs", "--tail", str(lines), "--timestamps", name], timeout=25)
        text = out + error
    elif kind == "service":
        if name not in SERVICES.get(role(), []):
            raise ApiError(404, "NOT_FOUND", "Serviço não encontrado.")
        _, text, _ = run(["journalctl", "-u", name, "-n", str(lines), "--no-pager", "-o", "short-iso"], timeout=25)
    else:
        raise ApiError(400, "INVALID_INPUT", "Tipo de log inválido.")
    clean = [scrub_logs(line)[:2000] for line in text.splitlines()]
    return {"lines": clean[-lines:]}


def manual_restart(payload):
    kind, name, actor = payload.get("kind"), payload.get("name"), str(payload.get("actor") or "painel")[:200]
    if not isinstance(name, str) or not NAME_RE.match(name):
        raise ApiError(400, "INVALID_INPUT", "Nome inválido.")
    if kind == "container":
        expected = expected_containers() if role() == "db" else {}
        current = {container["name"]: container for container in inspect_containers()}
        if name == PROTECTED_CONTAINER:
            code, _, error = run(["docker", "restart", "--time", "60", name], timeout=180)
        elif name in expected:
            code, _, error = restart_container(name, current.get(name), expected[name])
        else:
            raise ApiError(404, "NOT_FOUND", "Container não pode ser reiniciado por aqui.")
    elif kind == "service":
        if name not in SERVICES.get(role(), []) or name in NOT_RESTARTABLE:
            raise ApiError(404, "NOT_FOUND", "Serviço não pode ser reiniciado por aqui.")
        # O Master pode estar reiniciando a si mesmo: responde antes de agir.
        threading.Timer(1.0, restart_service, args=(name,)).start()
        code, error = 0, ""
    else:
        raise ApiError(400, "INVALID_INPUT", "Tipo inválido.")
    if code != 0:
        record_event("critical", "manual_failed", f"{kind}:{name}", f"Falha ao reiniciar {name}", f"por {actor}: {error}")
        raise ApiError(500, "RESTART_FAILED", "Não foi possível reiniciar.")
    record_event("info", "manual", f"{kind}:{name}", f"{name} reiniciado pelo painel", f"por {actor}")
    with lock:
        cache.pop("overview", None)
    return {"ok": True}


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


# ---------------------------------------------------------------- HTTP


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        return

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
            raise ApiError(400, "INVALID_JSON", "Corpo inválido.") from error

    def query(self):
        pairs = {}
        if "?" in self.path:
            for part in self.path.split("?", 1)[1].split("&"):
                key, _, value = part.partition("=")
                pairs[key] = urllib.request.unquote(value)
        return pairs

    def hours(self, query):
        value = query.get("hours", "24")
        return min(max(int(value), 1), 168) if value.isdigit() else 24

    def route(self):
        path = self.path.split("?")[0].rstrip("/")
        query = self.query()
        method = self.command
        if method == "GET" and path == "/overview":
            return 200, overview()
        if method == "GET" and path == "/metrics":
            return 200, host_metrics(self.hours(query))
        if method == "GET" and path == "/container-metrics":
            name = query.get("name", "")
            if not NAME_RE.match(name):
                raise ApiError(400, "INVALID_INPUT", "Nome inválido.")
            return 200, container_metrics(name, self.hours(query))
        if method == "GET" and path == "/logs":
            name = query.get("name", "")
            if not NAME_RE.match(name):
                raise ApiError(400, "INVALID_INPUT", "Nome inválido.")
            lines = query.get("lines", "200")
            return 200, logs(query.get("kind", ""), name, int(lines) if lines.isdigit() else 200)
        if method == "GET" and path == "/events":
            limit = query.get("limit", "100")
            return 200, {"events": recent_events(min(int(limit) if limit.isdigit() else 100, 500))}
        if method == "POST" and path == "/restart":
            return 200, manual_restart(self.body())
        if method == "POST" and path == "/heal":
            payload = self.body()
            if not isinstance(payload.get("enabled"), bool):
                raise ApiError(400, "INVALID_INPUT", "Valor inválido.")
            set_heal_enabled(payload["enabled"], str(payload.get("actor") or "painel")[:200])
            with lock:
                cache.pop("overview", None)
            return 200, {"enabled": payload["enabled"]}
        raise ApiError(404, "NOT_FOUND", "Rota inexistente.")

    def handle_request(self):
        if self.path == "/health":
            return self.respond(200, {"ok": True, "role": role()})
        token = os.environ.get("FROTAK_SENTINEL_TOKEN", "")
        sent = (self.headers.get("Authorization") or "").replace("Bearer ", "", 1)
        if not token or not hmac.compare_digest(sent, token):
            return self.respond(401, {"code": "UNAUTHORIZED", "message": "Token inválido."})
        try:
            status, body = self.route()
            self.respond(status, body)
        except ApiError as error:
            self.respond(error.status, {"code": error.code, "message": error.message})
        except Exception as error:
            log(f"{self.command} {self.path.split('?')[0]}: {scrub_logs(str(error))[:300]}")
            self.respond(500, {"code": "INTERNAL", "message": "Falha na sentinela."})

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()


def notify_systemd(message):
    address = os.environ.get("NOTIFY_SOCKET")
    if not address:
        return
    if address.startswith("@"):
        address = "\0" + address[1:]
    with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as sock:
        sock.sendto(message.encode(), address)


def watchdog_loop():
    """So avisa o systemd enquanto as verificacoes giram: se travarem, ele reinicia a sentinela."""
    while True:
        if time.time() - last_cycle["at"] < 240:
            notify_systemd("WATCHDOG=1")
        time.sleep(60)


def serve():
    init_db()
    bind = wireguard_ip() or "127.0.0.1"
    server = ThreadingHTTPServer((bind, PORT), Handler)
    last_cycle["at"] = time.time()
    threading.Thread(target=collect_loop, daemon=True).start()
    threading.Thread(target=heal_loop, daemon=True).start()
    threading.Thread(target=watchdog_loop, daemon=True).start()
    notify_systemd("READY=1")
    log(f"escutando em {bind}:{PORT}, papel {role()}")
    server.serve_forever()


if __name__ == "__main__":
    serve()
