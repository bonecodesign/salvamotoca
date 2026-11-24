#!/usr/bin/env python3
"""Reconcile the verified historical TESTES restore, on a disposable local PG17 only.
No connection URL or remote host is accepted. Never run on the hosted database.
Requires the restored historical package to have already passed the private verifier.
"""
import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

PIN = "f7ae94952411e6314c870d987914cec841f84d026f270908409a4d2f96785678"
ACK = "RECONCILIAR_SOMENTE_COPIA_LOCAL_DESCARTAVEL"
SQL = Path(__file__).with_name("g1-reconcile-historical-catalog.sql")

def validate_local(data_dir, port):
    data_dir = Path(data_dir).resolve(strict=True)
    if not data_dir.is_dir() or (data_dir / "PG_VERSION").read_text().strip() != "17":
        raise ValueError("NOT_LOCAL_PG17")
    lines = (data_dir / "postmaster.pid").read_text().splitlines()
    if len(lines) < 4 or not re.fullmatch(r"[1-9][0-9]*", lines[0]):
        raise ValueError("NO_LOCAL_POSTMASTER")
    pid = int(lines[0])
    if Path(lines[1]).resolve(strict=True) != data_dir or int(lines[3]) != port:
        raise ValueError("LOCAL_PID_OR_PORT_MISMATCH")
    # Linux-only: ensure PID really names a PostgreSQL executable, not a forwarded port.
    if Path(os.readlink(f"/proc/{pid}/exe")).name != "postgres":
        raise ValueError("NOT_LOCAL_POSTGRES_PROCESS")
    return data_dir

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data-dir", required=True, type=Path)
    p.add_argument("--port", required=True, type=int)
    p.add_argument("--archive", required=True, type=Path)
    p.add_argument("--psql", required=True, type=Path)
    p.add_argument("--pgpass-file", required=True, type=Path)
    p.add_argument("--ack", required=True)
    a = p.parse_args()
    try:
        if os.environ.get("GITHUB_ACTIONS") or sys.platform != "linux":
            raise ValueError("PRIVATE_LINUX_ONLY")
        if a.ack != ACK or not 1024 <= a.port <= 65535:
            raise ValueError("INVALID_ACK_OR_PORT")
        if a.archive.stat().st_size != 24484 or hashlib.sha256(a.archive.read_bytes()).hexdigest() != PIN:
            raise ValueError("NOT_PINNED_HISTORICAL_ARCHIVE")
        data_dir = validate_local(a.data_dir, a.port)
        psql = a.psql.resolve(strict=True)
        passfile = a.pgpass_file.resolve(strict=True)
        if psql.name != "psql" or not os.access(psql, os.X_OK):
            raise ValueError("INVALID_PSQL")
        if not passfile.is_file() or passfile.stat().st_mode & 0o077:
            raise ValueError("INSECURE_LOCAL_PGPASS")
        with tempfile.TemporaryDirectory(prefix="g1-reconcile-") as home:
            env = {"PATH": str(psql.parent)+":/usr/bin:/bin", "HOME": home,
                   "PGPASSFILE": str(passfile), "PGCONNECT_TIMEOUT": "5",
                   "PGSSLMODE": "disable", "LC_ALL": "C"}
            result = subprocess.run(
                [str(psql), "-X", "-w", "-h", "127.0.0.1", "-p", str(a.port),
                 "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
                 "-v", "expected_data_directory="+str(data_dir), "-f", str(SQL)],
                env=env, stdin=subprocess.DEVNULL, capture_output=True, timeout=120)
        if result.returncode != 0 or b"G1_HISTORICAL_CATALOG_RECONCILIATION=PASS" not in result.stdout:
            raise ValueError("CATALOG_RECONCILIATION_REJECTED")
        print("G1_HISTORICAL_CATALOG_RECONCILIATION=PASS")
        print("G1_RELEASE=NO_GO")
        return 0
    except (OSError, ValueError, subprocess.TimeoutExpired):
        # Never print raw DB error, credentials or file paths.
        print("G1_HISTORICAL_CATALOG_RECONCILIATION=BLOCKED", file=sys.stderr)
        return 2

if __name__ == "__main__":
    sys.exit(main())
