#!/usr/bin/env bash
# Salva Motoca! mock role-based concurrent quote acceptance, PostgreSQL 17 ONLY.
# All sessions use SET ROLE authenticated with a FAKE claim, NOT real JWT Auth.
set -euo pipefail
if [[ "$PGDATABASE" != "f234_auth_disposable" ]] ||
 [[ "$PGHOST" != "localhost" && "$PGHOST" != "127.0.0.1" ]]; then
 echo "REFUSE: isolated f234_auth_disposable on loopback only" >&2; exit 3
fi
psqlc(){ psql -X -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d f234_auth_disposable "$@"; }
tmp="$(mktemp -d)"
cleanup(){
 psqlc -Atqc "update private.f234_mock_gate set enabled=false where singleton" >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
assert_sql(){
 local ans
 ans="$(psqlc -Atqc "$1")"
 [[ "$ans" == t ]] || { echo "F234_AUTH_RACE_INVARIANT_FAIL" >&2; exit 1; }
}
REQ='33333333-3333-4333-8333-333333333333'
A='44444444-4444-4444-8444-444444444444'
B='55555555-5555-4555-8555-555555555555'
CUSTOMER='11111111-1111-4111-8111-111111111111'
PROVIDER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
THIRD='55555555-5555-4555-8555-555555555555'

psqlc -Atqc "update private.f234_mock_gate set enabled=true where singleton" >/dev/null

# Two competing bids, same fake customer identity. Single winner.
psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 set role authenticated;
 set local request.jwt.claim.sub='$CUSTOMER';
 select public.f234_mock_accept_as_customer('$REQ','$A','evt_auth_race_first',2000);
 select pg_sleep(1);commit;" >"$tmp/first" 2>&1 &
a=$!
sleep 0.15
psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 set role authenticated;
 set local request.jwt.claim.sub='$CUSTOMER';
 select public.f234_mock_accept_as_customer('$REQ','$B','evt_auth_race_second',2000);
 commit;" >"$tmp/second" 2>&1 &
b=$!
set +e
wait "$a"; ar=$?
wait "$b"; br=$?
set -e
if [[ "$ar" -ne 0 || "$br" -eq 0 ]]; then
 echo "F234_AUTH_RACE_DOUBLE_ACCEPT_OR_FIRST_FAILURE" >&2; exit 1
fi
grep -q '"outcome": "accepted_mock"' "$tmp/first"
grep -q 'WINNER_ALREADY_SELECTED' "$tmp/second"
assert_sql "select count(*)=1 from private.f234_mock_quotes where request_id='$REQ' and status='accepted'"
assert_sql "select count(*)=1 from private.f456_mock_sessions where request_id='$REQ' and not mock_paid"
assert_sql "select count(*)=0 from private.f456_mock_journal"
echo 'F234_AUTH_RACE=ONE_WINNER_OTHER_DENIED'

# Third party and provider cannot mutate the customer's chosen quote.
psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 set role authenticated;
 set local request.jwt.claim.sub='$THIRD';
 select count(*) from public.f234_mock_quote_cards;
 commit;" >"$tmp/third-read"
grep -qx '0' "$tmp/third-read"

if psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 set role authenticated;
 set local request.jwt.claim.sub='$PROVIDER';
 select public.f234_mock_accept_as_customer('$REQ','$A','evt_provider_race_try',2050);
 commit;" >"$tmp/provider-accept" 2>&1; then
 echo "F234_AUTH_RACE_PROVIDER_ACCEPTED_AS_CUSTOMER" >&2; exit 1
fi
grep -q 'CUSTOMER_NOT_AUTHORIZED' "$tmp/provider-accept"

psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 set role authenticated;
 set local request.jwt.claim.sub='$PROVIDER';
 select count(*) from public.f234_mock_quote_cards;
 commit;" >"$tmp/provider-read"
grep -qx '2' "$tmp/provider-read"
echo 'F234_AUTH_RACE_THIRD_CANNOT_READ_PROVIDER_CANNOT_ACCEPT'

# No PSP, dispatch or even mock payment has been created.
assert_sql "select count(*)=0 from private.f456_mock_events"
assert_sql "select count(*)=0 from private.f5_mock_outbox"
psqlc -Atqc "update private.f234_mock_gate set enabled=false where singleton" >/dev/null
assert_sql "select not enabled from private.f234_mock_gate where singleton"
echo 'F234_AUTH_REAL_JWT=NOT_TESTED'
echo 'HOSTED_SUPABASE_CHANGES=NONE; G1=BLOCKED; RELEASE=NO_GO'
