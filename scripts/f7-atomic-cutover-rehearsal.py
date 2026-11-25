#!/usr/bin/env python3
"""Transactional rehearsal only: no hosted connection, no durable DDL."""
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAMES = (
    "f2_backend_candidate", "f3_tow_backend_candidate",
    "f4_financial_backend_candidate", "f4_double_entry_mock_candidate",
    "f4_risk_settlement_mock_candidate", "f5_backend_rls_mock_candidate",
    "f6_backend_rls_mock_candidate", "f23_incidents_persistence_candidate",
    "f23_incident_intake_candidate", "f23_incident_historical_access_candidate",
    "f23_historical_compatibility_candidate",
    "f34_historical_finance_presence_candidate",
    "f456_historical_persisted_bridge_candidate",
    "f56_authenticated_fixture_api_candidate",
    "f7_persisted_admin_snapshot_candidate",
)
ENV = {"PATH": os.environ["PATH"], "PGHOST": "127.0.0.1",
       "PGPORT": "5432", "PGDATABASE": "sm_history_disposable",
       "PGUSER": "postgres", "PGPASSWORD": "postgres",
       "PGCONNECT_TIMEOUT": "5", "PGOPTIONS": "-c statement_timeout=15000 -c lock_timeout=3000"}
def check(condition, message):
    if not condition:
        raise RuntimeError(message)

def run(sql):
    return subprocess.run(
        ["psql", "-X", "-Atq", "-v", "ON_ERROR_STOP=1"],
        input=sql, text=True, capture_output=True, env=ENV, timeout=90)

def success(sql):
    result = run(sql)
    check(result.returncode == 0, "SQL fixture failed: " + result.stderr[-1800:])
    return result.stdout.strip()

# Same database, same server, no comparison of OIDs. Include ACLs, definitions,
# triggers and all schema relations. No row data is returned.
SNAPSHOT = """
set search_path=pg_catalog;
with items as (
 select 'relation',n.nspname||'.'||c.relname,
 concat_ws('|',c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private','auth','storage')
 union all
 select 'column',n.nspname||'.'||c.relname||'.'||a.attname,
 concat_ws('|',format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attacl::text,pg_get_expr(d.adbin,d.adrelid))
 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
 left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
 where n.nspname in ('public','private','auth','storage') and a.attnum>0 and not a.attisdropped
 union all
 select 'constraint',n.nspname||'.'||c.relname||'.'||k.conname,pg_get_constraintdef(k.oid)
 from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private','auth','storage')
 union all
 select 'index',schemaname||'.'||indexname,indexdef from pg_indexes where schemaname in ('public','private','auth','storage')
 union all
 select 'policy',schemaname||'.'||tablename||'.'||policyname,
 concat_ws('|',permissive,roles::text,cmd,qual,with_check) from pg_policies where schemaname in ('public','private','auth','storage')
 union all
 select 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 concat_ws('|',pg_get_functiondef(p.oid),p.proacl::text)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private','auth','storage') and p.prokind in ('f','p')
 union all
 select 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,
 concat_ws('|',pg_get_triggerdef(t.oid),t.tgenabled)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private','auth','storage') and not t.tgisinternal
)
select count(*)||'|'||md5(string_agg(md5(concat_ws(chr(31),column1,column2,column3)),'' order by column1 collate "C",column2 collate "C",column3 collate "C")) from items;
"""
# Names of UNION output columns must be explicit.
SNAPSHOT = SNAPSHOT.replace("with items as (", "with items(column1,column2,column3) as (")
CLOSE = """
-- Candidate wrappers re-grant EXECUTE; close the surface again at the end.
do $freeze$
declare f record;t record;
begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname ~ '^f[234567]_' or p.proname in
 ('bj_answer_quote','bj_finish_request','bj_get_request_location','bj_ping_presence','bj_set_presence','bj_submit_quote'))
 loop execute format('revoke execute on function %I.%I(%s) from public,anon,authenticated',f.nspname,f.proname,f.args);end loop;
 for t in select tablename from pg_tables where schemaname='public' and tablename ~ '^f[234567]_'
 loop
 execute format('create policy f7_cutover_closed_insert on public.%I as restrictive for insert to anon,authenticated with check(false)',t.tablename);
 execute format('create policy f7_cutover_closed_update on public.%I as restrictive for update to anon,authenticated using(false) with check(false)',t.tablename);
 execute format('create policy f7_cutover_closed_delete on public.%I as restrictive for delete to anon,authenticated using(false)',t.tablename);
 end loop;
end $freeze$;
"""
def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

def body(name):
    source = read("supabase/drafts/" + name + ".sql")
    # Known checked-in drafts only; reject psql meta commands, unfamiliar
    # transaction boundaries, and COMMIT/ROLLBACK lines rather than execute them.
    check(not re.search(r"(?m)^\s*\\", source), "Unexpected psql meta command: " + name)
    boundaries = list(re.finditer(r"(?im)^\s*(begin|commit|rollback)\s*;\s*$", source))
    if not boundaries:
        check(name in NAMES[7:10], "Expected outer transaction: " + name)
        return source
    check([m.group(1).lower() for m in boundaries] == ["begin", "commit"],
          "Unexpected transaction boundaries: " + name)
    check(not source[boundaries[1].end():].strip(), "Unexpected trailing SQL: " + name)
    return source[:boundaries[0].start()] + "\n" + source[boundaries[0].end():boundaries[1].start()] + "\n"

def main():
    check(os.environ.get("GITHUB_ACTIONS") == "true" and
          os.environ.get("SM_ATOMIC_CUTOVER_FIXTURE") == "yes", "CI fixture required")
    check(success("select current_database()='sm_history_disposable' and inet_server_port()=5432 and current_user='postgres';") == "t", "Wrong server")
    check(success("select not exists(select 1 from auth.users) and not exists(select 1 from storage.objects) and not exists(select 1 from public.service_requests) and not exists(select 1 from public.providers);") == "t", "Unexpected fixture data")
    before = success(SNAPSHOT)
    check(re.fullmatch(r"\d+\|[a-f0-9]{32}", before), "Invalid catalog snapshot")
    freeze = read("supabase/drafts/f7_legacy_lockdown_rehearsal.sql")
    assertion = read("tests/integration-history-cutover-assert.sql")
    chunks = [body(name) for name in NAMES]
    # Failure midway and after all candidate DDL; disconnect rolls everything back.
    for at in (8, len(chunks)):
        result = run("begin;\n" + freeze + "\n" + "\n".join(chunks[:at]) +
                     "\ndo $injected$ begin raise exception 'SM_EXPECTED_CUTOVER_FAILURE'; end $injected$;\nrollback;\n")
        check(result.returncode != 0 and "SM_EXPECTED_CUTOVER_FAILURE" in result.stderr, "Unexpected failure before injection: " + result.stderr[-1600:])
        check(success(SNAPSHOT) == before, "Catalog differs after injected failure")
        print("F7_CUTOVER_INJECTED_ROLLBACK=PASS stage=" + str(at))
    output = success("begin;\n" + freeze + "\n" + "\n".join(chunks) + "\n" + CLOSE + "\n" + assertion + "\nrollback;\n")
    check("F7_CUTOVER_CLOSED=PASS" in output, "Final assertion missing")
    check(success(SNAPSHOT) == before, "Catalog differs after explicit rollback")
    print("F7_ATOMIC_CUTOVER=PASS CANDIDATES=15 INJECTED_FAILURES=2 EXACT_CATALOG_ROLLBACK=PASS HOSTED_WRITES=NONE RELEASE=NO_GO")

if __name__ == "__main__":
    main()
