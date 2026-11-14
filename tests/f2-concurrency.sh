#!/usr/bin/env bash
# F2: DUAS conexões concorrentes no PostgreSQL17 descartável do CI.
# Não recebe URL, token ou projeto Supabase remoto.
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 -f tests/f2-concurrency-setup.sql >/dev/null

buyer="11111111-1111-4111-8111-111111111111"
first="88888888-8888-4888-8888-888888888801"
second="88888888-8888-4888-8888-888888888802"
a_sql="begin; set role authenticated; select set_config('request.jwt.claim.sub','$buyer',false); select public.f2_decide_quote('$first'::uuid,true); select pg_sleep(1); commit;"
b_sql="begin; set role authenticated; select set_config('request.jwt.claim.sub','$buyer',false); select public.f2_decide_quote('$second'::uuid,true); commit;"

set +e
psql -X -v ON_ERROR_STOP=1 -c "$a_sql" >/tmp/f2-attempt-a.log 2>&1 &
a_pid=$!
sleep 0.2
psql -X -v ON_ERROR_STOP=1 -c "$b_sql" >/tmp/f2-attempt-b.log 2>&1
b_result=$?
wait "$a_pid"
a_result=$?
set -e

if [[ "$a_result" -eq 0 && "$b_result" -eq 0 ]]; then
  echo "FALHA: dois clientes aceitaram simultaneamente" >&2
  exit 1
fi
if [[ "$a_result" -ne 0 && "$b_result" -ne 0 ]]; then
  echo "FALHA: ambas as operações falharam" >&2
  sed -E 's/.*(password|token|secret).*/[CREDENCIAL OCULTA]/I' /tmp/f2-attempt-a.log >&2
  sed -E 's/.*(password|token|secret).*/[CREDENCIAL OCULTA]/I' /tmp/f2-attempt-b.log >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if (select count(*) from public.service_quotes
     where request_id='77777777-7777-4777-8777-777777777777'
       and status='accepted')<>1
  then raise exception 'Mais de um orçamento aceito sob corrida'; end if;
  if (select count(*) from public.f2_request_offers
     where request_id='77777777-7777-4777-8777-777777777777'
       and status='selected')<>1
  then raise exception 'Mais de um prestador venceu a corrida'; end if;
  if (select status from public.service_requests
     where id='77777777-7777-4777-8777-777777777777')<>'awaiting_payment'
  then raise exception 'Estado final inválido'; end if;
  if (select count(*) from public.service_quotes
      where request_id='77777777-7777-4777-8777-777777777777')<>2
  then raise exception 'Histórico de propostas foi perdido'; end if;
end $$;
update private.f2_release_gate set enabled=false;
SQL
echo "F2 CONCORRÊNCIA: uma única proposta aceita; outra rejeitada, sem cobrança."
