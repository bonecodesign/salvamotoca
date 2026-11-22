"""Entirely fictitious no-network regression tests for G1 privileged RPC audit."""
from __future__ import annotations

import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/g1-verify-rpc-privileges-offline.py"
spec = importlib.util.spec_from_file_location("g1_rpc_audit", SCRIPT)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def fixture() -> dict:
    return {
        "project_ref": module.PROJECT,
        "functions": [
            {
                "name": name, "signature": sig, "owner_role": "postgres",
                "security_definer": True, "search_path_locked": True,
                "public_execute": False, "anon_execute": False,
                "authenticated_execute": True,
                "references_auth_uid": True,
            }
            for name, sig in module.EXPECTED.items()
        ],
    }


class RPCGuard(unittest.TestCase):
    def test_fixture_passes_but_cannot_approve_g1(self):
        self.assertIsNone(module.audit(fixture()))

    def test_missing_function_is_blocked(self):
        data = fixture()
        data["functions"].pop()
        with self.assertRaisesRegex(module.Blocked, "PRIVILEGED_RPC_SET_CHANGED"):
            module.audit(data)

    def test_added_function_is_blocked(self):
        data = fixture()
        data["functions"].append(copy.deepcopy(data["functions"][0]))
        with self.assertRaisesRegex(module.Blocked, "PRIVILEGED_RPC_SET_CHANGED"):
            module.audit(data)

    def test_function_identity_mismatch(self):
        data = fixture()
        data["functions"][0]["signature"] = "p_quote_id text, p_accept boolean"
        with self.assertRaisesRegex(module.Blocked, "SIGNATURE_CHANGED"):
            module.audit(data)

    def test_anon_exec_rejected(self):
        for key in ("anon_execute", "public_execute"):
            with self.subTest(key=key):
                data = fixture()
                data["functions"][0][key] = True
                with self.assertRaisesRegex(module.Blocked, "ANONYMOUS_ACCESS"):
                    module.audit(data)

    def test_open_search_path_rejected(self):
        data = fixture()
        data["functions"][2]["search_path_locked"] = False
        with self.assertRaisesRegex(module.Blocked, "SEARCH_PATH_OPEN"):
            module.audit(data)

    def test_missing_identity_reference_rejected(self):
        data = fixture()
        data["functions"][3]["references_auth_uid"] = False
        with self.assertRaisesRegex(module.Blocked, "MISSING_IDENTITY_REFERENCE"):
            module.audit(data)

    def test_role_and_auth_grant_drift_are_reviewed(self):
        for key, value, code in (
            ("owner_role", "anon", "OWNER_CHANGED"),
            ("authenticated_execute", False, "AUTH_GRANT_CHANGED"),
            ("security_definer", False, "MODE_CHANGED"),
        ):
            with self.subTest(key=key):
                data = fixture()
                data["functions"][0][key] = value
                with self.assertRaisesRegex(module.Blocked, code):
                    module.audit(data)

    def test_wrong_project_and_wrong_types_rejected(self):
        data = fixture()
        data["project_ref"] = "another-project"
        with self.assertRaisesRegex(module.Blocked, "WRONG_PROJECT"):
            module.audit(data)
        data = fixture()
        data["functions"][0]["public_execute"] = 0
        with self.assertRaisesRegex(module.Blocked, "INVALID_RPC_FLAGS"):
            module.audit(data)

    def test_cli_does_not_log_invalid_payload(self):
        secret_marker = "DO_NOT_PRINT_SYNTHETIC_SECRET"
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "audit.json"
            path.write_text(json.dumps({
                "project_ref": secret_marker,
                "functions": fixture()["functions"],
            }), encoding="utf-8")
            proc = subprocess.run(
                [sys.executable, str(SCRIPT), "--input", str(path)],
                capture_output=True, text=True, timeout=10,
            )
            self.assertNotEqual(proc.returncode, 0)
            self.assertNotIn(secret_marker, proc.stdout + proc.stderr)
            self.assertIn("G1_RPC_METADATA=REVIEW_REQUIRED", proc.stderr)

    def test_cli_wrapped_result_passes_without_claiming_authorization(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "audit.json"
            path.write_text(json.dumps([
                {"g1_rpc_metadata": json.dumps(fixture())}
            ]), encoding="utf-8")
            proc = subprocess.run(
                [sys.executable, str(SCRIPT), "--input", str(path)],
                capture_output=True, text=True, timeout=10,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertIn("G1_RPC_METADATA=PASS", proc.stdout)
            self.assertIn("G1_RPC_AUTHORIZATION_BEHAVIOR=NOT_PROVEN", proc.stdout)
            self.assertIn("G1=BLOCKED", proc.stdout)
            self.assertNotIn("G1=PASS", proc.stdout)


if __name__ == "__main__":
    unittest.main()
