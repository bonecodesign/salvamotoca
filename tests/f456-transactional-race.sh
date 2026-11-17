#!/usr/bin/env bash
# Salva Motoca! F4-F6 concurrent tests, disposable PG17 only.
set -euo pipefail
if [[ "$PGDATABASE" != "f456_race_disposable" ]] || [[ "$PGHOST" != "localhost" && "$PGHOST" != "127.0.0.1" ]]; then
  echo 'REFUSE: only f456_race_disposable on local GitHub runner' >&2; exit 3
fi
psqlc(){ psql -X -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d f456_race_disposable "$@"; }
tmp="$(mktemp -d)"
cleanup(){
  psqlc -Atqc "update private.f456_mock_gate set enabled=false where singleton" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
psqlc -Atqc "update private.f456_mock_gate set enabled=true where singleton" >/dev/null
R="33333333-3333-4333-8333-333333333333"
P="22222222-2222-4222-8222-222222222222"
C="11111111-1111-4111-8111-111111111111"
FIX="99999999-9999-4999-8999-999999999999"

run_sql(){
  local sql="$1" logfile="$2" delay=0
  if [[ "$#" -gt 2 ]]; then delay="$3"; fi
  psqlc -Atqc "begin; set local app.f456_test_only='disposable_pg17'; select private.f456_apply_mock_event($sql); select pg_sleep($delay); commit;" >"$logfile" 2>&1
}
assert_sql(){
  local result
  result="$(psqlc -Atqc "$1")"
  if [[ "$result" != "t" ]]; then
    echo "FAIL: synthetic concurrency invariant did not hold" >&2; exit 1
  fi
}
receipt="'$R','evt_paid_race_001','mock_payment_verified','$FIX',1100,29300"
run_sql "$receipt" "$tmp/paid-a" 1 &
a=$!
sleep 0.15
run_sql "$receipt" "$tmp/paid-b" 0 &
b=$!
wait "$a"
wait "$b"
grep -q '"outcome": "applied"' "$tmp/paid-a"
grep -q '"outcome": "duplicate"' "$tmp/paid-b"
assert_sql "select count(*)=1 from private.f456_mock_journal"
assert_sql "select count(*)=1 from private.f456_mock_events where payload->>'kind'='mock_payment_verified'"
assert_sql "select stage='ready_for_dispatch' and version=1 and not real_transfer_authorized from private.f456_mock_sessions where request_id='$R'"
echo 'F456_RACE_SAME_RECEIPT=ONE_APPLIED_ONE_DUPLICATE'

dispatch_a="'$R','evt_dispatch_race_a','mock_dispatch','$P',1200"
dispatch_b="'$R','evt_dispatch_race_b','mock_dispatch','$P',1200"
run_sql "$dispatch_a" "$tmp/dispatch-a" 1 &
a=$!
sleep 0.15
run_sql "$dispatch_b" "$tmp/dispatch-b" 0 &
b=$!
set +e
wait "$a"; ra=$?
wait "$b"; rb=$?
set -e
if [[ "$ra" -ne 0 || "$rb" -eq 0 ]] ||
  ! grep -q 'DISPATCH_NOT_AUTHORIZED' "$tmp/dispatch-b"; then
  echo 'FAIL: duplicated dispatch was not rejected atomically' >&2; exit 1
fi
assert_sql "select stage='en_route' and version=2 from private.f456_mock_sessions where request_id='$R'"
assert_sql "select count(*)=1 from private.f456_mock_events where payload->>'kind'='mock_dispatch'"
echo 'F456_RACE_DIFFERENT_DISPATCH=ONE_APPLIED_ONE_REJECTED'

run_sql "'$R','evt_arrived_race_1','mock_arrival','$P',1300" "$tmp/arrived"
run_sql "'$R','evt_started_race_1','mock_service_started','$P',1400" "$tmp/start"
run_sql "'$R','evt_summary_race_1','mock_summary_submitted','$P',1500" "$tmp/summary"
run_sql "'$R','evt_provider_race_1','mock_provider_confirmed','$P',1600" "$tmp/confirm-provider" 1 &
a=$!
sleep 0.15
run_sql "'$R','evt_customer_race_1','mock_customer_confirmed','$C',1600,null,true" "$tmp/confirm-customer" 0 &
b=$!
wait "$a"
wait "$b"
assert_sql "select stage='completed' and customer_confirmed and provider_confirmed and not real_transfer_authorized from private.f456_mock_sessions where request_id='$R'"
assert_sql "select count(*)=2 from private.f456_mock_events where payload->>'kind' in ('mock_provider_confirmed','mock_customer_confirmed')"
echo 'F456_RACE_BILATERAL=COMPLETED_NO_TRANSFER'

run_sql "'$R','evt_chargeback_race','mock_chargeback','$FIX',1700,29300" "$tmp/chargeback"
assert_sql "select stage='mock_hold' and not real_payment_verified and not real_dispatch_authorized and not real_transfer_authorized from private.f456_mock_sessions where request_id='$R'"
assert_sql "select count(*)=1 from private.f456_mock_journal"
psqlc -Atqc "update private.f456_mock_gate set enabled=false where singleton" >/dev/null
assert_sql "select not enabled from private.f456_mock_gate where singleton"
echo 'F456_RACE_CHARGEBACK=HOLD_NO_TRANSFER'
echo 'F456_BACKEND_REAL=NOT_IMPLEMENTED; G1=BLOCKED; RELEASE=NO_GO'
