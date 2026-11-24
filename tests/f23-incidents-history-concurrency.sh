#!/usr/bin/env bash
# SM-PLAN-005: duas sessões REAIS de psql em PostgreSQL17 descartável.
# Nunca aceitar host remoto, outra base ou credenciais do projeto hospedado.
set -euo pipefail
if [[ "${PGDATABASE:-}" != "f23_disposable" ]] ||
 [[ "${PGHOST:-}" != "localhost" && "${PGHOST:-}" != "127.0.0.1" ]] ||
 [[ "${PGPORT:-5432}" != "5432" ]]; then
 echo 'REFUSE: expected f23_disposable on localhost:5432 only' >&2; exit 3
fi
psqlc(){ psql -X -w -v ON_ERROR_STOP=1 "$@"; }
tmp="$(mktemp -d)"
cleanup(){
 psqlc -Atqc "truncate public.f23_mock_incident_events,public.f23_mock_incidents restart identity;
 delete from public.service_requests where id in
 ('77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888');
 delete from public.providers where id in
 ('55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666');
 delete from public.service_categories where id=2;
 update private.f23_mock_support_gate set enabled=false where singleton;" >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
psqlc -q <<'SQL'
insert into public.service_categories(id,code,paid_in_app)
 values(2,'borracharia_delivery',true);
insert into public.providers(id,owner_id,status,is_active,display_name) values
 ('55555555-5555-4555-8555-555555555555',
  '22222222-2222-4222-8222-222222222222','approved',true,'A synthetic'),
 ('66666666-6666-4666-8666-666666666666',
  '33333333-3333-4333-8333-333333333333','approved',true,'B synthetic');
insert into public.service_requests(id,customer_id,provider_id,category_id)
 values
 ('77777777-7777-4777-8777-777777777777',
  '11111111-1111-4111-8111-111111111111',
  '55555555-5555-4555-8555-555555555555',2),
 ('88888888-8888-4888-8888-888888888888',
  '11111111-1111-4111-8111-111111111111',
  '55555555-5555-4555-8555-555555555555',2);
update private.f23_mock_support_gate set enabled=true where singleton;
SQL
R="77777777-7777-4777-8777-777777777777"
R2="88888888-8888-4888-8888-888888888888"
PA="22222222-2222-4222-8222-222222222222"
PB="33333333-3333-4333-8333-333333333333"
C="11111111-1111-4111-8111-111111111111"
A="55555555-5555-4555-8555-555555555555"
B="66666666-6666-4666-8666-666666666666"

# Disputa de lock: um registro no prestador A deve concluir antes de a
# atribuição A -> B ser alterada. UPDATE concorrente bloqueia no FOR UPDATE.
psqlc -Atqc "begin; set local role authenticated;
 select set_config('request.jwt.claim.sub','$PA',true);
 select public.f23_mock_submit_incident(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','$R','service_issue');
 select pg_sleep(2); commit;" >"$tmp/submit-A" 2>&1 &
one=$!
sleep 0.25
psqlc -Atqc "update public.service_requests set provider_id='$B' where id='$R';" >"$tmp/reassign-B" 2>&1 &
two=$!
blocked=0
for _ in $(seq 1 12); do
 state="$(psqlc -Atqc "select exists(select 1 from pg_stat_activity
 where pid<>pg_backend_pid() and wait_event_type='Lock'
 and query ilike 'update public.service_requests set provider_id=%');")"
 if [[ "$state" == t ]]; then blocked=1; break; fi
 sleep 0.07
done
wait "$one"
wait "$two"
[[ "$blocked" -eq 1 ]] || { echo 'FAIL: provider reassignment was not blocked by intake row lock' >&2; exit 1; }
[[ "$(psqlc -Atqc "select count(*)=1 from public.f23_mock_incidents
 where request_key='$R' and reporter_id='$PA' and
 assignment_generation_at_report=1 and provider_at_report='$A'")" == t ]]
[[ "$(psqlc -Atqc "select f23_mock_assignment_generation=2 from public.service_requests where id='$R'")" == t ]]
echo 'SM_PLAN_005_REASSIGNMENT_LOCK=OBSERVED'

# Antigo prestador não tem permissão após troca. Novo pode registrar relato.
if psqlc -Atqc "begin; set local role authenticated;
 select set_config('request.jwt.claim.sub','$PA',true);
 select public.f23_mock_reporter_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 commit;" >"$tmp/old-access" 2>&1; then
 echo 'FAIL: old provider retained case status access' >&2; exit 1
fi
grep -q 'Caso não encontrado' "$tmp/old-access"
psqlc -Atqc "begin; set local role authenticated;
 select set_config('request.jwt.claim.sub','$PB',true);
 select public.f23_mock_submit_incident(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','$R','service_issue'); commit;" >"$tmp/new-provider"
echo 'SM_PLAN_005_OLD_PROVIDER_ACCESS=REVOKED'

# Dois envios do MESMO cliente e tema chegam em paralelo com chaves
# diferentes: somente um registro ativo deve persistir.
psqlc -Atqc "begin; set local role authenticated;
 select set_config('request.jwt.claim.sub','$C',true);
 select public.f23_mock_submit_incident(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','$R2','safety_report');
 select pg_sleep(1); commit;" >"$tmp/first" 2>&1 &
a=$!
sleep 0.25
set +e
psqlc -Atqc "begin; set local role authenticated;
 select set_config('request.jwt.claim.sub','$C',true);
 select public.f23_mock_submit_incident(
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd','$R2','safety_report'); commit;" >"$tmp/second" 2>&1
b_result=$?
wait "$a"
a_result=$?
set -e
[[ "$a_result" -eq 0 && "$b_result" -ne 0 ]] ||
 { echo 'FAIL: unexpected concurrent customer intake results' >&2; exit 1; }
grep -q 'duplicate key value violates unique constraint' "$tmp/second"
[[ "$(psqlc -Atqc "select count(*)=1 from public.f23_mock_incidents
 where request_key='$R2' and category='safety_report' and reporter_id='$C'")" == t ]]
[[ "$(psqlc -Atqc "select count(*)=0 from public.f23_mock_incident_events")" == t ]]
echo 'SM_PLAN_005_CONCURRENT_INTAKE=ONE_ACTIVE_ONE_REJECTED'

# Verifica que o código não transformou incidente em pagamento ou despacho.
[[ "$(psqlc -Atqc "select count(*)=3 from public.f23_mock_incidents
 where status='queued_mock' and version=0")" == t ]]
# Execução local finaliza sem deixar tickets reais; trap apaga tudo.
echo 'SM_PLAN_005=OFFLINE_PASS; REAL_NOTIFICATIONS=ZERO; RELEASE=NO_GO'
