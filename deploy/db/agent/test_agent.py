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
