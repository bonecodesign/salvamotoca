-- Candidate compatibility overlay for the replayed historical schema ONLY.
-- Not a migration. Do not execute against the hosted project.
begin;
drop index public.service_quotes_one_proposed_per_request;
create unique index f23_one_proposed_per_provider on public.service_quotes(request_id,provider_id) where status='proposed';
create unique index f23_one_accepted_per_request on public.service_quotes(request_id) where status='accepted';

-- Serialize on request; preserve one proposed quote for legacy requests and
-- require a delivered offer for a managed F2/F3 request.
create function private.f23_guard_proposal_insert()
returns trigger language plpgsql security definer set search_path='' as $guard$
declare r record; managed boolean;
begin
 select id,f2_mode,status into r from public.service_requests where id=new.request_id for update;
 if not found then raise exception 'Pedido inexistente.'; end if;
 if new.status<>'proposed' then raise exception 'Novo orçamento deve ser proposto.'; end if;
 managed:=r.f2_mode is not null or exists(select 1 from public.f2_request_offers o where o.request_id=r.id);
 if managed then
   if r.status<>'requested' or not exists(select 1 from private.f2_release_gate where enabled)
     or not exists(select 1 from public.f2_request_offers o
        where o.request_id=r.id and o.provider_id=new.provider_id and o.status='delivered'
          and o.delivered_at+interval '5 minutes'>now())
   then raise exception 'Pedido gerenciado exige convite F2/F3 válido.'; end if;
 elsif exists(select 1 from public.service_quotes q where q.request_id=r.id and q.status='proposed')
 then raise exception 'Pedido legado permite somente uma proposta.'; end if;
 return new;
end $guard$;
revoke all on function private.f23_guard_proposal_insert() from public,anon,authenticated;
create trigger f23_guard_proposal_insert before insert on public.service_quotes
for each row execute function private.f23_guard_proposal_insert();

-- Keep historical bodies private and preserve legacy semantics through guarded wrappers.
-- All mutation paths below acquire request lock before quotes/offers.
alter function public.bj_submit_quote(uuid,integer,text) set schema private;
alter function private.bj_submit_quote(uuid,integer,text) rename to f23_legacy_submit_quote;
alter function public.bj_answer_quote(uuid,boolean) set schema private;
alter function private.bj_answer_quote(uuid,boolean) rename to f23_legacy_answer_quote;
alter function public.bj_finish_request(uuid) set schema private;
alter function private.bj_finish_request(uuid) rename to f23_legacy_finish_request;
revoke all on function private.f23_legacy_submit_quote(uuid,integer,text),
 private.f23_legacy_answer_quote(uuid,boolean),private.f23_legacy_finish_request(uuid)
 from public,anon,authenticated;

create function public.bj_submit_quote(p_request_id uuid,p_amount_cents integer,p_details text default '')
returns uuid language plpgsql security definer set search_path='' as $wrapper$
declare r record;
begin
 if auth.uid() is null then raise exception 'Login obrigatório.'; end if;
 select id,f2_mode into r from public.service_requests where id=p_request_id for update;
 if not found then raise exception 'Pedido não autorizado.'; end if;
 if r.f2_mode is not null or exists(select 1 from public.f2_request_offers o where o.request_id=r.id)
 then raise exception 'Pedido gerenciado: use orçamento itemizado.'; end if;
 return private.f23_legacy_submit_quote(p_request_id,p_amount_cents,p_details);
end $wrapper$;
create function public.bj_answer_quote(p_quote_id uuid,p_accept boolean)
returns text language plpgsql security definer set search_path='' as $wrapper$
declare r record;
begin
 if auth.uid() is null then raise exception 'Login obrigatório.'; end if;
 select req.id,req.f2_mode into r from public.service_requests req
  where req.id=(select request_id from public.service_quotes where id=p_quote_id)
  for update;
 if not found then raise exception 'Pedido não autorizado.'; end if;
 if r.f2_mode is not null or exists(select 1 from public.f2_request_offers o where o.request_id=r.id)
 then raise exception 'Pedido gerenciado: use decisão itemizada.'; end if;
 return private.f23_legacy_answer_quote(p_quote_id,p_accept);
end $wrapper$;
create function public.bj_finish_request(p_request_id uuid)
returns text language plpgsql security definer set search_path='' as $wrapper$
begin
 if auth.uid() is null then raise exception 'Login obrigatório.'; end if;
 perform 1 from public.service_requests where id=p_request_id and customer_id=auth.uid() for update;
 if not found then raise exception 'Pedido não autorizado.'; end if;
 return private.f23_legacy_finish_request(p_request_id);
end $wrapper$;
revoke all on function public.bj_submit_quote(uuid,integer,text),public.bj_answer_quote(uuid,boolean),
 public.bj_finish_request(uuid) from public,anon,authenticated;
grant execute on function public.bj_submit_quote(uuid,integer,text),public.bj_answer_quote(uuid,boolean),
 public.bj_finish_request(uuid) to authenticated;

-- The legacy insert policy remains in force. Add only the managed, fully
-- specified F2 automatic request path under the server gate.
-- The restrictive policy also prevents setting f2_mode with the gate off
-- through the legacy manual-provider insert policy.
grant select(f2_mode) on public.service_requests to authenticated;
create function private.f23_f2_insert_allowed(p_customer uuid,p_category smallint,p_provider uuid,p_mode text,p_services text[],p_photo text)
returns boolean language sql stable security definer set search_path='' as $allowed$
 select auth.uid() is not null and auth.uid()=p_customer
 and exists(select 1 from private.f2_release_gate where enabled)
 and exists(select 1 from public.service_categories c where c.id=p_category and c.code='borracharia_delivery' and c.paid_in_app)
 and p_photo is not null and cardinality(p_services)>0
 and not ('reboque_moto'=any(p_services))
 and (p_mode='manual' or (p_mode='automatic' and p_provider is null));
$allowed$;
revoke all on function private.f23_f2_insert_allowed(uuid,smallint,uuid,text,text[],text) from public,anon,authenticated;
grant execute on function private.f23_f2_insert_allowed(uuid,smallint,uuid,text,text[],text) to authenticated;
create policy f23_automatic_insert on public.service_requests
for insert to authenticated with check (
 status='requested' and f2_mode='automatic' and provider_id is null
 and private.f23_f2_insert_allowed(customer_id,category_id,provider_id,f2_mode,service_types,photo_path)
);
create policy f23_managed_insert_guard on public.service_requests as restrictive
for insert to authenticated with check (
 f2_mode is null or (
  private.f23_f2_insert_allowed(customer_id,category_id,provider_id,f2_mode,service_types,photo_path)
 )
);
commit;
