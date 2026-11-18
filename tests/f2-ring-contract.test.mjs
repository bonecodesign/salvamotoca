import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const schema=get('tests/f2-ring-invites-fixture.sql');
const adversarial=get('tests/f2-ring-adversarial.sql');
const seed=get('tests/f2-ring-seed.sql');
const race=get('tests/f2-ring-race.sh');
const legacy=get('supabase/drafts/f2_backend_candidate.sql');
const f2=get('f2-flow.js');
test('F2 usa a tabela de ofertas e a distância existentes, sem novo backend real',()=>{
 assert.match(schema,/public\.f2_request_offers/);
 assert.match(schema,/private\.f2_distance_km/);
 assert.match(legacy,/f2_offer_candidates/);
 assert.match(f2,/RESPONSE_MS = 5 \* 60 \* 1000/);
 assert.match(schema,/PG17|PostgreSQL 17/i);
 assert.doesNotMatch(schema,/(create extension|http_post|net\.http_post|dblink)/i);
});
test('Proximidade antes de raio maior e limite de um convite por passo',()=>{
 assert.match(schema,/greatest\(1,v_progress\.ring_index\)\.\.3/);
 assert.match(schema,/when 1 then 5 when 2 then 15 else 60/);
 assert.match(schema,/order by private\.f2_distance_km/);
 assert.match(schema,/limit 1/);
 assert.match(schema,/unique\(request_id,provider_id\)/);
 assert.match(adversarial,/NEAR_NEXT_BEFORE_RADIUS_EXPANSION/);
 assert.match(adversarial,/SECOND_RING_AFTER_NEAR_EXHAUSTION/);
 assert.match(adversarial,/FAR_THIRD_RING_NOT_LAST/);
});
test('Só prestador aprovado, online e competente, nunca reboque F3',()=>{
 for(const snippet of [
  "p.status='approved' and p.is_active",
  'presence.last_seen_at>=pg_catalog.now()',
  'cap.service_types @> v_req.service_types',
  "'reboque_moto'=any(v_req.service_types)",
  'v_req.f2_mode is distinct from'
 ])assert.ok(schema.includes(snippet),snippet);
 assert.match(adversarial,/SUSPENDED_OR_WRONG_SERVICE_INVITED/);
 assert.match(adversarial,/REQUEST_NOT_ELIGIBLE_FOR_F2_AUTOMATIC/);
 assert.match(seed,/f2_mode,status/);
});
test('Prazo só começa após abertura fictícia; não penalizar entrega não comprovada',()=>{
 assert.match(schema,/coalesce\(i\.acknowledged_ms,i\.offered_ms\)\+300000/);
 assert.match(schema,/external_sent boolean not null default false check\(not external_sent\)/);
 assert.match(schema,/delivery_verified boolean not null default false check\(not delivery_verified\)/);
 assert.match(schema,/absence_counted boolean not null default false check\(not absence_counted\)/);
 assert.match(adversarial,/UNDLIVERED_INVITE_COUNTED_AS_ABSENCE/);
 assert.match(adversarial,/ACK_WINDOW_NOT_PRESERVED/);
});
test('API inacessível em produção, apenas operador de PG isolado',()=>{
 assert.match(schema,/security invoker set search_path=''/);
 assert.match(schema,/revoke all on function/);
 assert.match(schema,/F2_OFFLINE_GATE_DISABLED/);
 assert.match(schema,/app\.f2_ring_test_only/);
 assert.match(adversarial,/rollback;/);
 assert.match(adversarial,/F2_RING_ROLLBACK_FAILED/);
 assert.match(race,/F2_RINGS_CONCURRENT_CALLS=ONE_INVITED_ONE_WAITING/);
 assert.match(race,/F2_EXTERNAL_NOTIFICATIONS=ZERO/);
 assert.match(race,/127\.0\.0\.1/);
});
