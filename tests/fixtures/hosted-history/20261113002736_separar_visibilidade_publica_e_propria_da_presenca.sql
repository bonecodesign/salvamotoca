drop policy if exists bj_presence_visible on public.bj_provider_presence;
create policy bj_presence_public_read on public.bj_provider_presence
for select to anon,authenticated
using (
  exists (
    select 1 from public.providers p
    where p.id=bj_provider_presence.provider_id
      and p.status='approved' and p.is_active
  )
);
create policy bj_presence_owner_read on public.bj_provider_presence
for select to authenticated
using (
  exists (
    select 1 from public.providers p
    where p.id=bj_provider_presence.provider_id and p.owner_id=(select auth.uid())
  )
);