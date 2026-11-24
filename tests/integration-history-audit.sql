-- Diagnostic assertions, NOT a migration or approval of production readiness.
do $audit$
begin
 if current_database()<>'sm_history_disposable' then raise exception 'Wrong database'; end if;
 if (select enabled from private.f2_release_gate) or (select enabled from private.f3_release_gate)
 or (select enabled from private.f4_release_gate) or (select enabled from private.f5_mock_release_gate)
 or (select enabled from private.f6_mock_release_gate)
 then raise exception 'Candidate gate unexpectedly active'; end if;
 if exists(select 1 from public.service_requests) or exists(select 1 from public.payment_records)
 or exists(select 1 from auth.users) or exists(select 1 from storage.objects)
 then raise exception 'Unexpected data'; end if;
 if has_column_privilege('authenticated','public.service_requests','address_details','SELECT')
 or has_column_privilege('authenticated','public.service_requests','latitude','SELECT')
 or has_table_privilege('authenticated','public.service_quotes','INSERT')
 then raise exception 'Historical privacy guarantees lost'; end if;
 if exists(select 1 from pg_tables where schemaname='public' and tablename ~ '^(f[23456]_|f23_)' and not rowsecurity)
 then raise exception 'Candidate table without RLS'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^f[23456]_' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE'))
 then raise exception 'Anonymous execution of candidate RPC'; end if;
end $audit$;
-- Report known compatibility blockers rather than removing legacy safeguards.
select jsonb_build_object(
 'legacy_single_proposal_index',to_regclass('public.service_quotes_one_proposed_per_request') is not null,
 'legacy_customer_insert_requires_provider',(select qual is not null or with_check like '%provider_id IS NOT NULL%' from pg_policies where schemaname='public' and tablename='service_requests' and policyname='requests_customer_create'),
 'legacy_commission_15_constraint',exists(select 1 from pg_constraint where conrelid='public.payment_records'::regclass and conname='payment_records_commission_percent_check' and pg_get_constraintdef(oid) like '%15%'),
 'legacy_quote_rpc_callable',has_function_privilege('authenticated','public.bj_submit_quote(uuid,integer,text)','EXECUTE'),
 'legacy_cancel_rpc_callable',has_function_privilege('authenticated','public.bj_finish_request(uuid)','EXECUTE'),
 'tow_paid_in_app',(select paid_in_app from public.service_categories where code='reboque_moto'),
 'candidate_coexistence','DDL_ONLY','release','NO_GO') as compatibility;
