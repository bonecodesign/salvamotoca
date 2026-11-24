-- Historical TESTES snapshot only. NEVER run on hosted Supabase.
-- Invoke through scripts/g1-reconcile-historical-local.py, never manually against a URL.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('g1.expected_data_directory', :'expected_data_directory', true);
DO $guard$
BEGIN
 IF current_database() <> 'postgres' OR current_user <> 'postgres'
 OR inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'
 OR current_setting('data_directory') <> current_setting('g1.expected_data_directory')
 OR current_setting('server_version_num')::int / 10000 <> 17
 THEN RAISE EXCEPTION 'G1_WRONG_DESTINATION'; END IF;
 IF (SELECT count(*) FROM auth.users) <> 0 OR (SELECT count(*) FROM storage.objects) <> 0
 OR (SELECT count(*) FROM public.prestadores_prospeccao) <> 36
 OR (SELECT count(*) FROM public.ofertas_prospeccao) <> 40
 OR (SELECT count(*) FROM public.configuracao_comercial) <> 1
 OR (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 11
 THEN RAISE EXCEPTION 'G1_HISTORICAL_SCOPE_MISMATCH'; END IF;
 IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='request-photos' AND NOT public AND file_size_limit=5242880 AND allowed_mime_types=ARRAY['image/jpeg']::text[])
 THEN RAISE EXCEPTION 'G1_BUCKET_MISMATCH'; END IF;
END
$guard$;
CREATE TEMP VIEW g1_catalog AS WITH rel AS (SELECT c.oid,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','S')), fn AS (SELECT p.*,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private')), audit AS (SELECT 'relation_acl' k, jsonb_build_array(r.relname,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,a.grantor::regrole::text,a.privilege_type,a.is_grantable) v FROM rel r CROSS JOIN LATERAL aclexplode(coalesce(r.relacl,acldefault(CASE WHEN r.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,r.relowner))) a UNION ALL SELECT 'column_acl',jsonb_build_array(r.relname,p.attname,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,a.grantor::regrole::text,a.privilege_type,a.is_grantable) FROM rel r JOIN pg_attribute p ON p.attrelid=r.oid CROSS JOIN LATERAL aclexplode(p.attacl) a UNION ALL SELECT 'function_acl',jsonb_build_array(f.nspname,f.proname,pg_get_function_identity_arguments(f.oid),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,a.grantor::regrole::text,a.privilege_type,a.is_grantable) FROM fn f CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a UNION ALL SELECT 'functions',jsonb_build_array(f.nspname,f.proname,f.proowner::regrole::text,pg_get_functiondef(f.oid)) FROM fn f UNION ALL SELECT 'policies',jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) FROM pg_policies WHERE schemaname='public' OR (schemaname='storage' AND tablename='objects') UNION ALL SELECT 'constraints',jsonb_build_array(r.relname,c.conname,c.convalidated,pg_get_constraintdef(c.oid,true)) FROM rel r JOIN pg_constraint c ON c.conrelid=r.oid UNION ALL SELECT 'indexes',jsonb_build_array(r.relname,i.relname,x.indisvalid,x.indisready,pg_get_indexdef(i.oid)) FROM rel r JOIN pg_index x ON x.indrelid=r.oid JOIN pg_class i ON i.oid=x.indexrelid UNION ALL SELECT 'triggers',jsonb_build_array(r.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) FROM rel r JOIN pg_trigger t ON t.tgrelid=r.oid WHERE NOT t.tgisinternal UNION ALL SELECT 'rls',jsonb_build_array(r.relname,r.relowner::regrole::text,r.relrowsecurity,r.relforcerowsecurity) FROM rel r WHERE r.relkind='r') SELECT k,count(*) n,md5(string_agg(v::text,E'\n' ORDER BY v::text)) digest FROM audit GROUP BY k;
CREATE TEMP TABLE g1_expected(k text PRIMARY KEY,n bigint,digest text);
INSERT INTO g1_expected VALUES
('column_acl',36,'84150992bbd2954ae5d09390c5c5fe5c'),
('constraints',65,'fd84a3e8ef482daf0a20d42eb26c1f41'),
('function_acl',29,'469d646c768a49b16cbf3ff02f47cf50'),
('functions',9,'b74739d2d4f1c667a84be82426a2d42a'),
('indexes',29,'45b96029b2305a33a2753c95aa18619f'),
('policies',20,'281ac188b19a9776aa6acea92265d7f6'),
('relation_acl',234,'169d2028a98afc99ed18aa1a99fe57cf'),
('rls',13,'6e7ac4f0cd5fc614b1f6c5158fbb80ca'),
('triggers',2,'10e04649575d9ab755f3ea9205d52e4c');
DO $pre$
BEGIN
 IF EXISTS(SELECT 1 FROM g1_expected e LEFT JOIN g1_catalog c USING(k) WHERE e.k IN ('constraints','functions','indexes','rls','triggers') AND (e.n IS DISTINCT FROM c.n OR e.digest IS DISTINCT FROM c.digest))
 THEN RAISE EXCEPTION 'G1_PREEXISTING_SCHEMA_MISMATCH'; END IF;
END
$pre$;
-- Only known historical application objects. No dynamic user-provided SQL.
REVOKE ALL PRIVILEGES ON TABLE public.app_profiles, public.bj_provider_presence, public.bj_request_attempts, public.configuracao_comercial, public.ofertas_prospeccao, public.payment_records, public.prestadores_prospeccao, public.provider_services, public.providers, public.request_messages, public.service_categories, public.service_quotes, public.service_requests FROM PUBLIC, anon, authenticated, service_role;
-- Relation-level revoke does not necessarily remove independent column ACLs.
DO $columns$
DECLARE r record;
BEGIN
 FOR r IN SELECT c.relname,a.attname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relname=ANY(ARRAY['app_profiles','bj_provider_presence','bj_request_attempts','configuracao_comercial','ofertas_prospeccao','payment_records','prestadores_prospeccao','provider_services','providers','request_messages','service_categories','service_quotes','service_requests']) AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL LOOP
 EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',r.attname,r.relname);
 END LOOP;
END
$columns$;
REVOKE ALL ON SEQUENCE public.service_categories_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.app_profiles, public.bj_provider_presence, public.bj_request_attempts, public.configuracao_comercial, public.ofertas_prospeccao, public.payment_records, public.prestadores_prospeccao, public.provider_services, public.providers, public.request_messages, public.service_categories, public.service_quotes, public.service_requests TO service_role;
GRANT INSERT,SELECT,UPDATE ON public.app_profiles TO authenticated;
GRANT SELECT ON public.payment_records,public.service_quotes TO authenticated;
GRANT INSERT,SELECT ON public.provider_services,public.providers,public.request_messages TO authenticated;
GRANT SELECT ON public.service_categories TO anon,authenticated;
GRANT INSERT ON public.service_requests TO authenticated;
GRANT ALL ON SEQUENCE public.service_categories_id_seq TO anon,authenticated,service_role;
GRANT SELECT(last_seen_at,online_requested,provider_id,updated_at) ON public.bj_provider_presence TO anon,authenticated;
GRANT SELECT(category_id,is_active,provider_id) ON public.provider_services TO anon;
GRANT SELECT(approved_at,city,created_at,description,display_name,id,is_active,latitude,longitude,state_code,status,street_address) ON public.providers TO anon;
GRANT SELECT(category_id,created_at,customer_id,id,motorcycle_brand,motorcycle_model,motorcycle_year,photo_path,problem_description,provider_id,service_types,status,updated_at) ON public.service_requests TO authenticated;
REVOKE ALL ON FUNCTION public.bj_answer_quote(uuid,boolean), public.bj_finish_request(uuid), public.bj_get_request_location(uuid), public.bj_ping_presence(), public.bj_set_presence(boolean), public.bj_submit_quote(uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bj_answer_quote(uuid,boolean), public.bj_finish_request(uuid), public.bj_get_request_location(uuid), public.bj_ping_presence(), public.bj_set_presence(boolean), public.bj_submit_quote(uuid,integer,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.bj_online_providers(),public.sm_f1_verify_photo_exists(),private.bj_track_initial_attempt() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.bj_online_providers() TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sm_f1_verify_photo_exists() TO PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.bj_track_initial_attempt() TO PUBLIC;
DROP POLICY IF EXISTS f1_request_photo_author_upload ON storage.objects;
DROP POLICY IF EXISTS f1_request_photo_participants_read ON storage.objects;
DROP POLICY IF EXISTS f1_request_photo_author_delete ON storage.objects;
create policy "f1_request_photo_author_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'request-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  );

-- O autor pode consultar a propria foto.
-- O prestador designado pode consultar apenas a foto do pedido que lhe pertence.
-- Quando o prestador for trocado, o antigo perde autorizacao para gerar novas URLs.
create policy "f1_request_photo_participants_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'request-photos' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.service_requests r
        join public.providers p on p.id = r.provider_id
        where r.photo_path = storage.objects.name
          and p.owner_id = (select auth.uid())
      )
    )
  );

-- Limpeza somente de arquivos ainda nao vinculados a pedidos.
create policy "f1_request_photo_author_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'request-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.service_requests r
      where r.photo_path = storage.objects.name
        and r.customer_id = (select auth.uid())
    )
  );


DO $post$
BEGIN
 IF EXISTS(SELECT 1 FROM g1_expected e FULL JOIN g1_catalog c USING(k) WHERE e.n IS DISTINCT FROM c.n OR e.digest IS DISTINCT FROM c.digest)
 THEN RAISE EXCEPTION 'G1_FINAL_CATALOG_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon',p.oid,'EXECUTE'))
 THEN RAISE EXCEPTION 'G1_ANON_RPC_EXECUTE'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)
 THEN RAISE EXCEPTION 'G1_STORAGE_RLS_DISABLED'; END IF;
END
$post$;
COMMIT;
\echo G1_HISTORICAL_CATALOG_RECONCILIATION=PASS
