import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=get('tests/f456-transactional-fixture.sql');
const adversarial=get('tests/f456-transactional-adversarial.sql');
const sh=get('tests/f456-transactional-race.sh');
const config=get('config.js');

test('Mock transacional so pode executar em PG isolado com flag e sem grants externos',()=>{
 assert.match(sql,/ONLY for a disposable PostgreSQL 17/);
 assert.match(sql,/private\.f456_mock_gate/);
 assert.match(sql,/enabled boolean not null default false/);
 assert.match(sql,/current_setting\('app\.f456_test_only',true\) is distinct from 'disposable_pg17'/);
 assert.match(sql,/security invoker set search_path=''/);
 assert.match(sql,/revoke all on function private\.f456_apply_mock_event/);
 assert.doesNotMatch(sql,/\b(create extension dblink|postgres_fdw|http_post|net\.http_post|service_role)\b/i);
});
test('Soma 10%+10% no servidor ficticio continua sobre servico, materiais inclusos',()=>{
 for(const check of [
  'rider_fee_cents=(service_cents*1000+5000)/10000',
  'provider_fee_cents=(service_cents*1000+5000)/10000',
  'customer_subtotal_cents=quote_total_cents+rider_fee_cents',
  'provider_receivable_cents=quote_total_cents-provider_fee_cents',
  'platform_gross_cents=rider_fee_cents+provider_fee_cents'
 ])assert.ok(sql.includes(check),check);
 assert.match(sql,/materials_included boolean not null default true check\(materials_included\)/);
});
test('Idempotencia atomicamente protege row lock, ids globais e journaling unico',()=>{
 assert.match(sql,/where request_id=p_request_id for update/);
 assert.match(sql,/event_id text primary key/);
 assert.match(sql,/request_id uuid primary key references private\.f456_mock_sessions/);
 assert.match(sql,/REPLAY_EVENT_ID_PAYLOAD_MISMATCH/);
 assert.match(sql,/return pg_catalog\.jsonb_build_object\('outcome','duplicate'/);
 assert.match(sql,/UNEXPECTED_FINANCIAL_FIELD/);
 assert.match(adversarial,/REPLAY_NOT_IDEMPOTENT/);
});
test('Dois processos PostgreSQL e commit real; corrida de dispatch e confirmacao',()=>{
 assert.match(sh,/run_sql "\$receipt" "\$tmp\/paid-a" 1 &/);
 assert.match(sh,/run_sql "\$receipt" "\$tmp\/paid-b" 0 &/);
 assert.match(sh,/run_sql "\$dispatch_a"/);
 assert.match(sh,/run_sql "\$dispatch_b"/);
 assert.match(sh,/RACE_DIFFERENT_DISPATCH=ONE_APPLIED_ONE_REJECTED/);
 assert.match(sh,/RACE_BILATERAL=COMPLETED_NO_TRANSFER/);
 assert.match(sh,/RACE_CHARGEBACK=HOLD_NO_TRANSFER/);
 assert.match(sh,/PGDATABASE.*f456_race_disposable/);
 assert.match(sh,/127\.0\.0\.1/);
});
test('Nao existe forma de marcar pagamento/despacho/transferencia reais na fixture',()=>{
 for(const flag of ['real_payment_verified','real_dispatch_authorized','real_transfer_authorized'])
  assert.match(sql,new RegExp(flag+' boolean not null default false check\\(not '+flag+'\\)'));
 assert.match(adversarial,/rollback;/);
 assert.match(adversarial,/TEST_NOT_ROLLED_BACK/);
 assert.match(sql,/p_at_ms>s\.summary_at_ms\+300000/);
 assert.match(sql,/s\.stage:='mock_hold'/);
 assert.match(config,/f1TestRequestsEnabled:\s*false/);
});
