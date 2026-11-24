-- BorrachaJá! — Presença online, orçamento pelo prestador e próxima opção ao recusar.
-- PILOTO: somente projeto Supabase BorrachaJa; pagamentos reais NÃO estão ativos.
-- Status homologado/ativo é administrativo e nunca é alterado pelo toggle online.

create table public.bj_provider_presence (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  online_requested boolean not null default false,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint bj_presence_offline_no_ping check (online_requested or last_seen_at is null)
);
alter table public.bj_provider_presence enable row level security;
revoke all on public.bj_provider_presence from public, anon, authenticated;
grant select(provider_id,online_requested,last_seen_at,updated_at) on public.bj_provider_presence to anon,authenticated;
create policy bj_presence_visible on public.bj_provider_presence
for select to anon,authenticated
using (
  exists (
    select 1 from public.providers p
    where p.id = bj_provider_presence.provider_id
      and ((p.status='approved' and p.is_active)
           or p.owner_id = (select auth.uid()))
  )
);

-- Só o próprio prestador homologado pode ligar; desligar continua permitido ao proprietário.
create or replace function public.bj_set_presence(p_online boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_provider uuid;
begin
  if v_owner is null or p_online is null then raise exception 'Acesso não autorizado.'; end if;
  select p.id into v_provider from public.providers p
  where p.owner_id=v_owner and (not p_online or (p.status='approved' and p.is_active));
  if v_provider is null then raise exception 'Prestador não autorizado ou não homologado.'; end if;
  if p_online and not exists (
    select 1 from public.provider_services ps
    join public.service_categories c on c.id=ps.category_id
    where ps.provider_id=v_provider and ps.is_active and c.code='borracharia_delivery'
  ) then
    raise exception 'Serviço delivery ainda não habilitado.';
  end if;
  insert into public.bj_provider_presence(provider_id,online_requested,last_seen_at,updated_at)
  values(v_provider,p_online,case when p_online then now() else null end,now())
  on conflict(provider_id) do update
  set online_requested=excluded.online_requested,
      last_seen_at=excluded.last_seen_at,updated_at=now();
  return p_online;
end;
$$;
revoke all on function public.bj_set_presence(boolean) from public,anon,authenticated;
grant execute on function public.bj_set_presence(boolean) to authenticated;

-- Com conexão recente, o servidor mantém o indicador válido. Não reativa um prestador desligado.
create or replace function public.bj_ping_presence()
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_updated boolean := false;
begin
 if v_owner is null then return false; end if;
 update public.bj_provider_presence presence
 set last_seen_at=now(),updated_at=now()
 from public.providers p
 where presence.provider_id=p.id and p.owner_id=v_owner
   and p.status='approved' and p.is_active and presence.online_requested=true;
 v_updated := found;
 return v_updated;
end;
$$;
revoke all on function public.bj_ping_presence() from public,anon,authenticated;
grant execute on function public.bj_ping_presence() to authenticated;

-- Lista pública só contém identificadores de delivery homologado, ligado e com pulso recente.
-- Security invoker respeita permissões de coluna e políticas RLS de cada tabela.
create or replace function public.bj_online_providers()
returns table(provider_id uuid)
language sql stable security invoker set search_path = '' as $$
  select p.id
  from public.providers p
  join public.provider_services ps on ps.provider_id=p.id and ps.is_active
  join public.service_categories c on c.id=ps.category_id and c.code='borracharia_delivery'
  join public.bj_provider_presence presence on presence.provider_id=p.id
  where p.status='approved' and p.is_active
    and presence.online_requested
    and presence.last_seen_at >= now() - interval '90 seconds'
  order by p.id;
$$;
revoke all on function public.bj_online_providers() from public,anon,authenticated;
grant execute on function public.bj_online_providers() to anon,authenticated;

-- Estados adicionais. O aceite NÃO confirma pagamento.
alter table public.service_requests drop constraint service_requests_status_check;
alter table public.service_requests
add constraint service_requests_status_check
check (status in ('requested','quoted','awaiting_payment','no_provider',
                 'accepted','in_progress','completed','cancelled'));

-- A trilha de tentativas é interna, sem acesso direto do navegador.
create table public.bj_request_attempts (
  request_id uuid not null references public.service_requests(id) on delete cascade,
  provider_id uuid not null references public.providers(id),
  assigned_at timestamptz not null default now(),
  primary key (request_id,provider_id)
);
alter table public.bj_request_attempts enable row level security;
revoke all on public.bj_request_attempts from public,anon,authenticated;
insert into public.bj_request_attempts(request_id,provider_id)
select id,provider_id from public.service_requests
where provider_id is not null
on conflict do nothing;

create schema if not exists private;
revoke all on schema private from public;
create or replace function private.bj_track_initial_attempt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.provider_id is not null then
    insert into public.bj_request_attempts(request_id,provider_id)
    values(new.id,new.provider_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger bj_initial_attempt
after insert on public.service_requests
for each row execute function private.bj_track_initial_attempt();

-- Só clientes podem enviar pedidos para prestadores atualmente online.
drop policy if exists requests_customer_create on public.service_requests;
create policy requests_customer_create on public.service_requests
for insert to authenticated with check (
  customer_id=(select auth.uid()) and status='requested'
  and provider_id is not null
  and exists (
    select 1 from public.service_categories c
    where c.id=category_id and c.code='borracharia_delivery' and c.paid_in_app
  )
  and exists (
    select 1
    from public.providers p
    join public.provider_services ps on ps.provider_id=p.id and ps.category_id=service_requests.category_id
    join public.bj_provider_presence presence on presence.provider_id=p.id
    where p.id=service_requests.provider_id and p.status='approved' and p.is_active
      and ps.is_active and presence.online_requested
      and presence.last_seen_at >= now() - interval '90 seconds'
  )
);

-- O antigo prestador conserva somente a leitura dos próprios orçamentos (histórico).
drop policy if exists quotes_participants_read on public.service_quotes;
create policy quotes_participants_read on public.service_quotes
for select to authenticated using (
  exists (
    select 1 from public.service_requests r
    where r.id=service_quotes.request_id
      and (
        r.customer_id=(select auth.uid())
        or exists (
          select 1 from public.providers p
          where p.id=service_quotes.provider_id and p.owner_id=(select auth.uid())
        )
      )
  )
);

-- Evitar alterações de valores e status fora de RPC com verificação de papéis.
drop policy if exists quotes_assigned_provider_create on public.service_quotes;
revoke insert on public.service_quotes from authenticated;
alter table public.service_quotes add constraint bj_quote_no_external_contacts
check (coalesce(details,'') !~* '(https?://|www[.]|wa[.]me|whats[[:space:]]*app|chave[[:space:]]*pix|@[-_[:alnum:].]+|([0-9][[:space:]().-]*){9,})');

create or replace function public.bj_submit_quote(
  p_request_id uuid, p_amount_cents integer, p_details text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_provider uuid; v_status text; v_quote uuid;
begin
  if v_owner is null or p_amount_cents not between 100 and 500000
     or char_length(coalesce(p_details,''))>350 then
    raise exception 'Orçamento inválido.';
  end if;
  if coalesce(p_details,'') ~*
    '(https?://|www[.]|wa[.]me|whats[[:space:]]*app|chave[[:space:]]*pix|@[-_[:alnum:].]+|([0-9][[:space:]().-]*){9,})'
    then raise exception 'Contatos externos não permitidos no orçamento.'; end if;

  select r.provider_id,r.status into v_provider,v_status
  from public.service_requests r where r.id=p_request_id for update;
  if v_provider is null or v_status<>'requested'
     or not exists (
       select 1 from public.providers p
       where p.id=v_provider and p.owner_id=v_owner
         and p.status='approved' and p.is_active
     ) then raise exception 'Pedido não autorizado ou já orçado.'; end if;

  insert into public.service_quotes(request_id,provider_id,amount_cents,details,status)
  values(p_request_id,v_provider,p_amount_cents,trim(coalesce(p_details,'')),'proposed')
  returning id into v_quote;
  update public.service_requests set status='quoted',updated_at=now()
  where id=p_request_id;
  return v_quote;
end;
$$;
revoke all on function public.bj_submit_quote(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.bj_submit_quote(uuid,integer,text) to authenticated;

-- Aceite/recusa: o cliente decide. Recusa busca UM próximo prestador online, sem repetir tentativas.
create or replace function public.bj_answer_quote(p_quote_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid := auth.uid(); v_order uuid; v_provider uuid; v_quote_status text;
  v_owner uuid; v_order_status text; v_category smallint;
  v_lat numeric; v_lng numeric; v_next uuid;
begin
  if v_customer is null or p_accept is null then raise exception 'Faça login para decidir.'; end if;

  select q.request_id, q.provider_id, q.status, r.customer_id, r.status, r.category_id,
         r.latitude,r.longitude
  into v_order,v_provider,v_quote_status,v_owner,v_order_status,v_category,v_lat,v_lng
  from public.service_quotes q
  join public.service_requests r on r.id=q.request_id
  where q.id=p_quote_id
  for update of q,r;

  if v_order is null or v_owner<>v_customer
    or v_quote_status<>'proposed' or v_order_status<>'quoted'
    or not exists (
      select 1 from public.service_requests r where r.id=v_order and r.provider_id=v_provider
    ) then raise exception 'Orçamento indisponível ou não autorizado.'; end if;

  if p_accept then
    update public.service_quotes set status='accepted' where id=p_quote_id;
    update public.service_requests set status='awaiting_payment',updated_at=now()
    where id=v_order;
    return 'awaiting_payment';
  end if;

  update public.service_quotes set status='declined' where id=p_quote_id;

  -- Em BH piloto, prioriza proximidade quando o cliente autorizou GPS; sem GPS usa ordem de cadastro.
  select p.id into v_next
  from public.providers p
  join public.provider_services ps on ps.provider_id=p.id and ps.category_id=v_category and ps.is_active
  join public.bj_provider_presence presence on presence.provider_id=p.id
  where p.id<>v_provider and p.status='approved' and p.is_active
    and presence.online_requested and presence.last_seen_at >= now() - interval '90 seconds'
    and p.city=(select current_p.city from public.providers current_p where current_p.id=v_provider)
    and not exists (
      select 1 from public.bj_request_attempts a
      where a.request_id=v_order and a.provider_id=p.id
    )
  order by
    case when v_lat is not null and v_lng is not null
      and p.latitude is not null and p.longitude is not null
      then power((p.latitude-v_lat)::double precision,2)
          +power((p.longitude-v_lng)::double precision,2)
      else null end asc nulls last,
    p.created_at asc,p.id asc
  limit 1;

  if v_next is null then
    update public.service_requests set provider_id=null,status='no_provider',updated_at=now()
    where id=v_order;
    return 'no_provider';
  end if;

  update public.service_requests set provider_id=v_next,status='requested',updated_at=now()
  where id=v_order;
  insert into public.bj_request_attempts(request_id,provider_id)
  values(v_order,v_next) on conflict do nothing;
  return 'next_provider';
end;
$$;
revoke all on function public.bj_answer_quote(uuid,boolean) from public,anon,authenticated;
grant execute on function public.bj_answer_quote(uuid,boolean) to authenticated;
