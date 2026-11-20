#!/usr/bin/env bash
# Somente PostgreSQL17 local do GitHub Actions. Nenhum Supabase ou PSP.
set -euo pipefail
present() {
  psql -X -v ON_ERROR_STOP=1 -Atqc \
    "select to_regclass('private.f4_mock_journals') is not null" | grep -qx t
}
psql -X -v ON_ERROR_STOP=1 -c "update private.f4_release_gate set enabled=true" >/dev/null
if psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/f4_double_entry_only_if_empty.sql >/tmp/f4-journal-gate-denied.log 2>&1; then
 echo "FALHA: rollback contábil com gate ativo aceito" >&2; exit 1
fi
present
psql -X -v ON_ERROR_STOP=1 -c "update private.f4_release_gate set enabled=false" >/dev/null

if psql -X -v ON_ERROR_STOP=1 -f tests/f4-double-entry-rollback-with-rows.sql >/tmp/f4-journal-rows-denied.log 2>&1; then
 echo "FALHA: rollback contábil com partidas aceito" >&2; exit 1
fi
present
psql -X -v ON_ERROR_STOP=1 -Atqc \
 "select count(*) from private.f4_mock_journals" | grep -qx 0
psql -X -v ON_ERROR_STOP=1 -Atqc \
 "select not enabled from private.f4_release_gate where singleton" | grep -qx t
psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/f4_double_entry_only_if_empty.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -Atqc \
 "select to_regclass('private.f4_mock_journals') is null" | grep -qx t
psql -X -v ON_ERROR_STOP=1 -Atqc \
 "select to_regclass('private.f4_mock_payment_attempts') is not null" | grep -qx t
psql -X -v ON_ERROR_STOP=1 -Atqc \
 "select to_regclass('public.f2_request_offers') is not null" | grep -qx t
echo "F4 contábil: rollback recusado com gate/dados, permitido vazio e F1/F2 preservadas."
