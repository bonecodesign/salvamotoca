"""Offline tests for G1 auth-only diagnostic. No real connections or secrets."""
from __future__ import annotations

import contextlib
import importlib.util
import io
import os
from pathlib import Path
from types import SimpleNamespace
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / "scripts" / "g1-auth-readonly-probe.py"
spec = importlib.util.spec_from_file_location("g1_auth_readonly_probe", FILE)
assert spec and spec.loader
probe = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = probe
spec.loader.exec_module(probe)

FAKE_URI = (
    "postgresql://postgres.yivkqyjdeouxnwtwfekc:FICTIONAL%40PASSWORD"
    "@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
)
CONFIRMED = {
    "GITHUB_REPOSITORY": "bonecodesign/salvamotoca",
    "GITHUB_REF": "refs/heads/main",
    "GITHUB_EVENT_NAME": "workflow_dispatch",
    "G1_DIAGNOSE_CONFIRM": "DIAGNOSTICAR_POSTGRES_TESTES",
    "G1_SUPABASE_DB_URL": FAKE_URI,
}


class ProbeTests(unittest.TestCase):
    def test_successful_synthetic_psql_result_is_only_readonly_probe(self):
        success = SimpleNamespace(returncode=0, stdout="1\n", stderr="")
        with patch.dict(os.environ, CONFIRMED), patch.object(
            probe.subprocess, "run", return_value=success
        ) as called:
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(probe.main(), 0)
            args, kwargs = called.call_args
            self.assertEqual(args[0][-2:], ["-c", "SELECT 1;"])
            self.assertFalse(any("FICTIONAL" in x for x in args[0]))
            self.assertNotIn("G1_SUPABASE_DB_URL", kwargs["env"])
            self.assertEqual(kwargs["env"]["PGPASSWORD"], "FICTIONAL@PASSWORD")
            self.assertEqual(kwargs["env"]["PGPORT"], "5432")
            self.assertEqual(kwargs["env"]["PGSSLMODE"], "require")
            self.assertEqual(kwargs["env"]["PGCONNECT_TIMEOUT"], "8")
            self.assertIn("G1_AUTH_PROBE=PASS:READ_ONLY_CONNECTION_OK", output.getvalue())
            self.assertIn("G1_REMOTE_BACKUP=NOT_ATTEMPTED", output.getvalue())
            self.assertNotIn("FICTIONAL", output.getvalue())

    def test_password_rejection_is_classified_and_redacted(self):
        fake_error = 'psql: FATAL: password authentication failed for user "postgres.yivkqyjdeouxnwtwfekc" [SECRET_IN_STDERR]'
        with patch.dict(os.environ, CONFIRMED), patch.object(
            probe.subprocess, "run",
            return_value=SimpleNamespace(returncode=2, stdout="", stderr=fake_error),
        ):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(probe.main(), 2)
            self.assertIn("G1_AUTH_PROBE=FAIL:PASSWORD_REJECTED", output.getvalue())
            self.assertNotIn("SECRET_IN_STDERR", output.getvalue())
            self.assertNotIn("FICTIONAL", output.getvalue())

    def test_failure_categories_are_only_codes(self):
        cases = [
            ("FATAL: Tenant or user not found", "POOLER_TENANT_REJECTED"),
            ('FATAL: role "fake" does not exist', "ROLE_UNKNOWN"),
            ("permission denied for schema storage", "ACCESS_DENIED"),
            ("could not translate host name into address", "NETWORK_OR_DNS_FAILURE"),
            ("an unexpected connection failure", "CONNECTION_FAILED_UNCLASSIFIED"),
        ]
        for error, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(probe.classify_error(error), expected)

    def test_invalid_uri_never_invokes_psql(self):
        values = dict(CONFIRMED, G1_SUPABASE_DB_URL=FAKE_URI.replace(":5432/", ":6543/"))
        with patch.dict(os.environ, values), patch.object(probe.subprocess, "run") as called:
            self.assertEqual(probe.run_probe(), (False, "URI_INVALID"))
            called.assert_not_called()

    def test_wrong_event_never_invokes_psql(self):
        values = dict(CONFIRMED, GITHUB_EVENT_NAME="pull_request")
        with patch.dict(os.environ, values), patch.object(probe.subprocess, "run") as called:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(probe.main(), 2)
            called.assert_not_called()
            self.assertIn("REJECTED:MANUAL_ONLY", out.getvalue())

    def test_timeout_is_classified_without_errors(self):
        with patch.dict(os.environ, CONFIRMED), patch.object(
            probe.subprocess, "run",
            side_effect=probe.subprocess.TimeoutExpired(cmd="psql", timeout=15),
        ):
            self.assertEqual(probe.run_probe(), (False, "CONNECT_TIMEOUT"))

    def test_missing_psql_is_classified_without_traceback(self):
        with patch.dict(os.environ, CONFIRMED), patch.object(
            probe.subprocess, "run", side_effect=FileNotFoundError(),
        ):
            self.assertEqual(probe.run_probe(), (False, "PSQL_MISSING"))


if __name__ == "__main__":
    unittest.main()
