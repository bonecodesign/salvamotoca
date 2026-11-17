import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const f=file('tests/f5-outbox-fixture.sql');
const adversarial=file('tests/f5-outbox-adversarial.sql');
const race=file('tests/f5-outbox-race.sh');
test('F5 outbox nasce privada, sem API, RLS e sem direitos aos papeis clientes',()=>{
 assert.match(f,/create table private\.f5_mock_outbox/);
 assert.match(f,/alter table private\.f5_mock_outbox enable row level security/);
 assert.match(f,/revoke all on private\.f5_mock_outbox from public,anon,authenticated/);
 assert.match(f,/revoke all on function private\.f5_mock_outbox_on_event/);
 assert.match(f,/private\.f5_mock_outbox_claim\(text,bigint\)/);
 assert.match(f,/from public,anon,authenticated/);
 assert.doesNotMatch(f,/\b(service_role|http_post|net\.http_post|dblink|create extension)\b/i);
});
test('F5 cria evento de outbox somente de dispatch apos pagamento mock',()=>{
 assert.match(f,/create trigger f5_mock_outbox_insert/);
 assert.match(f,/new\.payload->>'kind'='mock_dispatch'/);
 assert.match(f,/new\.stage_after<>'en_route'/);
 assert.match(f,/where s\.request_id=new\.request_id and s\.mock_paid/);
 assert.match(f,/on conflict\(source_event_id\) do nothing/);
 assert.match(adversarial,/PAYMENT_NOT_ALLOWED_TO_DISPATCH/);
 assert.match(adversarial,/OUTBOX_NOT_ATOMIC_WITH_DISPATCH/);
});
test('F5 outbox cancela aviso apos chegada, disputa ou chargeback',()=>{
 for(const kind of ['mock_arrival','mock_dispute','mock_chargeback','mock_refund_requested'])
  assert.ok(f.includes("'"+kind+"'"),'missing '+kind);
 assert.match(f,/where request_id=new\.request_id and status in\('pending','leased'\)/);
 assert.match(adversarial,/ARRIVAL_DID_NOT_REVOKE_LEASE/);
 assert.match(adversarial,/DISPUTE_DID_NOT_REVOKE_PENDING/);
 assert.match(adversarial,/STALE_OR_FOREIGN_CLAIM/);
});
test('Lease protege de ack velho, retries controlados e fila isolada',()=>{
 assert.match(f,/for update of o skip locked limit 1/);
 assert.match(f,/lease_expires_at_ms=p_now_ms\+30000/);
 assert.match(f,/claim_token=pg_catalog\.gen_random_uuid\(\)/);
 assert.match(f,/attempts<3/);
 assert.match(f,/attempts>=3/);
 assert.match(f,/return 'duplicate_mock_ack'/);
 assert.match(f,/OUTBOX_SESSION_NO_LONGER_EN_ROUTE/);
 assert.match(adversarial,/RETRY_3_NOT_DEAD/);
 assert.match(race,/F5_OUTBOX_WORKERS=ONE_CLAIM_ONE_EMPTY/);
 assert.match(race,/F5_OUTBOX_EXPIRED_LEASE=RECLAIMED_STALE_ACK_DENIED/);
});
test('Somente estados MOCK, nenhuma notificacao real',()=>{
 assert.match(f,/kind text not null default 'mock_dispatch_notice'/);
 assert.match(f,/status in\('pending','leased','acked_mock','cancelled','dead'\)/);
 assert.match(f,/'externalSent',false/);
 assert.match(f,/security invoker set search_path=''/);
 assert.match(adversarial,/rollback;/);
 assert.match(adversarial,/OUTBOX_ADVERSARIAL_DID_NOT_ROLLBACK/);
 assert.match(race,/PGDATABASE.*f456_race_disposable/);
 assert.match(race,/127\.0\.0\.1/);
 assert.match(race,/F5_OUTBOX_EXTERNAL_NOTIFICATIONS=ZERO/);
});
