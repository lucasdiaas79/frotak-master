"""Regras da sentinela, sem servidor. Uso: python3 -m unittest deploy/common/sentinel/test_sentinel.py"""
import importlib.util
import sys
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("frotak_sentinel", Path(__file__).parent / "frotak_sentinel.py")
sentinel = importlib.util.module_from_spec(spec)
sys.modules["frotak_sentinel"] = sentinel
spec.loader.exec_module(sentinel)

decide = sentinel.decide
HealState = sentinel.HealState


def tick(state, failing, now):
    return decide(state, failing, now, threshold=3, limit=3, window=1800)


class Decide(unittest.TestCase):
    def test_saudavel_nao_faz_nada(self):
        self.assertEqual(tick(HealState(), False, 0), "ok")

    def test_oscilacao_curta_nao_reinicia(self):
        state = HealState()
        self.assertEqual(tick(state, True, 0), "wait")
        self.assertEqual(tick(state, True, 30), "wait")
        self.assertEqual(tick(state, False, 60), "ok")
        self.assertEqual(state.fails, 0)

    def test_falha_persistente_reinicia_na_terceira_verificacao(self):
        state = HealState()
        self.assertEqual([tick(state, True, t) for t in (0, 30, 60)], ["wait", "wait", "restart"])

    def test_depois_de_reiniciar_espera_antes_da_proxima_tentativa(self):
        state = HealState()
        [tick(state, True, t) for t in (0, 30, 60)]
        self.assertEqual(tick(state, True, 90), "wait")
        self.assertEqual(tick(state, True, 120), "wait")
        self.assertEqual(tick(state, True, 150), "restart")

    def test_recuperado_avisa_uma_vez(self):
        state = HealState()
        [tick(state, True, t) for t in (0, 30, 60)]
        self.assertEqual(tick(state, False, 90), "recovered")
        self.assertEqual(tick(state, False, 120), "ok")

    def test_limite_de_tentativas_para_e_avisa_uma_vez(self):
        state = HealState()
        results = [tick(state, True, t * 30) for t in range(16)]
        self.assertEqual(results.count("restart"), 3)
        self.assertEqual(results.count("give_up"), 1)
        self.assertEqual(results[-1], "wait")

    def test_oscilacao_que_volta_ainda_conta_tentativas(self):
        """Serviço que cai, volta e cai de novo não pode reiniciar para sempre."""
        state = HealState()
        restarts = 0
        now = 0
        for _ in range(8):
            for failing in (True, True, True, False):
                if tick(state, failing, now) == "restart":
                    restarts += 1
                now += 30
        self.assertEqual(restarts, 3)

    def test_depois_da_janela_tenta_de_novo(self):
        state = HealState()
        [tick(state, True, t * 30) for t in range(16)]
        self.assertTrue(state.gave_up)
        self.assertEqual(tick(state, True, 2000), "restart")
        self.assertFalse(state.gave_up)


class Container(unittest.TestCase):
    def test_estados(self):
        failing = sentinel.container_failing
        self.assertTrue(failing(None)[0])
        self.assertTrue(failing({"state": "exited"})[0])
        self.assertTrue(failing({"state": "paused"})[0])
        self.assertTrue(failing({"state": "running", "health": "unhealthy"})[0])
        self.assertFalse(failing({"state": "running", "health": "healthy"})[0])
        self.assertFalse(failing({"state": "running", "health": "starting"})[0])
        self.assertFalse(failing({"state": "running", "health": None})[0])


class Segredos(unittest.TestCase):
    def assertClean(self, text, secret):
        self.assertNotIn(secret, sentinel.scrub_logs(text))

    def test_jwt(self):
        self.assertClean("token eyJhbGciOiJIUzI1NiIs.eyJyb2xlIjoiYW5vbiJ9.abcDEF123", "eyJhbGciOiJIUzI1NiIs")

    def test_url_com_senha(self):
        self.assertClean("postgres://user:s3nh4Forte@db:5432/x", "s3nh4Forte")

    def test_chave_valor(self):
        self.assertClean('password=abc123 next', "abc123")
        self.assertClean('{"password":"abc123"}', "abc123")
        self.assertClean('{\\"token\\":\\"abc123\\"}', "abc123")
        self.assertClean("API_KEY: abc123", "abc123")
        self.assertClean("Authorization: Bearer abc123def456", "abc123def456")

    def test_alter_role(self):
        self.assertClean("ALTER ROLE x PASSWORD 'abc123'", "abc123")

    def test_log_comum_passa(self):
        line = "2026-11-05 GET /auth/v1/health 200 12ms"
        self.assertEqual(sentinel.scrub_logs(line), line)


class Utilitarios(unittest.TestCase):
    def test_tamanhos_do_docker(self):
        self.assertEqual(sentinel.parse_size("512MiB"), 512 * 1024**2)
        self.assertEqual(sentinel.parse_size("1.5GiB"), int(1.5 * 1024**3))
        self.assertEqual(sentinel.parse_size("20kB"), 20000)
        self.assertEqual(sentinel.parse_size("0B"), 0)
        self.assertEqual(sentinel.parse_size("--"), 0)

    def test_interface_ligada(self):
        self.assertTrue(sentinel.flags_up("0x1091"))
        self.assertTrue(sentinel.flags_up("0x91\n"))
        self.assertFalse(sentinel.flags_up("0x1090"))
        self.assertFalse(sentinel.flags_up("lixo"))

    def test_exposicao(self):
        self.assertEqual(sentinel.exposure("127.0.0.1", "10.60.0.1"), "local")
        self.assertEqual(sentinel.exposure("::1", "10.60.0.1"), "local")
        self.assertEqual(sentinel.exposure("10.60.0.1", "10.60.0.1"), "wireguard")
        self.assertEqual(sentinel.exposure("0.0.0.0", "10.60.0.1"), "public")
        self.assertEqual(sentinel.exposure("*", "10.60.0.1"), "public")


if __name__ == "__main__":
    unittest.main()
