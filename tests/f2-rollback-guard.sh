#!/usr/bin/env bash
# Teste F2: rollback NUNCA pode remover tabelas com gate ligado ou dados existentes.
# Executado somente no PostgreSQL descartável do CI, sem Supabase remoto.
set -euo pipefail
check_exists() {
  psql -X -v ON_ERROR_STOP=1 -Atqc "select to_regclass('public.f2_request_offers') is not null" | grep -qx t
}
expect_blocked() {
  if psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/f2_only_if_empty.sql >/tmp/f2-rollback-negative.log 2>&1; then
    echo 'FALHA: rollback F2 permitiu destruição indevida' >&2
    exit 1
  fi
  check_exists
}
check_exists
psql -X -v ON_ERROR_STOP=1 -c 'update private.f2_release_gate set enabled=true;' >/dev/null
expect_blocked
psql -X -v ON_ERROR_STOP=1 -c 'update private.f2_release_gate set enabled=false;' >/dev/null
psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.providers(id,owner_id,status,is_active)
values('99999999-1111-4111-8111-999999999999',
       '99999999-2222-4222-8222-999999999999','pending',false);
insert into public.f2_provider_capacity(provider_id,service_types,coverage_km)
values('99999999-1111-4111-8111-999999999999',array['pneu_furado'],3);
SQL
expect_blocked
psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
delete from public.f2_provider_capacity
 where provider_id='99999999-1111-4111-8111-999999999999';
delete from public.providers
 where id='99999999-1111-4111-8111-999999999999';
SQL
echo 'F2: rollback recusado com gate ativo e com dados. Ambiente limpo para rollback positivo.'
