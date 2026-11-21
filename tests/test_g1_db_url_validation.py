"""G1 URL preflight tests: fake values only, zero network and zero secrets."""
from __future__ import annotations
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "g1-validate-db-url.py"
spec = importlib.util.spec_from_file_location("g1_validate_db_url", SCRIPT)
assert spec and spec.loader
validator = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = validator
spec.loader.exec_module(validator)

USER = "postgres.yivkqyjdeouxnwtwfekc"
HOST = "aws-0-sa-east-1.pooler.supabase.com"


def uri(password="synthetic%40password", host=HOST, port=5432, user=USER, query=""):
    return f"postgresql://{user}:{password}@{host}:{port}/postgres{query}"


class ValidationTests(unittest.TestCase):
    def test_session_pooler_url_is_accepted_without_authentication(self):
        self.assertIsNone(validator.check(uri()))
        self.assertIsNone(validator.check(uri(query="?sslmode=require")))
        self.assertIsNone(validator.check(uri(password="fake%40%23%3F%3A%2F%25value")))
        self.assertIsNone(validator.check(uri(password="fake%20encoded%20space")))

    def test_invalid_connection_shapes_fail_closed(self):
        bad = [
            (uri(host="db.yivkqyjdeouxnwtwfekc.supabase.co"), "EXPECTED_SESSION_POOLER_HOST"),
            (uri(host="fake-attacker.pooler.supabase.com"), "EXPECTED_SESSION_POOLER_HOST"),
            (uri(port=6543), "EXPECTED_SESSION_POOLER_PORT_5432"),
            (uri(user="postgres.otherproject"), "WRONG_SUPABASE_PROJECT_USER"),
            (uri(password=""), "PASSWORD_PLACEHOLDER_OR_MISSING"),
            (uri(password="YOUR-PASSWORD"), "PASSWORD_PLACEHOLDER_OR_MISSING"),
            (uri(password="fake%XX"), "INVALID_PERCENT_ENCODING"),
            (uri(password="raw@symbol"), "INVALID_URI_USERINFO_ENCODING"),
            (uri(password="fake%"), "INVALID_PERCENT_ENCODING"),
            (uri(query="?sslmode=disable"), "INVALID_TLS_QUERY"),
            (uri(query="?sslmode=require&options=unsafe"), "INVALID_TLS_QUERY"),
            (uri(password="bad\npassword"), "INVALID_URI_WHITESPACE_OR_SIZE"),
        ]
        for value, label in bad:
            with self.subTest(label=label):
                with self.assertRaises(validator.UnsafeDBUrl) as ex:
                    validator.check(value)
                self.assertEqual(str(ex.exception), label)

    def test_does_not_echo_fake_password_even_when_invalid(self):
        marker = "TEST_PASSWORD_NEVER_LOG_ME"
        env = dict(os.environ, G1_SUPABASE_DB_URL=uri(password=marker + "@bad"))
        process = subprocess.run(
            [sys.executable, str(SCRIPT)], env=env,
            capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(process.returncode, 2)
        self.assertIn("G1_DB_URI_STATIC=REJECTED", process.stderr)
        self.assertNotIn(marker, process.stdout + process.stderr)
        self.assertNotIn(HOST, process.stdout + process.stderr)

    def test_success_does_not_claim_authentication(self):
        env = dict(os.environ, G1_SUPABASE_DB_URL=uri())
        process = subprocess.run(
            [sys.executable, str(SCRIPT)], env=env,
            capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(process.returncode, 0)
        self.assertIn("G1_DB_CONNECTION_AUTHENTICATED=UNVERIFIED", process.stdout)
        self.assertIn("G1_DB_REMOTE_ACCESS=NOT_ATTEMPTED", process.stdout)


if __name__ == "__main__":
    unittest.main()
