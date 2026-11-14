-- Salva Motoca F2 | SQL de CANDIDATO, apenas para PostgreSQL 17 DESCARTÁVEL.
-- NÃO APLICAR ao Supabase ativo. F1 requer backup restaurável antes de QUALQUER DDL remoto.
-- Backend multi-ofertas, sem cobrança, chat, despacho, push, e-mail ou cron.
-- Mesmo se aplicado por acidente, o release gate nasce FALSE.
begin;
create schema if not exists private;
-- Campo aditivo: escolha manual inicial ou busca automática.
alter table public.service_requests add column f2_mode text
  check (f2_mode in ('manual','automatic'));

create table private.f2_release_gate (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.f2_release_gate(singleton,enabled) values (true,false);
revoke all on private.f2_release_gate from public,anon,authenticated;

create table public.f2_provider_capacity (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  service_types text[] not null,
  coverage_km numeric(6,2) not null check (coverage_km between 0.1 and 30),
  updated_at timestamptz not null default now(),
  constraint f2_capabilities_valid check (
    cardinality(service_types) between 1 and 5 and
    array_position(service_types,null) is null and
    service_types <@ array['pneu_furado','troca_camara','troca_pneu','calibragem_valvula','outro']::text[]
  )
);
create table public.f2_request_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  provider_id uuid not null references public.providers(id),
  round_number integer not null default 1 check (round_number between 1 and 20),
  status text not null default 'offered' check
    (status in ('offered','delivered','quoted','declined','expired','not_selected','selected')),
  offered_at timestamptz not null default now(),
  delivered_at timestamptz,
  replied_at timestamptz,
  quote_id uuid unique references public.service_quotes(id),
  unique(request_id,provider_id,round_number),
  constraint f2_delivered_timestamp check
    (delivered_at is null or delivered_at >= offered_at)
);
create index f2_offers_by_request on public.f2_request_offers(request_id,offered_at desc);
create index f2_offers_by_provider on public.f2_request_offers(provider_id,status,offered_at);
create table public.f2_quote_items (
  quote_id uuid not null references public.service_quotes(id) on delete cascade,
  line_no smallint not null check (line_no between 1 and 16),
  kind text not null check (kind in ('service','travel','part')),
  code text not null check (length(btrim(code)) between 2 and 80),
  amount_cents integer not null check (amount_cents between 0 and 500000),
  primary key(quote_id,line_no),
  constraint f2_items_service_positive check (kind='travel' or amount_cents > 0)
);

alter table public.f2_provider_capacity enable row level security;
alter table public.f2_request_offers enable row level security;
alter table public.f2_quote_items enable row level security;
revoke all on public.f2_provider_capacity,public.f2_request_offers,public.f2_quote_items
  from public,anon,authenticated;

-- O catálogo pode ser consultado pelo próprio prestador e participantes aprovados.
create policy f2_capacity_read on public.f2_provider_capacity
for select to authenticated using (
  exists (select 1 from public.providers p
          where p.id=provider_id and
            (p.owner_id=(select auth.uid()) or (p.status='approved' and p.is_active)))
);
create policy f2_offer_read on public.f2_request_offers
for select to authenticated using (
  exists (select 1 from public.service_requests r
          where r.id=request_id and r.customer_id=(select auth.uid()))
  or exists (select 1 from public.providers p
             where p.id=provider_id and p.owner_id=(select auth.uid()))
);
create policy f2_quote_items_read on public.f2_quote_items
for select to authenticated using (
  exists (select 1 from public.service_quotes q
          join public.service_requests r on r.id=q.request_id
          where q.id=quote_id and
          (r.customer_id=(select auth.uid()) or
            exists (select 1 from public.providers p
                    where p.id=q.provider_id and p.owner_id=(select auth.uid()))))
);
grant select on public.f2_provider_capacity,public.f2_request_offers,public.f2_quote_items to authenticated;

-- Evita recursão RLS: função interna sempre confirma auth.uid() e o gate da F2.
create or replace function private.f2_can_view_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
  and exists(select 1 from private.f2_release_gate g where g.enabled)
  and exists (
    select 1 from public.f2_request_offers o
    join public.providers p on p.id=o.provider_id
    join public.service_requests r on r.id=o.request_id
    where r.id=p_request_id and r.status='requested'
      and o.status in ('offered','delivered','quoted')
      and p.owner_id=auth.uid()
  );
$$;
create or replace function private.f2_can_view_photo(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.service_requests r
                where r.photo_path=p_path and private.f2_can_view_request(r.id));
$$;
revoke all on function private.f2_can_view_request(uuid) from public,anon,authenticated;
revoke all on function private.f2_can_view_photo(text) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.f2_can_view_request(uuid) to authenticated;
grant execute on function private.f2_can_view_photo(text) to authenticated;

create policy f2_invited_provider_request_read on public.service_requests
for select to authenticated using (private.f2_can_view_request(id));
create policy f2_invited_provider_photo_read on storage.objects
for select to authenticated using (
  bucket_id='request-photos' and private.f2_can_view_photo(name)
);

-- Helper interno, sem API pública.
create or replace function private.f2_distance_km(
  a_lat numeric,a_lng numeric,b_lat numeric,b_lng numeric
) returns double precision language sql immutable set search_path='' as $$
  select case when a_lat is null or a_lng is null or b_lat is null or b_lng is null
    then null::double precision
    else 6371.0088 * 2 * asin(sqrt(least(1::double precision,
      power(sin(radians((b_lat-a_lat)::double precision)/2),2)
      + cos(radians(a_lat::double precision))*cos(radians(b_lat::double precision))
      *power(sin(radians((b_lng-a_lng)::double precision)/2),2)
    ))) end;
$$;
revoke all on function private.f2_distance_km(numeric,numeric,numeric,numeric)
  from public,anon,authenticated;

-- Cadastro de capacidades, somente o dono autenticado (sem ativar serviço não homologado).
create or replace function public.f2_set_capacity(
  p_services text[], p_coverage_km numeric
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_provider uuid; v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Autenticação obrigatória.'; end if;
  if not exists(select 1 from private.f2_release_gate where enabled)
    then raise exception 'F2 desativada no servidor.'; end if;
  if p_services is null or cardinality(p_services) not between 1 and 5
     or array_position(p_services,null) is not null
     or not p_services <@ array['pneu_furado','troca_camara','troca_pneu',
       'calibragem_valvula','outro']::text[]
     or (select count(distinct s) from unnest(p_services) s) <> cardinality(p_services)
     or p_coverage_km is null or p_coverage_km not between 0.1 and 30
  then raise exception 'Capacidades ou cobertura inválidas.'; end if;
  select id into v_provider from public.providers where owner_id=v_user;
  if v_provider is null then raise exception 'Prestador não encontrado.'; end if;
  insert into public.f2_provider_capacity(provider_id,service_types,coverage_km,updated_at)
    values(v_provider,p_services,p_coverage_km,now())
  on conflict(provider_id) do update set
    service_types=excluded.service_types,coverage_km=excluded.coverage_km,
    updated_at=now();
  return v_provider;
end;
$$;

-- Invites são exclusivamente internos; não disparam push, pagamentos nem atendimento.
-- Raios 1/3/10 km são EXEMPLOS PARA TESTE, NÃO parâmetros operacionais aprovados.
create or replace function public.f2_offer_candidates(
  p_request_id uuid, p_max_offers integer default 3
) returns integer language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_req record; v_ring integer;
  v_created integer:=0; v_round integer; candidate record;
begin
  if v_user is null or p_max_offers not between 1 and 3
    then raise exception 'Requisição inválida.'; end if;
  if not exists(select 1 from private.f2_release_gate where enabled)
    then raise exception 'F2 ainda desativada no servidor.'; end if;
  select id,customer_id,category_id,provider_id,f2_mode,
    service_types,latitude,longitude,status
    into v_req from public.service_requests
    where id=p_request_id for update;
  if not found or v_req.customer_id<>v_user or v_req.status<>'requested'
    or v_req.service_types is null or cardinality(v_req.service_types)<1
    or 'reboque_moto'=any(v_req.service_types)
    or (select count(distinct s) from unnest(v_req.service_types) as s)
       <>cardinality(v_req.service_types)
    or v_req.latitude is null or v_req.longitude is null
  then raise exception 'Pedido não elegível à F2.'; end if;
  if not exists(select 1 from public.service_categories c
                where c.id=v_req.category_id and c.code='borracharia_delivery')
  then raise exception 'Categoria de pedido não atende à F2.'; end if;

  -- Se já existem ofertas ativas, não inicia rodada duplicada.
  if exists(select 1 from public.f2_request_offers o
            where o.request_id=p_request_id
              and o.status in ('offered','delivered','quoted'))
  then raise exception 'Há ofertas pendentes neste pedido.'; end if;
  select coalesce(max(round_number),0)+1 into v_round
    from public.f2_request_offers where request_id=p_request_id;
  if v_round>20 then raise exception 'Limite de rodadas atingido.'; end if;
  -- Preservar prestador originalmente selecionado se não houver NENHUM
  -- candidato. A liberação de foto só muda ao criar ofertas com sucesso.
  for v_ring in select unnest(array[1,3,10]::integer[]) loop
    for candidate in
      select p.id as provider_id,
        private.f2_distance_km(v_req.latitude,v_req.longitude,p.latitude,p.longitude) as dist
      from public.providers p
      join public.provider_services ps on ps.provider_id=p.id
        and ps.category_id=v_req.category_id and ps.is_active
      join public.bj_provider_presence presence on presence.provider_id=p.id
        and presence.online_requested and presence.last_seen_at>=now()-interval '90 seconds'
      join public.f2_provider_capacity cap on cap.provider_id=p.id
        and cap.service_types @> v_req.service_types
      where p.status='approved' and p.is_active
        and p.city='Belo Horizonte' and p.state_code='MG'
        -- Na primeira rodada manual, respeitar exclusivamente o escolhido.
        -- Rodadas seguintes podem ampliar após recusa/vencimento.
        and (v_round>1 or coalesce(v_req.f2_mode,'automatic')='automatic'
             or p.id=v_req.provider_id)
        and p.latitude is not null and p.longitude is not null
        and private.f2_distance_km(v_req.latitude,v_req.longitude,p.latitude,p.longitude)
          <= least(cap.coverage_km,v_ring)
        and not exists (
          select 1 from public.f2_request_offers o
          where o.request_id=p_request_id and o.provider_id=p.id
            and o.status in ('offered','delivered','quoted','selected')
        )
        and (
          select count(*) from public.f2_request_offers o
          where o.request_id=p_request_id and o.provider_id=p.id
            and o.status='declined'
        ) < 2
        -- Não devolver imediatamente ao último prestador recusado.
        and p.id is distinct from (
          select o.provider_id from public.f2_request_offers o
          where o.request_id=p_request_id and o.status='declined'
          order by o.replied_at desc nulls last,o.offered_at desc limit 1
        )
      order by dist,p.created_at,p.id
      limit case when v_round=1 and v_req.f2_mode='manual'
                 then 1 else p_max_offers end
    loop
      insert into public.f2_request_offers(request_id,provider_id,round_number,status)
      values(p_request_id,candidate.provider_id,v_round,'offered');
      v_created:=v_created+1;
    end loop;
    exit when v_created>0;
  end loop;
  if v_created>0 then
    -- Revogar a atribuição F1 prévia no MESMO commit dos convites;
    -- convidado A/B só acessará dados pela nova política F2.
    update public.service_requests
       set provider_id=null,updated_at=now() where id=p_request_id;
  end if;
  return v_created;
end;
$;

-- Abrir o convite autenticado é um ACK de leitura, não prova de entrega push.
-- Ausência só pode ser revisada após ACK + 5 minutos sem resposta.
create or replace function public.f2_ack_offer(p_offer_id uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_offer record; v_time timestamptz;
begin
  if v_user is null then raise exception 'Login obrigatório.'; end if;
  if not exists(select 1 from private.f2_release_gate where enabled)
    then raise exception 'F2 desativada.'; end if;
  select o.id,o.status,o.delivered_at into v_offer
  from public.f2_request_offers o join public.providers p on p.id=o.provider_id
  where o.id=p_offer_id and p.owner_id=v_user
    and p.status='approved' and p.is_active for update of o;
  if not found then raise exception 'Oferta indisponível.'; end if;
  if v_offer.status not in ('offered','delivered') then
    raise exception 'Oferta já encerrada.'; end if;
  if v_offer.delivered_at is not null then return v_offer.delivered_at; end if;
  -- Convite não pode ser aberto depois de vencer, mesmo sem cron/worker.
  if exists(select 1 from public.f2_request_offers
    where id=p_offer_id and offered_at+interval '5 minutes'<=now())
  then raise exception 'Convite expirado, solicite nova rodada.'; end if;
  update public.f2_request_offers set status='delivered',delivered_at=now()
  where id=p_offer_id returning delivered_at into v_time;
  return v_time;
end;
$$;

-- Orçamento itemizado: cliente NÃO informa total persistido.
-- Atomicidade: grava serviço, deslocamento e peças no mesmo commit.
create or replace function public.f2_submit_quote(
  p_offer_id uuid,p_items jsonb,p_details text default ''
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_offer record; v_req record; v_quote uuid;
  v_line jsonb; v_kind text; v_code text; v_amount integer;
  v_index integer:=0; v_total integer:=0; v_travel integer:=0;
  v_seen text[]:=array[]::text[]; v_parts integer:=0;
begin
  if v_user is null or not exists(select 1 from private.f2_release_gate where enabled)
    then raise exception 'F2 não autorizada.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or
    jsonb_array_length(p_items) not between 2 and 16
    or length(coalesce(p_details,''))>350 or
    coalesce(p_details,'') ~*
      '(https?://|www[.]|wa[.]me|whats[[:space:]]*app|chave[[:space:]]*pix|@[-_[:alnum:].]+|([0-9][[:space:]().-]*){9,})'
  then raise exception 'Itens ou descrição inválidos.'; end if;
  select o.id,o.request_id,o.provider_id,o.status,o.delivered_at
    into v_offer from public.f2_request_offers o
    join public.providers p on p.id=o.provider_id and p.owner_id=v_user
      and p.status='approved' and p.is_active
    where o.id=p_offer_id for update of o;
  if not found or v_offer.status<>'delivered'
    or v_offer.delivered_at is null
    or now()>=v_offer.delivered_at+interval '5 minutes'
  then raise exception 'Oferta sem autorização ou prazo encerrado.'; end if;
  select id,category_id,service_types,status into v_req from public.service_requests
    where id=v_offer.request_id for update;
  if v_req.status<>'requested' then raise exception 'Pedido não recebe novos orçamentos.'; end if;
  if not exists(select 1 from public.providers p
    join public.provider_services ps on ps.provider_id=p.id
      and ps.category_id=v_req.category_id and ps.is_active
    join public.f2_provider_capacity cap on cap.provider_id=p.id
      and cap.service_types @> v_req.service_types
    where p.id=v_offer.provider_id and p.status='approved' and p.is_active)
  then raise exception 'Prestador ou serviços não estão mais homologados.'; end if;

  for v_line in select value from jsonb_array_elements(p_items) loop
    v_index:=v_index+1;
    if jsonb_typeof(v_line)<>'object'
       or (v_line->>'amountCents') !~ '^[0-9]{1,6}$'
       then raise exception 'Valor inválido em centavos.'; end if;
    v_kind:=v_line->>'kind'; v_code:=btrim(coalesce(v_line->>'code',''));
    v_amount:=(v_line->>'amountCents')::integer;
    if v_amount>500000 or length(v_code) not between 2 and 80
      then raise exception 'Item não permitido.'; end if;
    if v_kind='service' then
      if not(v_code=any(v_req.service_types)) or v_code=any(v_seen)
        or v_amount=0 then raise exception 'Serviço ausente, extra ou duplicado.'; end if;
      v_seen:=array_append(v_seen,v_code);
    elsif v_kind='travel' then
      if v_code<>'deslocamento' or v_travel>0
        then raise exception 'Deslocamento obrigatório e único.'; end if;
      v_travel:=v_travel+1;
    elsif v_kind='part' then
      v_parts:=v_parts+1;
      if v_parts>10 or v_amount=0 or v_code ~*
        '(https?://|www[.]|wa[.]me|whats[[:space:]]*app|chave[[:space:]]*pix|@[-_[:alnum:].]+|([0-9][[:space:]().-]*){9,})'
        then raise exception 'Peça inválida ou contém contato externo.'; end if;
    else raise exception 'Tipo de item não permitido.'; end if;
    v_total:=v_total+v_amount;
  end loop;
  if v_travel<>1 or cardinality(v_seen)<>cardinality(v_req.service_types)
    or v_total not between 100 and 500000
  then raise exception 'Orçamento incompleto ou fora do limite.'; end if;

  insert into public.service_quotes(request_id,provider_id,amount_cents,details,status)
    values(v_offer.request_id,v_offer.provider_id,v_total,btrim(coalesce(p_details,'')),'proposed')
    returning id into v_quote;
  v_index:=0;
  for v_line in select value from jsonb_array_elements(p_items) loop
    v_index:=v_index+1;
    insert into public.f2_quote_items(quote_id,line_no,kind,code,amount_cents)
    values(v_quote,v_index,v_line->>'kind',btrim(v_line->>'code'),
           (v_line->>'amountCents')::integer);
  end loop;
  update public.f2_request_offers
  set status='quoted',quote_id=v_quote,replied_at=now()
  where id=p_offer_id;
  return v_quote;
end;
$$;

-- Aceite ou recusa de UM orçamento F2.
-- SERIALIZA PELO PEDIDO: só uma proposta pode vencer sob concorrência.
create or replace function public.f2_decide_quote(
  p_quote_id uuid,p_accept boolean
) returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_request_id uuid; v_req record; v_quote record;
begin
  if v_user is null or p_accept is null or
    not exists(select 1 from private.f2_release_gate where enabled)
    then raise exception 'Decisão indisponível.'; end if;
  select request_id into v_request_id
  from public.service_quotes where id=p_quote_id;
  if v_request_id is null then raise exception 'Proposta não encontrada.'; end if;
  select id,customer_id,status into v_req from public.service_requests
    where id=v_request_id for update;
  if v_req.customer_id<>v_user or v_req.status<>'requested'
    then raise exception 'Titularidade ou estado incompatível.'; end if;
  select q.id,q.provider_id,q.status,q.created_at into v_quote
  from public.service_quotes q
  join public.f2_request_offers o on o.quote_id=q.id
  where q.id=p_quote_id and o.request_id=v_request_id and o.status='quoted'
  for update of q;
  if not found or v_quote.status<>'proposed' then raise exception 'Proposta indisponível.'; end if;
  if now()>=v_quote.created_at+interval '5 minutes'
    then raise exception 'Proposta expirada.'; end if;
  if p_accept and not exists(
    select 1 from public.providers p where p.id=v_quote.provider_id
    and p.status='approved' and p.is_active
  ) then raise exception 'Prestador vencedor perdeu homologação.'; end if;
  if not p_accept then
    update public.service_quotes set status='declined' where id=p_quote_id;
    update public.f2_request_offers set status='declined',replied_at=now()
    where quote_id=p_quote_id;
    return 'declined';
  end if;
  update public.service_quotes set status='accepted' where id=p_quote_id;
  update public.service_quotes set status='expired' where request_id=v_request_id
    and id<>p_quote_id and status='proposed';
  update public.f2_request_offers set status='not_selected',replied_at=now()
    where request_id=v_request_id and quote_id is distinct from p_quote_id
      and status in ('offered','delivered','quoted');
  update public.f2_request_offers set status='selected',replied_at=now()
    where quote_id=p_quote_id;
  update public.service_requests
    set provider_id=v_quote.provider_id,status='awaiting_payment',updated_at=now()
    where id=v_request_id;
  return 'awaiting_payment';
end;
$$;

-- No refresh autenticado: não contabiliza falta de resposta se não houve ACK.
create or replace function public.f2_expire_offers(p_request_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_count integer;
begin
  if v_user is null or not exists(select 1 from private.f2_release_gate where enabled)
    then raise exception 'F2 indisponível.'; end if;
  if not exists(select 1 from public.service_requests r
    where r.id=p_request_id and r.customer_id=v_user)
  then raise exception 'Acesso negado.'; end if;
  -- Convite não aberto expira sem gerar ausência; se foi aberto, a contagem
  -- depende de ACK autêntico e da janela completa de resposta.
  update public.f2_request_offers set status='expired',replied_at=now()
  where request_id=p_request_id
    and ((
      status='offered' and offered_at+interval '5 minutes'<=now()
    ) or (
      status='delivered' and delivered_at is not null
      and delivered_at+interval '5 minutes'<=now()
    ));
  get diagnostics v_count=row_count;
  -- Uma proposta vencida não pode permanecer como pendência infinita.
  update public.service_quotes q set status='expired'
  where q.request_id=p_request_id and q.status='proposed'
    and q.created_at+interval '5 minutes'<=now()
    and exists (select 1 from public.f2_request_offers o
                where o.quote_id=q.id and o.status='quoted');
  update public.f2_request_offers o set status='expired',replied_at=now()
  where o.request_id=p_request_id and o.status='quoted'
    and exists(select 1 from public.service_quotes q
               where q.id=o.quote_id and q.status='expired');
  return v_count;
end;
$$;
create or replace function public.f2_absence_review()
returns table(absences_30d bigint,requires_human_review boolean,automatically_suspended boolean)
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_provider uuid; v_n bigint;
begin
  if v_user is null then raise exception 'Autenticação obrigatória.'; end if;
  select id into v_provider from public.providers where owner_id=v_user;
  if v_provider is null then raise exception 'Prestador não encontrado.'; end if;
  select count(*) into v_n from public.f2_request_offers o
    where o.provider_id=v_provider and o.status='expired'
      and o.quote_id is null  -- Não penaliza orçamento enviado e não aceito.
      and o.delivered_at>=now()-interval '30 days';
  return query select v_n,v_n>=10,false;
end;
$$;

-- Evita que RPC antiga marque o pedido como "quoted" com convites F2 ativos.
create or replace function private.f2_guard_old_rpc()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='requested' and new.status='quoted'
    and exists(select 1 from public.f2_request_offers o
               where o.request_id=old.id and o.status in ('offered','delivered','quoted'))
  then raise exception 'Pedido F2: utilize orçamentos itemizados.'; end if;
  return new;
end;
$$;
create trigger f2_guard_legacy_quote before update of status on public.service_requests
for each row execute function private.f2_guard_old_rpc();

-- Cancelamento pelo fluxo legado revoga convites F2 e propostas em aberto.
create or replace function private.f2_cancel_pending()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='cancelled' and old.status is distinct from 'cancelled' then
    update public.service_quotes set status='expired'
      where request_id=new.id and status='proposed'
      and exists(select 1 from public.f2_request_offers o
                 where o.quote_id=service_quotes.id);
    update public.f2_request_offers set status='not_selected',replied_at=now()
      where request_id=new.id and status in ('offered','delivered','quoted');
  end if;
  return new;
end;
$$;
create trigger f2_cancel_open_offers after update of status on public.service_requests
for each row execute function private.f2_cancel_pending();

-- Revoga EXECUTE padrão de PUBLIC + roles; apenas usuários autenticados
-- podem chamar APIs protegidas com auth.uid e controle de titularidade.
revoke all on function public.f2_set_capacity(text[],numeric) from public,anon,authenticated;
revoke all on function public.f2_offer_candidates(uuid,integer) from public,anon,authenticated;
revoke all on function public.f2_ack_offer(uuid) from public,anon,authenticated;
revoke all on function public.f2_submit_quote(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.f2_decide_quote(uuid,boolean) from public,anon,authenticated;
revoke all on function public.f2_expire_offers(uuid) from public,anon,authenticated;
revoke all on function public.f2_absence_review() from public,anon,authenticated;
grant execute on function public.f2_set_capacity(text[],numeric),
  public.f2_offer_candidates(uuid,integer),public.f2_ack_offer(uuid),
  public.f2_submit_quote(uuid,jsonb,text),public.f2_decide_quote(uuid,boolean),
  public.f2_expire_offers(uuid),public.f2_absence_review()
to authenticated;
commit;