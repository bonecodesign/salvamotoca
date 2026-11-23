#!/usr/bin/env python3
"""G1: offline fail-closed audit of privileged RPC *metadata* only.

Input: a PRIVATE JSON output from docs/G1_RPC_PRIVILEGES_READONLY.sql.
This program does not connect to Supabase, read user data, or change ACLs.
A PASS is NOT an authorization proof and NEVER changes the release gate.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

PROJECT = "yivkqyjdeouxnwtwfekc"
EXPECTED = {
    "bj_answer_quote": "p_quote_id uuid, p_accept boolean",
    "bj_finish_request": "p_request_id uuid",
    "bj_get_request_location": "p_request_id uuid",
    "bj_ping_presence": "",
    "bj_set_presence": "p_online boolean",
    "bj_submit_quote": "p_request_id uuid, p_amount_cents integer, p_details text",
}
FIELDS = {
    "name", "signature", "owner_role", "security_definer",
    "search_path_locked", "public_execute", "anon_execute",
    "authenticated_execute", "references_auth_uid",
}
MAX_BYTES = 60_000


class Blocked(Exception):
    """Stable, non-sensitive audit code; never include source values."""


def audit(data: object) -> None:
    if not isinstance(data, dict) or set(data) != {"project_ref", "functions"}:
        raise Blocked("INVALID_AUDIT_DOCUMENT")
    if data["project_ref"] != PROJECT:
        raise Blocked("WRONG_PROJECT")
    functions = data["functions"]
    if not isinstance(functions, list) or len(functions) != len(EXPECTED):
        raise Blocked("PRIVILEGED_RPC_SET_CHANGED")
    seen = set()
    for item in functions:
        if not isinstance(item, dict) or set(item) != FIELDS:
            raise Blocked("INVALID_RPC_METADATA")
        name = item["name"]
        if not isinstance(name, str) or name not in EXPECTED or name in seen:
            raise Blocked("PRIVILEGED_RPC_SET_CHANGED")
        seen.add(name)
        if item["signature"] != EXPECTED[name]:
            raise Blocked("PRIVILEGED_RPC_SIGNATURE_CHANGED")
        if item["owner_role"] != "postgres":
            raise Blocked("PRIVILEGED_RPC_OWNER_CHANGED")
        for field in (
            "security_definer", "search_path_locked", "public_execute",
            "anon_execute", "authenticated_execute", "references_auth_uid"
        ):
            if type(item[field]) is not bool:
                raise Blocked("INVALID_RPC_FLAGS")
        if not item["security_definer"]:
            raise Blocked("PRIVILEGED_RPC_MODE_CHANGED")
        if not item["search_path_locked"]:
            raise Blocked("PRIVILEGED_RPC_SEARCH_PATH_OPEN")
        if item["public_execute"] or item["anon_execute"]:
            raise Blocked("PRIVILEGED_RPC_ANONYMOUS_ACCESS")
        # A grant becoming stricter is not necessarily a vulnerability,
        # but it's material operational drift: request human review.
        if not item["authenticated_execute"]:
            raise Blocked("PRIVILEGED_RPC_AUTH_GRANT_CHANGED")
        # This is a weak static indicator (string match), not proof of
        # customer/provider ownership or of auth.uid() being enforced.
        if not item["references_auth_uid"]:
            raise Blocked("PRIVILEGED_RPC_MISSING_IDENTITY_REFERENCE")
    if seen != set(EXPECTED):
        raise Blocked("PRIVILEGED_RPC_SET_CHANGED")


def main() -> int:
    parser = argparse.ArgumentParser(description="G1 privileged RPC metadata review")
    parser.add_argument("--input", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.input.stat().st_size > MAX_BYTES:
            raise Blocked("AUDIT_TOO_LARGE")
        obj = json.loads(args.input.read_text(encoding="utf-8"))
        # Some tooling wraps the SQL output as [{"g1_rpc_metadata":"{...}"}].
        if isinstance(obj, list) and len(obj) == 1 and isinstance(obj[0], dict):
            embedded = obj[0].get("g1_rpc_metadata")
            if isinstance(embedded, str):
                obj = json.loads(embedded)
        audit(obj)
    except Blocked as exc:
        print("G1_RPC_METADATA=REVIEW_REQUIRED:" + str(exc), file=sys.stderr)
        return 2
    except (OSError, UnicodeError, ValueError, TypeError):
        print("G1_RPC_METADATA=REVIEW_REQUIRED:INVALID_INPUT", file=sys.stderr)
        return 2
    print("G1_RPC_METADATA=PASS")
    print("G1_PRIVILEGED_RPC_COUNT=6")
    print("G1_RPC_AUTHORIZATION_BEHAVIOR=NOT_PROVEN")
    print("G1_REAL_AUTH_RLS_RESTORE=NOT_PROVEN")
    print("G1=BLOCKED")
    print("RELEASE=NO_GO")
    return 0


if __name__ == "__main__":
    sys.exit(main())
