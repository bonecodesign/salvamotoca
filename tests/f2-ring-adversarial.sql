-- F2 synthetic 5/15/60km ring escalation adversarial, PG17 isolated only.
-- Changes deliberately rolled back; zero remote messages or real deliveries.
begin;
do $$
begin
 if (select enabled from private.f2_mock_ring_gate where singleton)
 then raise exception 'F2_GATE_DEFAULT_NOT_FALSE'; end if;
 if has_function_privilege('authenticated',
  'private.f2_mock_advance_ring(uuid,bigint)','EXECUTE')
 or has_function_privilege('anon',
  'private.f2_mock_open_invite(uuid,uuid,bigint)','EXECUTE')
 or has_table_privilege('authenticated','private.f2_mock_invites','SELECT')
 or has_table_privilege('authenticated','private.f2_mock_ring_progress','UPDATE')
 then raise exception 'F2_CLIENT_PERMISSIONS_TOO_BROAD'; end if;
end $$;
set local app.f2_ring_test_only='disposable_pg17';
do $$
begin
 begin
  perform private.f2_mock_advance_ring(
    '11111111-aaaa-4111-8111-111111111111',1000000);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%F2_OFFLINE_GATE_DISABLED%' then raise; end if;
 end;
end $$;
update private.f2_mock_ring_gate set enabled=true where singleton;
do $$
declare
 r uuid:='11111111-aaaa-4111-8111-111111111111';
 a uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 f uuid:='ffffffff-ffff-4fff-8fff-ffffffffffff';
 b uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 c uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 offer uuid;
 result jsonb;
begin
 result:=private.f2_mock_advance_ring(r,1000000);
 if result->>'status'<>'invited_mock' or (result->>'ring')::int<>1
  or (result->>'radiusKm')::int<>5 or result->>'providerId'<>a::text
 then raise exception 'FIRST_RING_NOT_NEAREST'; end if;
 offer:=(result->>'offerId')::uuid;
 if (private.f2_mock_advance_ring(r,1000010))->>'status'<>'waiting'
 then raise exception 'ACTIVE_INVITE_DUPLICATED'; end if;
 begin
  perform private.f2_mock_open_invite(offer,b,1100000);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%UNAUTHORIZED_MOCK_OPEN%' then raise; end if;
 end;
 if private.f2_mock_open_invite(offer,a,1100000)<>'opened_mock'
 or private.f2_mock_open_invite(offer,a,1100001)<>'duplicate_mock_open'
 then raise exception 'OPEN_NOT_IDEMPOTENT'; end if;
 if (private.f2_mock_advance_ring(r,1399999))->>'status'<>'waiting'
 then raise exception 'ACK_WINDOW_NOT_PRESERVED'; end if;

 -- Still a near provider available: exhaust current ring before expanding.
 result:=private.f2_mock_advance_ring(r,1400000);
 if result->>'status'<>'invited_mock' or (result->>'ring')::int<>1
  or result->>'providerId'<>f::text
 then raise exception 'NEAR_NEXT_BEFORE_RADIUS_EXPANSION'; end if;
 if not exists(select 1 from private.f2_mock_invites
    where request_id=r and provider_id=a
    and status='expired_after_ack' and not absence_counted
    and not delivery_verified)
 then raise exception 'ACK_TIMEOUT_WRONG_ABSENCE'; end if;
 if (private.f2_mock_advance_ring(r,1699999))->>'status'<>'waiting'
 then raise exception 'UNACKED_INVITE_TIMEOUT_TOO_EARLY'; end if;

 -- No mock ACK/delivery => can retry another provider, no absence credited.
 result:=private.f2_mock_advance_ring(r,1700000);
 if result->>'status'<>'invited_mock' or (result->>'ring')::int<>2
  or (result->>'radiusKm')::int<>15 or result->>'providerId'<>b::text
 then raise exception 'SECOND_RING_AFTER_NEAR_EXHAUSTION'; end if;
 if not exists(select 1 from private.f2_mock_invites
    where request_id=r and provider_id=f
    and status='expired_no_delivery' and not absence_counted
    and not delivery_verified)
 then raise exception 'UNDLIVERED_INVITE_COUNTED_AS_ABSENCE'; end if;
 offer:=(result->>'offerId')::uuid;
 begin
  perform private.f2_mock_decline_invite(offer,a,1710000);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%DECLINE_NOT_AUTHORIZED%' then raise; end if;
 end;
 if private.f2_mock_decline_invite(offer,b,1710000)<>'declined_mock'
 then raise exception 'VOLUNTARY_DECLINE_NOT_SUPPORTED'; end if;

 result:=private.f2_mock_advance_ring(r,1710001);
 if result->>'status'<>'invited_mock' or (result->>'ring')::int<>3
  or (result->>'radiusKm')::int<>60 or result->>'providerId'<>c::text
 then raise exception 'FAR_THIRD_RING_NOT_LAST'; end if;
 if (select count(*) from private.f2_mock_invites where request_id=r)<>4
 or (select count(distinct provider_id) from private.f2_mock_invites
     where request_id=r)<>4
 then raise exception 'PROVIDER_DUPLICATED_OR_SKIPPED'; end if;
 if exists(select 1 from private.f2_mock_invites i
  join public.providers p on p.id=i.provider_id
  where i.request_id=r and
    (p.status<>'approved' or not p.is_active or p.id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'))
 then raise exception 'SUSPENDED_OR_WRONG_SERVICE_INVITED'; end if;
 if exists(select 1 from private.f2_mock_invites
    where external_sent or delivery_verified or absence_counted)
 then raise exception 'MOCK_PRETENDS_REAL_DELIVERY_OR_ABSENCE'; end if;
 if exists(select 1 from public.service_requests
  where id=r and provider_id is not null)
 then raise exception 'F1_PROVIDER_ASSIGNMENT_STILL_ACTIVE'; end if;

 -- Accepted quote/payment handoff prevents any further invite.
 update public.service_requests set status='awaiting_payment' where id=r;
 result:=private.f2_mock_advance_ring(r,1710100);
 if result->>'status'<>'blocked'
 or (select status from private.f2_mock_invites
     where request_id=r and provider_id=c)<>'cancelled'
 then raise exception 'ACCEPTED_REQUEST_STILL_ROUTED'; end if;
 if (select count(*) from public.service_quotes where request_id=r)<>0
 then raise exception 'F2_TEST_CREATED_QUOTE'; end if;

 -- Manual choice must never fall through to automatic broadening.
 update public.service_requests
  set f2_mode='manual' where id='11111111-bbbb-4111-8111-111111111111';
 begin
  perform private.f2_mock_advance_ring(
     '11111111-bbbb-4111-8111-111111111111',1000000);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%REQUEST_NOT_ELIGIBLE_FOR_F2_AUTOMATIC%' then raise; end if;
 end;
end $$;
rollback;
do $$
begin
 if (select enabled from private.f2_mock_ring_gate where singleton)
 or (select count(*) from private.f2_mock_invites)<>0
 or (select count(*) from private.f2_mock_ring_progress)<>0
 or (select count(*) from public.f2_request_offers)<>0
 or (select count(*) from public.service_quotes)<>0
 then raise exception 'F2_RING_ROLLBACK_FAILED'; end if;
 if (select count(*) from public.service_requests where status='requested')<>2
 then raise exception 'F2_ROLLBACK_CHANGED_REQUESTS'; end if;
end $$;
