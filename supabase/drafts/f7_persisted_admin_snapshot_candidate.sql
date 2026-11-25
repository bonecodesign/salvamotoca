-- Disposable integration fixture only, never a hosted migration.
begin;
create function private.f7_mock_admin_snapshot()
returns jsonb language plpgsql security definer set search_path='' as $snapshot$
declare data jsonb;
begin
 if current_database()<>'sm_history_disposable' then raise exception 'Somente fixture descartavel.';end if;
 perform private.f23_mock_require_admin();
 -- Return aggregates and a bounded incident queue, not user identifiers, GPS,
 -- chat bodies or private payment events. A case key is an opaque action handle.
 with review as (
  select i.status,a.expected_provider_cents,a.commission_cents,
   (i.status='review_only' and a.status='mock_verified' and r.status='awaiting_payment'
    and r.customer_id=s.customer_id and r.provider_id=s.provider_id
    and q.status='accepted' and q.request_id=r.id and q.provider_id=s.provider_id
    and p.owner_id=s.provider_owner_id and p.status='approved' and p.is_active
    and s.status='handoff_f6' and s.mock_paid and c.status='completed'
    and c.customer_confirmed_at is not null and c.provider_confirmed_at is not null
    and not exists(select 1 from private.f5_mock_revocations v where v.session_id=s.id)
    and not exists(select 1 from private.f4_mock_risk_cases k where k.attempt_id=a.id and k.status='review_required')
    and not exists(select 1 from public.f23_mock_incidents k where k.request_key=r.id
     and k.category in ('payment_dispute','safety_report') and k.status<>'reviewed_mock')) as eligible
   from private.f4_mock_settlement_intents i
   join private.f4_mock_payment_attempts a on a.id=i.attempt_id
   join public.f5_mock_sessions s on s.request_id=a.request_id and s.quote_id=a.quote_id
     and s.customer_id=a.customer_id and s.provider_id=a.provider_id
   join public.service_requests r on r.id=s.request_id
   join public.service_quotes q on q.id=s.quote_id
   join public.providers p on p.id=s.provider_id
   join public.f6_mock_completions c on c.session_id=s.id
 ), queue as (
  select case_key,category,status,version,
   case category when 'safety_report' then 0 when 'payment_dispute' then 1 else 2 end as priority,
   opened_at
  from public.f23_mock_incidents
  order by (status='reviewed_mock'),priority,opened_at,case_key limit 100
 )
 select jsonb_build_object(
  'mockOnly',true,'productionAuthorized',false,'transferAuthorized',false,
  'refundAuthorized',false,'realFundsAvailable',null,
  'sessions',(select count(*) from public.f5_mock_sessions),
  'completed',(select count(*) from public.f6_mock_completions where status='completed'),
  'pendingIncidents',(select count(*) from public.f23_mock_incidents where status<>'reviewed_mock'),
  'criticalPending',(select count(*) from public.f23_mock_incidents where category='safety_report' and status in ('queued_mock','escalated_uncovered_mock')),
  'reviewCandidates',(select count(*) from review where eligible is true),
  'heldReviews',(select count(*) from private.f4_mock_settlement_intents)-(select count(*) from review where eligible is true),
  'providerReviewCents',(select coalesce(sum(expected_provider_cents),0) from review where eligible is true),
  'commissionReviewCents',(select coalesce(sum(commission_cents),0) from review where eligible is true),
  'queue',(select coalesce(jsonb_agg(jsonb_build_object('caseKey',case_key,'category',category,'status',status,'version',version,'priority',priority) order by (status='reviewed_mock'),priority,opened_at,case_key),'[]'::jsonb) from queue)
 ) into data;
 return data;
end $snapshot$;
revoke all on function private.f7_mock_admin_snapshot() from public,anon,authenticated;
grant execute on function private.f7_mock_admin_snapshot() to authenticated;
create function public.f7_mock_admin_snapshot()
returns jsonb language sql security invoker set search_path='' as $snapshot$
 select private.f7_mock_admin_snapshot();
$snapshot$;
revoke all on function public.f7_mock_admin_snapshot() from public,anon,authenticated;
grant execute on function public.f7_mock_admin_snapshot() to authenticated;
commit;
