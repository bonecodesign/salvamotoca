-- ⚠️ ESQUEMA LEGADO / DEMONSTRAÇÃO: NÃO EXECUTAR NO PROJETO SUPABASE DE TESTES EXISTENTE.
-- O esquema real está documentado em docs/INTEGRACAO_SUPABASE.md.
-- Este arquivo bj_* é incompatível com as tabelas reais (providers, service_requests etc.).

-- Salva Motoca! — Etapa 3: backend multiusuário seguro (piloto).
-- Executar SOMENTE em um projeto Supabase novo, pelo SQL Editor.
-- Não migra o esquema de referência anterior. Não configura pagamentos reais.
-- Revisão de segurança e testes em projeto de homologação são obrigatórios antes da produção.

create extension if not exists pgcrypto;
create schema if not exists private;

create table public.bj_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 80),
  created_at timestamptz not null default now()
);

create table public.bj_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.bj_providers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.bj_profiles(id) on delete cascade,
  business_name text not null check (char_length(trim(business_name)) between 3 and 90),
  description text not null default '' check (char_length(description) <= 350),
  region text not null check (char_length(trim(region)) between 3 and 100),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  coverage_km integer not null default 10 check (coverage_km between 1 and 50),
  delivery_enabled boolean not null default true,
  available boolean not null default false,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint bj_provider_no_external_contacts check (
    (business_name || ' ' || description || ' ' || region) !~*
      '(https?://|www\.|wa\.me|whats.?app|chave[[:space:]]+pix|@[[:alnum:]_.-]+|([0-9][[:space:]().-]*){9,})'
  )
);

create table public.bj_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.bj_profiles(id),
  request_key uuid not null,
  provider_id uuid not null references public.bj_providers(id),
  dispatch_mode text not null check (dispatch_mode in ('manual','automatic')),
  problem text not null check (char_length(trim(problem)) between 4 and 120),
  motorcycle text not null check (char_length(trim(motorcycle)) between 2 and 100),
  area text not null check (char_length(trim(area)) between 3 and 130),
  status text not null default 'requested'
    check (status in ('requested','quoted','awaiting_payment','paid','en_route','in_service','completed','cancelled','disputed')),
  quoted_amount_cents integer check (quoted_amount_cents between 100 and 500000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id,request_key)
);

-- Endereço exato e GPS NÃO ficam expostos na tabela de pedidos.
-- O prestador verá esses dados somente após pagamento real confirmado no servidor.
create table public.bj_order_private_location (
  order_id uuid primary key references public.bj_orders(id) on delete cascade,
  exact_address text not null check (char_length(trim(exact_address)) between 6 and 300),
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  check ((latitude is null) = (longitude is null))
);

-- Preparação para o chat após o pagamento. Neste estágio o frontend não o habilita.
create table public.bj_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.bj_orders(id) on delete cascade,
  sender_id uuid not null references public.bj_profiles(id),
  text_body text not null check (char_length(trim(text_body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (text_body !~* '(https?://|www\.|wa\.me|whats.?app|chave[[:space:]]+pix|@[[:alnum:]_.-]+|([0-9][[:space:]().-]*){9,})')
);

create index bj_orders_customer_idx on public.bj_orders(customer_id, created_at desc);
create index bj_orders_provider_idx on public.bj_orders(provider_id, created_at desc);
create index bj_providers_geo_idx on public.bj_providers(verified, available, delivery_enabled);
create index bj_messages_order_idx on public.bj_messages(order_id, created_at);

-- Perfis não recebem poderes administrativos por metadata do usuário.
create or replace function private.bj_on_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  v_name := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Motociclista'), 80);
  if char_length(v_name) < 2 then v_name := 'Motociclista'; end if;
  insert into public.bj_profiles(id, display_name) values (new.id, v_name);
  return new;
end;
$$;
create trigger bj_new_user after insert on auth.users
for each row execute function private.bj_on_signup();

create or replace function private.bj_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bj_admins a where a.user_id = (select auth.uid()));
$$;

-- Alterações comerciais precisam de nova revisão; o simples liga/desliga da disponibilidade não.
create or replace function private.bj_reset_provider_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.business_name is distinct from old.business_name
    or new.description is distinct from old.description
    or new.region is distinct from old.region
    or new.latitude is distinct from old.latitude
    or new.longitude is distinct from old.longitude
    or new.coverage_km is distinct from old.coverage_km
    or new.delivery_enabled is distinct from old.delivery_enabled then
    new.verified := false;
    new.available := false;
  end if;
  return new;
end;
$$;
create trigger bj_provider_reapproval before update on public.bj_providers
for each row execute function private.bj_reset_provider_review();

create or replace function private.bj_distance_km(a_lat numeric, a_lng numeric, b_lat numeric, b_lng numeric)
returns double precision language sql immutable set search_path = '' as $$
  select 2.0 * 6371.0 * asin(sqrt(least(1.0, greatest(0.0,
    power(sin(radians((b_lat - a_lat)::double precision) / 2), 2) +
    cos(radians(a_lat::double precision)) * cos(radians(b_lat::double precision)) *
    power(sin(radians((b_lng - a_lng)::double precision) / 2), 2)
  ))));
$$;

alter table public.bj_profiles enable row level security;
alter table public.bj_admins enable row level security;
alter table public.bj_providers enable row level security;
alter table public.bj_orders enable row level security;
alter table public.bj_order_private_location enable row level security;
alter table public.bj_messages enable row level security;

create policy bj_profiles_read on public.bj_profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.bj_is_admin()));
create policy bj_profiles_self_update on public.bj_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy bj_admins_self_read on public.bj_admins for select to authenticated
  using (user_id = (select auth.uid()));
create policy bj_providers_read on public.bj_providers for select to authenticated
  using (verified or owner_id = (select auth.uid()) or (select private.bj_is_admin()));
create policy bj_providers_owner_insert on public.bj_providers for insert to authenticated
  with check (owner_id = (select auth.uid()) and not verified and not available);
create policy bj_providers_owner_update on public.bj_providers for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy bj_orders_participants_read on public.bj_orders for select to authenticated
  using (
    customer_id = (select auth.uid())
    or exists (select 1 from public.bj_providers p where p.id = provider_id and p.owner_id = (select auth.uid()))
    or (select private.bj_is_admin())
  );
create policy bj_location_private_read on public.bj_order_private_location for select to authenticated
  using (exists (
    select 1 from public.bj_orders o where o.id = order_id and (
      o.customer_id = (select auth.uid()) or (select private.bj_is_admin())
      or (
        o.status in ('paid','en_route','in_service','completed','disputed')
        and exists(select 1 from public.bj_providers p where p.id = o.provider_id and p.owner_id = (select auth.uid()))
      )
    )
  ));
create policy bj_messages_participants_read on public.bj_messages for select to authenticated
  using (exists (
    select 1 from public.bj_orders o where o.id = order_id
    and (o.customer_id = (select auth.uid())
      or exists(select 1 from public.bj_providers p where p.id=o.provider_id and p.owner_id=(select auth.uid()))
      or (select private.bj_is_admin()))
    and o.status in ('paid','en_route','in_service','completed','disputed')
  ));
create policy bj_messages_participants_insert on public.bj_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and exists (
    select 1 from public.bj_orders o where o.id = order_id
    and (o.customer_id = (select auth.uid())
      or exists(select 1 from public.bj_providers p where p.id=o.provider_id and p.owner_id=(select auth.uid())))
    and o.status in ('paid','en_route','in_service')
  ));

-- O mapa público revela SOMENTE dados comerciais aprovados; sem telefone/WhatsApp ou ID do dono.
create or replace function public.bj_find_providers()
returns table (id uuid, business_name text, description text, region text, latitude numeric,
  longitude numeric, coverage_km integer, delivery_enabled boolean, available boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.business_name, p.description, p.region, p.latitude,
    p.longitude, p.coverage_km, p.delivery_enabled, p.available
  from public.bj_providers p where p.verified = true
  order by p.business_name limit 250;
$$;

-- Cria pedido e endereço privado de forma atômica, sem permitir alteração direta de estado.
create or replace function public.bj_request_service(
  p_request_key uuid, p_mode text, p_provider_id uuid, p_problem text, p_motorcycle text,
  p_area text, p_exact_address text, p_lat numeric default null, p_lng numeric default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_provider uuid; v_order uuid;
begin
  if v_user is null then raise exception 'Faça login para solicitar atendimento.'; end if;
  if p_request_key is null then raise exception 'Identificador de solicitação obrigatório.'; end if;
  select id into v_order from public.bj_orders where customer_id=v_user and request_key=p_request_key;
  if v_order is not null then return v_order; end if;
  if p_mode not in ('manual','automatic') then raise exception 'Modo inválido.'; end if;
  if char_length(trim(coalesce(p_problem,''))) not between 4 and 120
    or char_length(trim(coalesce(p_motorcycle,''))) not between 2 and 100
    or char_length(trim(coalesce(p_area,''))) not between 3 and 130
    or char_length(trim(coalesce(p_exact_address,''))) not between 6 and 300
    then raise exception 'Preencha os dados do pedido corretamente.';
  end if;
  if (p_lat is null) <> (p_lng is null)
    or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180))
    then raise exception 'Coordenadas inválidas.'; end if;
  if p_mode = 'automatic' then
    if p_lat is null then raise exception 'A busca automática exige localização GPS autorizada.'; end if;
    select p.id into v_provider from public.bj_providers p
    where p.verified and p.delivery_enabled and p.available
      and private.bj_distance_km(p_lat, p_lng, p.latitude, p.longitude) <= p.coverage_km
    order by private.bj_distance_km(p_lat,p_lng,p.latitude,p.longitude),p.created_at
    limit 1;
  else
    select p.id into v_provider from public.bj_providers p
    where p.id = p_provider_id and p.verified and p.delivery_enabled and p.available
      and (p_lat is null or private.bj_distance_km(p_lat,p_lng,p.latitude,p.longitude) <= p.coverage_km);
  end if;
  if v_provider is null then raise exception 'Nenhum borracheiro disponível para esse atendimento.'; end if;
  insert into public.bj_orders(customer_id,request_key,provider_id,dispatch_mode,problem,motorcycle,area)
    values(v_user,p_request_key,v_provider,p_mode,trim(p_problem),trim(p_motorcycle),trim(p_area))
    on conflict (customer_id,request_key) do nothing returning id into v_order;
  if v_order is null then
    select id into v_order from public.bj_orders where customer_id=v_user and request_key=p_request_key;
    return v_order;
  end if;
  insert into public.bj_order_private_location(order_id,exact_address,latitude,longitude)
    values(v_order,trim(p_exact_address),p_lat,p_lng);
  return v_order;
end;
$$;

create or replace function public.bj_offer_quote(p_order_id uuid, p_amount_cents integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_amount_cents is null or p_amount_cents not between 100 and 500000
    then raise exception 'Orçamento inválido.'; end if;
  update public.bj_orders o set quoted_amount_cents=p_amount_cents,status='quoted',updated_at=now()
  where o.id=p_order_id and o.status='requested' and exists (
    select 1 from public.bj_providers p where p.id=o.provider_id and p.owner_id=auth.uid() and p.verified
  );
  if not found then raise exception 'Pedido não autorizado ou estado incompatível.'; end if;
end;
$$;

create or replace function public.bj_accept_quote(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  update public.bj_orders set status='awaiting_payment',updated_at=now()
    where id=p_order_id and customer_id=auth.uid() and status='quoted' and quoted_amount_cents is not null;
  if not found then raise exception 'Pedido não autorizado ou estado incompatível.'; end if;
end;
$$;

create or replace function public.bj_cancel_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  update public.bj_orders o set status='cancelled',updated_at=now()
  where o.id=p_order_id and o.status in ('requested','quoted','awaiting_payment')
    and (o.customer_id=auth.uid() or exists (
      select 1 from public.bj_providers p where p.id=o.provider_id and p.owner_id=auth.uid()
    ));
  if not found then raise exception 'Pedido não autorizado ou não cancelável.'; end if;
end;
$$;

-- Aprovação é feita exclusivamente por um administrador cadastrado no banco.
create or replace function public.bj_review_provider(p_provider_id uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.bj_is_admin() then raise exception 'Acesso não autorizado.'; end if;
  update public.bj_providers set verified=p_verified,
    available=case when p_verified then available else false end
  where id=p_provider_id;
  if not found then raise exception 'Profissional não encontrado.'; end if;
end;
$$;

-- Padrão: RLS ativo e sem escrita direta em pedidos, status ou valores monetários.
revoke all on public.bj_profiles,public.bj_admins,public.bj_providers,public.bj_orders,
  public.bj_order_private_location,public.bj_messages from anon,authenticated;
grant select on public.bj_profiles,public.bj_admins,public.bj_providers,public.bj_orders,
  public.bj_order_private_location,public.bj_messages to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.bj_is_admin() to authenticated;
grant update(display_name) on public.bj_profiles to authenticated;
grant insert(owner_id,business_name,description,region,latitude,longitude,coverage_km,delivery_enabled,available,verified)
  on public.bj_providers to authenticated;
grant update(business_name,description,region,latitude,longitude,coverage_km,delivery_enabled,available)
  on public.bj_providers to authenticated;
grant insert(order_id,sender_id,text_body) on public.bj_messages to authenticated;

revoke all on function public.bj_find_providers() from public;
grant execute on function public.bj_find_providers() to anon,authenticated;
revoke all on function public.bj_request_service(uuid,text,uuid,text,text,text,text,numeric,numeric) from public;
grant execute on function public.bj_request_service(uuid,text,uuid,text,text,text,text,numeric,numeric) to authenticated;
revoke all on function public.bj_offer_quote(uuid,integer) from public;
grant execute on function public.bj_offer_quote(uuid,integer) to authenticated;
revoke all on function public.bj_accept_quote(uuid) from public;
grant execute on function public.bj_accept_quote(uuid) to authenticated;
revoke all on function public.bj_cancel_order(uuid) from public;
grant execute on function public.bj_cancel_order(uuid) to authenticated;
revoke all on function public.bj_review_provider(uuid,boolean) from public;
grant execute on function public.bj_review_provider(uuid,boolean) to authenticated;

-- NUNCA disponibilize service_role, secret key nem senha de banco no navegador.
-- Primeiro administrador (depois de cadastrar uma conta real):
-- insert into public.bj_admins(user_id) values ('UUID_DA_CONTA_QUE_VOCE_CONTROLA');
-- Não alterar status para 'paid' manualmente: somente integração futura com webhook validado.
