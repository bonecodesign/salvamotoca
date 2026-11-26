import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import urllib.parse
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "g1_refresh", ROOT / "scripts/g1-dropbox-oauth-refresh.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
CONFIG = {"app_key": "fixture-app", "app_secret": "fixture-secret",
          "refresh_token": "fixture-refresh"}
GOOD = {"access_token": "fixture-renewed-token", "token_type": "bearer",
        "expires_in": 14400, "scope": "files.metadata.read files.content.write"}


class Response(io.BytesIO):
    status = 200


class Opener:
    def __init__(self, answer):
        self.answer = answer
        self.calls = []

    def open(self, request, timeout):
        self.calls.append((request, timeout))
        return Response(json.dumps(self.answer).encode())


class OAuthRefreshTest(unittest.TestCase):
    def test_fixed_endpoint_post_and_scopes(self):
        opener = Opener(GOOD)
        self.assertEqual(module.refresh(json.dumps(CONFIG), opener),
                         GOOD["access_token"])
        req, timeout = opener.calls[0]
        self.assertEqual(req.full_url, module.ENDPOINT)
        self.assertEqual(req.get_method(), "POST")
        self.assertEqual(timeout, 30)
        self.assertEqual(urllib.parse.parse_qs(req.data.decode()), {
            "grant_type": ["refresh_token"], "client_id": ["fixture-app"],
            "client_secret": ["fixture-secret"], "refresh_token": ["fixture-refresh"]})
        self.assertNotIn("fixture-secret", req.full_url)

    def test_invalid_configuration_never_contacts_provider(self):
        for config in [{}, {**CONFIG, "refresh_token": ""},
                       {**CONFIG, "app_secret": "newline\n"},
                       {**CONFIG, "endpoint": "https://other.invalid"}]:
            with self.subTest(config=config):
                opener = Opener(GOOD)
                with self.assertRaises(ValueError):
                    module.refresh(json.dumps(config), opener)
                self.assertEqual(opener.calls, [])

    def test_rejects_bad_provider_response(self):
        for answer in [
            {**GOOD, "access_token": "bad\n::warning::"},
            {**GOOD, "access_token": ""},
            {**GOOD, "token_type": "basic"},
            {**GOOD, "expires_in": 20},
            {**GOOD, "expires_in": True},
            {**GOOD, "scope": "files.metadata.read"},
        ]:
            with self.subTest(answer=answer):
                with self.assertRaises(ValueError):
                    module.refresh(json.dumps(CONFIG), Opener(answer))

    def test_accepts_numeric_string_expiry_and_omitted_scope(self):
        answer = dict(GOOD)
        del answer["scope"]
        answer["expires_in"] = "14400"
        self.assertEqual(module.refresh(json.dumps(CONFIG), Opener(answer)),
                         GOOD["access_token"])

    def test_redirect_denied(self):
        self.assertIsNone(module.NoRedirect().redirect_request(
            None, None, 307, "", {}, "https://wrong.invalid/"))

    def test_provider_error_only_safe_marker(self):
        with patch.dict(os.environ, {"G1_DROPBOX_OAUTH_JSON": json.dumps(CONFIG)}):
            with patch.object(module, "refresh", side_effect=RuntimeError("fixture-secret")):
                out, err = io.StringIO(), io.StringIO()
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    self.assertEqual(module.main(), 23)
                self.assertEqual(out.getvalue(), "")
                self.assertEqual(err.getvalue(), "G1_DROPBOX_OAUTH_REFRESH=FAIL\n")

    def test_failed_refresh_cannot_fall_back_to_legacy_or_touch_db(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            bin_dir = base / "bin"
            bin_dir.mkdir()
            marker = base / "remote-attempt"
            for tool in ("curl", "psql", "supabase", "docker", "age"):
                mock = bin_dir / tool
                mock.write_text('#!/bin/sh\nprintf x > "$G1_TEST_MARKER"\nexit 99\n')
                mock.chmod(0o700)
            env = dict(os.environ, PATH=str(bin_dir)+os.pathsep+os.environ["PATH"],
                       RUNNER_TEMP=tmp, GITHUB_REPOSITORY="bonecodesign/salvamotoca",
                       GITHUB_REF="refs/heads/main", GITHUB_EVENT_NAME="workflow_dispatch",
                       G1_BACKUP_AUTHORIZED="true", G1_CONFIRM="BACKUP_TESTES_SALVAMOTOCA",
                       G1_SUPABASE_DB_URL="postgresql://postgres.yivkqyjdeouxnwtwfekc:fictional-password@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
                       G1_DROPBOX_PATH="/backup-testes",
                       G1_AGE_RECIPIENT="age1"+"a"*58,
                       G1_DROPBOX_ACCESS_TOKEN="fixture-legacy",
                       G1_DROPBOX_OAUTH_JSON='{"bad":"fixture-private"}',
                       G1_TEST_MARKER=str(marker))
            proc = subprocess.run(["bash", str(ROOT/"scripts/g1-actions-backup-real.sh")],
                                  env=env, capture_output=True, text=True, timeout=10)
            output = proc.stdout+proc.stderr
            self.assertEqual(proc.returncode, 23)
            self.assertIn("G1_DROPBOX_OAUTH_REFRESH=FAIL", output)
            self.assertFalse(marker.exists())
            self.assertNotIn("fixture-private", output)
            self.assertNotIn("fixture-legacy", output)

    def test_new_token_reaches_only_vault_guard_and_config_is_unset(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            bin_dir = base / "bin"
            bin_dir.mkdir()
            marker = base / "vault-checked"
            db_marker = base / "db-touched"
            python = bin_dir / "python3"
            python.write_text("""#!/bin/bash
if [[ "$1" == *g1-dropbox-oauth-refresh.py ]]; then
  [[ -z "${G1_DROPBOX_ACCESS_TOKEN+x}" ]] || exit 91
  [[ -n "${G1_DROPBOX_OAUTH_JSON:-}" ]] || exit 92
  printf fixture-renewed-token
else
  exec "$G1_TEST_PYTHON" "$@"
fi
""")
            curl = bin_dir / "curl"
            curl.write_text("""#!/bin/bash
[[ -z "${G1_DROPBOX_OAUTH_JSON+x}" ]] || exit 91
[[ "$*" == *'Authorization: Bearer fixture-renewed-token'* ]] || exit 92
[[ "$*" == *'https://api.dropboxapi.com/2/files/get_metadata'* ]] || exit 93
printf x > "$G1_TEST_MARKER"
printf '%s' '{".tag":"folder","name":"backup-testes","id":"wrong-vault"}'
""")
            for tool in ("psql", "supabase", "docker", "age"):
                mock = bin_dir / tool
                mock.write_text('#!/bin/sh\nprintf x > "$G1_TEST_DB_MARKER"\nexit 99\n')
                mock.chmod(0o700)
            python.chmod(0o700)
            curl.chmod(0o700)
            import sys
            env = dict(os.environ, PATH=str(bin_dir)+os.pathsep+os.environ["PATH"],
                       GITHUB_ACTIONS="false", RUNNER_TEMP=tmp,
                       GITHUB_REPOSITORY="bonecodesign/salvamotoca",
                       GITHUB_REF="refs/heads/main", GITHUB_EVENT_NAME="workflow_dispatch",
                       G1_BACKUP_AUTHORIZED="true", G1_CONFIRM="BACKUP_TESTES_SALVAMOTOCA",
                       G1_SUPABASE_DB_URL="postgresql://postgres.yivkqyjdeouxnwtwfekc:fictional-password@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
                       G1_DROPBOX_PATH="/backup-testes", G1_AGE_RECIPIENT="age1"+"a"*58,
                       G1_DROPBOX_ACCESS_TOKEN="fixture-legacy",
                       G1_DROPBOX_OAUTH_JSON=json.dumps(CONFIG),
                       G1_TEST_MARKER=str(marker), G1_TEST_DB_MARKER=str(db_marker),
                       G1_TEST_PYTHON=sys.executable)
            proc = subprocess.run(["bash", str(ROOT/"scripts/g1-actions-backup-real.sh")],
                                  env=env, capture_output=True, text=True, timeout=10)
            output = proc.stdout+proc.stderr
            self.assertEqual(proc.returncode, 23)
            self.assertIn("G1_DROPBOX_OAUTH_REFRESH=PASS", output)
            self.assertIn("outro cofre privado", output)
            self.assertTrue(marker.exists())
            self.assertFalse(db_marker.exists())
            self.assertNotIn("fixture-renewed-token", output)
            self.assertNotIn("fixture-secret", output)
            self.assertNotIn("fixture-legacy", output)


if __name__ == "__main__":
    unittest.main()
