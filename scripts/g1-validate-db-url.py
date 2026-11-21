#!/usr/bin/env python3
"""G1: validate only the *syntax* of the GitHub Environment DB URI.

This program NEVER connects to a network, never prints a credential, and
cannot determine whether a PostgreSQL password is correct. Do not use it as
proof of a real backup. Execute only with G1_SUPABASE_DB_URL as an env var.
"""
from __future__ import annotations

import os
import re
import sys
from urllib.parse import parse_qsl, unquote, unquote_to_bytes, urlsplit

PROJECT_REF = "yivkqyjdeouxnwtwfekc"
EXPECTED_USER = "postgres." + PROJECT_REF
POOLER_HOST = re.compile(r"aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com\Z")
BAD_ESCAPE = re.compile(r"%(?![0-9a-fA-F]{2})")
BAD_CHAR = re.compile(r"[\x00-\x20\x7f]")
# These characters inside a URI password need %XX encoding. A raw colon
# creates a second userinfo colon; raw @ can change the hostname.
BAD_PASSWORD_CHAR = re.compile(r"[:@/?#\[\]\\]")


class UnsafeDBUrl(ValueError):
    """A stable non-sensitive failure code, never the supplied URI."""


def check(uri: str) -> None:
    if not isinstance(uri, str) or not uri:
        raise UnsafeDBUrl("MISSING_DB_URL")
    if len(uri) > 4096 or BAD_CHAR.search(uri):
        raise UnsafeDBUrl("INVALID_URI_WHITESPACE_OR_SIZE")
    if BAD_ESCAPE.search(uri):
        raise UnsafeDBUrl("INVALID_PERCENT_ENCODING")
    try:
        parts = urlsplit(uri)
        if parts.scheme not in ("postgres", "postgresql"):
            raise UnsafeDBUrl("INVALID_URI_SCHEME")
        if parts.fragment:
            raise UnsafeDBUrl("INVALID_URI_FRAGMENT")
        if parts.netloc.count("@") != 1:
            raise UnsafeDBUrl("INVALID_URI_USERINFO_ENCODING")
        user_info, _host_part = parts.netloc.split("@", 1)
        if user_info.count(":") != 1:
            raise UnsafeDBUrl("INVALID_URI_USERINFO_ENCODING")
        user, raw_password = user_info.split(":", 1)
        if unquote(user) != EXPECTED_USER:
            raise UnsafeDBUrl("WRONG_SUPABASE_PROJECT_USER")
        if not raw_password:
            raise UnsafeDBUrl("PASSWORD_PLACEHOLDER_OR_MISSING")
        if BAD_PASSWORD_CHAR.search(raw_password):
            raise UnsafeDBUrl("PASSWORD_REQUIRES_PERCENT_ENCODING")
        # Check URI encoding without ever emitting the decoded value.
        decoded_password = unquote_to_bytes(raw_password).decode("utf-8")
        if not decoded_password or BAD_CHAR.search(decoded_password):
            raise UnsafeDBUrl("PASSWORD_PLACEHOLDER_OR_MISSING")
        if decoded_password.upper() in (
            "YOUR-PASSWORD", "[YOUR-PASSWORD]", "PASSWORD",
            "YOUR_DATABASE_PASSWORD", "YOUR_PASSWORD",
        ):
            raise UnsafeDBUrl("PASSWORD_PLACEHOLDER_OR_MISSING")
        host = (parts.hostname or "").lower()
        if not POOLER_HOST.fullmatch(host):
            raise UnsafeDBUrl("EXPECTED_SESSION_POOLER_HOST")
        if parts.port != 5432:
            raise UnsafeDBUrl("EXPECTED_SESSION_POOLER_PORT_5432")
        if parts.path != "/postgres":
            raise UnsafeDBUrl("EXPECTED_POSTGRES_DATABASE")
        if parts.query:
            pairs = parse_qsl(parts.query, keep_blank_values=True, strict_parsing=True)
            if pairs != [("sslmode", "require")] and pairs != [
                ("sslmode", "verify-ca")
            ] and pairs != [("sslmode", "verify-full")]:
                raise UnsafeDBUrl("INVALID_TLS_QUERY")
    except UnsafeDBUrl:
        raise
    except (ValueError, UnicodeError, AttributeError):
        raise UnsafeDBUrl("INVALID_POSTGRES_URI") from None


def main() -> int:
    try:
        check(os.environ.get("G1_SUPABASE_DB_URL", ""))
    except UnsafeDBUrl as error:
        print("G1_DB_URI_STATIC=REJECTED:" + str(error), file=sys.stderr)
        print("G1_DB_CONNECTION_AUTHENTICATED=FALSE", file=sys.stderr)
        return 2
    # This is a format-only check; never claim successful authentication.
    print("G1_DB_URI_STATIC=PASS")
    print("G1_DB_CONNECTION_AUTHENTICATED=UNVERIFIED")
    print("G1_DB_REMOTE_ACCESS=NOT_ATTEMPTED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
