-- F3 / Salva Motoca: reversão LOCAL e conservadora, apenas se sem dados.
-- NÃO executar no projeto Supabase remoto sem backup, janela e autorização.
begin;
do $protect$
begin
 if not exists(select 1 from private.f3_release_gate where singleton and not enabled)
 then raise exception 'Rollback F3 bloqueado: gate F3 ativo.'; end if;
 if exists(select 1 from public.f3_tow_requests limit 1)
    or exists(select 1 from public.f3_tow_provider_capacity limit 1)
 then raise exception 'Rollback F3 bloqueado: dados F3 existentes.'; end if;
 if exists(select 1 from public.service_requests
   where 'reboque_moto'=any(service_types) limit 1)
 then raise exception 'Rollback F3 bloqueado: pedidos de reboque em service_requests.'; end if;
end $protect$;
drop trigger f3_guard_tow_request on public.service_requests;
drop trigger f3_guard_tow_quote_accept on public.service_quotes;
drop trigger f3_guard_tow_offer_transition on public.f2_request_offers;

drop function public.f3_decide_tow_quote(uuid,boolean);
drop function public.f3_submit_tow_quote(uuid,jsonb,text);
drop function public.f3_offer_candidates(uuid,integer);
drop function public.f3_tow_summary(uuid);
drop function public.f3_create_tow_request(
 uuid,text,text,text,integer,integer,text[],text,numeric,numeric,text,text,
 text,text,text,integer,text,uuid);
drop function public.f3_set_tow_capacity(text,integer,integer,integer,boolean,boolean);
drop function private.f3_guard_tow_offer_transition();
drop function private.f3_guard_tow_quote_accepted();
drop function private.f3_tow_insert_guard();
drop function private.f3_enabled();

-- A política F2 de foto/pedido usa este helper. Restaurar a definição F2
-- antes de remover as tabelas F3, preservando a autorização original.
create or replace function private.f2_can_view_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
  and exists(select 1 from private.f2_release_gate g where g.enabled)
  and exists (
    select 1 from public.f2_request_offers o
    join public.providers p on p.id=o.provider_id
    join public.service_requests r on r.id=o.request_id
    where r.id=p_request_id and r.status='requested'
      and p.owner_id=auth.uid() and p.status='approved' and p.is_active
      and (
        (o.status='offered' and o.offered_at+interval '5 minutes'>now())
        or (o.status='delivered' and o.delivered_at is not null
            and o.delivered_at+interval '5 minutes'>now())
        or (o.status='quoted' and exists (
          select 1 from public.service_quotes q where q.id=o.quote_id
            and q.status='proposed' and q.created_at+interval '5 minutes'>now()
        ))
      )
  );
$$;

drop table public.f3_tow_requests;
drop table public.f3_tow_provider_capacity;
drop table private.f3_release_gate;

-- Restaura a regra F1 original que veta reboque enquanto F3 não existe.
alter table public.service_requests drop constraint f1_selected_service_types_check;
alter table public.service_requests
 add constraint f1_selected_service_types_check check (
  service_types is null or (
    cardinality(service_types) between 1 and 6
    and array_position(service_types,null) is null
    and service_types <@ array['pneu_furado','troca_camara','troca_pneu',
      'calibragem_valvula','reboque_moto','outro']::text[]
    and not('reboque_moto'=any(service_types))
  )
 );
commit;
