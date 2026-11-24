#!/usr/bin/env python3
"""PostgreSQL 17 disposable CI only. No external URL, credentials or data.
Real concurrent database connections; synthetic identities, quotations and ledger.
"""
import concurrent.futures as cf
import json
import os
import statistics
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = "sm_perf_disposable"
WORKERS = 24
ENV = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LC_ALL": "C.UTF-8",
       "PGHOST": "127.0.0.1", "PGPORT": "5432", "PGDATABASE": DB,
       "PGUSER": "postgres", "PGPASSWORD": "postgres", "PGCONNECT_TIMEOUT": "5",
       "PGOPTIONS": "-c statement_timeout=15000 -c lock_timeout=10000"}

def check(condition, label):
    if not condition:
        raise RuntimeError(label)

def sql(statement, expected_error=None):
    start = time.perf_counter()
    p = subprocess.run(["psql", "-X", "-Atq", "-v", "ON_ERROR_STOP=1"],
                       input=statement, text=True, capture_output=True, env=ENV,
                       cwd=ROOT, timeout=25)
    if expected_error is not None and p.returncode:
        check(expected_error in p.stderr, "Unexpected SQL rejection: " + p.stderr[:500])
        return "rejected", (time.perf_counter()-start)*1000
    check(p.returncode == 0, "SQL failure: " + p.stderr[:500])
    return p.stdout.strip(), (time.perf_counter()-start)*1000

def scalar(statement):
    return sql(statement)[0]

def uid(n):
    return "11111111-1111-4111-8111-" + str(n).zfill(12)

def request(n): return uid(100000+n)
def buyer(n): return uid(200000+n)
def provider(n, side): return uid(300000+2*n+side)
def quote(n, side): return uid(400000+2*n+side)
def offer(n, side): return uid(500000+2*n+side)

def seed(start, count):
    providers, requests, quotes, items, offers = [], [], [], [], []
    for n in range(start, start+count):
        requests.append(f"('{request(n)}','{buyer(n)}',2,null,array['pneu_furado'],'requested')")
        for side in (0, 1):
            p, q = provider(n, side), quote(n, side)
            providers.append(f"('{p}','{uid(600000+2*n+side)}','approved',true)")
            quotes.append(f"('{q}','{request(n)}','{p}',27000,'proposed')")
            items.extend([f"('{q}',1,'service','pneu_furado',23000)",
                          f"('{q}',2,'travel','deslocamento',4000)"])
            offers.append(f"('{offer(n,side)}','{request(n)}','{p}','quoted',now(),now(),now(),'{q}')")
    sql("begin;\n" +
        "insert into public.providers(id,owner_id,status,is_active) values "+",".join(providers)+";\n"+
        "insert into public.service_requests(id,customer_id,category_id,provider_id,service_types,status) values "+",".join(requests)+";\n"+
        "insert into public.service_quotes(id,request_id,provider_id,amount_cents,status) values "+",".join(quotes)+";\n"+
        "insert into public.f2_quote_items(quote_id,line_no,kind,code,amount_cents) values "+",".join(items)+";\n"+
        "insert into public.f2_request_offers(id,request_id,provider_id,status,offered_at,delivered_at,replied_at,quote_id) values "+",".join(offers)+";\ncommit;")

def accept(n, side, commit=True):
    return sql(f"begin; set local role authenticated; "
               f"set local request.jwt.claim.sub='{buyer(n)}'; "
               f"select public.f2_decide_quote('{quote(n,side)}',true); "
               + ("commit;" if commit else ""),
               expected_error="Titularidade ou estado incompatível" if commit else None)

def finance(n, commit=True):
    # One transaction locks the request, reuses the attempt and posts the receipt.
    # The same event on two separate connections must yield one journal only.
    return sql(f"""begin;
       set local app.f4_test_only='local_fixture';
       select private.f4_prepare_mock_attempt(q.id) from public.service_quotes q
        where q.request_id='{request(n)}' and q.status='accepted';
       select private.f4_ingest_mock_event(a.id,'load_payment_{n}','mock_payment_verified',29300)
        from private.f4_mock_payment_attempts a where a.request_id='{request(n)}';
       select private.f4_post_mock_double_entry(r.id)
        from private.f4_mock_webhook_receipts r where r.mock_event_id='load_payment_{n}';
       """ + ("commit;" if commit else ""))

def measure(tasks, fn):
    start = time.perf_counter()
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(fn, tasks))
    elapsed = time.perf_counter()-start
    times = sorted(t for _, t in results)
    return results, {"calls":len(tasks), "maxConcurrentConnections":WORKERS,
                    "elapsedMs":round(elapsed*1000,2),
                    "callsPerSecond":round(len(tasks)/elapsed,2),
                    "p50Ms":round(statistics.median(times),2),
                    "p95Ms":round(times[(95*len(times)+99)//100-1],2),
                    "maxMs":round(times[-1],2)}

def batch(start, count):
    seed(start,count)
    # Closing a connection with an open transaction must undo all its writes.
    out,_ = accept(start,0,commit=False)
    check(out=="awaiting_payment","Uncommitted acceptance did not execute")
    check(scalar(f"select status from public.service_requests where id='{request(start)}';")=="requested",
          "Uncommitted acceptance survived disconnect")
    check(scalar(f"select count(*) from public.service_quotes where request_id='{request(start)}' and status='accepted';")=="0",
          "Partial winner survived disconnect")
    pairs=[(n,s) for n in range(start,start+count) for s in (0,1)]
    results, acceptance=measure(pairs,lambda x:accept(*x))
    for i in range(count):
        check(sorted(r[0] for r in results[2*i:2*i+2])==["awaiting_payment","rejected"],
              "Expected exactly one winner per request")
    acceptance.update(winners=count,expectedConflicts=count,unexpectedFailures=0)
    out,_=finance(start,commit=False)
    check("mock_verified" in out,"Uncommitted finance did not execute")
    check(scalar(f"select count(*) from private.f4_mock_payment_attempts where request_id='{request(start)}';")=="0",
          "Partial financial attempt survived disconnect")
    check(scalar(f"select count(*) from private.f4_mock_webhook_receipts where mock_event_id='load_payment_{start}';")=="0",
          "Partial receipt survived disconnect")
    before=scalar("select count(*) from private.f4_mock_journals;")
    results, financial=measure([n for n in range(start,start+count) for _ in (0,1)],finance)
    for i in range(count):
        left,right=[r[0].splitlines() for r in results[2*i:2*i+2]]
        check(len(left)==len(right)==3 and left[0]==right[0] and left[2]==right[2]
              and sorted([left[1],right[1]])==["duplicate","mock_verified"],"Payment replay diverged")
    check(int(scalar("select count(*) from private.f4_mock_journals;"))-int(before)==count,"Journal duplicated")
    financial.update(uniqueReceipts=count,duplicateReplays=count,unexpectedFailures=0)
    return {"requests":count,"acceptance":acceptance,"financial":financial,
            "disconnectRollbackChecks":2}

def verify(count):
    q = """select count(*) from public.service_requests r
     where r.status<>'awaiting_payment'
     or (select count(*) from public.service_quotes q where q.request_id=r.id and q.status='accepted' and q.provider_id=r.provider_id)<>1
     or (select count(*) from public.service_quotes q where q.request_id=r.id and q.status='expired')<>1
     or (select count(*) from public.f2_request_offers o where o.request_id=r.id and o.status='selected' and o.provider_id=r.provider_id)<>1
     or (select count(*) from public.f2_request_offers o where o.request_id=r.id and o.status='not_selected')<>1;"""
    check(scalar(q)=="0","Request/quote/offer invariants failed")
    check(scalar(f"""select
     (select count(*) from public.service_requests)={count}
     and (select count(*) from public.service_quotes)={2*count}
     and (select count(*) from private.f4_mock_payment_attempts where status='mock_verified')={count}
     and (select count(*) from private.f4_mock_webhook_receipts)={count}
     and (select count(*) from private.f4_mock_ledger_entries)={count}
     and (select count(*) from private.f4_mock_journals)={count}
     and (select count(*) from private.f4_mock_journal_lines)={3*count}
     and (select sum(amount_cents) from private.f4_mock_ledger_entries)={29300*count}
     and (select sum(expected_provider_cents) from private.f4_mock_payment_attempts)={24700*count}
     and (select sum(commission_cents) from private.f4_mock_payment_attempts)={4600*count};""")=="t",
          "Financial counts or cent totals diverged")
    check(scalar("""select count(*) from (
       select journal_id from private.f4_mock_journal_lines group by journal_id
       having sum(case when side='debit' then amount_cents else -amount_cents end)<>0
       or count(*)<>3) bad;""")=="0","Unbalanced journal")
    check(scalar(f"""begin; set local role authenticated;
      set local request.jwt.claim.sub='{buyer(1)}';
      select count(*) from public.service_requests;
      select count(*) from public.f2_quote_items; rollback;""")=="1\n4","RLS cross-customer leak")
    check(scalar(f"""begin; set local role authenticated;
      set local request.jwt.claim.sub='{uid(999999)}';
      select count(*) from public.service_requests;
      select count(*) from public.f2_quote_items; rollback;""")=="0\n0","RLS outsider leak")

def main():
    check(os.environ.get("GITHUB_ACTIONS")=="true" and os.environ.get("SM_PG_LOAD_FIXTURE")=="yes",
          "Refusing non-CI execution")
    check(scalar("select current_database()='"+DB+"' and current_user='postgres' and inet_server_addr()='127.0.0.1'::inet and current_setting('server_version_num')::int between 170000 and 179999;")=="t",
          "Wrong disposable database")
    check(scalar("""select not (select enabled from private.f2_release_gate)
       and not (select enabled from private.f4_release_gate)
       and not exists(select 1 from public.service_requests)
       and not exists(select 1 from public.providers)
       and not exists(select 1 from private.f4_mock_payment_attempts)
       and not exists(select 1 from private.f4_mock_journals);""")=="t","Fixture not empty/closed")
    sql("insert into public.service_categories(id,code) values(2,'borracharia_delivery'); update private.f2_release_gate set enabled=true; update private.f4_release_gate set enabled=true;")
    try:
        batches=[batch(1,100),batch(101,300)]
        verify(400)
    finally:
        sql("update private.f2_release_gate set enabled=false; update private.f4_release_gate set enabled=false;")
    # Only on this new disposable database, no cascade or external destination.
    sql("""truncate private.f4_mock_journal_lines,private.f4_mock_journals,
      private.f4_mock_ledger_entries,private.f4_mock_webhook_receipts,private.f4_mock_payment_attempts,
      public.f2_quote_items,public.f2_request_offers,public.service_quotes,
      public.service_requests,public.f2_provider_capacity,public.bj_provider_presence,
      public.provider_services,public.providers,public.service_categories restart identity;""")
    check(scalar("""select not (select enabled from private.f2_release_gate)
     and not (select enabled from private.f4_release_gate)
     and not exists(select 1 from public.service_requests)
     and not exists(select 1 from private.f4_mock_payment_attempts)
     and not exists(select 1 from private.f4_mock_journals);""")=="t","Cleanup failed")
    print(json.dumps({"scope":"PG17_CI_DISPOSABLE_ONLY","batches":batches,
       "verifiedRequests":400,"uniqueJournals":400,"rls":"PASS","cleanup":"PASS",
       "hostedWrites":0,"realPayments":0,"release":"NO_GO"},indent=2))

if __name__ == "__main__":
    main()
