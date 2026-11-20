-- Migração aplicada apenas no Supabase de testes; RLS histórico de orçamentos.
drop policy if exists quotes_participants_read on public.service_quotes;
create policy quotes_participants_read on public.service_quotes
for select to authenticated using (
  exists (
    select 1 from public.service_requests r
    where r.id = service_quotes.request_id and r.customer_id = (select auth.uid())
  )
  or exists (
    select 1 from public.providers p
    where p.id = service_quotes.provider_id and p.owner_id = (select auth.uid())
  )
);
