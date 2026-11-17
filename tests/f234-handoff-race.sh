#!/usr/bin/env bash
# F234 -> F456 -> F5 concurrent acceptance, fake payment and outbox.
# ONLY GitHub Actions disposable PG17; no external services.
set -euo pipefail
if [[ "$PGDATABASE" != "f234_handoff_disposable" ]] ||
 [[ "$PGHOST" != "localhost" && "$PGHOST" != "127.0.0.1" ]]; then
 echo "REFUSED: only f234_handoff_disposable on loopback" >&2; exit 3
fi
psqlc(){ psql -X -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d f234_handoff_disposable "$@"; }
tmp="$(mktemp -d)"
cleanup(){
  psqlc -Atqc "update private.f234_mock_gate set enabled=false where singleton" >/dev/null 2>&1 || true
  psqlc -Atqc "update private.f456_mock_gate set enabled=false where singleton" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
assert_sql(){
  local answer
  answer="$(psqlc -Atqc "$1")"
  [[ "$answer" == "t" ]] || { echo "F234_RACE_ASSERT_FAIL" >&2; exit 1; }
}
R='33333333-3333-4333-8333-333333333333'
C='11111111-1111-4111-8111-111111111111'
A='44444444-4444-4444-8444-444444444444'
B='55555555-5555-4555-8555-555555555555'
P='22222222-2222-4222-8222-222222222222'
FIX='99999999-9999-4999-8999-999999999999'
psqlc -Atqc "update private.f234_mock_gate set enabled=true where singleton; update private.f456_mock_gate set enabled=true where singleton" >/dev/null

# Two different bids accepted at the same instant: row lock serializes choice.
psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 select private.f234_mock_accept_quote('$R','$A','$C','evt_accept_race_first',2000);
 select pg_sleep(1);commit;" >"$tmp/accept-first" 2>&1 &
first=$!
sleep 0.15
psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 select private.f234_mock_accept_quote('$R','$B','$C','evt_accept_race_second',2000);
 commit;" >"$tmp/accept-second" 2>&1 &
second=$!
set +e
wait "$first"; a=$?
wait "$second"; b=$?
set -e
if [[ "$a" -ne 0 || "$b" -eq 0 ]]; then
 echo 'F234_RACE_FAIL: two quote winners or first failed' >&2; exit 1
fi
grep -q '"outcome": "accepted_mock"' "$tmp/accept-first"
grep -q 'WINNER_ALREADY_SELECTED' "$tmp/accept-second"
assert_sql "select count(*)=1 from private.f456_mock_sessions where request_id='$R'"
assert_sql "select count(*)=1 from private.f234_mock_quotes where request_id='$R' and status='accepted'"
assert_sql "select count(*)=0 from private.f456_mock_journal"
echo 'F234_RACE_QUOTE_SELECTION=ONE_WINNER_ONE_REJECTED'

# Exact retry gets duplicate acknowledgement, not another session.
psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 select private.f234_mock_accept_quote('$R','$A','$C','evt_accept_race_first',2000);
 commit;" >"$tmp/replay-accept"
grep -q '"outcome": "duplicate"' "$tmp/replay-accept"

# Same fake receipt in two transactions: one applied, second duplicate.
psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 set local app.f456_test_only='disposable_pg17';
 select private.f456_apply_mock_event('$R','evt_race_fake_paid','mock_payment_verified','$FIX',2100,29300);
 select pg_sleep(1);commit;" >"$tmp/paid-first" 2>&1 &
first=$!
sleep 0.15
psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 set local app.f456_test_only='disposable_pg17';
 select private.f456_apply_mock_event('$R','evt_race_fake_paid','mock_payment_verified','$FIX',2100,29300);
 commit;" >"$tmp/paid-second" 2>&1 &
second=$!
wait "$first"
wait "$second"
grep -q '"outcome": "applied"' "$tmp/paid-first"
grep -q '"outcome": "duplicate"' "$tmp/paid-second"
assert_sql "select count(*)=1 from private.f456_mock_journal"
assert_sql "select count(*)=0 from private.f5_mock_outbox"
echo 'F234_RACE_PAYMENT_MOCK=ONE_JOURNAL_ONE_REPLAY'

# Two separate dispatch IDs race. Only one fictitious outbox job.
psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 set local app.f456_test_only='disposable_pg17';
 select private.f456_apply_mock_event('$R','evt_dispatch_race_first','mock_dispatch','$P',2200);
 select pg_sleep(1);commit;" >"$tmp/dispatch-first" 2>&1 &
first=$!
sleep 0.15
psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 set local app.f456_test_only='disposable_pg17';
 select private.f456_apply_mock_event('$R','evt_dispatch_race_second','mock_dispatch','$P',2200);
 commit;" >"$tmp/dispatch-second" 2>&1 &
second=$!
set +e
wait "$first"; a=$?
wait "$second"; b=$?
set -e
if [[ "$a" -ne 0 || "$b" -eq 0 ]]; then
 echo 'F234_RACE_FAIL: double dispatch or first failed' >&2;exit 1
fi
grep -q 'DISPATCH_NOT_AUTHORIZED' "$tmp/dispatch-second"
assert_sql "select count(*)=1 from private.f5_mock_outbox where request_id='$R' and status='pending' and not external_sent"
assert_sql "select count(*)=1 from private.f456_mock_events where request_id='$R' and payload->>'kind'='mock_dispatch'"
echo 'F234_RACE_DISPATCH=ONE_OUTBOX_NO_EXTERNAL_MESSAGE'

# Financial risk always cancels a pending outbox job, no payout.
psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 set local app.f456_test_only='disposable_pg17';
 select private.f456_apply_mock_event('$R','evt_race_refund_01','mock_refund_requested','$FIX',2300,29300);
 commit;" >"$tmp/refund"
assert_sql "select status='cancelled' and not external_sent from private.f5_mock_outbox where request_id='$R'"
assert_sql "select stage='mock_hold' and not real_payment_verified and not real_transfer_authorized from private.f456_mock_sessions where request_id='$R'"
echo 'F234_RACE_RISK=OUTBOX_REVOKED_NO_TRANSFER'

# Conflict between cancel and accept on another request: cancel wins.
R2='33333333-3333-4333-8333-333333333335'
Q2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 select private.f234_mock_cancel_preaccept('$R2','$C'); select pg_sleep(1);commit;" >"$tmp/cancel-first" 2>&1 &
first=$!
sleep 0.15
psqlc -Atqc "begin; set local app.f234_test_only='disposable_pg17';
 select private.f234_mock_accept_quote('$R2','$Q2','$C','evt_cancel_accept_race',2000);commit;" >"$tmp/accept-after-cancel" 2>&1 &
second=$!
set +e
wait "$first"; a=$?
wait "$second"; b=$?
set -e
if [[ "$a" -ne 0 || "$b" -eq 0 ]]; then
 echo 'F234_RACE_FAIL: cancelled quote accepted' >&2; exit 1
fi
grep -q 'REQUEST_CLOSED' "$tmp/accept-after-cancel"
assert_sql "select state='cancelled' from private.f234_mock_requests where request_id='$R2'"
assert_sql "select count(*)=0 from private.f456_mock_sessions where request_id='$R2'"
echo 'F234_RACE_CANCEL=NO_PAYMENT_SNAPSHOT'

psqlc -Atqc "update private.f234_mock_gate set enabled=false where singleton; update private.f456_mock_gate set enabled=false where singleton" >/dev/null
assert_sql "select not enabled from private.f234_mock_gate where singleton"
assert_sql "select not enabled from private.f456_mock_gate where singleton"
echo 'SUPABASE_HOSTED_WRITES=NONE; PSP_REAL=NOT_CONNECTED; G1=BLOCKED; RELEASE=NO_GO'
