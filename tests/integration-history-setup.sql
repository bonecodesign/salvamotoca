-- Minimal platform dependencies, not native Supabase Auth/Storage.
create role anon nologin;
create role authenticated nologin;
create schema extensions;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable
as $uid$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $uid$;
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create function storage.foldername(name text) returns text[] language sql immutable
as $folder$ select (string_to_array(name,'/'))[1:1] $folder$;
alter table storage.objects enable row level security;
grant usage on schema auth,storage to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
grant select,insert,delete on storage.objects to authenticated;
