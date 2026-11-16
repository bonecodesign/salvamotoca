import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const get = path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const fixture=get('tests/f1-other-rpcs-security-fixture.sql');
const adversarial=get('tests/f1-other-rpcs-adversarial.sql');
test('Somente PostgreSQL descartavel: guards nao sao migrations',()=>{
 assert.match(fixture,/PostgreSQL 17 DESCARTÁVEL/);
 assert.match(fixture,/Não é migration/);
 assert.match(fixture,/create schema private/);
 assert.doesNotMatch(fixture,/create (extension|role service_role)|dblink|postgres_fdw/i);
});
test('Cobre cinco RPCs F1 com grants privados e autenticacao',()=>{
 for (const name of [
  'submit_quote','answer_quote','finish_request','set_presence','ping_presence'
 ]) {
  assert.match(fixture,new RegExp('create function private.f1_guarded_'+name+'\\('));
  assert.match(fixture,new RegExp('private.f1_baseline_'+name+'\\('));
 }
 assert.match(fixture,/revoke all on function private.f1_baseline_submit_quote/);
 assert.match(fixture,/to authenticated/);
 assert.match(fixture,/auth.uid\(\)/);
 assert.match(fixture,/security definer set search_path=''/);
});
test('Guarda de orcamentos calcula taxa do cliente e prestador so sobre servico',()=>{
 assert.match(fixture,/service_cents\+travel_cents\+rider_fee_cents/);
 assert.match(fixture,/service_cents\+travel_cents-provider_fee_cents/);
 assert.match(fixture,/rider_fee_cents=\(service_cents\+5\)\/10/);
 assert.match(fixture,/provider_fee_cents=\(service_cents\+5\)\/10/);
 assert.match(adversarial,/rider_fee_cents=2300/);
 assert.match(adversarial,/provider_fee_cents=2300/);
 assert.match(adversarial,/customer_total_cents=29300/);
 assert.match(adversarial,/provider_receivable_cents=24700/);
});
test('Disponibilidade e cancelamento requerem gate e verificacao em servidor',()=>{
 assert.match(fixture,/quote_enabled boolean not null default false/);
 assert.match(fixture,/presence_enabled boolean not null default false/);
 assert.match(fixture,/cancel_enabled boolean not null default false/);
 assert.match(fixture,/status='approved'/);
 assert.match(fixture,/code in \('borracharia_delivery','reboque_moto'\)/);
 assert.match(fixture,/if exists\(select 1 from public.payment_records pay/);
 assert.match(adversarial,/Analise humana financeira/);
 for(const status of ['pending','authorized','paid','refunded','failed','disputed','chargeback'])
  assert.match(adversarial,new RegExp("set status='"+status+"'"));
});
test('Recusa retorno a disponibilidade sem servico e preserva rollback',()=>{
 assert.match(adversarial,/disabled service forced offline/);
 assert.match(adversarial,/no resurrection by ping/);
 assert.match(adversarial,/suspended heartbeat blocked/);
 assert.match(adversarial,/rollback;/);
 assert.match(adversarial,/Gate persisted enabled after rollback/);
 const config=get('config.js');
 assert.match(config,/f1TestRequestsEnabled:\s*false/);
});
