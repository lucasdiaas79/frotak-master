"""Regras de endereco do agente, sem Postgres nem Docker.
Uso: python3 -m unittest deploy/db/agent/test_agent.py"""
import importlib.util
import sys
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("frotak_agent", Path(__file__).parent / "frotak_agent.py")
agent = importlib.util.module_from_spec(spec)
sys.modules["frotak_agent"] = agent
spec.loader.exec_module(agent)

METAS = {
    "acme": {"subdomain": "acme-nova", "domains": [{"host": "tms.acme.com.br", "addedAt": "x"}]},
    # Cliente de antes dos enderecos editaveis: ficha sem subdominio nem dominios.
    "beta": {"name": "Beta"},
}


class Enderecos(unittest.TestCase):
    def setUp(self):
        self.saved = (agent.settings, agent.client_slugs, agent.client_meta)
        agent.settings = lambda: {
            "CLIENT_BASE_DOMAIN": "Frotak.App",
            "API_HOST": "api.frotak.app",
            "MASTER_HOST": "master.frotak.app",
            "SERVICE_PUBLIC_IP": "203.0.113.10",
        }
        agent.client_slugs = lambda: sorted(METAS)
        agent.client_meta = lambda slug: METAS.get(slug, {})

    def tearDown(self):
        agent.settings, agent.client_slugs, agent.client_meta = self.saved

    def test_hosts_do_cliente(self):
        self.assertEqual(agent.client_hosts("acme"), ["acme-nova.frotak.app", "tms.acme.com.br"])
        self.assertEqual(agent.client_hosts("beta"), ["beta.frotak.app"])
        self.assertEqual(agent.primary_url("acme"), "https://acme-nova.frotak.app")

    def test_indice_de_enderecos(self):
        index = agent.host_index()
        self.assertEqual(index["acme-nova.frotak.app"], "acme")
        self.assertEqual(index["tms.acme.com.br"], "acme")
        self.assertEqual(index["beta.frotak.app"], "beta")
        self.assertNotIn("acme.frotak.app", index, "o endereco antigo deixa de valer")

    def test_subdominio_ocupado(self):
        self.assertTrue(agent.subdomain_taken("acme-nova"))
        self.assertTrue(agent.subdomain_taken("acme"), "identificador de outro cliente fica reservado")
        self.assertFalse(agent.subdomain_taken("acme", except_slug="acme"), "o proprio pode voltar ao identificador")
        self.assertFalse(agent.subdomain_taken("gama"))

    def test_conferencia_de_subdominio(self):
        self.assertTrue(agent.check_subdomain("gama")["available"])
        self.assertFalse(agent.check_subdomain("master")["available"])
        self.assertFalse(agent.check_subdomain("beta")["available"])
        self.assertFalse(agent.check_subdomain("-x")["available"])
        self.assertEqual(agent.check_subdomain("gama")["host"], "gama.frotak.app")

    def test_env_dos_enderecos(self):
        env = agent.address_env("acme", METAS["acme"])
        self.assertEqual(env["CLIENT_SITE_URL"], "https://acme-nova.frotak.app")
        self.assertEqual(
            env["CLIENT_URI_ALLOW_LIST"], "https://acme-nova.frotak.app/**,https://tms.acme.com.br/**"
        )

    def test_normalizacao(self):
        self.assertEqual(agent.normalize_host(" TMS.Acme.com.br.:443 "), "tms.acme.com.br")
        self.assertTrue(agent.HOST_RE.match("tms.acme.com.br"))
        self.assertFalse(agent.HOST_RE.match("acme"))
        self.assertFalse(agent.HOST_RE.match("tms_acme.com"))

    def test_senha_temporaria(self):
        for _ in range(50):
            value = agent.temporary_password()
            self.assertEqual(len(value), 16)
            self.assertTrue(any(c.isupper() for c in value) and any(c.islower() for c in value))
            self.assertTrue(any(c.isdigit() for c in value))
            self.assertFalse(set(value) & set("0O1lI"))


if __name__ == "__main__":
    unittest.main()


class Notificacoes(unittest.TestCase):
    RULE = {
        "id": "6f1c2a3e-6d1f-4c0a-9b0e-0f5a1d000001",
        "tenant_id": None,
        "name": "Frete do O'Neil",
        "source": "freights",
        "trigger_kind": "update",
        "title_template": "Frete {{placa}}: {{etapa}}",
    }

    def setUp(self):
        self.saved = (
            agent.psql, agent.client_env, agent.client_meta, agent.names_for, agent.post_to_tms, agent.log
        )
        self.statements = []
        self.posts = []
        self.logs = []
        self.answers = {}
        agent.client_env = lambda slug: {}
        agent.client_meta = lambda slug: {"tenantId": "11111111-1111-4111-8111-111111111111"}
        agent.names_for = lambda slug: {"db": f"frotak_{slug}"}

        def fake_psql(database, statement, user="supabase_admin"):
            self.statements.append((database, statement))
            for key, answer in self.answers.items():
                if key in statement:
                    if isinstance(answer, Exception):
                        raise answer
                    return answer
            return ""

        agent.psql = fake_psql
        agent.post_to_tms = lambda slug, path, body, headers: self.posts.append((slug, path, headers))
        agent.log = self.logs.append

    def tearDown(self):
        (
            agent.psql, agent.client_env, agent.client_meta, agent.names_for, agent.post_to_tms, agent.log
        ) = self.saved

    def test_regras_validas_vao_para_o_banco_do_cliente(self):
        self.answers["master_sync_notification_rules"] = "1"
        result = agent.set_notification_rules("acme", {"rules": [self.RULE]})
        self.assertEqual(result, {"ok": True, "rules": 1})
        database, statement = self.statements[-1]
        self.assertEqual(database, "frotak_acme")
        self.assertIn("master_sync_notification_rules('11111111-1111-4111-8111-111111111111'::uuid,", statement)
        self.assertIn("Frete do O''Neil", statement, "aspas simples escapadas")

    def test_regras_invalidas_sao_recusadas(self):
        casos = [
            {},
            {"rules": "tudo"},
            {"rules": [{"id": "nao-e-uuid", "source": "freights"}]},
            {"rules": [{**self.RULE, "source": "auth.users"}]},
            {"rules": [self.RULE] * (agent.NOTIFICATION_RULES_MAX + 1)},
            {"rules": [{**self.RULE, "title_template": "x" * (agent.NOTIFICATION_RULES_MAX_BYTES + 1)}]},
        ]
        for payload in casos:
            with self.assertRaises(agent.AgentError) as raised:
                agent.set_notification_rules("acme", payload)
            self.assertEqual(raised.exception.status, 400)
        self.assertEqual(self.statements, [], "nada chega ao banco")

    def test_envio_so_quando_ha_aviso_pendente(self):
        now = agent.datetime.datetime(2026, 11, 26, 14, 7, tzinfo=agent.datetime.timezone.utc)
        cfg = {"FROTAK_PUSH_CRON_TOKEN": "segredo"}
        self.answers["push_status = 'pending'"] = "f"
        agent.notification_tick("acme", "frotak_acme", now, cfg)
        self.assertEqual(self.posts, [])
        self.answers["push_status = 'pending'"] = "t"
        agent.notification_tick("acme", "frotak_acme", now, cfg)
        self.assertEqual(
            self.posts, [("acme", "/api/notifications/dispatch", {"x-frotak-push-token": "segredo"})]
        )
        self.assertFalse(any("evaluate_scheduled" in s for _, s in self.statements), "fora do quarto de hora")

    def test_agendadas_a_cada_15_minutos(self):
        cfg = {"FROTAK_PUSH_CRON_TOKEN": "segredo"}
        self.answers["push_status = 'pending'"] = "f"
        for minute, expected in ((0, True), (15, True), (16, False), (45, True)):
            self.statements.clear()
            now = agent.datetime.datetime(2026, 11, 26, 9, minute, tzinfo=agent.datetime.timezone.utc)
            agent.notification_tick("acme", "frotak_acme", now, cfg)
            ran = any("evaluate_scheduled_notification_rules" in s for _, s in self.statements)
            self.assertEqual(ran, expected, f"minuto {minute}")

    def test_banco_sem_a_migration_nao_enche_o_log(self):
        missing = agent.AgentError(500, "SQL_FAILED", 'relation "public.notifications" does not exist')
        self.answers["push_status = 'pending'"] = missing
        self.answers["evaluate_scheduled"] = agent.AgentError(500, "SQL_FAILED", "function does not exist")
        now = agent.datetime.datetime(2026, 11, 26, 9, 0, tzinfo=agent.datetime.timezone.utc)
        agent.notification_tick("acme", "frotak_acme", now, {"FROTAK_PUSH_CRON_TOKEN": "x"})
        self.assertEqual(self.logs, [])
        self.assertEqual(self.posts, [])
