#!/usr/bin/env python3
"""G1: coverage audit, offline, of every public table and RLS policy in a dump.

The expected list is discovered from the SOURCE Postgres catalog immediately
before backup. This program never connects to DB, reads creds, or mutates data.
It verifies structural coverage only; it does NOT prove a full data restore.
"""
from __future__ import annotations
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import sys

IDENT = r'(?:"?public"?\.)"?([a-z][a-z0-9_]*)"?'
NAME = re.compile(r"^[a-z][a-z0-9_]*$")
# Supabase CLI makes schema dumps idempotent, while raw pg_dump does not.
# Both representations are valid and must satisfy identical coverage checks.
CREATE = re.compile(rf"^CREATE TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+{IDENT}\s*\(", re.M | re.I)
COPY = re.compile(rf"^COPY {IDENT}\s*\(", re.M | re.I)
RLS = re.compile(rf"^ALTER TABLE (?:ONLY )?{IDENT}\s+ENABLE ROW LEVEL SECURITY\s*;", re.M | re.I)
POLICY = re.compile(
    rf'^CREATE POLICY\s+(?:"[^"\r\n]+"|[a-z_0-9]+)\s+ON\s+{IDENT}\b',
    re.M | re.I,
)
MAX_INVENTORY_BYTES = 96_000
MAX_SCHEMA_BYTES = 25 * 1024 * 1024
MAX_DATA_BYTES = 180 * 1024 * 1024


class CoverageFailure(Exception):
    pass


def read_inventory(path: Path) -> dict[str, tuple[bool, int]]:
    if path.stat().st_size > MAX_INVENTORY_BYTES:
        raise CoverageFailure("SCHEMA_INVENTORY_TOO_LARGE")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or set(data) != {"tables"}:
        raise CoverageFailure("SCHEMA_INVENTORY_FORMAT_INVALID")
    tables = data["tables"]
    if not isinstance(tables, list) or not tables or len(tables) > 500:
        raise CoverageFailure("SCHEMA_TABLES_EMPTY_OR_TOO_MANY")
    out: dict[str, tuple[bool, int]] = {}
    for item in tables:
        if not isinstance(item, dict) or set(item) != {"name", "rls_enabled", "policy_count"}:
            raise CoverageFailure("SCHEMA_TABLE_ENTRY_INVALID")
        name, rls, policies = item["name"], item["rls_enabled"], item["policy_count"]
        if not isinstance(name, str) or not NAME.fullmatch(name):
            raise CoverageFailure("SCHEMA_TABLE_NAME_UNSAFE")
        if type(rls) is not bool or type(policies) is not int or policies < 0:
            raise CoverageFailure("SCHEMA_TABLE_POLICY_INVALID")
        if name in out:
            raise CoverageFailure("SCHEMA_TABLE_DUPLICATE")
        out[name] = (rls, policies)
    return out


def inspect(inventory_path: Path, schema_path: Path, data_path: Path) -> dict[str, tuple[bool, int]]:
    expected = read_inventory(inventory_path)
    if schema_path.stat().st_size > MAX_SCHEMA_BYTES:
        raise CoverageFailure("SCHEMA_SQL_TOO_LARGE")
    if data_path.stat().st_size > MAX_DATA_BYTES:
        raise CoverageFailure("DATA_SQL_TOO_LARGE")
    schema = schema_path.read_text(encoding="utf-8", errors="strict")
    tables = [m.group(1) for m in CREATE.finditer(schema)]
    rls_tables = [m.group(1) for m in RLS.finditer(schema)]
    policy_tables = [m.group(1) for m in POLICY.finditer(schema)]
    names = set(expected)
    if set(tables) != names or len(tables) != len(names):
        raise CoverageFailure("PUBLIC_TABLE_SCHEMA_COVERAGE_MISMATCH")
    if set(rls_tables) != {name for name, (enabled, _) in expected.items() if enabled}:
        raise CoverageFailure("PUBLIC_RLS_COVERAGE_MISMATCH")
    if Counter(policy_tables) != Counter({
        name: n for name, (_, n) in expected.items() if n
    }):
        raise CoverageFailure("PUBLIC_POLICY_COVERAGE_MISMATCH")
    # Streaming prevents retaining personal or business rows in memory.
    seen: list[str] = []
    with data_path.open("r", encoding="utf-8", errors="strict") as f:
        for line in f:
            if line.startswith("COPY ") and len(line) < 8192:
                match = COPY.match(line)
                if match:
                    seen.append(match.group(1))
    if set(seen) != names or len(seen) != len(names):
        raise CoverageFailure("PUBLIC_DATA_COPY_COVERAGE_MISMATCH")
    return expected


def main() -> int:
    arg = argparse.ArgumentParser(description="G1 public schema RLS and SQL dump coverage audit")
    arg.add_argument("--inventory", type=Path, required=True)
    arg.add_argument("--schema", type=Path, required=True)
    arg.add_argument("--data", type=Path, required=True)
    args = arg.parse_args()
    try:
        result = inspect(args.inventory, args.schema, args.data)
    except (CoverageFailure, OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
        # Never echo filenames, table contents, personal data or SQL.
        label = str(exc) if isinstance(exc, CoverageFailure) else "INVALID_DUMP_INPUT"
        print("G1_DUMP_COVERAGE=REJECTED:" + label, file=sys.stderr)
        return 2
    print("G1_DUMP_PUBLIC_TABLES_COUNT=" + str(len(result)))
    print("G1_DUMP_ALL_PUBLIC_TABLES_COPY=PASS")
    print("G1_DUMP_RLS_POLICY_COVERAGE=PASS")
    print("G1_BACKUP_RESTORE_VERIFIED=FALSE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
