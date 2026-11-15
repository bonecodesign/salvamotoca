#!/usr/bin/env bash
# Duas conexões PostgreSQL simultâneas contra o MESMO evento de PSP fictício.
# Não conecta Supabase ou serviços de pagamento reais.
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 -f tests/f4-concurrency-setup.sql >/dev/null
attempt="$(psql -X -v ON_ERROR_STOP=1 -Atqc "select id from private.f4_mock_payment_attempts limit 1")"
if [[ -z "$attempt" ]]; then echo "Nenhuma tentativa mock criada" >&2; exit 1; fi

sql="begin; select set_config('app.f4_test_only','local_fixture',true); select private.f4_ingest_mock_event('$attempt','evt_concurrent_mock_001','mock_payment_verified',28000); select pg_sleep(1); commit;"
psql -X -v ON_ERROR_STOP=1 -c "$sql" > /tmp/f4-mock-race-a.log 2>&1 &
a=$!
sleep 0.2
psql -X -v ON_ERROR_STOP=1 -c "$sql" > /tmp/f4-mock-race-b.log 2>&1 &
b=$!
set +e
wait "$a"; result_a=$?
wait "$b"; result_b=$?
set -e
if [[ "$result_a" -ne 0 || "$result_b" -ne 0 ]]; then
 echo "Falha de idempotência: chamadas mock repetidas não foram toleradas" >&2
 grep -E 'ERROR:|FATAL:|psql:' /tmp/f4-mock-race-a.log /tmp/f4-mock-race-b.log >&2 || true
 exit 1
fi
psql -X -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
 if (select count(*) from private.f4_mock_webhook_receipts)<>1
  or (select count(*) from private.f4_mock_ledger_entries)<>1
  or (select status from private.f4_mock_payment_attempts)<>'mock_verified'
  or (select sum(amount_cents) from private.f4_mock_ledger_entries)<>28000
 then raise exception 'Dois webhooks mock concorrentes geraram duplicação'; end if;
 if (select status from public.service_requests) <> 'awaiting_payment'
 then raise exception 'Mock de pagamento desbloqueou pedido real'; end if;
 if (select enabled from private.f4_release_gate) is distinct from true
 then raise exception 'Fixture desligada antes da prova de concorrência'; end if;
end $$;
update private.f4_release_gate set enabled=false;
SQL
echo "F4 CONCORRÊNCIA LOCAL: um único recibo e lançamento, sem status paid."
