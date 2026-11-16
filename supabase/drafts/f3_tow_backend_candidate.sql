-- Salva Motoca! F3: CANDIDATO SQL DE REBOQUE, somente PostgreSQL 17 DESCARTÁVEL.
-- Depende da migration F1 e do candidato F2 (PR #42).
-- NÃO aplicar no Supabase hospedado; backup/restauração + revisão são obrigatórios.
-- Não cria pagamentos, notificações, rastreamento, despachos ou prestadores reais.
begin;

create table private.f3_release_gate(
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
insert into private.f3_release_gate(singleton,enabled) values(true,false);
revoke all on private.f3_release_gate from public,anon,authenticated;

-- A F1 bloqueia reboque em uma CHECK; permitir o código SOMENTE junto
-- de gatilho fail-closed, função Auth e três gates de liberação.
alter table public.service_requests drop constraint if exists f1_selected_service_types_check;
alter table public.service_requests
  add constraint f1_selected_service_types_check check(
    service_types is null or (
      cardinality(service_types) between 1 and 6
      and array_position(service_types,null) is null
      and service_types <@ array[
        'pneu_furado','troca_camara','troca_pneu',
        'calibragem_valvula','reboque_moto','outro'
      ]::text[]
      and array_position(service_types,null) is null
    )
  );
-- O check anterior da F1 exclui explicitamente reboque. O trigger abaixo,
-- não o formulário, controla a criação de pedidos dessa modalidade.

create table public.f3_tow_provider_capacity(
  provider_id uuid primary key references public.providers(id) on delete cascade,
  equipment text not null check(equipment in
    ('plataforma','carretinha','caminhonete_adaptada')),
  max_moto_kg integer not null check(max_moto_kg between 50 and 1000),
  coverage_km integer not null check(coverage_km between 1 and 150),
  tie_down_points integer not null check(tie_down_points between 2 and 12),
  has_ramp boolean not null default false,
  has_wheel_chock boolean not null default false,
  verified_by_admin boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint f3_equipment_minimum check(has_ramp and has_wheel_chock)
);
create table public.f3_tow_requests(
  request_id uuid primary key references public.service_requests(id) on delete cascade,
  motorcycle_weight_kg integer not null check(motorcycle_weight_kg between 40 and 650),
  pickup_city text not null check(length(btrim(pickup_city)) between 2 and 80),
  pickup_state_code text not null check(pickup_state_code ~ '^[A-Z]{2}$'),
  destination_city text not null check(length(btrim(destination_city)) between 2 and 80),
  destination_state_code text not null check(destination_state_code ~ '^[A-Z]{2}$'),
  destination_address text not null check(length(btrim(destination_address)) between 5 and 240),
  estimated_route_km integer not null check(estimated_route_km between 1 and 500),
  selected_provider_id uuid references public.providers(id),
  created_at timestamptz not null default now()
);
create index f3_tow_city on public.f3_tow_requests(pickup_state_code,pickup_city);
alter table public.f3_tow_provider_capacity enable row level security;
alter table public.f3_tow_requests enable row level security;
revoke all on public.f3_tow_provider_capacity,public.f3_tow_requests
  from public,anon,authenticated;
-- A tabela de destino exato NÃO dá SELECT ao prestador antes do pagamento.
create policy f3_tow_owner_read on public.f3_tow_requests
  for select to authenticated using(exists(
    select 1 from public.service_requests r
    where r.id=request_id and r.customer_id=(select auth.uid())
  ));
create policy f3_capacity_owner_read on public.f3_tow_provider_capacity
  for select to authenticated using(exists(
    select 1 from public.providers p
    where p.id=provider_id and p.owner_id=(select auth.uid())
  ));
grant select on public.f3_tow_requests,public.f3_tow_provider_capacity to authenticated;

create or replace function private.f3_enabled()
returns boolean language sql stable security definer set search_path='' as $$
 select (select enabled from private.f3_release_gate where singleton)
    and (select enabled from private.f2_release_gate where singleton);
$$;
revoke all on function private.f3_enabled() from public,anon,authenticated;

-- Ampliação conservadora da autorização já usada pelas políticas de foto/pedido
-- F2. Para reboque, não basta convite: requer F3 ativo e equipamento ainda
-- certificado com capacidade suficiente. As outras categorias mantêm a regra F2.
-- O rollback F3 restaura a definição anterior, sem mudar grants.
create or replace function private.f2_can_view_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
   and exists(select 1 from private.f2_release_gate g where g.enabled)
   and exists(
     select 1 from public.f2_request_offers o
     join public.providers p on p.id=o.provider_id
     join public.service_requests r on r.id=o.request_id
     where r.id=p_request_id and r.status='requested'
       and p.owner_id=auth.uid() and p.status='approved' and p.is_active
       and (
         (o.status='offered' and o.offered_at+interval '5 minutes'>now())
         or (o.status='delivered' and o.delivered_at is not null
             and o.delivered_at+interval '5 minutes'>now())
         or (o.status='quoted' and exists(
           select 1 from public.service_quotes q
           where q.id=o.quote_id and q.status='proposed'
             and q.created_at+interval '5 minutes'>now()
         ))
       )
       and (
         not exists(select 1 from public.service_categories cat
           where cat.id=r.category_id and cat.code='reboque_moto')
         or (
           private.f3_enabled()
           and exists(
             select 1 from public.f3_tow_provider_capacity cap
             join public.f3_tow_requests tow on tow.request_id=r.id
             where cap.provider_id=p.id and cap.verified_by_admin
               and cap.has_ramp and cap.has_wheel_chock
               and cap.tie_down_points>=2
               and cap.max_moto_kg>=tow.motorcycle_weight_kg
           )
         )
       )
   );
$$;

-- Impedir envio direto para serviço de reboque por clientes legados/F1.
-- RPC autorizada executa como o dono do banco; cliente via Data API opera
-- sob role authenticated, e o gate impede ativação prematura em todo caso.
create or replace function private.f3_tow_insert_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.service_types is not null and 'reboque_moto'=any(new.service_types) then
    if not private.f3_enabled() or current_setting('app.f3_create_authorized',true) is distinct from 'yes'
    then raise exception 'Reboque F3 desativado; use o fluxo seguro de solicitação.'; end if;
    if not exists(select 1 from public.service_categories c
      where c.id=new.category_id and c.code='reboque_moto')
    then raise exception 'Categoria de reboque inválida.'; end if;
  end if;
  return new;
end;
$$;
create trigger f3_guard_tow_request before insert or update of category_id,service_types
  on public.service_requests for each row
  execute function private.f3_tow_insert_guard();

-- O prestador informa capacidade, mas NEVER aprova o próprio equipamento.
create or replace function public.f3_set_tow_capacity(
  p_equipment text,p_max_moto_kg integer,p_coverage_km integer,
  p_tie_down_points integer,p_has_ramp boolean,p_has_wheel_chock boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_provider uuid; v_user uuid:=auth.uid();
begin
 if v_user is null or not private.f3_enabled()
 then raise exception 'F3 desativada ou sem autenticação.'; end if;
 if p_equipment not in ('plataforma','carretinha','caminhonete_adaptada')
   or p_max_moto_kg not between 50 and 1000 or p_coverage_km not between 1 and 150
   or p_tie_down_points not between 2 and 12
   or p_has_ramp is distinct from true or p_has_wheel_chock is distinct from true
 then raise exception 'Equipamento ou amarração incompatível.'; end if;
 select id into v_provider from public.providers where owner_id=v_user;
 if v_provider is null then raise exception 'Prestador não cadastrado.'; end if;
 insert into public.f3_tow_provider_capacity(
   provider_id,equipment,max_moto_kg,coverage_km,tie_down_points,
   has_ramp,has_wheel_chock,verified_by_admin
 ) values(v_provider,p_equipment,p_max_moto_kg,p_coverage_km,
   p_tie_down_points,true,true,false)
 on conflict(provider_id) do update set
   equipment=excluded.equipment,max_moto_kg=excluded.max_moto_kg,
   coverage_km=excluded.coverage_km,tie_down_points=excluded.tie_down_points,
   has_ramp=true,has_wheel_chock=true,verified_by_admin=false,updated_at=now();
 return v_provider;
end;
$$;

-- Pedido + dados privados em UMA transação, com foto F1 já existente.
-- Dados de destino não aparecem nas ofertas nem em RLS do prestador.
create or replace function public.f3_create_tow_request(
 p_request_key uuid,p_photo_path text,p_brand text,p_model text,p_year integer,
 p_weight_kg integer,p_service_types text[],p_description text,
 p_pickup_lat numeric,p_pickup_lng numeric,p_pickup_city text,p_pickup_state text,
 p_destination_city text,p_destination_state text,p_destination_address text,
 p_estimated_km integer,p_mode text default 'automatic',p_selected_provider uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_category smallint;v_request uuid;v_existing record;
begin
 if v_user is null or not private.f3_enabled()
 then raise exception 'F3 desativada ou sem autenticação.'; end if;
 if p_request_key is null or p_photo_path is distinct from
    v_user::text||'/'||p_request_key::text||'.jpg'
   or not exists(select 1 from storage.objects
     where bucket_id='request-photos' and name=p_photo_path)
 then raise exception 'Foto privada de titularidade inválida ou inexistente.'; end if;
 if p_brand is null or length(btrim(p_brand)) not between 2 and 70
   or p_model is null or length(btrim(p_model)) not between 2 and 90
   or p_year is null or p_year not between 1950 and 2100
   or p_weight_kg is null or p_weight_kg not between 40 and 650
   or p_description is null or length(btrim(p_description)) not between 10 and 500
   or p_service_types is null or cardinality(p_service_types) not between 1 and 6
   or array_position(p_service_types,null) is not null
   or 'reboque_moto' <> all(p_service_types)
   or not (p_service_types <@ array['pneu_furado','troca_camara','troca_pneu',
     'calibragem_valvula','reboque_moto','outro']::text[])
   or (select count(distinct x) from unnest(p_service_types) x)
       <>cardinality(p_service_types)
 then raise exception 'Dados de motocicleta, descrição ou serviço inválidos.'; end if;
 if p_pickup_lat is null or p_pickup_lng is null
   or p_pickup_lat not between -90 and 90 or p_pickup_lng not between -180 and 180
   or length(btrim(coalesce(p_pickup_city,''))) not between 2 and 80
   or p_pickup_state is null or p_pickup_state !~ '^[A-Z]{2}$'
   or length(btrim(coalesce(p_destination_city,''))) not between 2 and 80
   or p_destination_state is null or p_destination_state !~ '^[A-Z]{2}$'
   or length(btrim(coalesce(p_destination_address,''))) not between 5 and 240
   or p_estimated_km is null or p_estimated_km not between 1 and 500
   or p_mode is null or p_mode not in ('manual','automatic')
   or (p_mode='manual' and p_selected_provider is null)
   or (p_mode='automatic' and p_selected_provider is not null)
 then raise exception 'Rota, destino ou modo inválidos.'; end if;
 select id into v_category from public.service_categories where code='reboque_moto';
 if v_category is null then raise exception 'Categoria de reboque inexistente.'; end if;
 if p_selected_provider is not null and not exists(
   select 1 from public.providers p join public.provider_services ps
     on ps.provider_id=p.id and ps.category_id=v_category and ps.is_active
   join public.f3_tow_provider_capacity cap on cap.provider_id=p.id
     and cap.verified_by_admin and cap.has_ramp and cap.has_wheel_chock
     and cap.tie_down_points>=2 and cap.max_moto_kg>=p_weight_kg
   where p.id=p_selected_provider and p.status='approved' and p.is_active
 ) then raise exception 'Prestador manual não homologado para reboque.'; end if;
 -- Em reenvios, somente payload estritamente idêntico pode retornar o ID.
 select r.id,r.customer_id,r.photo_path,r.service_types,r.motorcycle_brand,
    r.motorcycle_model,r.motorcycle_year,r.problem_description,r.provider_id,r.f2_mode,
    t.motorcycle_weight_kg,t.pickup_city,t.pickup_state_code,t.destination_city,
    t.destination_state_code,t.destination_address,t.estimated_route_km,
    t.selected_provider_id,r.latitude,r.longitude
 into v_existing
 from public.service_requests r
 left join public.f3_tow_requests t on t.request_id=r.id
 where r.request_key=p_request_key for update of r;
 if found then
   if v_existing.customer_id<>v_user or v_existing.photo_path is distinct from p_photo_path
     or v_existing.service_types is distinct from p_service_types
     or v_existing.motorcycle_brand is distinct from btrim(p_brand)
     or v_existing.motorcycle_model is distinct from btrim(p_model)
     or v_existing.motorcycle_year is distinct from p_year
     or v_existing.problem_description is distinct from btrim(p_description)
     or v_existing.motorcycle_weight_kg is distinct from p_weight_kg
     or v_existing.pickup_city is distinct from btrim(p_pickup_city)
     or v_existing.pickup_state_code is distinct from p_pickup_state
     or v_existing.destination_city is distinct from btrim(p_destination_city)
     or v_existing.destination_state_code is distinct from p_destination_state
     or v_existing.destination_address is distinct from btrim(p_destination_address)
     or v_existing.estimated_route_km is distinct from p_estimated_km
     or v_existing.selected_provider_id is distinct from p_selected_provider
     or v_existing.latitude is distinct from p_pickup_lat
     or v_existing.longitude is distinct from p_pickup_lng
     or v_existing.f2_mode is distinct from p_mode
   then raise exception 'Chave de pedido reutilizada com dados diferentes.'; end if;
   return v_existing.id;
 end if;
 -- SET LOCAL só libera o gatilho na operação protegida desta transação.
 perform set_config('app.f3_create_authorized','yes',true);
 insert into public.service_requests(
  request_key,customer_id,category_id,provider_id,motorcycle_brand,motorcycle_model,
  motorcycle_year,service_types,photo_path,problem_description,
  latitude,longitude,status,f2_mode
 ) values (
  p_request_key,v_user,v_category,null,btrim(p_brand),btrim(p_model),
  p_year,p_service_types,p_photo_path,btrim(p_description),
  p_pickup_lat,p_pickup_lng,'requested',p_mode
 ) returning id into v_request;
 perform set_config('app.f3_create_authorized','',true);
 insert into public.f3_tow_requests(
   request_id,motorcycle_weight_kg,pickup_city,pickup_state_code,
   destination_city,destination_state_code,destination_address,estimated_route_km,
   selected_provider_id
 ) values(v_request,p_weight_kg,btrim(p_pickup_city),p_pickup_state,
   btrim(p_destination_city),p_destination_state,btrim(p_destination_address),p_estimated_km,
   p_selected_provider);
 return v_request;
end;
$$;

-- Lê somente resumo: nunca endereço exato nem latitude/longitude.
-- Autorização por convite F2 vigente, usuário titular ou prestador vencedor
-- APÓS pagamento legítimo (F4, não ativado nesta fase).
create or replace function public.f3_tow_summary(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_r record;
begin
 if v_user is null or not private.f3_enabled()
 then raise exception 'Resumo de reboque indisponível.'; end if;
 select r.id,r.customer_id,r.motorcycle_brand,r.motorcycle_model,r.motorcycle_year,
   t.motorcycle_weight_kg,t.pickup_city,t.pickup_state_code,
   t.destination_city,t.destination_state_code,t.estimated_route_km
 into v_r
 from public.service_requests r join public.f3_tow_requests t on t.request_id=r.id
 where r.id=p_request_id;
 if not found then raise exception 'Pedido inexistente.'; end if;
 if v_r.customer_id<>v_user
   and not private.f2_can_view_request(p_request_id)
 then raise exception 'Resumo não autorizado.'; end if;
 return jsonb_build_object(
   'requestId',v_r.id,'motorcycleBrand',v_r.motorcycle_brand,
   'motorcycleModel',v_r.motorcycle_model,'motorcycleYear',v_r.motorcycle_year,
   'motorcycleWeightKg',v_r.motorcycle_weight_kg,
   'pickupCity',v_r.pickup_city,'pickupStateCode',v_r.pickup_state_code,
   'destinationCity',v_r.destination_city,'destinationStateCode',v_r.destination_state_code,
   'estimatedRouteKm',v_r.estimated_route_km);
end;
$$;

-- Ofertas F3 usam a mesma estrutura transacional da F2, com regras
-- próprias de capacidade certificada, equipamento, peso e cobertura.
create or replace function public.f3_offer_candidates(
 p_request_id uuid,p_max_offers integer default 3
) returns integer language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_req record;v_tow record;
        v_ring integer;v_round integer;v_count integer:=0;candidate record;
begin
 if v_user is null or not private.f3_enabled() or p_max_offers not between 1 and 3
 then raise exception 'Distribuição F3 não autorizada.'; end if;
 select r.id,r.customer_id,r.category_id,r.provider_id,r.f2_mode,r.service_types,
   r.latitude,r.longitude,r.status
 into v_req from public.service_requests r where r.id=p_request_id for update;
 if not found or v_req.customer_id<>v_user or v_req.status<>'requested'
   or v_req.latitude is null or v_req.longitude is null
   or v_req.service_types is null or not('reboque_moto'=any(v_req.service_types))
   or not exists(select 1 from public.service_categories c
      where c.id=v_req.category_id and c.code='reboque_moto')
 then raise exception 'Pedido F3 não elegível.'; end if;
 select motorcycle_weight_kg,pickup_city,pickup_state_code,selected_provider_id
  into v_tow from public.f3_tow_requests where request_id=p_request_id;
 if not found then raise exception 'Peso e destino do reboque não cadastrados.'; end if;
 if exists(select 1 from public.f2_request_offers
   where request_id=p_request_id and status in('offered','delivered','quoted'))
 then raise exception 'Convites pendentes exigem decisão ou vencimento.'; end if;
 select coalesce(max(round_number),0)+1 into v_round
   from public.f2_request_offers where request_id=p_request_id;
 if v_round>20 then raise exception 'Limite de rodadas atingido.'; end if;
 for v_ring in select unnest(array[1,3,10]::integer[]) loop
   for candidate in
     select p.id as provider_id,
       private.f2_distance_km(v_req.latitude,v_req.longitude,p.latitude,p.longitude) as dist
     from public.providers p
     join public.provider_services ps on ps.provider_id=p.id
       and ps.category_id=v_req.category_id and ps.is_active
     join public.bj_provider_presence presence on presence.provider_id=p.id
       and presence.online_requested and presence.last_seen_at>=now()-interval '90 seconds'
     join public.f3_tow_provider_capacity cap on cap.provider_id=p.id
       and cap.verified_by_admin and cap.has_ramp and cap.has_wheel_chock
       and cap.tie_down_points>=2 and cap.max_moto_kg>=v_tow.motorcycle_weight_kg
     left join public.f2_provider_capacity basic on basic.provider_id=p.id
     where p.status='approved' and p.is_active
       and p.city=v_tow.pickup_city and p.state_code=v_tow.pickup_state_code
       and p.latitude is not null and p.longitude is not null
       and private.f2_distance_km(v_req.latitude,v_req.longitude,p.latitude,p.longitude)
         <=least(v_ring,cap.coverage_km)
       and (basic.service_types @> array_remove(v_req.service_types,'reboque_moto')
         or cardinality(array_remove(v_req.service_types,'reboque_moto'))=0)
       and (v_round>1 or coalesce(v_req.f2_mode,'automatic')='automatic'
            or p.id=v_tow.selected_provider_id)
       and not exists(select 1 from public.f2_request_offers o
          where o.request_id=p_request_id and o.provider_id=p.id
            and o.status in('offered','delivered','quoted','selected'))
       and (select count(*) from public.f2_request_offers o
           where o.request_id=p_request_id and o.provider_id=p.id
             and o.status='declined')<2
       and p.id is distinct from (select o.provider_id from public.f2_request_offers o
          where o.request_id=p_request_id and o.status='declined'
          order by o.replied_at desc nulls last,o.offered_at desc limit 1)
     order by dist,p.created_at,p.id
     limit case when v_round=1 and v_req.f2_mode='manual' then 1 else p_max_offers end
   loop
     insert into public.f2_request_offers(
       request_id,provider_id,round_number,status
     ) values(p_request_id,candidate.provider_id,v_round,'offered');
     v_count:=v_count+1;
   end loop;
   exit when v_count>0;
 end loop;
 if v_count>0 then update public.service_requests
  set provider_id=null,updated_at=now() where id=p_request_id; end if;
 return v_count;
end;
$$;

-- Cotação F3 usa F2 (service/travel, materiais inclusos), mas exige
-- reboque presente, peso suportado e equipamento ainda homologado.
create or replace function public.f3_submit_tow_quote(
  p_offer_id uuid,p_items jsonb,p_details text default ''
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_offer record;v_req record;v_quote uuid;
        v_line jsonb;v_kind text;v_code text;v_amount integer;
        v_line_no integer:=0;v_total integer:=0;v_travel integer:=0;
        v_seen text[]:=array[]::text[];
begin
 if v_user is null or not private.f3_enabled()
 then raise exception 'Cotação F3 desativada.'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array'
   or jsonb_array_length(p_items) not between 2 and 16
   or length(coalesce(p_details,''))>350
   or coalesce(p_details,'') ~*
       '(https?://|www[.]|wa[.]me|whats[[:space:]]*app|chave[[:space:]]*pix|@[-_[:alnum:].]+|([0-9][[:space:]().-]*){9,})'
 then raise exception 'Itens inválidos ou descrição contém contato externo.'; end if;
 select o.id,o.request_id,o.provider_id,o.status,o.delivered_at
   into v_offer from public.f2_request_offers o
   join public.providers p on p.id=o.provider_id and p.owner_id=v_user
   where o.id=p_offer_id and p.status='approved' and p.is_active
   for update of o;
 if not found or v_offer.status<>'delivered' or v_offer.delivered_at is null
    or now()>=v_offer.delivered_at+interval '5 minutes'
 then raise exception 'Convite vencido ou sem autorização.'; end if;
 select r.id,r.category_id,r.service_types,r.status into v_req
   from public.service_requests r where r.id=v_offer.request_id for update;
 if not found or v_req.status<>'requested'
   or not exists(select 1 from public.service_categories c
      where c.id=v_req.category_id and c.code='reboque_moto')
 then raise exception 'Pedido de reboque indisponível.'; end if;
 if not exists(
   select 1 from public.providers p
   join public.provider_services ps on ps.provider_id=p.id
     and ps.category_id=v_req.category_id and ps.is_active
   join public.f3_tow_provider_capacity cap on cap.provider_id=p.id
     and cap.verified_by_admin and cap.has_ramp and cap.has_wheel_chock
   join public.f3_tow_requests t on t.request_id=v_req.id
      and t.motorcycle_weight_kg<=cap.max_moto_kg
   left join public.f2_provider_capacity basic on basic.provider_id=p.id
   where p.id=v_offer.provider_id and p.status='approved' and p.is_active
     and (basic.service_types @> array_remove(v_req.service_types,'reboque_moto')
       or cardinality(array_remove(v_req.service_types,'reboque_moto'))=0)
 ) then raise exception 'Capacidade do reboque não está mais homologada.'; end if;
 for v_line in select value from jsonb_array_elements(p_items) loop
   v_line_no:=v_line_no+1;
   if jsonb_typeof(v_line)<>'object'
     or (v_line->>'amountCents') !~ '^[0-9]{1,6}$'
   then raise exception 'Valor do item deve ser inteiro em centavos.'; end if;
   v_kind:=v_line->>'kind'; v_code:=btrim(coalesce(v_line->>'code',''));
   v_amount:=(v_line->>'amountCents')::integer;
   if v_amount>500000 or length(v_code) not between 2 and 80
   then raise exception 'Item ou preço inválido.'; end if;
   if v_kind='service' then
     if not(v_code=any(v_req.service_types)) or v_code=any(v_seen) or v_amount=0
     then raise exception 'Serviço extra, repetido ou sem valor.'; end if;
     v_seen:=array_append(v_seen,v_code);
   elsif v_kind='travel' then
     if v_code<>'deslocamento' or v_travel>0
     then raise exception 'Deslocamento inválido.'; end if;
     v_travel:=v_travel+1;
   else raise exception 'Tipo de linha inválido.'; end if;
   v_total:=v_total+v_amount;
 end loop;
 if v_travel<>1 or cardinality(v_seen)<>cardinality(v_req.service_types)
   or v_total not between 100 and 500000
 then raise exception 'Orçamento incompleto ou acima do limite de teste.'; end if;
 insert into public.service_quotes(request_id,provider_id,amount_cents,details,status)
 values(v_offer.request_id,v_offer.provider_id,v_total,btrim(coalesce(p_details,'')),'proposed')
 returning id into v_quote;
 v_line_no:=0;
 for v_line in select value from jsonb_array_elements(p_items) loop
   v_line_no:=v_line_no+1;
   insert into public.f2_quote_items(quote_id,line_no,kind,code,amount_cents)
   values(v_quote,v_line_no,v_line->>'kind',
          btrim(v_line->>'code'),(v_line->>'amountCents')::integer);
 end loop;
 update public.f2_request_offers
   set status='quoted',quote_id=v_quote,replied_at=now()
   where id=p_offer_id;
 return v_quote;
end;
$$;

-- F2 já serializa a decisão por service_requests FOR UPDATE.
-- F3 apenas revalida a segurança do reboque ANTES de invocar F2.
create or replace function public.f3_decide_tow_quote(
 p_quote_id uuid,p_accept boolean
) returns text language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_quote record;v_req record;
begin
 if v_user is null or not private.f3_enabled()
 then raise exception 'Decisão F3 desativada.'; end if;
 select q.id,q.provider_id,q.request_id into v_quote
 from public.service_quotes q where q.id=p_quote_id;
 if not found then raise exception 'Proposta inexistente.'; end if;
 select r.id,r.customer_id,r.category_id,r.status into v_req
 from public.service_requests r where r.id=v_quote.request_id for update;
 if not found or v_req.customer_id<>v_user or v_req.status<>'requested'
   or not exists(select 1 from public.service_categories c
       where c.id=v_req.category_id and c.code='reboque_moto')
 then raise exception 'Somente titular de solicitação F3 ativa pode decidir.'; end if;
 if p_accept and not exists(
   select 1 from public.providers p
   join public.provider_services ps on ps.provider_id=p.id
     and ps.category_id=v_req.category_id and ps.is_active
   join public.f3_tow_provider_capacity cap on cap.provider_id=p.id
     and cap.verified_by_admin and cap.has_ramp and cap.has_wheel_chock
   join public.f3_tow_requests t on t.request_id=v_req.id
     and t.motorcycle_weight_kg<=cap.max_moto_kg
   where p.id=v_quote.provider_id and p.status='approved' and p.is_active
 ) then raise exception 'Reboque perdeu habilitação antes do aceite.'; end if;
 return public.f2_decide_quote(p_quote_id,p_accept);
end;
$$;

-- Trava de auditoria contra bypass: um cliente poderia tentar chamar a
-- RPC genérica F2 para aceitar uma proposta de reboque sem certificação vigente.
-- O gatilho é executado até quando o aceite chega pela RPC de F2.
create or replace function private.f3_guard_tow_quote_accepted()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_req record;
begin
 if new.status='accepted' and old.status is distinct from 'accepted' then
   select r.id,r.category_id into v_req
   from public.service_requests r where r.id=new.request_id;
   if exists(select 1 from public.service_categories c
     where c.id=v_req.category_id and c.code='reboque_moto') then
     if not private.f3_enabled() then
       raise exception 'Reboque não liberado para aceite.'; end if;
     if not exists(select 1 from public.providers p
       join public.provider_services ps on ps.provider_id=p.id
         and ps.category_id=v_req.category_id and ps.is_active
       join public.f3_tow_provider_capacity cap on cap.provider_id=p.id
         and cap.verified_by_admin and cap.has_ramp and cap.has_wheel_chock
         and cap.tie_down_points>=2
       join public.f3_tow_requests t on t.request_id=v_req.id
         and t.motorcycle_weight_kg<=cap.max_moto_kg
       where p.id=new.provider_id and p.status='approved' and p.is_active
     ) then raise exception 'Prestador de reboque sem homologação no aceite.'; end if;
   end if;
 end if;
 return new;
end;
$$;
create trigger f3_guard_tow_quote_accept
  before update of status on public.service_quotes
  for each row execute function private.f3_guard_tow_quote_accepted();

-- Revogar alterações de convite F3 quando o gate F3 estiver desativado,
-- inclusive se tentarem usar as RPCs genéricas de ACK/recusa da F2.
create or replace function private.f3_guard_tow_offer_transition()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status is distinct from new.status and exists(
   select 1 from public.service_requests r
   join public.service_categories c on c.id=r.category_id
   where r.id=new.request_id and c.code='reboque_moto'
 ) and not private.f3_enabled()
 then raise exception 'Convite F3 desativado.'; end if;
 return new;
end;
$$;
create trigger f3_guard_tow_offer_transition
  before update of status on public.f2_request_offers
  for each row execute function private.f3_guard_tow_offer_transition();

-- Não conceder escrita direta em tabelas; apenas RPCs autenticadas.
revoke all on function public.f3_set_tow_capacity(text,integer,integer,integer,boolean,boolean)
  from public,anon,authenticated;
revoke all on function public.f3_create_tow_request(
 uuid,text,text,text,integer,integer,text[],text,numeric,numeric,text,text,
 text,text,text,integer,text,uuid) from public,anon,authenticated;
revoke all on function public.f3_tow_summary(uuid) from public,anon,authenticated;
revoke all on function public.f3_offer_candidates(uuid,integer) from public,anon,authenticated;
revoke all on function public.f3_submit_tow_quote(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.f3_decide_tow_quote(uuid,boolean) from public,anon,authenticated;
grant execute on function
  public.f3_set_tow_capacity(text,integer,integer,integer,boolean,boolean),
  public.f3_create_tow_request(uuid,text,text,text,integer,integer,text[],text,numeric,numeric,
    text,text,text,text,text,integer,text,uuid),
  public.f3_tow_summary(uuid),
  public.f3_offer_candidates(uuid,integer),
  public.f3_submit_tow_quote(uuid,jsonb,text),
  public.f3_decide_tow_quote(uuid,boolean)
to authenticated;

-- F3 não altera paid_in_app da categoria reboque, que permanece false
-- até homologação financeira F4 e decisão de publicação.
commit;
