-- Histórico de migração aplicada no projeto Supabase de testes (yivkqyjdeouxnwtwfekc).
-- Migração remota: 20261112214828_restringir_localizacao_pedidos_antes_pagamento
-- NÃO executar novamente no painel sem verificar o estado do banco.
revoke select on public.service_requests from authenticated;
grant select (
  id, customer_id, category_id, provider_id, problem_description,
  status, created_at, updated_at
) on public.service_requests to authenticated;

create or replace function public.bj_get_request_location(p_request_id uuid)
returns table (address_details text, latitude numeric, longitude numeric)
language sql stable security definer set search_path = ''
as $$
  select r.address_details, r.latitude, r.longitude
  from public.service_requests r
  where r.id = p_request_id
    and (select auth.uid()) is not null
    and (
      r.customer_id = (select auth.uid())
      or (
        exists (
          select 1 from public.providers p
          where p.id = r.provider_id and p.owner_id = (select auth.uid())
        )
        and exists (
          select 1 from public.payment_records payment
          where payment.request_id = r.id and payment.status = 'paid'
        )
      )
    );
$$;
revoke all on function public.bj_get_request_location(uuid) from public, anon, authenticated;
grant execute on function public.bj_get_request_location(uuid) to authenticated;
