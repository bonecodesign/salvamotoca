-- F1: schema minimo de Supabase isolado para testar a migration no PostgreSQL 17.
-- Apenas fixtures; NAO executar no banco Supabase real.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function storage.foldername(object_name text) returns text[]
language sql immutable
as $$ select array[split_part(object_name, '/', 1)] $$;

create table public.providers (
  id uuid primary key,
  owner_id uuid not null
);
create table public.service_requests (
  id uuid primary key,
  request_key uuid not null unique,
  customer_id uuid not null,
  provider_id uuid,
  address_details text,
  latitude numeric,
  longitude numeric
);
create table storage.buckets (
  id text primary key, name text not null, public boolean not null,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id bigint generated always as identity primary key,
  bucket_id text not null references storage.buckets(id),
  name text not null unique
);
alter table public.service_requests enable row level security;
alter table storage.objects enable row level security;
create policy "test_customer_request_insert" on public.service_requests
for insert to authenticated with check (customer_id = (select auth.uid()));
create policy "test_request_participants_read" on public.service_requests
for select to authenticated using (
  customer_id = (select auth.uid())
  or exists (select 1 from public.providers p
    where p.id = service_requests.provider_id and p.owner_id = (select auth.uid()))
);
create policy "test_providers_read" on public.providers
for select to authenticated using (true);
alter table public.providers enable row level security;

grant usage on schema auth,storage,public to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
grant execute on function storage.foldername(text) to authenticated,anon;
grant select on public.providers to authenticated;
-- Espelha privilegios do projeto real: SELECT apenas por coluna,
-- sem leitura direta de endereco, latitude, longitude ou request_key.
grant select (id,customer_id,provider_id) on public.service_requests to authenticated;
grant insert on public.service_requests to authenticated;
grant select,insert,delete on storage.objects to authenticated;
grant select on storage.objects to anon;
