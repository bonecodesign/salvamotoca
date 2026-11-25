-- Disposable cutover final assertion. Called inside the single transaction.
do $check$
begin
 if current_database()<>'sm_history_disposable' then raise exception 'Wrong fixture';end if;
 if (select enabled from private.f2_release_gate) is distinct from false
 or (select enabled from private.f3_release_gate) is distinct from false
 or (select enabled from private.f4_release_gate) is distinct from false
 or (select enabled from private.f5_mock_release_gate) is distinct from false
 or (select enabled from private.f6_mock_release_gate) is distinct from false
 or (select enabled from private.f23_mock_support_gate) is distinct from false
 or exists(select 1 from private.f56_native_fixture_marker)
 then raise exception 'Operational gate unexpectedly open';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity)
 then raise exception 'RLS missing';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname ~ '^f[234567]_' or p.proname in
 ('bj_answer_quote','bj_finish_request','bj_get_request_location','bj_ping_presence','bj_set_presence','bj_submit_quote'))
 and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE')))
 then raise exception 'Operational RPC exposed during closed cutover';end if;
 if not has_function_privilege('anon','public.bj_online_providers()','EXECUTE')
 then raise exception 'Catalog unavailable';end if;
 if exists(select 1 from public.service_requests) or exists(select 1 from public.payment_records)
 or exists(select 1 from auth.users) or exists(select 1 from storage.objects)
 then raise exception 'Unexpected operational data';end if;
end $check$;
-- Force deferred constraints before rolling back the entire rehearsal.
set constraints all immediate;
select 'F7_CUTOVER_CLOSED=PASS SIX_GATES=OFF RPC_CLOSED=PASS';
