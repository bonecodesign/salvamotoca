begin read only;
set local search_path=pg_catalog;
-- Read-only fingerprint of selected application DDL, no rows or credentials.
-- Run with search_path=pg_catalog for reproducible deparsing.
with items as (
 select 'columns' section, c.relname||'.'||a.attname item,
 concat_ws('|',format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,coalesce(pg_get_expr(d.adbin,d.adrelid),'')) val
 from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
 where n.nspname='public' and c.relkind in ('r','p') and c.relname in ('service_requests','service_quotes','providers','provider_services','service_categories','payment_records','request_messages','bj_provider_presence','bj_request_attempts') and a.attnum>0 and not a.attisdropped
 union all
 select 'constraints',c.relname||'.'||k.conname,pg_get_constraintdef(k.oid)
 from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('service_requests','service_quotes','providers','provider_services','service_categories','payment_records','request_messages','bj_provider_presence','bj_request_attempts')
 union all
 select 'policies',tablename||'.'||policyname,concat_ws('|',permissive,roles::text,cmd,coalesce(qual,''),coalesce(with_check,''))
 from pg_policies where schemaname='public' and tablename in ('service_requests','service_quotes','providers','provider_services','service_categories','payment_records','request_messages','bj_provider_presence','bj_request_attempts')
 union all
 select 'rpc',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',concat_ws('|',p.prosecdef,p.provolatile,p.proconfig::text,has_function_privilege('anon',p.oid,'EXECUTE'),has_function_privilege('authenticated',p.oid,'EXECUTE'),p.prosrc)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('bj_answer_quote','bj_finish_request','bj_get_request_location','bj_ping_presence','bj_set_presence','bj_submit_quote','bj_online_providers')
 union all
 select 'indexes',tablename||'.'||indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('service_requests','service_quotes','providers','provider_services','service_categories','payment_records','request_messages','bj_provider_presence','bj_request_attempts')
)
select section,count(*) item_count,md5(string_agg(md5(item||chr(31)||val),'' order by item collate "C",val collate "C")) fingerprint from items group by section order by section;
commit;
