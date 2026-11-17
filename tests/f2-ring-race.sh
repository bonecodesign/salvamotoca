#!/usr/bin/env bash
# F2: compete for a single synthetic invitation with two PG17 sessions.
set -euo pipefail
if [[ "$PGDATABASE" != "f2_rings_disposable" ]] ||
 [[ "$PGHOST" != "localhost" && "$PGHOST" != "127.0.0.1" ]]; then
 echo 'REFUSE: isolated f2_rings_disposable loopback only' >&2; exit 3
fi
psqlc(){ psql -X -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d f2_rings_disposable "$@"; }
tmp="$(mktemp -d)"
trap 'psqlc -Atqc "update private.f2_mock_ring_gate set enabled=false where singleton" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
R="11111111-bbbb-4111-8111-111111111111"
psqlc -Atqc "update private.f2_mock_ring_gate set enabled=true where singleton" >/dev/null
psqlc -Atqc "begin; set local app.f2_ring_test_only='disposable_pg17';
 select private.f2_mock_advance_ring('$R',1000000); select pg_sleep(1); commit;" >"$tmp/first" 2>&1 &
a=$!
sleep 0.2
psqlc -Atqc "begin; set local app.f2_ring_test_only='disposable_pg17';
 select private.f2_mock_advance_ring('$R',1000000); commit;" >"$tmp/second" 2>&1 &
b=$!
wait "$a"
wait "$b"
grep -q '"status": "invited_mock"' "$tmp/first"
grep -q '"status": "waiting"' "$tmp/second"
[[ "$(psqlc -Atqc "select count(*) from private.f2_mock_invites where request_id='$R'")" == 1 ]]
[[ "$(psqlc -Atqc "select count(distinct provider_id) from private.f2_mock_invites where request_id='$R'")" == 1 ]]
[[ "$(psqlc -Atqc "select count(*) from public.f2_request_offers where request_id='$R'")" == 1 ]]
[[ "$(psqlc -Atqc "select count(*) from private.f2_mock_invites where external_sent or delivery_verified or absence_counted")" == 0 ]]
psqlc -Atqc "update private.f2_mock_ring_gate set enabled=false where singleton" >/dev/null
[[ "$(psqlc -Atqc "select not enabled from private.f2_mock_ring_gate where singleton")" == t ]]
echo 'F2_RINGS_CONCURRENT_CALLS=ONE_INVITED_ONE_WAITING'
echo 'F2_EXTERNAL_NOTIFICATIONS=ZERO'
echo 'F2_ROUND_RADIUS=ILLUSTRATIVE_NOT_APPROVED'
echo 'G1=BLOCKED; RELEASE=NO_GO'
