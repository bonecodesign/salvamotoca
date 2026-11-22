#!/usr/bin/env python3
"""Fail closed if managed Auth/Storage state cannot be safely recovered by G1.

Only a STRUCTURAL snapshot is permitted. This check performs no network access,
never reads account rows or file bytes, and never grants G1 approval.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

AUTH_FIELDS = (
    "auth_users", "auth_identities", "auth_sessions",
    "auth_refresh_tokens", "auth_mfa_factors", "auth_flow_state",
)
EXPECTED_FIELDS = set(AUTH_FIELDS) | {
    "storage_objects", "storage_buckets", "storage_policy_count",
}
EXPECTED_BUCKETS = [{
    "name": "request-photos",
    "private": True,
    "file_size_limit": 5 * 1024 * 1024,
    "allowed_mime_types": ["image/jpeg"],
}]
MAX_BYTES = 64_000


class ManagedScopeBlocked(Exception):
    """Non-sensitive failure label, never the input JSON."""


def validate(scope: object) -> None:
    if not isinstance(scope, dict) or set(scope) != EXPECTED_FIELDS:
        raise ManagedScopeBlocked("MANAGED_SCOPE_KEYS_CHANGED")
    for name in AUTH_FIELDS + ("storage_objects", "storage_policy_count"):
        if type(scope[name]) is not int or scope[name] < 0:
            raise ManagedScopeBlocked("MANAGED_SCOPE_COUNT_INVALID")
    if any(scope[name] != 0 for name in AUTH_FIELDS):
        raise ManagedScopeBlocked("AUTH_MANAGED_DATA_NOT_IN_G1_SQL")
    if scope["storage_objects"] != 0:
        raise ManagedScopeBlocked("STORAGE_PHYSICAL_OBJECTS_NOT_INCLUDED")
    if type(scope["storage_policy_count"]) is not int or scope["storage_policy_count"] != 3:
        raise ManagedScopeBlocked("STORAGE_POLICIES_REQUIRE_REVIEW")
    buckets = scope["storage_buckets"]
    if not isinstance(buckets, list) or len(buckets) != 1:
        raise ManagedScopeBlocked("STORAGE_BUCKETS_REQUIRE_REVIEW")
    b = buckets[0]
    if not isinstance(b, dict) or set(b) != set(EXPECTED_BUCKETS[0]):
        raise ManagedScopeBlocked("STORAGE_BUCKET_CONFIGURATION_CHANGED")
    if (type(b["name"]) is not str or type(b["private"]) is not bool
        or type(b["file_size_limit"]) is not int
        or not isinstance(b["allowed_mime_types"], list)
        or any(type(x) is not str for x in b["allowed_mime_types"])):
        raise ManagedScopeBlocked("STORAGE_BUCKET_CONFIGURATION_CHANGED")
    if b != EXPECTED_BUCKETS[0]:
        raise ManagedScopeBlocked("STORAGE_BUCKET_CONFIGURATION_CHANGED")


def main() -> int:
    parser = argparse.ArgumentParser(description="G1 Auth/Storage safe-scope guard")
    parser.add_argument("--input", required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.input.stat().st_size > MAX_BYTES:
            raise ManagedScopeBlocked("MANAGED_SCOPE_TOO_LARGE")
        scope = json.loads(args.input.read_text(encoding="utf-8"))
        validate(scope)
    except ManagedScopeBlocked as exc:
        print("G1_MANAGED_SCOPE=REJECTED:" + str(exc), file=sys.stderr)
        print("G1=BLOCKED", file=sys.stderr)
        return 2
    except (OSError, UnicodeError, ValueError):
        print("G1_MANAGED_SCOPE=REJECTED:INVALID_INPUT", file=sys.stderr)
        print("G1=BLOCKED", file=sys.stderr)
        return 2

    print("G1_MANAGED_SCOPE=SAFE_FOR_SQL_ONLY")
    print("G1_AUTH_MANAGED_ROWS=ZERO")
    print("G1_STORAGE_FILE_BYTES=ZERO")
    print("G1_STORAGE_BUCKET_RESTORE_PROVEN=FALSE")
    print("G1_AUTH_SERVICE_RESTORE_PROVEN=FALSE")
    print("G1=BLOCKED")
    print("RELEASE=NO_GO")
    return 0


if __name__ == "__main__":
    sys.exit(main())
