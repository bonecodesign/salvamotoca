#!/usr/bin/env bash
# G1 fixture: real PostgreSQL 17 dump -> age -> isolated restore, then verify
# functional FK / trigger / SECURITY INVOKER / SECURITY DEFINER / ACL / RLS.
# Entirely fictional; never connect to the hosted Supabase project.
set -euo pipefail
umask 077
: "${PGPASSWORD:?fictional CI postgres password required}"
: "${RUNNER_TEMP:?temporary CI directory required}"
command -v docker >/dev/null
command -v age >/dev/null
command -v sha256sum >/dev/null
work="$(mktemp -d "$RUNNER_TEMP/g1-functional-restore.XXXXXX")"
trap 'rm -rf -- "$work"' EXIT
cd "$work"

pg() {
 docker run --rm --network host -e PGPASSWORD postgres:17 \
  psql -h 127.0.0.1 -U postgres -X -v ON_ERROR_STOP=1 "$@"
}
pg_stdin() {
 docker run --rm -i --network host -e PGPASSWORD postgres:17 \
  psql -h 127.0.0.1 -U postgres -X -v ON_ERROR_STOP=1 "$@"
}
pgdump() {
 docker run --rm --network host -e PGPASSWORD postgres:17 \
  pg_dump -h 127.0.0.1 -U postgres "$@"
}

pg -d postgres -q -c "CREATE ROLE g1_actor_alpha NOLOGIN;"
pg -d postgres -q -c "CREATE ROLE g1_actor_beta NOLOGIN;"
pg -d postgres -q -c "CREATE DATABASE g1_rel_source;"
pg -d postgres -q -c "CREATE DATABASE g1_rel_restored;"

cat > fixture.sql <<'SQL'
-- All tables, roles and records here are invented.
-- Never deploy this synthetic ownership policy to hosted Supabase: custom
-- session settings are writable and NOT trustworthy authentication claims.
CREATE TABLE public.g1_case_owner(
 owner_id integer PRIMARY KEY,
 label text NOT NULL
);
CREATE TABLE public.g1_case_note(
 note_id integer PRIMARY KEY,
 owner_id integer NOT NULL REFERENCES public.g1_case_owner(owner_id),
 body text NOT NULL
);
CREATE TABLE public.g1_audit_log(
 audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 note_id integer NOT NULL
);
CREATE FUNCTION public.g1_note_audit_fn() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER
 AS $body$
 BEGIN
   INSERT INTO public.g1_audit_log(note_id) VALUES (NEW.note_id);
   RETURN NEW;
 END;
 $body$;
CREATE TRIGGER g1_note_audit_trigger
 AFTER INSERT ON public.g1_case_note
 FOR EACH ROW EXECUTE FUNCTION public.g1_note_audit_fn();

CREATE FUNCTION public.g1_restricted_definer() RETURNS integer
 LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
 AS $body$ SELECT 7; $body$;
REVOKE ALL ON FUNCTION public.g1_restricted_definer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.g1_restricted_definer() TO g1_actor_alpha;

ALTER TABLE public.g1_case_owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.g1_case_note ENABLE ROW LEVEL SECURITY;
CREATE POLICY g1_case_owner_scope ON public.g1_case_owner
 FOR SELECT TO g1_actor_alpha,g1_actor_beta
 USING (owner_id = nullif(current_setting('app.g1_fake_actor_id',true),'')::integer);
CREATE POLICY g1_case_note_scope ON public.g1_case_note
 FOR SELECT TO g1_actor_alpha,g1_actor_beta
 USING (owner_id = nullif(current_setting('app.g1_fake_actor_id',true),'')::integer);
GRANT USAGE ON SCHEMA public TO g1_actor_alpha,g1_actor_beta;
GRANT SELECT ON public.g1_case_owner,public.g1_case_note TO g1_actor_alpha,g1_actor_beta;

INSERT INTO public.g1_case_owner(owner_id,label) VALUES (1,'fictional-alpha'),(2,'fictional-beta');
INSERT INTO public.g1_case_note(note_id,owner_id,body)
 VALUES (101,1,'invented-note-a'),(102,2,'invented-note-b');
SQL
pg_stdin -d g1_rel_source -q < fixture.sql

# pg_dump from a REAL synthetic PostgreSQL 17 instance includes GRANT/REVOKE:
# do NOT pass --no-acl. No real Supabase content is present anywhere here.
pgdump -d g1_rel_source --schema-only --schema=public --no-owner > schema.sql
pgdump -d g1_rel_source --data-only --schema=public --no-owner > data.sql
sha256sum schema.sql data.sql > manifest.sha256
tar -czf backup.tar.gz schema.sql data.sql manifest.sha256
age-keygen -o fake-age-identity 2>/dev/null
recipient="$(age-keygen -y fake-age-identity)"
age -r "$recipient" -o backup.tar.gz.age backup.tar.gz
age -d -i fake-age-identity -o decrypted.tar.gz backup.tar.gz.age
mkdir -m 700 restored_files
tar -xzf decrypted.tar.gz -C restored_files
(cd restored_files && sha256sum -c manifest.sha256 >/dev/null)

# RESTORE TARGET MUST BE DISPOSABLE! This schema deletion is explicitly
# local to the second fictional PostgreSQL DB; NEVER run in Supabase.
pg -d g1_rel_restored -q -c 'DROP SCHEMA IF EXISTS public CASCADE;'
pg_stdin -d g1_rel_restored -q < restored_files/schema.sql
# During data replay, synthetic AFTER-INSERT trigger must NOT double-write
# the audit table. This setting requires superuser on disposable PostgreSQL;
# Supabase hosted restore needs its own verified migration procedure.
{
 printf "BEGIN;\nSET LOCAL session_replication_role = 'replica';\n"
 cat restored_files/data.sql
 printf "\nCOMMIT;\n"
} | pg_stdin -d g1_rel_restored -q

# A shared catalog comparison by itself is planned in older PR #69. This
# suite adds the missing BEHAVIORAL proof with the PostgreSQL engine.
catalog_ok="$(pg -d g1_rel_restored -qAt -c "
SELECT (
 (SELECT count(*) FROM public.g1_case_owner) = 2
 AND (SELECT count(*) FROM public.g1_case_note) = 2
 AND (SELECT count(*) FROM public.g1_audit_log) = 2
 AND EXISTS (
   SELECT 1 FROM pg_constraint c
   JOIN pg_class t ON t.oid=c.conrelid
   JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname='public' AND t.relname='g1_case_note'
   AND c.contype='f'
 )
 AND EXISTS (
   SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE c.relname='g1_case_note'
   AND t.tgname='g1_note_audit_trigger'
   AND t.tgenabled='O' AND NOT t.tgisinternal
 )
 AND EXISTS (
   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='g1_restricted_definer'
     AND p.prosecdef
 )
 AND has_function_privilege('g1_actor_alpha','public.g1_restricted_definer()','EXECUTE')
 AND NOT has_function_privilege('g1_actor_beta','public.g1_restricted_definer()','EXECUTE')
 AND has_table_privilege('g1_actor_alpha','public.g1_case_note','SELECT')
 AND NOT has_table_privilege('g1_actor_alpha','public.g1_case_note','INSERT')
 AND (SELECT count(*) FROM pg_policies
      WHERE schemaname='public'
        AND tablename IN ('g1_case_owner','g1_case_note')) = 2
 AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('g1_case_owner','g1_case_note')
        AND c.relrowsecurity) = 2
);")"
[[ "$catalog_ok" == "t" ]] || {
 echo "G1_FUNCTIONAL_FIXTURE=FAIL:CATALOG_OR_DATA_MISMATCH" >&2; exit 1;
}

# Explicit RLS behavior. These roles have only SELECT; each sees its own row.
alpha="$(pg -d g1_rel_restored -qAt -c "
BEGIN; SET LOCAL ROLE g1_actor_alpha;
SET LOCAL app.g1_fake_actor_id='1';
SELECT count(*) FROM public.g1_case_note;
ROLLBACK;")"
beta="$(pg -d g1_rel_restored -qAt -c "
BEGIN; SET LOCAL ROLE g1_actor_beta;
SET LOCAL app.g1_fake_actor_id='2';
SELECT count(*) FROM public.g1_case_note;
ROLLBACK;")"
none="$(pg -d g1_rel_restored -qAt -c "
BEGIN; SET LOCAL ROLE g1_actor_beta;
SET LOCAL app.g1_fake_actor_id='3';
SELECT count(*) FROM public.g1_case_note;
ROLLBACK;")"
[[ "$alpha" == "1" && "$beta" == "1" && "$none" == "0" ]] || {
 echo "G1_FUNCTIONAL_FIXTURE=FAIL:RLS_SCOPE_BROKEN" >&2; exit 1;
}

# An invalid foreign key must be rejected even after restore.
if pg -d g1_rel_restored -q -c \
 "INSERT INTO public.g1_case_note VALUES (999,999,'invalid-foreign-key')" \
 > /dev/null 2>&1; then
 echo "G1_FUNCTIONAL_FIXTURE=FAIL:FOREIGN_KEY_NOT_ENFORCED" >&2
 exit 1
fi

# The restored AFTER-INSERT trigger must fire once for a new valid write.
pg -d g1_rel_restored -q -c \
 "INSERT INTO public.g1_case_note VALUES (103,1,'fictitious-after-restore');"
trigger_count="$(pg -d g1_rel_restored -qAt -c \
 "SELECT count(*) FROM public.g1_audit_log;")"
[[ "$trigger_count" == "3" ]] || {
 echo "G1_FUNCTIONAL_FIXTURE=FAIL:TRIGGER_NOT_RECOVERED" >&2; exit 1;
}

echo 'G1_PG17_FK_RESTORE_AND_REJECTION=PASS'
echo 'G1_PG17_TRIGGER_RESTORE_AND_EXECUTION=PASS'
echo 'G1_PG17_RLS_ISOLATION_FOR_FICTITIOUS_ACTORS=PASS'
echo 'G1_PG17_DEF_INVOKER_AND_ACL_RESTORED=PASS'
echo 'G1_PG17_ENCRYPTED_SQL_RESTORED=PASS'
echo 'G1_REAL_SUPABASE_BACKUP=NOT_EXECUTED'
echo 'G1_REAL_AUTH_STORAGE_RESTORE=NOT_EXECUTED'
echo 'G1=BLOCKED'
echo 'RELEASE=NO_GO'
