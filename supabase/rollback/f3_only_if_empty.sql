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
