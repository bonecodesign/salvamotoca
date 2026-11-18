-- Salva Motoca! F1–F5: inventory-only hosted SQL (NO writes, no personal data).
-- Intended ONLY for the existing Supabase project yivkqyjdeouxnwtwfekc.
-- Run read-only on demand; do not use to declare G1 proof or HTTP Auth PASS.
-- Never COPY/dump rows of auth.users, requests, quotes or Storage objects here.

select current_database() as db_name, current_setting('server_version') as pg_version,
 pg_catalog.clock_timestamp() as checked_at_utc;

select
 (select count(*) from auth.users) as auth_user_count,
 (select count(*) from public.service_requests) as request_count,
 (select count(*) from public.service_quotes) as quote_count,
 (select count(*) from storage.objects where bucket_id='request-photos') as f1_photo_count;

select id,public,allowed_mime_types,file_size_limit
 from storage.buckets where id='request-photos';

select n.nspname as schema,c.relname as table_name,c.relrowsecurity as rls_enabled
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where (n.nspname='public' and c.relname in
  ('service_requests','service_quotes','providers','payment_records'))
  or (n.nspname='storage' and c.relname='objects')
 order by n.nspname,c.relname;

select a.attname as field,
 has_column_privilege('authenticated',c.oid,a.attnum,'SELECT') as auth_can_select,
 has_column_privilege('anon',c.oid,a.attnum,'SELECT') as anon_can_select
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=c.oid
 where n.nspname='public' and c.relname='service_requests'
  and a.attnum>0 and not a.attisdropped
  and a.attname in ('id','customer_id','provider_id','photo_path',
   'latitude','longitude','address_details','request_key')
 order by a.attnum;

select schemaname,tablename,policyname,cmd,roles,qual,with_check
 from pg_policies where
 (schemaname='public' and tablename in ('service_requests','service_quotes'))
 or (schemaname='storage' and tablename='objects' and policyname like 'f1_%')
 order by schemaname,tablename,policyname;

select p.proname,pg_get_function_identity_arguments(p.oid) as signature,
 p.prosecdef as security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_can_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in(
 'bj_answer_quote','bj_finish_request','bj_get_request_location',
 'bj_ping_presence','bj_set_presence','bj_submit_quote')
 order by p.proname;

-- NOT a dynamic security probe:
-- - privileges and RLS settings alone do not verify behavior with real JWTs
-- - old RPCs have side effects; do not invoke them here
-- - this query does not prove backup/restore of Database, Auth or Storage
