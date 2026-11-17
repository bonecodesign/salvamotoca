import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const fixture=get('tests/f234-auth-roles-fixture.sql');
const sql=get('tests/f234-auth-roles-adversarial.sql');
const race=get('tests/f234-auth-roles-race.sh');
const config=get('config.js');

test('Auth fake apenas PG17 descartável, nunca valida JWT',()=>{
 assert.match(fixture,/PostgreSQL 17 disposable CI ONLY/);
 assert.match(fixture,/NOT real Supabase Auth/);
 assert.match(fixture,/request\.jwt\.claim\.sub.*test selector ONLY/);
 assert.match(fixture,/create schema auth/);
 assert.match(fixture,/create function auth\.uid\(\)/);
 assert.match(fixture,/request\.jwt\.claim\.sub/);
 assert.doesNotMatch(fixture,/\b(service_role|sb_secret_|http_post|net\.http_post|dblink|create extension)\b/i);
});
test('RLS protege ofertas e negamos colunas secretas de quote cards',()=>{
 assert.match(fixture,/alter table public\.f234_mock_quote_cards enable row level security/);
 assert.match(fixture,/create policy f234_quote_cards_actor_only/);
 assert.match(fixture,/for select to authenticated/);
 assert.match(fixture,/customer_id=\(select auth\.uid\(\)\)/);
 assert.match(fixture,/provider_owner_id=\(select auth\.uid\(\)\)/);
 assert.match(fixture,/grant select\(quote_id,request_id,service_cents,travel_cents,quote_status\)/);
 assert.doesNotMatch(fixture,/grant select\s+on public\.f234_mock_quote_cards/i);
 assert.match(sql,/THIRD_PARTY_RLS_BYPASS/);
 assert.match(sql,/HIDDEN_OWNER_OR_PRIVATE_NOTE_EXPOSED/);
});
test('API mock não aceita identidade passada pelo cliente',()=>{
 const wrap=fixture.match(/create function public\.f234_mock_accept_as_customer\(([\s\S]*?)\) returns jsonb/i);
 assert.ok(wrap);
 assert.doesNotMatch(wrap[1],/p_actor_id/);
 assert.match(fixture,/declare v_actor uuid:=auth\.uid\(\)/);
 assert.match(fixture,/private\.f234_mock_accept_quote\(\s*p_request_id,p_quote_id,v_actor,p_event_id,p_at_ms\)/);
 assert.match(sql,/CUSTOMER_NOT_AUTHORIZED/);
 assert.match(sql,/PROVIDER_ACCEPTED_AS_CUSTOMER/);
});
test('Funções SECURITY DEFINER mock fechadas para anon; privadas sem grants',()=>{
 assert.match(fixture,/security definer set search_path=''/);
 assert.match(fixture,/revoke all on function\s+public\.f234_mock_accept_as_customer/);
 assert.match(fixture,/from public,anon,authenticated/);
 assert.match(fixture,/to authenticated/);
 assert.match(sql,/ANON_RPC_EXECUTE_LEAK/);
 assert.match(sql,/CLIENT_CAN_CALL_PRIVATE_MOCK_PAYMENT_OR_OUTBOX/);
 assert.match(sql,/CLIENT_QUOTE_TAMPER_GRANTED/);
});
test('A vê próprios orçamentos; B somente o seu; C não vê nem aceita',()=>{
 for(const mark of [
 'CUSTOMER_RLS_OWN_QUOTES_MISSING','PROVIDER_RLS_WRONG_VISIBLE_QUOTES',
 'THIRD_PARTY_SESSION_GRANTED','THIRD_PARTY_CANCEL_GRANTED',
 'OTHER_PROVIDER_QUOTE_READ','LOSING_PROVIDER_SESSION_ACCESS',
 'SELECTED_PROVIDER_SESSION_CONTAINS_REAL_PERMISSION'])
  assert.ok(sql.includes(mark),mark);
 assert.match(fixture,/exactLocationShared',false/);
 assert.match(fixture,/chatAllowed',false/);
 assert.match(sql,/AUTH_SESSION_EXPOSED_REAL_PERMISSION/);
});
test('Aceite único e cancelamento são separados de dinheiro real',()=>{
 assert.match(sql,/AUTH_ACCEPT_IDEMPOTENCY_FAIL/);
 assert.match(sql,/SECOND_WINNER_ACCEPTED/);
 assert.match(sql,/AUTH_CANCEL_POST_ACCEPT_GRANTED/);
 assert.match(sql,/AUTH_MOCK_ACCEPT_CREATED_FAKE_MONEY_OR_DISPATCH/);
 assert.match(sql,/AUTH_MOCK_TEST_ROLLBACK_FAILED/);
 assert.match(sql,/rollback;/);
});
test('Duas conexões PostgreSQL usam perfis de teste e impedem corrida no aceite',()=>{
 assert.match(race,/F234_AUTH_RACE=ONE_WINNER_OTHER_DENIED/);
 assert.match(race,/F234_AUTH_RACE_THIRD_CANNOT_READ_PROVIDER_CANNOT_ACCEPT/);
 assert.match(race,/F234_AUTH_REAL_JWT=NOT_TESTED/);
 assert.match(race,/f234_auth_disposable/);
 assert.match(race,/127\.0\.0\.1/);
});
test('Release continua congelado com F1/F2/F3 desabilitados',()=>{
 assert.match(config,/f1TestRequestsEnabled:\s*false/);
 assert.match(config,/f2TestOffersEnabled:\s*false/);
 assert.match(config,/f3TowEnabled:\s*false/);
 assert.match(race,/HOSTED_SUPABASE_CHANGES=NONE; G1=BLOCKED; RELEASE=NO_GO/);
});
