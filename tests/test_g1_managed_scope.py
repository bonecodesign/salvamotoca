"""Synthetic, offline managed Auth/Storage gate regression cases for G1."""
from __future__ import annotations
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/g1-verify-managed-scope.py"
spec = importlib.util.spec_from_file_location("g1_managed_scope", SCRIPT)
assert spec and spec.loader
scope = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = scope
spec.loader.exec_module(scope)


def baseline():
    return {
        "auth_users": 0,
        "auth_identities": 0,
        "auth_sessions": 0,
        "auth_refresh_tokens": 0,
        "auth_mfa_factors": 0,
        "auth_flow_state": 0,
        "storage_objects": 0,
        "storage_buckets": [{
            "name": "request-photos", "private": True,
            "file_size_limit": 5242880,
            "allowed_mime_types": ["image/jpeg"],
        }],
        "storage_policy_count": 3,
    }


class ManagedScopeTests(unittest.TestCase):
    def blocked(self, value, expected):
        with self.assertRaises(scope.ManagedScopeBlocked) as error:
            scope.validate(value)
        self.assertEqual(str(error.exception), expected)

    def test_valid_metadata_is_not_restoration(self):
        self.assertIsNone(scope.validate(baseline()))

    def test_every_auth_table_is_guarded(self):
        for field in scope.AUTH_FIELDS:
            with self.subTest(field=field):
                v = baseline()
                v[field] = 1
                self.blocked(v, "AUTH_MANAGED_DATA_NOT_IN_G1_SQL")

    def test_physical_file_metadata_blocks_backup(self):
        v = baseline()
        v["storage_objects"] = 1
        self.blocked(v, "STORAGE_PHYSICAL_OBJECTS_NOT_INCLUDED")

    def test_bucket_not_private_or_mime_policy_changed(self):
        for key, value in (
            ("private", False),
            ("file_size_limit", 100000000),
            ("allowed_mime_types", ["image/png"]),
            ("name", "wrong-bucket"),
        ):
            with self.subTest(key=key):
                v = baseline()
                v["storage_buckets"][0][key] = value
                self.blocked(v, "STORAGE_BUCKET_CONFIGURATION_CHANGED")

    def test_boolean_is_not_integer(self):
        v = baseline()
        v["storage_buckets"][0]["private"] = 1
        self.blocked(v, "STORAGE_BUCKET_CONFIGURATION_CHANGED")
        v = baseline()
        v["storage_buckets"][0]["file_size_limit"] = True
        self.blocked(v, "STORAGE_BUCKET_CONFIGURATION_CHANGED")

    def test_bucket_removed_or_extra_bucket(self):
        v = baseline()
        v["storage_buckets"] = []
        self.blocked(v, "STORAGE_BUCKETS_REQUIRE_REVIEW")
        v = baseline()
        v["storage_buckets"].append(copy.deepcopy(v["storage_buckets"][0]))
        self.blocked(v, "STORAGE_BUCKETS_REQUIRE_REVIEW")

    def test_storage_policy_count_must_be_reviewed(self):
        for count in (0, 2, 4):
            with self.subTest(count=count):
                v = baseline()
                v["storage_policy_count"] = count
                self.blocked(v, "STORAGE_POLICIES_REQUIRE_REVIEW")

    def test_wrong_types_malformed_fields_rejected(self):
        v = baseline()
        v["auth_users"] = False
        self.blocked(v, "MANAGED_SCOPE_COUNT_INVALID")
        v = baseline()
        v["storage_policy_count"] = True
        self.blocked(v, "MANAGED_SCOPE_COUNT_INVALID")
        v = baseline()
        v["external_secret"] = "MUST_NOT_LOG"
        self.blocked(v, "MANAGED_SCOPE_KEYS_CHANGED")

    def test_never_prints_source_values(self):
        v = baseline()
        v["extra"] = "SYNTHETIC_SECRET_NEVER_PRINT"
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fake-scope.json"
            path.write_text(json.dumps(v), encoding="utf-8")
            proc = subprocess.run([sys.executable, str(SCRIPT), "--input", str(path)],
                                  capture_output=True, text=True, timeout=5)
            self.assertEqual(proc.returncode, 2)
            self.assertNotIn("SYNTHETIC_SECRET_NEVER_PRINT", proc.stdout+proc.stderr)
            self.assertIn("G1=BLOCKED", proc.stderr)

    def test_pass_always_no_go(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fake-scope.json"
            path.write_text(json.dumps(baseline()), encoding="utf-8")
            proc = subprocess.run([sys.executable, str(SCRIPT), "--input", str(path)],
                                  capture_output=True, text=True, timeout=5)
            self.assertEqual(proc.returncode, 0)
            self.assertIn("G1_STORAGE_BUCKET_RESTORE_PROVEN=FALSE", proc.stdout)
            self.assertIn("G1_AUTH_SERVICE_RESTORE_PROVEN=FALSE", proc.stdout)
            self.assertIn("RELEASE=NO_GO", proc.stdout)
            self.assertNotIn("G1=PASS", proc.stdout)


if __name__ == "__main__":
    unittest.main()
