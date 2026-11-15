#!/usr/bin/env bash
# F4 — duas sessões PostgreSQL disputam mesmo case_key e orçamento de reembolso.
# Executar somente em PostgreSQL de CI, sem PSP, Supabase remoto ou atendimentos.
set -euo pipefail
psql -X -v ON_ERROR_STOP=1 -f tests/f4-risk-race-setup.sql >/dev/null
attempt="$(psql -X -v ON_ERROR_STOP=1 -Atqc "select id from private.f4_mock_payment_attempts limit 1")"
[[ -n "$attempt" ]] || { echo "Tentativa mock inexistente" >&2; exit 1; }
present() {
 psql -X -v ON_ERROR_STOP=1 -Atqc "select to_regclass('private.f4_mock_risk_cases') is not null" | grep -qx t
}
# Rollback com gate ativo recusa, mesmo sem dados.
if psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/f4_risk_only_if_empty.sql >/tmp/f4-risk-gate-denied.log 2>&1; then
 echo "Rollback de risco com gate ativo foi aceito" >&2; exit 1
fi
present
invoke() {
  local name="$1" amount="$2" sleep_sec="$3" outfile="$4"
  psql -X -v ON_ERROR_STOP=1 -c \
    "begin; select set_config('app.f4_test_only','local_fixture',true); select private.f4_open_mock_risk_case('$attempt','$name','refund_partial',$amount); select pg_sleep($sleep_sec); commit;" \
    > "$outfile" 2>&1
}
# Duas cópias do MESMO evento lógico: ambas idempotentes, só um case.
invoke "case_race_same_0001" 8000 0.6 /tmp/f4-risk-same-a.log & a=$!
sleep 0.15
invoke "case_race_same_0001" 8000 0 /tmp/f4-risk-same-b.log & b=$!
wait "$a" || { cat /tmp/f4-risk-same-a.log; exit 1; }
wait "$b" || { cat /tmp/f4-risk-same-b.log; exit 1; }
psql -X -v ON_ERROR_STOP=1 -Atqc \
  "select count(*) from private.f4_mock_risk_cases" | grep -qx 1
# Duas reservas parciais DIFERENTES de 11.000 centavos. Após a primeira
# reserva 8.000 + 11.000 = 19.000; a segunda excederia 28.000.
set +e
invoke "case_race_diff_0001" 11000 0.6 /tmp/f4-risk-diff-a.log & a=$!
sleep 0.15
invoke "case_race_diff_0002" 11000 0 /tmp/f4-risk-diff-b.log & b=$!
wait "$a"; ra=$?
wait "$b"; rb=$?
set -e
if [[ "$ra" -ne 0 || "$rb" -eq 0 ]]; then
 echo "Teste de reserva parcial concorrente deu resultado inesperado" >&2
 cat /tmp/f4-risk-diff-a.log /tmp/f4-risk-diff-b.log >&2
 exit 1
fi
grep -q 'Estornos mock solicitados excedem orçamento' /tmp/f4-risk-diff-b.log
psql -X -v ON_ERROR_STOP=1 -Atqc \
 "select count(*)||':'||sum(requested_cents) from private.f4_mock_risk_cases" | grep -qx '2:19000'
# Nenhuma intenção de repasse sai por evento de risco.
psql -X -v ON_ERROR_STOP=1 -Atqc \
 "select count(*) from private.f4_mock_settlement_intents" | grep -qx 0
psql -X -v ON_ERROR_STOP=1 -Atqc \
 "select status from public.service_requests limit 1" | grep -qx 'awaiting_payment'
# Com casos abertos, nem com gate off é permitido apagar a fila.
psql -X -v ON_ERROR_STOP=1 -c \
 "update private.f4_release_gate set enabled=false" >/dev/null
if psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/f4_risk_only_if_empty.sql >/tmp/f4-risk-data-denied.log 2>&1; then
 echo "Rollback de risco com casos foi aceito" >&2; exit 1
fi
present
# Apenas no banco descartável, eliminar fixture para validar rollback positivo.
psql -X -v ON_ERROR_STOP=1 -c \
 "delete from private.f4_mock_risk_cases" >/dev/null
psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/f4_risk_only_if_empty.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -Atqc \
 "select to_regclass('private.f4_mock_risk_cases') is null" | grep -qx t
psql -X -v ON_ERROR_STOP=1 -Atqc \
 "select to_regclass('private.f4_mock_journals') is not null" | grep -qx t
psql -X -v ON_ERROR_STOP=1 -Atqc \
 "select count(*) from private.f4_mock_journals" | grep -qx 1
echo "F4 risco: 2 chamadas idempotentes e 1 de 2 reservas concorrentes, sem pagamento real."
