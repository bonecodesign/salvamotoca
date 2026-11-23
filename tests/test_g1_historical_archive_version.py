"""Validação G1 exclusiva Salva Motoca! com chaves e SQL inteiramente fictícios."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
VERIFIER = ROOT / "scripts" / "g1-verify-encrypted-bundle.py"
PROJECT = "yivkqyjdeouxnwtwfekc"
POLICY_SHA = "c75f54c93a080d4552558ce59539c2e8813a645b5dfdfe44ebd328839aad2254"
TABLES = ["prestadores_prospeccao", "ofertas_prospeccao", "configuracao_comercial"]


@unittest.skipUnless(shutil.which("age") and shutil.which("age-keygen"),
                     "Requires local age tool; no network or real key")
class TestG1BackupVersions(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="g1-salvamotoca-FICTIONAL-")
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.key = self.root / "fictional-age-identity.txt"
        subprocess.run(["age-keygen", "-o", str(self.key)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.recipient = subprocess.check_output(
            ["age-keygen", "-y", str(self.key)],
            stderr=subprocess.DEVNULL).decode().strip()

    def make_archive(self, legacy=True, wrong_project=False,
                     corrupt_sql=False, remove_member=False):
        settings = {
            "project_ref": "WRONG_APP_NOT_SALVA_MOTOCA" if wrong_project else PROJECT,
            "environment": "TESTES",
            "backup_kind": "logical_sql",
            "g1_restoration_verified": "false",
            "storage_physical_objects_included": "false",
        }
        if not legacy:
            settings.update({
                "auth_managed_schema_recovery_proven": "false",
                "storage_bucket_configuration_recovery_proven": "false",
            })
        files = {
            "roles.sql": b"-- FICTIONAL ROLE ONLY\n",
            "schema.sql": b"-- FICTIONAL SCHEMA ONLY\n",
            "data.sql": "".join(
                "COPY public." + name + " (id) FROM stdin;\n\\.\n"
                for name in TABLES).encode(),
            "history_schema.sql": b"-- FICTIONAL HISTORY SCHEMA\n",
            "history_data.sql": b"-- FICTIONAL HISTORY DATA\n",
            "source_inventory_before.json": json.dumps({
                "auth_users": 0, "service_requests": 0,
                "registered_providers": 0, "prospected_providers": 0,
                "prospecting_offers": 0, "commercial_config": 0,
                "migration_versions": 0, "storage_objects": 0,
            }).encode(),
            "source_schema_inventory_before.json": json.dumps({
                "tables": [
                    {"name": name, "rls_enabled": True, "policy_count": 0}
                    for name in TABLES],
            }).encode(),
            "manifest.txt": "".join(
                key + "=" + value + "\n" for key, value in settings.items()).encode(),
        }
        if not legacy:
            files["source_managed_scope_before.json"] = json.dumps({
                "auth_users": 0, "auth_identities": 0, "auth_sessions": 0,
                "auth_refresh_tokens": 0, "auth_mfa_factors": 0,
                "auth_flow_state": 0, "storage_objects": 0,
                "storage_policy_count": 3,
                "storage_policy_sha256": POLICY_SHA,
                "storage_buckets": [{
                    "name": "request-photos", "private": True,
                    "file_size_limit": 5242880,
                    "allowed_mime_types": ["image/jpeg"],
                }],
            }).encode()
        hashed_names = sorted(k for k in files if k != "manifest.txt")
        files["manifest.sha256"] = "".join(
            hashlib.sha256(files[k]).hexdigest() + "  " + k + "\n"
            for k in hashed_names).encode()
        if corrupt_sql:
            files["roles.sql"] = b"-- CORRUPTED BUT FICTIONAL\n"
        if remove_member:
            del files["source_schema_inventory_before.json"]

        plain = self.root / "synthetic-backup.tar.gz"
        encrypted = self.root / "synthetic-backup.tar.gz.age"
        with tarfile.open(plain, "w:gz") as archive:
            for name, content in files.items():
                header = tarfile.TarInfo(name)
                header.size = len(content)
                archive.addfile(header, io.BytesIO(content))
        subprocess.run(["age", "-r", self.recipient, "-o",
                        str(encrypted), str(plain)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return encrypted

    def verify(self, archive, synthetic=True):
        env = dict(os.environ)
        env["GITHUB_ACTIONS"] = "true" if synthetic else "false"
        if synthetic:
            env["G1_SYNTHETIC_CI_ONLY"] = "true"
        else:
            env.pop("G1_SYNTHETIC_CI_ONLY", None)
        return subprocess.run(
            [sys.executable, str(VERIFIER), "--archive", str(archive),
             "--identity", str(self.key)],
            env=env, text=True, capture_output=True, check=False)

    def test_legacy_fictional_passes_with_legacy_warning(self):
        result = self.verify(self.make_archive(legacy=True))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("G1_HASHED_MEMBER_COUNT=7", result.stdout)
        self.assertIn("G1_PACKAGE_VERSION=HISTORICAL_PINNED", result.stdout)
        self.assertIn("G1_MANAGED_SCOPE_NOT_RESTORED=UNKNOWN_LEGACY", result.stdout)
        self.assertIn("G1_RESTORATION_VERIFIED=FALSE", result.stdout)

    def test_v2_fictional_retains_managed_scope_guard(self):
        result = self.verify(self.make_archive(legacy=False))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("G1_HASHED_MEMBER_COUNT=8", result.stdout)
        self.assertIn("G1_PACKAGE_VERSION=MANAGED_SCOPE_V2", result.stdout)
        self.assertIn("G1_MANAGED_SCOPE_NOT_RESTORED=CONFIRMED", result.stdout)

    def test_legacy_unpinned_archive_is_rejected_outside_fixture_mode(self):
        result = self.verify(self.make_archive(legacy=True), synthetic=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("UNRECOGNIZED_LEGACY_CIPHERTEXT", result.stderr)

    def test_other_project_rejected(self):
        result = self.verify(self.make_archive(legacy=True, wrong_project=True))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("BACKUP_PROJECT_OR_SCOPE_MISMATCH", result.stderr)

    def test_modified_sql_rejected(self):
        result = self.verify(self.make_archive(legacy=True, corrupt_sql=True))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("MANIFEST_SHA256_MISMATCH", result.stderr)

    def test_missing_manifest_member_rejected(self):
        result = self.verify(self.make_archive(legacy=True, remove_member=True))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("UNEXPECTED_OR_MISSING_ARCHIVE_FILES", result.stderr)


if __name__ == "__main__":
    unittest.main()
