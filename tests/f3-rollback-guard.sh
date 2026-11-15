#!/usr/bin/env bash
# SOMENTE PostgreSQL descartável; não recebe URL Supabase nem credenciais reais.
set -euo pipefail
expect_rejected() {
  if psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/f3_only_if_empty.sql >/tmp/f3-rollback-rejected.log 2>&1; then
    echo 'FALHA: rollback F3 apagaria dados ou fase ativa' >&2
    exit 1
  fi
  psql -X -v ON_ERROR_STOP=1 -Atqc "select to_regclass('public.f3_tow_requests') is not null" | grep -qx t
}
psql -X -v ON_ERROR_STOP=1 -c 'update private.f3_release_gate set enabled=true;' >/dev/null
expect_rejected
psql -X -v ON_ERROR_STOP=1 -c 'update private.f3_release_gate set enabled=false;' >/dev/null
psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.providers(id,owner_id,status,is_active)
values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
       'ffffffff-ffff-4fff-8fff-ffffffffffff','pending',false);
insert into public.f3_tow_provider_capacity(provider_id,equipment,max_moto_kg,
 coverage_km,tie_down_points,has_ramp,has_wheel_chock)
values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
       'plataforma',150,10,4,true,true);
SQL
expect_rejected
psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
delete from public.f3_tow_provider_capacity
 where provider_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
delete from public.providers where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
SQL
echo 'Rollback F3 recusado com gate ativo e com dados; banco local permanece íntegro.'
