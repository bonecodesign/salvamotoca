-- MIGRAÇÃO JÁ APLICADA no Supabase de testes (yivkqyjdeouxnwtwfekc)
-- Versão remota: 20261112235714
-- O reboque não é serviço cobrado no MVP. Só borracharia delivery terá cobrança futura.
-- NÃO aplicar novamente sem checar o histórico de migrations.

alter table public.service_categories drop constraint category_commission_rules;
update public.service_categories
set paid_in_app = false, commission_percent = 0
where code = 'reboque_moto';
alter table public.service_categories add constraint category_commission_rules check (
  (code = 'map_borracharia' and commission_percent = 0 and paid_in_app = false)
  or (code = 'borracharia_delivery' and commission_percent = 15 and paid_in_app = true)
  or (code = 'reboque_moto' and commission_percent = 0 and paid_in_app = false)
);

alter table public.service_requests
add column if not exists request_key uuid not null default gen_random_uuid();
create unique index if not exists service_requests_customer_key_uq
on public.service_requests (customer_id, request_key);

create unique index if not exists service_quotes_one_proposed_per_request
on public.service_quotes (request_id) where status = 'proposed';

drop policy if exists messages_participants_create on public.request_messages;
create policy messages_participants_create on public.request_messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.service_requests r
    join public.payment_records pay on pay.request_id = r.id and pay.status = 'paid'
    where r.id = request_messages.request_id
      and r.status in ('accepted','in_progress')
      and (
        r.customer_id = (select auth.uid())
        or exists (
          select 1 from public.providers p
          where p.id = r.provider_id and p.owner_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists messages_participants_read on public.request_messages;
create policy messages_participants_read on public.request_messages
for select to authenticated
using (
  exists (
    select 1 from public.service_requests r
    join public.payment_records pay
      on pay.request_id = r.id and pay.status in ('paid','refunded')
    where r.id = request_messages.request_id
      and (
        r.customer_id = (select auth.uid())
        or exists (
          select 1 from public.providers p
          where p.id = r.provider_id and p.owner_id = (select auth.uid())
        )
      )
  )
);

alter table public.providers
  add constraint providers_public_no_external_contacts
  check (
    (coalesce(display_name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(street_address,'')) !~*
    '(https?://|www[.]|wa[.]me|whats[[:space:]]*app|chave[[:space:]]*pix|@[-_[:alnum:].]+|([0-9][[:space:]().-]*){9,})'
  );
alter table public.provider_services
  add constraint provider_services_no_external_contacts
  check (
    coalesce(price_note,'') !~*
    '(https?://|www[.]|wa[.]me|whats[[:space:]]*app|chave[[:space:]]*pix|@[-_[:alnum:].]+|([0-9][[:space:]().-]*){9,})'
  );

revoke select on public.providers from anon;
grant select (id,display_name,description,street_address,city,state_code,latitude,longitude,status,is_active,approved_at,created_at)
on public.providers to anon;
revoke select on public.provider_services from anon;
grant select (provider_id,category_id,is_active) on public.provider_services to anon;
