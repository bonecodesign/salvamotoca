-- SALVA MOTOCA! F1 / G1 — SOMENTE LEITURA, SEM USUARIOS/REGISTROS NA SAIDA.
-- Rodar manualmente no projeto EXISTENTE somente no momento da exportacao privada.
-- Guardar o JSON gerado FORA do GitHub, fora do ChatGPT e junto a evidencias do dump.
-- A contagem exata NAO prova integridade, origem ou recuperacao dos bytes Storage.
select jsonb_pretty(jsonb_build_object(
 'version',1,
 'project_ref','yivkqyjdeouxnwtwfekc',
 'captured_at',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'snapshot',jsonb_build_object(
   'auth_users',(select count(*)::integer from auth.users),
   'service_requests',(select count(*)::integer from public.service_requests),
   'request_photo_metadata',(select count(*)::integer from storage.objects
     where bucket_id='request-photos'),
   'storage_total',(select count(*)::integer from storage.objects),
   'request_policy_count',(select count(*)::integer from pg_policies
     where schemaname='public' and tablename='service_requests'),
   'storage_policy_count',(select count(*)::integer from pg_policies
     where schemaname='storage' and tablename='objects'),
   'f1_rpc_names',(select count(distinct p.proname)::integer
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and p.proname in ('bj_answer_quote','bj_finish_request',
       'bj_get_request_location','bj_ping_presence','bj_set_presence','bj_submit_quote')),
   'request_bucket_private',(select b.public is false from storage.buckets b
     where b.id='request-photos'),
   'request_rls',(select relrowsecurity from pg_class
     where oid='public.service_requests'::regclass),
   'storage_rls',(select relrowsecurity from pg_class
     where oid='storage.objects'::regclass),
   'anon_can_select_requests',has_table_privilege('anon','public.service_requests','SELECT'),
   'authenticated_can_select_requests',has_table_privilege('authenticated','public.service_requests','SELECT')
 )
)) as f1_private_source_snapshot;
