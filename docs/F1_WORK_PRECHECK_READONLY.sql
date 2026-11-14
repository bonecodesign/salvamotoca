-- F1 / Salva Motoca — PRECHECK APENAS LEITURA, para Work/Supabase SQL Editor.
-- Não executa DDL/DML, não grava dados, não exibe senhas/JWT nem conteúdo de usuários.
-- Conferir conexão com o projeto yivkqyjdeouxnwtwfekc antes de executar.
-- Nunca substituir este precheck por um teste de autenticação HTTP real.

select 'projeto' as bloco, current_database() as banco, current_setting('server_version') as postgres;

select 'tamanhos' as bloco,
       (select count(*) from auth.users) as total_usuarios_auth,
       (select count(*) from public.service_requests) as total_solicitacoes,
       (select count(*) from public.service_requests where photo_path is not null) as solicitacoes_f1,
       (select count(*) from storage.objects where bucket_id='request-photos') as fotos_f1;

select 'bucket_privado' as bloco,id,public,file_size_limit,allowed_mime_types
from storage.buckets where id='request-photos';

select 'migration_f1' as bloco, version, name
from supabase_migrations.schema_migrations
where version='20261114020317';

select 'coluna_f1' as bloco,column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and table_name='service_requests'
  and column_name in ('motorcycle_brand','motorcycle_model','motorcycle_year',
  'service_types','photo_path','request_key')
order by column_name;

select 'rls' as bloco,
       'storage.objects' as tabela, relrowsecurity as habilitada
from pg_class where oid='storage.objects'::regclass
union all
select 'rls','public.service_requests',relrowsecurity
from pg_class where oid='public.service_requests'::regclass;

select 'politica' as bloco, schemaname,tablename,policyname,cmd,roles
from pg_policies
where (schemaname='storage' and tablename='objects' and policyname like 'f1_%')
   or (schemaname='public' and tablename='service_requests')
order by schemaname,tablename,policyname;

select 'privilegio' as bloco,
  has_table_privilege('anon','public.service_requests','SELECT') as anon_ler_pedidos,
  has_column_privilege('anon','public.service_requests','photo_path','SELECT') as anon_ler_foto,
  has_table_privilege('authenticated','public.service_requests','SELECT') as auth_select_tabela,
  has_column_privilege('authenticated','public.service_requests','photo_path','SELECT') as auth_ler_caminho_foto,
  has_column_privilege('authenticated','public.service_requests','request_key','SELECT') as auth_ler_request_key,
  has_column_privilege('authenticated','public.service_requests','address_details','SELECT') as auth_ler_endereco,
  has_column_privilege('authenticated','public.service_requests','latitude','SELECT') as auth_ler_latitude;

select 'rpc_privilegiada' as bloco, p.proname,p.prosecdef as security_definer,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_pode_executar,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as autenticado_pode_executar
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
 'bj_answer_quote','bj_finish_request','bj_get_request_location',
 'bj_ping_presence','bj_set_presence','bj_submit_quote')
order by p.proname;

-- Atenção: service_requests possui um trigger pós-insert que grava
-- public.bj_request_attempts. Não inserir pedidos sem isolar efeitos.
select 'trigger' as bloco,n.nspname as esquema,c.relname as tabela,
       t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definicao
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal
  and ((n.nspname='auth' and c.relname='users')
    or (n.nspname='public' and c.relname in ('service_requests','service_quotes'))
    or (n.nspname='storage' and c.relname='objects'))
order by n.nspname,c.relname,t.tgname;
