#!/usr/bin/env bash
# Teste exclusivamente no PostgreSQL 17 efêmero do workflow F3.
set -euo pipefail
[[ "$GITHUB_ACTIONS" == true && "$PGHOST" == localhost && "$PGDATABASE" == f3_local && "$PGUSER" == postgres ]] || exit 90
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
sql() { psql -X -v ON_ERROR_STOP=1 "$@"; }
sql >/dev/null <<'SQL'
insert into public.service_categories(id,code,paid_in_app) values(3,'reboque_moto',false);
insert into storage.objects(bucket_id,name) values
('request-photos','11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555.jpg');
update private.f2_release_gate set enabled=true;
update private.f3_release_gate set enabled=true;
SQL
call="select public.f3_create_tow_request('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555.jpg','Honda','CG 160',2024,140,array['reboque_moto'],'Defeito ficticio no pneu.',-19.924,-43.938,'Belo Horizonte','MG','Contagem','MG','Rua ficticia 123',20,'automatic',null);"
prefix="begin; set local statement_timeout='15s'; set local role authenticated; set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';"
PGAPPNAME=sm_f3_first sql -qAtc "$prefix $call select pg_sleep(4); commit;" >"$tmp/a" 2>"$tmp/err-a" &
first=$!
# Esperar a primeira chamada concluir o INSERT, mantendo a transação aberta.
ready=false
for i in $(seq 1 60); do
  if [[ "$(sql -Atqc "select count(*) from pg_stat_activity where application_name='sm_f3_first' and wait_event='PgSleep'")" == 1 ]]; then ready=true; break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then wait "$first" || true; echo "Primeira transação não chegou ao ponto de sincronização"; exit 1; fi
PGAPPNAME=sm_f3_second sql -qAtc "$prefix $call commit;" >"$tmp/b" 2>"$tmp/err-b" &
second=$!
# Comprovar sobreposição real: a segunda sessão aguarda o lock transacional.
blocked=false
for i in $(seq 1 40); do
  if [[ "$(sql -Atqc "select count(*) from pg_stat_activity where application_name='sm_f3_second' and wait_event_type='Lock' and wait_event='advisory'")" == 1 ]]; then blocked=true; break; fi
  sleep 0.05
done
wait "$first"
wait "$second"
[[ "$blocked" == true ]]
a=$(grep -E '^[0-9a-f-]{36}$' "$tmp/a")
b=$(grep -E '^[0-9a-f-]{36}$' "$tmp/b")
[[ "$a" == "$b" ]]
# Uma mesma chave não pode aceitar outro endereço.
different=$(printf '%s' "$call" | sed 's/Rua ficticia 123/Rua ficticia 456/')
if sql -qAtc "$prefix $different commit;" >"$tmp/c" 2>"$tmp/err-c"; then
  echo "Payload divergente indevidamente aceito"; exit 1
fi
grep -q 'Chave de pedido reutilizada' "$tmp/err-c"
sql >/dev/null <<'SQL'
do $test$
begin
 if (select count(*) from public.service_requests where request_key='55555555-5555-4555-8555-555555555555')<>1
 or (select count(*) from public.f3_tow_requests)<>1
 or (select destination_address from public.f3_tow_requests)<>'Rua ficticia 123'
 then raise exception 'Criação concorrente não preservou pedido e destino únicos'; end if;
end $test$;
delete from public.f3_tow_requests where request_id in (select id from public.service_requests where request_key='55555555-5555-4555-8555-555555555555');
delete from public.service_requests where request_key='55555555-5555-4555-8555-555555555555';
delete from storage.objects where name='11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555.jpg';
delete from public.service_categories where id=3 and code='reboque_moto';
update private.f3_release_gate set enabled=false;
update private.f2_release_gate set enabled=false;
SQL
echo "F3: duas chamadas concorrentes, mesmo ID, um pedido, destino preservado; divergência rejeitada."
