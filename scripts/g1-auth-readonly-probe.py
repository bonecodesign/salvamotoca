#!/usr/bin/env python3
"""G1: isolated, read-only authentication probe for the staging DB.

Uses the existing protected GitHub Environment Secret G1_SUPABASE_DB_URL.
Never prints a URI, credential, SQL result from user tables or raw pg error.
Never backs up, changes DB objects, uploads a file or touches Dropbox.
"""
from __future__ import annotations

import os
import subprocess
import sys
from urllib.parse import unquote, urlsplit

from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from importlib import import_module
# File name contains a hyphen; import directly via importlib.util instead.
import importlib.util

FILE = Path(__file__).resolve().parent / "g1-validate-db-url.py"
SPEC = importlib.util.spec_from_file_location("g1_validate_db_url", FILE)
assert SPEC and SPEC.loader
VALIDATOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = VALIDATOR
SPEC.loader.exec_module(VALIDATOR)


def classify_error(stderr: str) -> str:
    s = stderr.lower()
    if "password authentication failed" in s or "authentication failed" in s:
        return "PASSWORD_REJECTED"
    if "tenant or user not found" in s or "tenant not found" in s:
        return "POOLER_TENANT_REJECTED"
    if "role " in s and " does not exist" in s:
        return "ROLE_UNKNOWN"
    if "permission denied" in s or "no pg_hba.conf entry" in s:
        return "ACCESS_DENIED"
    if any(e in s for e in (
        "could not translate host", "name or service not known",
        "network is unreachable", "connection timed out", "connection refused",
        "could not connect", "temporary failure in name resolution",
    )):
        return "NETWORK_OR_DNS_FAILURE"
    return "CONNECTION_FAILED_UNCLASSIFIED"


def run_probe() -> tuple[bool, str]:
    raw_uri = os.environ.get("G1_SUPABASE_DB_URL", "")
    try:
        VALIDATOR.check(raw_uri)
    except VALIDATOR.UnsafeDBUrl:
        return False, "URI_INVALID"

    parsed = urlsplit(raw_uri)
    # No credentials in command-line parameters, GitHub logs, or stdout.
    env = os.environ.copy()
    env.pop("G1_SUPABASE_DB_URL", None)
    env.update({
        "PGHOST": parsed.hostname or "",
        "PGPORT": str(parsed.port),
        "PGDATABASE": parsed.path.lstrip("/"),
        "PGUSER": unquote(parsed.username or ""),
        "PGPASSWORD": unquote(parsed.password or ""),
        "PGSSLMODE": "require",
        "PGCONNECT_TIMEOUT": "8",
    })
    # Even successful authentication runs exactly one read-only expression.
    # No pg_dump, no database migrations, no Dropbox access.
    try:
        completed = subprocess.run(
            ["psql", "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1",
             "-c", "SELECT 1;"],
            env=env,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except FileNotFoundError:
        return False, "PSQL_MISSING"
    except subprocess.TimeoutExpired:
        return False, "CONNECT_TIMEOUT"

    if completed.returncode == 0 and completed.stdout.strip() == "1":
        return True, "READ_ONLY_CONNECTION_OK"
    return False, classify_error(completed.stderr)


def main() -> int:
    if os.environ.get("GITHUB_REPOSITORY") != "bonecodesign/salvamotoca":
        print("G1_AUTH_PROBE=REJECTED:WRONG_REPOSITORY")
        return 2
    if os.environ.get("GITHUB_REF") != "refs/heads/main":
        print("G1_AUTH_PROBE=REJECTED:WRONG_BRANCH")
        return 2
    if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch":
        print("G1_AUTH_PROBE=REJECTED:MANUAL_ONLY")
        return 2
    if os.environ.get("G1_DIAGNOSE_CONFIRM") != "DIAGNOSTICAR_POSTGRES_TESTES":
        print("G1_AUTH_PROBE=REJECTED:CONFIRMATION_REQUIRED")
        return 2
    ok, code = run_probe()
    if ok:
        print("G1_AUTH_PROBE=PASS:READ_ONLY_CONNECTION_OK")
        print("G1_REMOTE_BACKUP=NOT_ATTEMPTED")
        print("G1=BLOCKED")
        print("RELEASE=NO_GO")
        return 0
    print("G1_AUTH_PROBE=FAIL:" + code)
    print("G1_REMOTE_BACKUP=NOT_ATTEMPTED")
    print("G1=BLOCKED")
    print("RELEASE=NO_GO")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
