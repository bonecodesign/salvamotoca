-- Salva Motoca! F1 — auditoria de RPCs em LEITURA APENAS.
-- Usar somente no projeto existente e somente para revisar grants/atributos.
-- Nenhum DDL, INSERT, UPDATE, DELETE, DO, RPC operacional ou acesso a dados de usuários.
-- Status: NÃO COMPROVA teste HTTP autenticado e NÃO libera pagamentos.

select n.nspname as schema_name,p.proname,p.prosecdef as security_definer,
       p.proconfig as seguranca_de_ambiente,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('bj_answer_quote','bj_finish_request','bj_get_request_location',
  'bj_ping_presence','bj_set_presence','bj_submit_quote')
order by p.proname;

select c.relname as tabela, c.relrowsecurity as rls_habilitada,
       has_table_privilege('anon',c.oid,'INSERT') as anon_insert,
       has_table_privilege('authenticated',c.oid,'INSERT') as auth_insert,
       has_table_privilege('authenticated',c.oid,'UPDATE') as auth_update,
       has_table_privilege('authenticated',c.oid,'SELECT') as auth_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and c.relname in ('payment_records','service_requests','service_quotes','providers')
order by c.relname;

select schemaname,tablename,policyname,cmd,roles
from pg_policies
where schemaname='public' and tablename in ('payment_records','service_requests')
order by tablename,policyname;

select 'auth_users' as metric, count(*)::bigint as value
from auth.users
union all select 'service_requests', count(*) from public.service_requests
union all select 'request_photos', count(*)
from storage.objects where bucket_id='request-photos';
