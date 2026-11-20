-- Migração JÁ APLICADA no Supabase de testes em 2026-11-13 (UTC).
-- Versão remota 20261113000025_separar_leitura_publica_de_servicos_da_leitura_do_prestador.
-- Ela corrigiu a negação de acesso para usuários anon ao consultar provider_services.

drop policy if exists provider_services_public_or_owner_read on public.provider_services;

create policy provider_services_public_read on public.provider_services
for select to anon, authenticated
using (
  exists (
    select 1 from public.providers p
    where p.id = provider_services.provider_id
      and p.status = 'approved'
      and p.is_active = true
  )
);

create policy provider_services_owner_read on public.provider_services
for select to authenticated
using (
  exists (
    select 1 from public.providers p
    where p.id = provider_services.provider_id
      and p.owner_id = (select auth.uid())
  )
);
