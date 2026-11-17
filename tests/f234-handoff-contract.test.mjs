import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const schema=read('tests/f234-handoff-fixture.sql');
const cases=read('tests/f234-handoff-adversarial.sql');
const race=read('tests/f234-handoff-race.sh');

test('Handoff isolado de PG17 e sujeito a gate sem acesso anon/autenticado',()=>{
 assert.match(schema,/POSTGRES 17 DISPOSABLE ONLY/);
 assert.match(schema,/enabled boolean not null default false/);
 assert.match(schema,/app\.f234_test_only/);
 assert.match(schema,/security invoker set search_path=''/);
 assert.match(schema,/revoke all on function private\.f234_mock_quote_freeze/);
 assert.match(schema,/from public,anon,authenticated/);
 assert.doesNotMatch(schema,/create extension|dblink|http_post|net\.http_post|service_role|sb_secret_/i);
});
test('Vencedor financeiro congelado, pedido bloqueado e quote do mesmo ator',()=>{
 assert.match(schema,/for update/);
 assert.match(schema,/WINNER_ALREADY_SELECTED/);
 assert.match(schema,/ACCEPTED_QUOTE_IMMUTABLE/);
 assert.match(schema,/CUSTOMER_NOT_AUTHORIZED/);
 assert.match(schema,/unique\(request_id,provider_id\)/);
 assert.match(schema,/create unique index f234_one_accepted_quote_per_request/);
 assert.match(schema,/selected_provider_id=q\.provider_id/);
 assert.match(schema,/accept_event_id=p_event_id/);
 assert.match(cases,/SELECT_REPLAY_NOT_IDEMPOTENT/);
});
test('Reboque misto exige equipamento e competência para todos os serviços',()=>{
 assert.match(schema,/reboque_moto'=any\(service_types\)/);
 assert.match(schema,/not p\.available_services @> r\.service_types/);
 assert.match(schema,/not p\.tow_equipment_verified/);
 assert.match(schema,/p\.max_moto_kg<r\.motorcycle_weight_kg/);
 assert.match(cases,/MIXED_TOW_NOT_HONOURED/);
});
test('F4 só recebe valores do orçamento aceito e nunca uma prova de PSP',()=>{
 assert.match(schema,/insert into private\.f456_mock_sessions/);
 assert.match(schema,/v_fee:=\(q\.service_cents\*1000\+5000\)\/10000/);
 assert.match(schema,/q\.service_cents\+q\.travel_cents\+v_fee/);
 assert.match(schema,/q\.service_cents\+q\.travel_cents-v_fee/);
 assert.match(schema,/realPspVerified',false/);
 assert.match(schema,/s\.quote_id is distinct from q\.quote_id/);
 assert.match(schema,/s\.provider_id is distinct from q\.provider_id/);
 assert.match(schema,/s\.service_cents is distinct from q\.service_cents/);
 assert.match(cases,/BAD_F234_TO_F456_SNAPSHOT/);
});
test('Apenas atendimento mock reconciliado habilita a fila fictícia de F5',()=>{
 assert.match(schema,/if k='mock_dispatch' and \(/);
 assert.match(schema,/not s\.mock_paid or s\.stage<>'ready_for_dispatch'/);
 assert.match(schema,/private\.f456_mock_journal j/);
 assert.match(schema,/PROVIDER_REVOKED_AT_HANDOFF/);
 assert.match(cases,/F5_OUTBOX_NOT_ATOMIC/);
 assert.match(cases,/F5_RISK_NOT_REVOKED/);
 assert.match(cases,/F234_TRANSACTION_NOT_ROLLED_BACK/);
});
test('Concorrência em duas conexões impede dupla seleção e cancelamento tardio',()=>{
 assert.match(race,/F234_RACE_QUOTE_SELECTION=ONE_WINNER_ONE_REJECTED/);
 assert.match(race,/F234_RACE_PAYMENT_MOCK=ONE_JOURNAL_ONE_REPLAY/);
 assert.match(race,/F234_RACE_DISPATCH=ONE_OUTBOX_NO_EXTERNAL_MESSAGE/);
 assert.match(race,/F234_RACE_CANCEL=NO_PAYMENT_SNAPSHOT/);
 assert.match(race,/F234_RACE_RISK=OUTBOX_REVOKED_NO_TRANSFER/);
 assert.match(race,/127\.0\.0\.1/);
 assert.match(race,/f234_handoff_disposable/);
});
test('Nenhuma cobrança, envio ou arquivo em dispositivo foi introduzido',()=>{
 assert.match(cases,/rollback;/);
 assert.match(cases,/GATES_NOT_CLOSED_AT_START/);
 assert.match(schema,/No auth provider, PSP webhook, push notification/);
 assert.match(race,/PSP_REAL=NOT_CONNECTED; G1=BLOCKED; RELEASE=NO_GO/);
 const config=read('config.js');
 assert.match(config,/f1TestRequestsEnabled:\s*false/);
 assert.match(config,/f2TestOffersEnabled:\s*false/);
 assert.match(config,/f3TowEnabled:\s*false/);
});
