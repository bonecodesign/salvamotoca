-- Rollback F2 CANDIDATO. Somente após BACKUP, revisão, e com F2 DESLIGADA e sem dados.
-- Nunca executar diretamente no Supabase real sem recuperação comprovada.
-- NÃO remove o schema private (compartilhado com funções anteriores).
begin;
do $protect$
begin
  if not exists (select 1 from private.f2_release_gate where singleton and not enabled)
    then raise exception 'Rollback F2 bloqueado: release gate não está desligado.'; end if;
  if exists(select 1 from public.f2_request_offers limit 1)
    or exists(select 1 from public.f2_quote_items limit 1)
    or exists(select 1 from public.f2_provider_capacity limit 1)
  then raise exception 'Rollback F2 bloqueado: dados F2 existentes.'; end if;
  if exists(select 1 from public.service_requests where f2_mode is not null limit 1)
  then raise exception 'Rollback F2 bloqueado: pedidos F2 existentes.'; end if;
end $protect$;

drop trigger f2_guard_legacy_quote on public.service_requests;
drop trigger f2_cancel_open_offers on public.service_requests;
drop policy f2_invited_provider_request_read on public.service_requests;
drop policy f2_invited_provider_photo_read on storage.objects;

drop function public.f2_absence_review();
drop function public.f2_expire_offers(uuid);
drop function public.f2_decide_quote(uuid,boolean);
drop function public.f2_submit_quote(uuid,jsonb,text);
drop function public.f2_ack_offer(uuid);
drop function public.f2_decline_offer(uuid);
drop function public.f2_offer_candidates(uuid,integer);
drop function public.f2_set_capacity(text[],numeric);

drop function private.f2_can_view_photo(text);
drop function private.f2_can_view_request(uuid);
drop function private.f2_distance_km(numeric,numeric,numeric,numeric);
drop function private.f2_guard_old_rpc();
drop function private.f2_cancel_pending();

drop table public.f2_quote_items;
drop table public.f2_request_offers;
drop table public.f2_provider_capacity;
alter table public.service_requests drop column f2_mode;
drop table private.f2_release_gate;
commit;