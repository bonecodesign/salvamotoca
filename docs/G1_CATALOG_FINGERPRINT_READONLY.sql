-- SALVA MOTOCA! / G1 — Schema fingerprints READ ONLY, no rows or secrets returned.
-- Execute on source AS OF BACKUP and then the independently RESTORED PG17.
-- Output hashes from *same SQL*, compare equality of EACH component, not merely counts.
-- MD5 here is a deterministic drift detector, NOT proof of origin or tamper resistance.
-- Restore PostgreSQL may normalize SQL representation differently; mismatches => REVIEW.
-- Only SELECT with pg_catalog and information_schema metadata. No DDL, no copy, no auth.
with
catalog_objects as (
  select 'relation'::text as kind,
    n.nspname||'.'||c.relname as ident,
    concat_ws('|',c.relkind::text,c.relrowsecurity::text,c.relforcerowsecurity::text,
      coalesce(array_to_string(c.relacl,','),'NO_ACL')) as definition
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in('public','auth','storage') and c.relkind in('r','p','v','m')
  union all
  select 'column',
    n.nspname||'.'||c.relname||'.'||a.attname,
    concat_ws('|',
       pg_catalog.format_type(a.atttypid,a.atttypmod),
       a.attnotnull::text,a.attidentity::text,a.attgenerated::text,
       coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'NO_DEFAULT'),
       coalesce(array_to_string(a.attacl,','),'NO_ACL'))
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid=a.attrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  left join pg_catalog.pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
  where n.nspname in('public','auth','storage')
    and c.relkind in('r','p','v','m') and a.attnum>0 and not a.attisdropped
  union all
  select 'policy',
    p.schemaname||'.'||p.tablename||'.'||p.policyname,
    concat_ws('|',p.cmd,coalesce(array_to_string(p.roles,','),''),
      coalesce(p.qual,''),coalesce(p.with_check,''))
  from pg_catalog.pg_policies p
  where p.schemaname in('public','auth','storage')
  union all
  select 'function',
    n.nspname||'.'||p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')',
    concat_ws('|',p.prosecdef::text,p.provolatile::text,
       coalesce(array_to_string(p.proacl,','),'NO_ACL'),
       pg_catalog.pg_get_functiondef(p.oid))
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','auth','storage')
  union all
  select 'constraint',
    n.nspname||'.'||c.relname||'.'||k.conname,
    pg_catalog.pg_get_constraintdef(k.oid)
  from pg_catalog.pg_constraint k
  join pg_catalog.pg_class c on c.oid=k.conrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in('public','auth','storage')
  union all
  select 'index',
    n.nspname||'.'||c.relname,
    pg_catalog.pg_get_indexdef(c.oid)
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in('public','auth','storage') and c.relkind in('i','I')
  union all
  select 'trigger',
    n.nspname||'.'||c.relname||'.'||t.tgname,
    pg_catalog.pg_get_triggerdef(t.oid,true)||'|'||t.tgenabled::text
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid=t.tgrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in('public','auth','storage') and not t.tgisinternal
  union all
  select 'bucket',
    b.id,
    concat_ws('|',b.public::text,coalesce(b.file_size_limit::text,'NULL'),
      coalesce(array_to_string(b.allowed_mime_types,','),'NULL'))
  from storage.buckets b
),
component as (
  select kind,count(*)::integer as object_count,
    pg_catalog.md5(
      pg_catalog.string_agg(ident||chr(31)||definition,chr(10)
       order by ident,definition)) as digest
  from catalog_objects group by kind
),
counts as (
  select
    (select count(*)::integer from auth.users) as auth_users,
    (select count(*)::integer from auth.sessions) as auth_sessions,
    (select count(*)::integer from public.service_requests) as requests,
    (select count(*)::integer from public.service_quotes) as quotes,
    (select count(*)::integer from public.payment_records) as payments,
    (select count(*)::integer from storage.objects) as storage_objects,
    (select count(*)::integer from storage.objects where bucket_id='request-photos')
      as request_photos,
    (select count(*)::integer from supabase_migrations.schema_migrations)
      as migration_count
)
select pg_catalog.jsonb_build_object(
  'format','g1_catalog_fingerprint_v1',
  'algorithm','md5_for_drift_only_not_source_attestation',
  'project_ref','yivkqyjdeouxnwtwfekc',
  'postgres_major',(current_setting('server_version_num')::integer/10000),
  'components',(
    select pg_catalog.jsonb_object_agg(
      kind,pg_catalog.jsonb_build_object('objects',object_count,'digest',digest))
    from component),
  'overall_catalog_md5',(
    select pg_catalog.md5(pg_catalog.string_agg(
      kind||chr(31)||ident||chr(31)||definition,chr(10)
      order by kind,ident,definition))
    from catalog_objects),
  'source_counts',(select pg_catalog.to_jsonb(counts) from counts),
  'captured_utc',pg_catalog.clock_timestamp()
) as g1_catalog_evidence;
