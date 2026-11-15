-- F1 / Salva Motoca! — fixture FICTICIA para ensaio de dump e restore.
-- Executar APENAS em PostgreSQL 17 descartavel no CI, nunca no Supabase hospedado.
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists private;
create function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

create table auth.users (
 id uuid primary key,
 email text not null unique
);
insert into auth.users(id,email)
values ('11111111-1111-4111-8111-111111111111','a@sample.invalid');

create table storage.buckets (
 id text primary key,
 public boolean not null default false
);
insert into storage.buckets(id,public) values('request-photos',false);
create table storage.objects (
 name text primary key,
 bucket_id text not null references storage.buckets(id)
);
-- APENAS METADADOS: conteudo de arquivo e objeto fisico SEPARADO.
insert into storage.objects(name,bucket_id)
values('synthetic/fixture.jpg','request-photos');

create table public.service_requests (
 id uuid primary key,
 customer_id uuid not null,
 status text not null default 'requested',
 photo_path text
);
insert into public.service_requests(id,customer_id,status,photo_path)
values ('22222222-2222-4222-8222-222222222222',
 '11111111-1111-4111-8111-111111111111','requested','synthetic/fixture.jpg');

create table private.backup_rehearsal_marker (
 id integer primary key check(id=1),
 note text not null
);
insert into private.backup_rehearsal_marker(id,note)
values(1,'CI_OFFLINE_SYNTHETIC_ONLY');

revoke all on auth.users,storage.buckets,storage.objects,
 public.service_requests,private.backup_rehearsal_marker
 from public,anon,authenticated;
alter table public.service_requests enable row level security;
alter table storage.objects enable row level security;
create policy f1_owner_read on public.service_requests
 for select to authenticated using(customer_id=(select auth.uid()));
grant usage on schema auth to authenticated;
revoke all on function auth.uid() from public,anon,authenticated;
grant execute on function auth.uid() to authenticated;
grant select on public.service_requests to authenticated;
-- Nenhum dado real do projeto Supabase esta nesta fixture.
