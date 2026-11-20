#!/usr/bin/env bash
# G1: restore an ACTUAL synthetic pg_dump in disposable PG17, no hosted DB.
set -euo pipefail
umask 077
: "${PGPASSWORD:?fake CI password expected}"
command -v docker >/dev/null
command -v age >/dev/null
command -v python3 >/dev/null
dir="$(mktemp -d "${RUNNER_TEMP:?}/g1-combined.XXXXXXXX")"
trap 'rm -rf -- "$dir"' EXIT
cd "$dir"
psql_test() {
 docker run --rm --network host -e PGPASSWORD postgres:17 \
   psql -h 127.0.0.1 -U postgres "$@"
}
psql_stdin() {
 docker run --rm -i --network host -e PGPASSWORD postgres:17 \
   psql -h 127.0.0.1 -U postgres "$@"
}
pgdump() {
 docker run --rm --network host -e PGPASSWORD postgres:17 \
   pg_dump -h 127.0.0.1 -U postgres "$@"
}
psql_test -d postgres -X -v ON_ERROR_STOP=1 -c 'create database g1_bundle_fixture'
psql_test -d postgres -X -v ON_ERROR_STOP=1 -c 'create database g1_bundle_restored'
psql_test -d g1_bundle_fixture -X -v ON_ERROR_STOP=1 -c "
create table public.prestadores_prospeccao(id integer primary key, note text);
create table public.ofertas_prospeccao(id integer primary key, note text);
create table public.configuracao_comercial(id integer primary key, note text);
insert into public.prestadores_prospeccao values (1,'fake A'),(2,'fake B');
insert into public.ofertas_prospeccao values (1,'fake A'),(2,'fake B'),(3,'fake C');
insert into public.configuracao_comercial values (1,'fake setting');
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
insert into supabase_migrations.schema_migrations values ('fixture0001');
alter table public.prestadores_prospeccao enable row level security;
alter table public.ofertas_prospeccao enable row level security;
alter table public.configuracao_comercial enable row level security;
create policy mock_prospected on public.prestadores_prospeccao
 for select using (true);
create policy mock_offers on public.ofertas_prospeccao
 for select using (true);
create policy mock_config on public.configuracao_comercial
 for select using (true);
"
printf '%s\n' '-- Synthetic fixture requires no additional SQL roles.' > roles.sql
pgdump -d g1_bundle_fixture --schema-only --schema=public --no-owner --no-acl > schema.sql
pgdump -d g1_bundle_fixture --data-only --schema=public --no-owner --no-acl > data.sql
pgdump -d g1_bundle_fixture --schema-only --schema=supabase_migrations --no-owner --no-acl > history_schema.sql
pgdump -d g1_bundle_fixture --data-only --schema=supabase_migrations --no-owner --no-acl > history_data.sql
cat > source_inventory_before.json <<'JSON'
{"auth_users":0,"service_requests":0,"registered_providers":0,"prospected_providers":2,"prospecting_offers":3,"commercial_config":1,"migration_versions":1,"storage_objects":0}
JSON
cat > source_schema_inventory_before.json <<'SCHEMA_JSON'
{"tables":[{"name":"prestadores_prospeccao","rls_enabled":true,"policy_count":1},{"name":"ofertas_prospeccao","rls_enabled":true,"policy_count":1},{"name":"configuracao_comercial","rls_enabled":true,"policy_count":1}]}
SCHEMA_JSON
python3 "$GITHUB_WORKSPACE/scripts/g1-verify-public-dump-coverage.py" \
 --inventory source_schema_inventory_before.json \
 --schema schema.sql --data data.sql > "$dir/coverage.log"
grep -q 'G1_DUMP_RLS_POLICY_COVERAGE=PASS' "$dir/coverage.log"
cat > manifest.txt <<'MANIFEST'
project_ref=yivkqyjdeouxnwtwfekc
environment=TESTES
backup_kind=logical_sql
g1_restoration_verified=false
storage_physical_objects_included=false
MANIFEST
sha256sum roles.sql schema.sql data.sql history_schema.sql history_data.sql source_inventory_before.json source_schema_inventory_before.json > manifest.sha256
tar -czf "$dir/bundle.tar.gz" roles.sql schema.sql data.sql history_schema.sql history_data.sql source_inventory_before.json source_schema_inventory_before.json manifest.sha256 manifest.txt
age-keygen -o "$dir/fixture-private-key" 2>/dev/null
recipient="$(age-keygen -y "$dir/fixture-private-key")"
age -r "$recipient" -o "$dir/bundle.tar.gz.age" "$dir/bundle.tar.gz"
G1_SYNTHETIC_CI_ONLY=true python3 \
 "$GITHUB_WORKSPACE/scripts/g1-verify-encrypted-bundle.py" \
 --archive "$dir/bundle.tar.gz.age" --identity "$dir/fixture-private-key" \
 > "$dir/verification.log"
grep -q 'G1_ENCRYPTED_ARCHIVE_INTEGRITY=PASS' "$dir/verification.log"
grep -q 'G1_RESTORATION_VERIFIED=FALSE' "$dir/verification.log"

# This extraction/restore uses only the script's own synthetic tables.
mkdir -m 700 "$dir/extracted"
age --decrypt -i "$dir/fixture-private-key" -o "$dir/recovered.tar.gz" "$dir/bundle.tar.gz.age"
tar -xzf "$dir/recovered.tar.gz" -C "$dir/extracted"
(cd "$dir/extracted" && sha256sum -c manifest.sha256 >/dev/null)
# pg_dump --schema=public inclui CREATE SCHEMA public; esta base FICTICIA
# recém-criada pelo PostgreSQL já tem public. Excluir APENAS nela,
# nunca em Supabase hospedado (não usar este script como restore real).
psql_test -X -v ON_ERROR_STOP=1 -d g1_bundle_restored -c \
  'drop schema if exists public cascade'
psql_stdin -X -v ON_ERROR_STOP=1 -d g1_bundle_restored < "$dir/extracted/schema.sql"
psql_stdin -X -v ON_ERROR_STOP=1 -d g1_bundle_restored < "$dir/extracted/data.sql"
psql_stdin -X -v ON_ERROR_STOP=1 -d g1_bundle_restored < "$dir/extracted/history_schema.sql"
psql_stdin -X -v ON_ERROR_STOP=1 -d g1_bundle_restored < "$dir/extracted/history_data.sql"
restored="$(psql_test -X -tA -v ON_ERROR_STOP=1 -d g1_bundle_restored -c "
select
 (select count(*) from public.prestadores_prospeccao)=2 and
 (select count(*) from public.ofertas_prospeccao)=3 and
 (select count(*) from public.configuracao_comercial)=1 and
 (select count(*) from supabase_migrations.schema_migrations)=1
")"
[[ "$restored" == "t" ]] || { echo 'FAIL: restored synthetic data mismatch' >&2; exit 1; }
echo 'G1_PG17_SQL_AGE_VERIFY_PG17_RESTORE=PASS'
echo 'G1_SYNTHETIC_RECORD_COUNTS=PASS'
echo 'G1_SYNTHETIC_RLS_POLICY_COVERAGE=PASS'
echo 'G1_SAVED_REAL_SUPABASE_DATA=FALSE'
echo 'G1_REAL_AUTH_STORAGE_RESTORED=FALSE'
echo 'G1=BLOCKED'
echo 'RELEASE=NO_GO'
