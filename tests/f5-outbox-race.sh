#!/usr/bin/env bash
# F5 mock outbox: two concurrent PostgreSQL workers; NO external send.
set -euo pipefail
if [[ "$PGDATABASE" != "f456_race_disposable" ]] ||
 [[ "$PGHOST" != "localhost" && "$PGHOST" != "127.0.0.1" ]]; then
 echo 'REFUSE: f456_race_disposable loopback only' >&2; exit 3
fi
psqlc(){ psql -X -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d f456_race_disposable "$@"; }
tmp="$(mktemp -d)"
cleanup(){
 psqlc -Atqc "update private.f456_mock_gate set enabled=false where singleton" >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
assert_sql(){
 local r
 r="$(psqlc -Atqc "$1")"
 [[ "$r" == "t" ]] || { echo 'F5_OUTBOX_RACE_FAIL: invariant violated' >&2; exit 1; }
}
psqlc -Atqc "update private.f456_mock_gate set enabled=true where singleton" >/dev/null
R='33333333-3333-4333-8333-333333333333'
P='22222222-2222-4222-8222-222222222222'
MOCK='99999999-9999-4999-8999-999999999999'
psqlc -Atqc "begin; set local app.f456_test_only='disposable_pg17';
 select private.f456_apply_mock_event('$R','evt_outbox_paid_01','mock_payment_verified','$MOCK',1100,29300);
 select private.f456_apply_mock_event('$R','evt_outbox_dispatch','mock_dispatch','$P',1200);
 commit;" >"$tmp/dispatch.log"
assert_sql "select count(*)=1 from private.f5_mock_outbox"
echo 'F5_OUTBOX_DISPATCH=ONE_ATOMIC_JOB'

# Two actual overlapping psql sessions, SKIP LOCKED means one empty.
psqlc -Atqc "begin; set local app.f456_test_only='disposable_pg17';
 select private.f5_mock_outbox_claim('worker_alpha',2000);
 select pg_sleep(1); commit;" >"$tmp/worker-a.log" 2>&1 &
a=$!
sleep 0.2
psqlc -Atqc "begin; set local app.f456_test_only='disposable_pg17';
 select private.f5_mock_outbox_claim('worker_beta',2000);
 commit;" >"$tmp/worker-b.log" 2>&1 &
b=$!
wait "$a"
wait "$b"
grep -q '"status": "leased"' "$tmp/worker-a.log"
grep -q '"status": "empty"' "$tmp/worker-b.log"
assert_sql "select count(*)=1 from private.f5_mock_outbox where status='leased' and attempts=1"
echo 'F5_OUTBOX_WORKERS=ONE_CLAIM_ONE_EMPTY'

# A crashed worker loses its lease. Old token must never acknowledge.
id="$(psqlc -Atqc 'select job_id from private.f5_mock_outbox')"
old="$(psqlc -Atqc "select claim_token from private.f5_mock_outbox where job_id=$id")"
psqlc -Atqc "begin; set local app.f456_test_only='disposable_pg17';
 select private.f5_mock_outbox_claim('worker_beta',33000);
 commit;" >"$tmp/reclaim.log"
grep -q '"attempt": 2' "$tmp/reclaim.log"
new="$(psqlc -Atqc "select claim_token from private.f5_mock_outbox where job_id=$id")"
if [[ "$old" == "$new" ]]; then echo 'REUSED_LEASE_TOKEN' >&2; exit 1; fi
if psqlc -Atqc "begin; set local app.f456_test_only='disposable_pg17';
 select private.f5_mock_outbox_ack($id,'worker_alpha','$old',33050);
 commit;" >"$tmp/stale.log" 2>&1; then
 echo 'F5_OUTBOX_RACE_FAIL: stale ack accepted' >&2; exit 1
fi
grep -q 'STALE_OR_FOREIGN_CLAIM' "$tmp/stale.log"
psqlc -Atqc "begin; set local app.f456_test_only='disposable_pg17';
 select private.f5_mock_outbox_ack($id,'worker_beta','$new',33050);
 commit;" >"$tmp/ack.log"
grep -q 'acked_mock' "$tmp/ack.log"
assert_sql "select status='acked_mock' and attempts=2 from private.f5_mock_outbox where job_id=$id"
echo 'F5_OUTBOX_EXPIRED_LEASE=RECLAIMED_STALE_ACK_DENIED'

# No new work, even if retrying after acknowledgement.
psqlc -Atqc "begin; set local app.f456_test_only='disposable_pg17';
 select private.f5_mock_outbox_claim('worker_alpha',34000);
 commit;" >"$tmp/empty.log"
grep -q '"status": "empty"' "$tmp/empty.log"
psqlc -Atqc "update private.f456_mock_gate set enabled=false where singleton" >/dev/null
assert_sql "select not enabled from private.f456_mock_gate where singleton"
assert_sql "select count(*)=1 from private.f5_mock_outbox"
assert_sql "select count(*)=1 from private.f456_mock_events where payload->>'kind'='mock_dispatch'"
echo 'F5_OUTBOX_EXTERNAL_NOTIFICATIONS=ZERO'
echo 'F5_OUTBOX=OFFLINE_PASS; G1=BLOCKED; RELEASE=NO_GO'
