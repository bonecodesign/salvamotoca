-- Salva Motoca! — espelho comportamental de 5 RPCs F1, inteiramente sintético.
-- PostgreSQL 17 DESCARTÁVEL. Não é migration. Não executar no Supabase hospedado.
-- O espelho preserva fluxos essenciais encontrados na leitura de 16/11/2026,
-- NÃO é cópia assinada das funções em produção, nem prova de exploração real.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable set search_path=''
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
revoke all on function auth.uid() from public,anon,authenticated;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant usage on schema private to authenticated;

create table public.service_categories(
 id smallint primary key,code text not null unique
);
create table public.providers(
 id uuid primary key,owner_id uuid not null,
 status text not null check(status in('approved','pending','suspended')),
 is_active boolean not null,city text not null default 'BH',
 latitude numeric,longitude numeric,
 created_at timestamptz not null default now()
);
create table public.provider_services(
 provider_id uuid not null references public.providers(id),
 category_id smallint not null references public.service_categories(id),
 is_active boolean not null,
 primary key(provider_id,category_id)
);
create table public.bj_provider_presence(
 provider_id uuid primary key references public.providers(id),
 online_requested boolean not null default false,
 last_seen_at timestamptz,updated_at timestamptz not null default now()
);
create table public.service_requests(
 id uuid primary key,customer_id uuid not null,
 provider_id uuid references public.providers(id),
 status text not null check(status in(
  'requested','quoted','awaiting_payment','no_provider','cancelled',
  'accepted','in_progress','completed')),
 category_id smallint not null references public.service_categories(id),
 latitude numeric,longitude numeric,updated_at timestamptz default now()
);
create table public.service_quotes(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.service_requests(id),
 provider_id uuid not null references public.providers(id),
 amount_cents integer not null check(amount_cents between 100 and 500000),
 details text not null default '',
 status text not null check(status in('proposed','accepted','declined','expired'))
);
create table public.payment_records(
 request_id uuid primary key references public.service_requests(id),
 status text not null check(status in(
  'pending','authorized','paid','refunded','failed','disputed','chargeback'))
);
create table public.bj_request_attempts(
 request_id uuid not null references public.service_requests(id),
 provider_id uuid not null references public.providers(id),
 rejection_count integer not null default 0,
 last_declined_at timestamptz,
 primary key(request_id,provider_id)
);
create table private.f1_rpc_mock_gates(
 singleton boolean primary key default true check(singleton),
 quote_enabled boolean not null default false,
 presence_enabled boolean not null default false,
 cancel_enabled boolean not null default false
);
insert into private.f1_rpc_mock_gates(singleton) values(true);
create table private.f1_quote_pricing_mock(
 quote_id uuid primary key references public.service_quotes(id),
 request_id uuid not null references public.service_requests(id),
 provider_id uuid not null references public.providers(id),
 service_cents integer not null check(service_cents between 100 and 500000),
 travel_cents integer not null check(travel_cents between 0 and 500000),
 rider_fee_cents integer not null,
 provider_fee_cents integer not null,
 customer_total_cents integer not null,
 provider_receivable_cents integer not null,
 materials_included boolean not null default true check(materials_included),
 check (rider_fee_cents=(service_cents+5)/10),
 check (provider_fee_cents=(service_cents+5)/10),
 check (customer_total_cents=service_cents+travel_cents+rider_fee_cents),
 check (provider_receivable_cents=service_cents+travel_cents-provider_fee_cents)
);
revoke all on public.service_categories,public.providers,public.provider_services,
 public.bj_provider_presence,public.service_requests,public.service_quotes,
 public.payment_records,public.bj_request_attempts,
 private.f1_rpc_mock_gates,private.f1_quote_pricing_mock
 from public,anon,authenticated;
alter table public.service_requests enable row level security;
alter table public.service_quotes enable row level security;
alter table public.payment_records enable row level security;
alter table public.bj_provider_presence enable row level security;

-- Réplicas comportamentais para comparar o contrato legado, SEM qualquer PSP.
-- Os mocks de baseline nunca devem ser promovidos para produção.
create function private.f1_baseline_submit_quote(
 p_request_id uuid,p_amount_cents integer,p_details text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();v_provider uuid;v_status text;v_quote uuid;
begin
 if v_owner is null or p_amount_cents not between 100 and 500000
   or char_length(coalesce(p_details,''))>350
 then raise exception 'Orcamento invalido'; end if;
 if coalesce(p_details,'') ~*
   '(https?://|www[.]|wa[.]me|whats[[:space:]]*app|chave[[:space:]]*pix|@[-_[:alnum:].]+|([0-9][[:space:]().-]*){9,})'
 then raise exception 'Contato externo'; end if;
 select r.provider_id,r.status into v_provider,v_status
 from public.service_requests r where r.id=p_request_id for update;
 if v_provider is null or v_status<>'requested' or not exists(
  select 1 from public.providers p where p.id=v_provider
    and p.owner_id=v_owner and p.status='approved' and p.is_active
 ) then raise exception 'Pedido nao autorizado'; end if;
 insert into public.service_quotes(request_id,provider_id,amount_cents,details,status)
 values(p_request_id,v_provider,p_amount_cents,trim(coalesce(p_details,'')),'proposed')
 returning id into v_quote;
 update public.service_requests set status='quoted',updated_at=now()
 where id=p_request_id;
 return v_quote;
end $$;

create function private.f1_baseline_answer_quote(p_quote_id uuid,p_accept boolean)
returns text language plpgsql security definer set search_path='' as $$
declare v_customer uuid:=auth.uid();v_order uuid;v_provider uuid;
 v_quote_status text;v_owner uuid;v_order_status text;
begin
 if v_customer is null or p_accept is null then raise exception 'Login obrigatorio'; end if;
 select q.request_id,q.provider_id,q.status,r.customer_id,r.status
 into v_order,v_provider,v_quote_status,v_owner,v_order_status
 from public.service_quotes q join public.service_requests r on r.id=q.request_id
 where q.id=p_quote_id for update of q,r;
 if v_order is null or v_owner<>v_customer
 or v_quote_status<>'proposed' or v_order_status<>'quoted'
 or not exists(select 1 from public.service_requests r
   where r.id=v_order and r.provider_id=v_provider)
 then raise exception 'Orcamento nao autorizado'; end if;
 if p_accept then
  update public.service_quotes set status='accepted' where id=p_quote_id;
  update public.service_requests set status='awaiting_payment',updated_at=now()
  where id=v_order;
  return 'awaiting_payment';
 end if;
 update public.service_quotes set status='declined' where id=p_quote_id;
 update public.service_requests set status='no_provider',provider_id=null
 where id=v_order;
 return 'no_provider';
end $$;

create function private.f1_baseline_finish_request(p_request_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_owner uuid;v_status text;v_customer uuid:=auth.uid();
begin
 if v_customer is null then raise exception 'Login obrigatorio'; end if;
 select customer_id,status into v_owner,v_status
 from public.service_requests where id=p_request_id for update;
 if v_owner is null or v_owner<>v_customer then raise exception 'Nao autorizado'; end if;
 if v_status='cancelled' then return 'cancelled'; end if;
 if v_status not in('requested','quoted','no_provider','awaiting_payment')
 then raise exception 'Estado invalido'; end if;
 if exists(select 1 from public.payment_records
   where request_id=p_request_id and status in('authorized','paid'))
 then raise exception 'Suporte financeiro'; end if;
 update public.service_quotes set status='expired'
  where request_id=p_request_id and status='proposed';
 update public.service_requests set status='cancelled',updated_at=now()
  where id=p_request_id;
 return 'cancelled';
end $$;

create function private.f1_baseline_set_presence(p_online boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();v_provider uuid;
begin
 if v_owner is null or p_online is null then raise exception 'Acesso negado'; end if;
 select p.id into v_provider from public.providers p
 where p.owner_id=v_owner and (not p_online or(p.status='approved' and p.is_active));
 if v_provider is null then raise exception 'Prestador invalido'; end if;
 if p_online and not exists(
  select 1 from public.provider_services ps
  join public.service_categories c on c.id=ps.category_id
  where ps.provider_id=v_provider and ps.is_active
   and c.code='borracharia_delivery'
 ) then raise exception 'Delivery nao habilitado'; end if;
 insert into public.bj_provider_presence(provider_id,online_requested,last_seen_at,updated_at)
 values(v_provider,p_online,case when p_online then now() else null end,now())
 on conflict(provider_id) do update set
  online_requested=excluded.online_requested,
  last_seen_at=excluded.last_seen_at,updated_at=now();
 return p_online;
end $$;

create function private.f1_baseline_ping_presence()
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();v_updated boolean:=false;
begin
 if v_owner is null then return false; end if;
 update public.bj_provider_presence presence
 set last_seen_at=now(),updated_at=now()
 from public.providers p
 where presence.provider_id=p.id and p.owner_id=v_owner
  and p.status='approved' and p.is_active and presence.online_requested;
 v_updated:=found;
 return v_updated;
end $$;

-- Candidatos alternativos em schema privado, NUNCA executados no Supabase real.
-- IMPORTANTE: enquanto as RPCs antigas estiverem expostas, estas novas guards
-- sozinhas NAO endurecem producao: a substituicao exige revisao e rollout.
create function private.f1_guarded_submit_quote(
 p_request_id uuid,p_service_cents integer,p_travel_cents integer,
 p_details text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();v_req public.service_requests%rowtype;
 v_fee integer;v_quote uuid;
begin
 if v_owner is null or not exists(
  select 1 from private.f1_rpc_mock_gates where singleton and quote_enabled
 ) then raise exception 'F2 bloqueada'; end if;
 if p_service_cents is null or p_travel_cents is null
 or p_service_cents not between 100 and 500000
 or p_travel_cents not between 0 and 500000
 or p_service_cents+p_travel_cents>500000
 then raise exception 'Service/travel invalidos; materiais inclusos'; end if;
 select * into v_req from public.service_requests r
 where r.id=p_request_id for update;
 if v_req.id is null or v_req.status<>'requested'
 or not exists(
  select 1 from public.providers p
  join public.provider_services ps on ps.provider_id=p.id
  where p.id=v_req.provider_id and p.owner_id=v_owner
    and p.status='approved' and p.is_active
    and ps.category_id=v_req.category_id and ps.is_active
 )
 or not exists(
  select 1 from public.bj_provider_presence pr
  where pr.provider_id=v_req.provider_id and pr.online_requested
  and pr.last_seen_at>=now()-interval '90 seconds'
 ) then raise exception 'Prestador, categoria ou presenca nao elegiveis'; end if;
 v_quote:=private.f1_baseline_submit_quote(
   p_request_id,p_service_cents+p_travel_cents,p_details);
 v_fee:=(p_service_cents+5)/10;
 insert into private.f1_quote_pricing_mock(
  quote_id,request_id,provider_id,service_cents,travel_cents,
  rider_fee_cents,provider_fee_cents,customer_total_cents,
  provider_receivable_cents,materials_included
 ) values(v_quote,v_req.id,v_req.provider_id,p_service_cents,p_travel_cents,
   v_fee,v_fee,p_service_cents+p_travel_cents+v_fee,
   p_service_cents+p_travel_cents-v_fee,true);
 return v_quote;
end $$;

create function private.f1_guarded_answer_quote(p_quote_id uuid,p_accept boolean)
returns text language plpgsql security definer set search_path='' as $$
declare v_customer uuid:=auth.uid();v_quote public.service_quotes%rowtype;
 v_req public.service_requests%rowtype;
begin
 if v_customer is null or p_accept is null or not exists(
  select 1 from private.f1_rpc_mock_gates where singleton and quote_enabled
 ) then raise exception 'Decisao F2 bloqueada'; end if;
 select * into v_quote from public.service_quotes where id=p_quote_id for update;
 if v_quote.id is null then raise exception 'Proposta nao existe'; end if;
 select * into v_req from public.service_requests r where id=v_quote.request_id for update;
 if v_req.customer_id<>v_customer or v_req.status<>'quoted'
  or v_req.provider_id<>v_quote.provider_id or v_quote.status<>'proposed'
  or exists(select 1 from public.payment_records pay where pay.request_id=v_req.id)
  or not exists(
    select 1 from public.providers p
    join public.provider_services ps on ps.provider_id=p.id
    where p.id=v_quote.provider_id and p.status='approved' and p.is_active
     and ps.category_id=v_req.category_id and ps.is_active
  )
  or not exists(
    select 1 from public.bj_provider_presence pr where pr.provider_id=v_quote.provider_id
    and pr.online_requested and pr.last_seen_at>=now()-interval '90 seconds'
  )
  or not exists(
    select 1 from private.f1_quote_pricing_mock c
    where c.quote_id=v_quote.id and c.request_id=v_req.id
      and c.provider_id=v_quote.provider_id
      and c.service_cents+c.travel_cents=v_quote.amount_cents
      and c.customer_total_cents=v_quote.amount_cents+c.rider_fee_cents
  )
 then raise exception 'Decisao ou prestador nao autorizados'; end if;
 return private.f1_baseline_answer_quote(p_quote_id,p_accept);
end $$;

create function private.f1_guarded_finish_request(p_request_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_customer uuid:=auth.uid();v_req public.service_requests%rowtype;
begin
 if v_customer is null or not exists(
  select 1 from private.f1_rpc_mock_gates where singleton and cancel_enabled
 ) then raise exception 'Encerramento financeiro bloqueado'; end if;
 select * into v_req from public.service_requests where id=p_request_id for update;
 if v_req.id is null or v_req.customer_id<>v_customer
 then raise exception 'Pedido de outro cliente'; end if;
 if v_req.status='cancelled' then return 'cancelled'; end if;
 -- Sem reconciliação PSP, QUALQUER linha em payment_records exige suporte.
 if exists(select 1 from public.payment_records pay where pay.request_id=p_request_id)
 then raise exception 'Analise humana financeira obrigatoria'; end if;
 return private.f1_baseline_finish_request(p_request_id);
end $$;

create function private.f1_guarded_set_presence(p_online boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();v_provider public.providers%rowtype;
begin
 if v_owner is null or p_online is null then raise exception 'Identidade invalida'; end if;
 select * into v_provider from public.providers p where p.owner_id=v_owner for update;
 if v_provider.id is null then raise exception 'Prestador nao pertence ao ator'; end if;
 if p_online and (
   not exists(select 1 from private.f1_rpc_mock_gates
     where singleton and presence_enabled)
   or v_provider.status<>'approved' or not v_provider.is_active
   or not exists(
     select 1 from public.provider_services ps
     join public.service_categories c on c.id=ps.category_id
     where ps.provider_id=v_provider.id and ps.is_active
       and c.code in ('borracharia_delivery','reboque_moto')
   )
 ) then raise exception 'F1/F3 offline ou prestador descredenciado'; end if;
 -- Desligar a disponibilidade e seguro mesmo com gate operacional desligado.
 insert into public.bj_provider_presence(provider_id,online_requested,last_seen_at,updated_at)
 values(v_provider.id,p_online,case when p_online then now() else null end,now())
 on conflict(provider_id) do update set
  online_requested=excluded.online_requested,
  last_seen_at=excluded.last_seen_at,updated_at=now();
 return p_online;
end $$;

create function private.f1_guarded_ping_presence()
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();v_enabled boolean;
begin
 if v_owner is null then return false; end if;
 select presence_enabled into v_enabled from private.f1_rpc_mock_gates
 where singleton;
 -- Revoga offline quando o serviço se descredenciou, sem confiar no cliente.
 update public.bj_provider_presence pr
 set online_requested=false,last_seen_at=null,updated_at=now()
 from public.providers p
 where pr.provider_id=p.id and p.owner_id=v_owner and pr.online_requested
 and (not coalesce(v_enabled,false) or p.status<>'approved' or not p.is_active
 or not exists(
   select 1 from public.provider_services ps
   join public.service_categories c on c.id=ps.category_id
   where ps.provider_id=p.id and ps.is_active
    and c.code in('borracharia_delivery','reboque_moto')
 ));
 if not coalesce(v_enabled,false) then return false; end if;
 update public.bj_provider_presence pr
 set last_seen_at=now(),updated_at=now()
 from public.providers p
 where pr.provider_id=p.id and p.owner_id=v_owner
  and p.status='approved' and p.is_active and pr.online_requested
  and pr.last_seen_at>=now()-interval '90 seconds'
  and exists(
    select 1 from public.provider_services ps
    join public.service_categories c on c.id=ps.category_id
    where ps.provider_id=p.id and ps.is_active
     and c.code in('borracharia_delivery','reboque_moto')
  );
 return found;
end $$;

revoke all on function private.f1_baseline_submit_quote(uuid,integer,text),
 private.f1_baseline_answer_quote(uuid,boolean),
 private.f1_baseline_finish_request(uuid),
 private.f1_baseline_set_presence(boolean),
 private.f1_baseline_ping_presence(),
 private.f1_guarded_submit_quote(uuid,integer,integer,text),
 private.f1_guarded_answer_quote(uuid,boolean),
 private.f1_guarded_finish_request(uuid),
 private.f1_guarded_set_presence(boolean),
 private.f1_guarded_ping_presence()
 from public,anon,authenticated;
grant execute on function
 private.f1_guarded_submit_quote(uuid,integer,integer,text),
 private.f1_guarded_answer_quote(uuid,boolean),
 private.f1_guarded_finish_request(uuid),
 private.f1_guarded_set_presence(boolean),
 private.f1_guarded_ping_presence()
 to authenticated;

-- Todas as identidades e preços abaixo são fictícios.
insert into public.service_categories(id,code)
values(1,'borracharia_delivery'),(2,'reboque_moto');
insert into public.providers(id,owner_id,status,is_active,city)
values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222','approved',true,'BH'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '44444444-4444-4444-8444-444444444444','approved',true,'BH'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '66666666-6666-4666-8666-666666666666','approved',true,'BH');
insert into public.provider_services(provider_id,category_id,is_active)
values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,true),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',2,true);
insert into public.bj_provider_presence(provider_id,online_requested,last_seen_at)
values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false,null),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',false,null);
insert into public.service_requests(id,customer_id,provider_id,status,category_id)
values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','requested',1),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '11111111-1111-4111-8111-111111111111',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','requested',2),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','awaiting_payment',1);
