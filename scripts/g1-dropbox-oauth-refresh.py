#!/usr/bin/env python3
"""G1 Dropbox access token renewal. Never log the provider response or credentials."""
import json
import os
import sys
import urllib.parse
import urllib.request

ENDPOINT = "https://api.dropboxapi.com/oauth2/token"
REQUIRED_SCOPES = {"files.metadata.read", "files.content.write"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def valid_secret(value):
    return (isinstance(value, str) and 1 <= len(value) <= 16384
            and all(33 <= ord(c) <= 126 for c in value))


def refresh(raw, opener=None):
    config = json.loads(raw)
    if (not isinstance(config, dict)
            or set(config) != {"app_key", "app_secret", "refresh_token"}
            or not all(valid_secret(v) for v in config.values())):
        raise ValueError("invalid OAuth configuration")
    payload = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "client_id": config["app_key"],
        "client_secret": config["app_secret"],
        "refresh_token": config["refresh_token"],
    }).encode("ascii")
    request = urllib.request.Request(
        ENDPOINT, data=payload, method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded",
                 "Accept": "application/json"})
    opener = opener if opener is not None else urllib.request.build_opener(NoRedirect())
    with opener.open(request, timeout=30) as response:
        if response.status != 200:
            raise ValueError("unexpected status")
        body = response.read(65537)
    if len(body) > 65536:
        raise ValueError("oversized response")
    result = json.loads(body)
    token = result.get("access_token")
    expires = result.get("expires_in")
    if (not valid_secret(token)
            or result.get("token_type", "").lower() != "bearer"
            or isinstance(expires, bool)
            or not str(expires).isascii() or not str(expires).isdigit()
            or int(expires) < 1800):
        raise ValueError("invalid or short-lived token response")
    if "scope" in result:
        scope = result["scope"]
        if not isinstance(scope, str) or not REQUIRED_SCOPES.issubset(scope.split()):
            raise ValueError("missing required scope")
    return token


def main():
    try:
        token = refresh(os.environ["G1_DROPBOX_OAUTH_JSON"])
    except Exception:
        # Intentionally discard raw exceptions, bodies and headers.
        print("G1_DROPBOX_OAUTH_REFRESH=FAIL", file=sys.stderr)
        return 23
    # The shell captures stdout; never call this helper directly with live secrets.
    sys.stdout.write(token)
    return 0


if __name__ == "__main__":
    sys.exit(main())
