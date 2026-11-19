-- SM-AUD-001 — PRECHECK INFORMATIVO, SOMENTE LEITURA.
-- Banco-alvo ao usar no Studio: somente Supabase já existente do
-- Salva Motoca! (ambiente de testes), nunca outro projeto.
-- Este arquivo NÃO contém DDL, DML, chamadas de RPCs com efeitos,
-- funções que escrevem, secrets nem dados de usuário.
-- NÃO comprova backup nem restauração, não autoriza o piloto.
-- Deve ser executado por administrador com privilégios adequados.

select jsonb_build_object(
  'project_purpose','existing_staging_only',
  'server_version',current_setting('server_version'),
  'checks',jsonb_build_object(
    'auth_users',(select count(*) from auth.users),
    'service_requests',(select count(*) from public.service_requests),
    'registered_providers',(select count(*) from public.providers),
    'service_quotes',(select count(*) from public.service_quotes),
    'payment_records',(select count(*) from public.payment_records),
    'request_messages',(select count(*) from public.request_messages),
    'stored_objects',(select count(*) from storage.objects),
    'prospecting_provider_rows',(select count(*) from public.prestadores_prospeccao),
    'prospecting_offer_rows',(select count(*) from public.ofertas_prospeccao),
    'commercial_config_rows',(select count(*) from public.configuracao_comercial)
  ),
  'storage_buckets',(select jsonb_agg(jsonb_build_object(
    'bucket_id',b.id,
    'is_public',b.public,
    'max_bytes',b.file_size_limit,
    'allowed_types',b.allowed_mime_types)) from storage.buckets b),
  'public_rls',(select jsonb_agg(jsonb_build_object(
    'table',c.relname,'rls',c.relrowsecurity,
    'policy_count',(select count(*) from pg_policies p
      where p.schemaname='public' and p.tablename=c.relname))
     order by c.relname)
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in('r','p')),
  'security_definer_rpc',(select jsonb_agg(jsonb_build_object(
    'function_name',p.proname,
    'anon_executable',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated_executable',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'uses_auth_uid',position('auth.uid()' in pg_get_functiondef(p.oid))>0,
    'locked_search_path',position('SET search_path TO ''''' in pg_get_functiondef(p.oid))>0)
    order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef)
) as read_only_audit;

-- CONFIRMAÇÃO FINAL:
-- A consulta acima apenas lê catálogos e contagens; não mudou nenhuma linha.
-- O armazenamento de arquivos físicos do Storage NÃO é validado por SELECT.
-- G1 BACKUP/RESTAURAÇÃO = PENDENTE; F1/F2/F3 = NÃO LIBERADAS.
