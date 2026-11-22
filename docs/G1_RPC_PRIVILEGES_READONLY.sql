-- G1 / Salva Motoca! / somente SELECT: inventário seguro dos RPCs SECURITY DEFINER.
-- Resultado: JSON de METADADOS, sem corpos de funções, senhas ou linhas de negócio.
-- Fonte: projeto Supabase de TESTES yivkqyjdeouxnwtwfekc.
-- Uma validação de padrões NÃO substitui testes de autorização com sessões reais.
-- Rodar sob autorização administrativa somente em modo de LEITURA.
WITH g1_functions AS (
 SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) signature,
        p.proowner::regrole::text owner_role,
        p.prosecdef,
        coalesce(p.proconfig @> ARRAY['search_path=""']::text[],false)
          AS search_path_locked,
        EXISTS (
          SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
        ) AS public_execute,
        has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
        has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
        strpos(pg_get_functiondef(p.oid),'auth.uid()')>0 AS references_auth_uid
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef
)
SELECT jsonb_build_object(
 'project_ref','yivkqyjdeouxnwtwfekc',
 'functions',COALESCE(
   (SELECT jsonb_agg(jsonb_build_object(
     'name',proname,'signature',signature,'owner_role',owner_role,
     'security_definer',prosecdef,
     'search_path_locked',search_path_locked,
     'public_execute',public_execute,
     'anon_execute',anon_execute,
     'authenticated_execute',authenticated_execute,
     'references_auth_uid',references_auth_uid
   ) ORDER BY proname) FROM g1_functions),'[]'::jsonb
 )
)::text AS g1_rpc_metadata;
