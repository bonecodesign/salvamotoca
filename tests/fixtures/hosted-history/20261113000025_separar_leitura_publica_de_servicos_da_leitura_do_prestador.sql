drop policy if exists provider_services_public_or_owner_read on public.provider_services;
create policy provider_services_public_read on public.provider_services
for select to anon, authenticated using (
 exists (
  select 1 from public.providers p
  where p.id = provider_services.provider_id
    and p.status = 'approved' and p.is_active = true
 )
);
create policy provider_services_owner_read on public.provider_services
for select to authenticated using (
 exists (
  select 1 from public.providers p
  where p.id = provider_services.provider_id
    and p.owner_id = (select auth.uid())
 )
);