-- F2: fixture MINIMAL PostgreSQL 17, nunca no projeto Supabase real.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema storage;
create schema private;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

create table public.providers(
 id uuid primary key,owner_id uuid not null,display_name text not null default 'Teste',
 status text not null default 'pending',is_active boolean not null default false,
 city text not null default 'Belo Horizonte',state_code char(2) not null default 'MG',
 latitude numeric,longitude numeric,
 created_at timestamptz not null default now());
create table public.service_categories(
 id smallint primary key,code text not null unique,paid_in_app boolean not null default true);
create table public.provider_services(
 provider_id uuid not null references public.providers(id),
 category_id smallint not null references public.service_categories(id),
 is_active boolean not null default false,
 primary key(provider_id,category_id));
create table public.bj_provider_presence(
 provider_id uuid primary key references public.providers(id),
 online_requested boolean not null default false,
 last_seen_at timestamptz);
create table public.service_requests(
 id uuid primary key default gen_random_uuid(),
 request_key uuid not null default gen_random_uuid() unique,
 customer_id uuid not null,
 category_id smallint not null references public.service_categories(id),
 provider_id uuid references public.providers(id),
 service_types text[],
 problem_description text not null default 'Pneu furado no teste',
 photo_path text,
 motorcycle_brand text,motorcycle_model text,motorcycle_year integer,
 latitude numeric,longitude numeric,address_details text,
 status text not null default 'requested',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now());
create table public.service_quotes(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.service_requests(id),
 provider_id uuid not null references public.providers(id),
 amount_cents integer not null check (amount_cents>0),
 details text not null default '',
 status text not null default 'proposed' check(status in('proposed','accepted','declined','expired')),
 created_at timestamptz not null default now());
create table storage.objects(
 id uuid primary key default gen_random_uuid(),
 bucket_id text not null,name text not null unique);
create table storage.buckets(
 id text primary key,public boolean not null default false);
insert into storage.buckets(id,public) values('request-photos',false);

alter table public.providers enable row level security;
alter table public.service_requests enable row level security;
alter table public.service_quotes enable row level security;
alter table storage.objects enable row level security;
create policy provider_read on public.providers
 for select to authenticated using(true);
create policy request_participants_read on public.service_requests
 for select to authenticated using
 (customer_id=(select auth.uid())
 or exists(select 1 from public.providers p where p.id=provider_id and p.owner_id=(select auth.uid())));
create policy quote_participants_read on public.service_quotes
 for select to authenticated using (
   exists(select 1 from public.service_requests r where r.id=request_id and r.customer_id=(select auth.uid()))
   or exists(select 1 from public.providers p where p.id=provider_id and p.owner_id=(select auth.uid())));
create policy storage_owner_select on storage.objects for select to authenticated
 using(bucket_id='request-photos' and split_part(name,'/',1)= (select auth.uid())::text);
grant usage on schema auth,storage,public to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
grant select on public.providers to authenticated;
grant select(id,customer_id,category_id,provider_id,service_types,problem_description,photo_path,
 motorcycle_brand,motorcycle_model,motorcycle_year,status,created_at,updated_at)
 on public.service_requests to authenticated;
grant select on public.service_quotes to authenticated;
grant select on storage.objects to authenticated;
-- Sem grant de escrita em tabelas de pedido/orçamentos ao browser.
