#!/usr/bin/env bash
# F4: SOMENTE PostgreSQL descartável do CI. Sem Supabase remoto/PSP.
set -euo pipefail
assert_f4_present() {
 psql -X -v ON_ERROR_STOP=1 -Atqc "select to_regclass('private.f4_mock_payment_attempts') is not null" | grep -qx t
}
expect_blocked() {
 if psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/f4_only_if_empty.sql >/tmp/f4-rollback-denied.log 2>&1; then
   echo "FALHA: rollback F4 destrutivo foi permitido" >&2
   exit 1
 fi
 assert_f4_present
}
psql -X -v ON_ERROR_STOP=1 -c 'update private.f4_release_gate set enabled=true;' >/dev/null
expect_blocked
psql -X -v ON_ERROR_STOP=1 -c 'update private.f4_release_gate set enabled=false;' >/dev/null

psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.service_categories(id,code) values(2,'borracharia_delivery');
insert into public.providers(id,owner_id,status,is_active)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       '22222222-2222-4222-8222-222222222222','approved',true);
insert into public.service_requests(id,customer_id,provider_id,category_id,
 service_types,status)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 2,array['pneu_furado'],'awaiting_payment');
insert into public.service_quotes(id,request_id,provider_id,
 amount_cents,status)
values('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',27000,'accepted');
insert into private.f4_mock_payment_attempts(request_id,quote_id,
 customer_id,provider_id,service_cents,travel_cents,parts_cents,
 quote_total_cents,rider_fee_cents,provider_fee_cents,customer_subtotal_cents,
 commission_cents,expected_provider_cents)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 23000,4000,0,27000,2300,2300,29300,4600,24700);
SQL
expect_blocked
psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
delete from private.f4_mock_payment_attempts;
delete from public.service_quotes;
delete from public.service_requests;
delete from public.providers;
delete from public.service_categories;
SQL
assert_f4_present
echo 'Rollback F4 corretamente bloqueado com gate ativo e com registros financeiros.'
