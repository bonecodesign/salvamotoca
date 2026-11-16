-- SM! F1/F4/F5: adversarial authorization tests, entirely synthetic PG17.
-- No network, no real accounts, no PSP. All state transitions rolled back.
begin;
do $$
begin
 if (select enabled from private.f1_location_release_gate where singleton)
 or (select enabled from private.f1_mock_f4_release_gate where singleton)
 then raise exception 'F1/F4 mock gate must begin disabled'; end if;
 if has_function_privilege('anon','private.f1_location_financial_lifecycle_fixture(uuid)','EXECUTE')
 then raise exception 'Anon must not invoke provider location'; end if;
 if has_table_privilege('authenticated','private.f1_mock_f4_decisions','SELECT')
 or has_table_privilege('authenticated','private.f1_mock_f4_decisions','UPDATE')
 or has_table_privilege('authenticated','private.f1_mock_f5_sessions','UPDATE')
 then raise exception 'Financial or lifecycle mock table exposed'; end if;
 if (select service_cents from private.f1_mock_f4_decisions)<>23000
 or (select travel_cents from private.f1_mock_f4_decisions)<>4000
 or (select rider_total_cents from private.f1_mock_f4_decisions)<>29300
 or (select provider_payable_cents from private.f1_mock_f4_decisions)<>24700
 or (select platform_gross_cents from private.f1_mock_f4_decisions)<>4600
 then raise exception '10+10 mock financial snapshot inconsistent'; end if;
end $$;

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>1
 then raise exception 'Owner may read their own location even with gates off: unexpected address access'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Unrelated customer cannot read address: unexpected address access'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Provider blocked by both gates: unexpected address access'; end if;
end $$;
reset role;

update private.f1_location_release_gate set enabled=true where singleton;

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'F1 alone cannot release provider address: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f4_release_gate set enabled=true where singleton;

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Legacy paid status cannot bypass awaiting_payment: unexpected address access'; end if;
end $$;
reset role;

update public.service_requests set status='accepted' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Request accepted but F5 not dispatched: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f5_sessions set stage='ready_for_dispatch' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Ready for dispatch is not en route: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f5_sessions set stage='en_route' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>1
 then raise exception 'Provider access is valid only in en_route synthetic scenario: unexpected address access'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Third party remains denied even when gates enabled: unexpected address access'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Other provider remains denied: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f4_decisions set status='awaiting' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Legacy paid alone cannot bypass F4 authorization: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f4_decisions set status='mock_confirmed' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

update private.f1_mock_f4_decisions set risk_status='disputed' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'disputed must revoke address: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f4_decisions set risk_status='clear' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

update private.f1_mock_f4_decisions set risk_status='refunded' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'refunded must revoke address: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f4_decisions set risk_status='clear' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

update private.f1_mock_f4_decisions set risk_status='chargeback' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'chargeback must revoke address: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f4_decisions set risk_status='clear' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

update private.f1_mock_f4_decisions set revoked_at=now() where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Explicit financial revocation: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f4_decisions set revoked_at=null where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

update private.f1_mock_f5_sessions set stage='arrived' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'F5 status arrived may not expose location: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f5_sessions set stage='in_service' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'F5 status in_service may not expose location: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f5_sessions set stage='handoff_f6' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'F5 status handoff_f6 may not expose location: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f5_sessions set stage='support_review' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'F5 status support_review may not expose location: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f5_sessions set stage='completed' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'F5 status completed may not expose location: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f5_sessions set stage='cancelled' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'F5 status cancelled may not expose location: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f5_sessions set stage='en_route' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

update public.providers set status='suspended' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Suspension immediately revokes: unexpected address access'; end if;
end $$;
reset role;

update public.providers set status='approved',is_active=false where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Inactive provider revokes: unexpected address access'; end if;
end $$;
reset role;

update public.providers set is_active=true where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

update public.service_quotes set status='declined' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Declined quote denied: unexpected address access'; end if;
end $$;
reset role;

update public.service_quotes set status='accepted' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

insert into public.service_quotes(id,request_id,provider_id,status) values('ffffffff-ffff-4fff-8fff-ffffffffffff','cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','accepted');

update private.f1_mock_f5_sessions set quote_id='ffffffff-ffff-4fff-8fff-ffffffffffff' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Accepted quote of F5 must bind to F4 financial record: unexpected address access'; end if;
end $$;
reset role;

update private.f1_mock_f5_sessions set quote_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

update public.service_requests set provider_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Reassigned provider loses address: unexpected address access'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'New provider cannot access without accepted quote and session: unexpected address access'; end if;
end $$;
reset role;

update public.service_requests set provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

update public.service_requests set status='completed' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Request status completed revoked: unexpected address access'; end if;
end $$;
reset role;

update public.service_requests set status='cancelled' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Request status cancelled revoked: unexpected address access'; end if;
end $$;
reset role;

update public.service_requests set status='awaiting_payment' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Request status awaiting_payment revoked: unexpected address access'; end if;
end $$;
reset role;

update public.service_requests set status='accepted' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

update public.payment_records set status='refunded' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Legacy refunded status never releases: unexpected address access'; end if;
end $$;
reset role;

update public.payment_records set status='paid',paid_at=null where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Legacy status paid without timestamp is insufficient: unexpected address access'; end if;
end $$;
reset role;

update public.payment_records set paid_at=now()+interval '1 hour' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Future payment timestamp is invalid: unexpected address access'; end if;
end $$;
reset role;

update public.payment_records set paid_at=now()-interval '1 minute' where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>1
 then raise exception 'Final authorized synthetic fixture during travel: unexpected address access'; end if;
end $$;
reset role;

do $$
begin
  -- Invalid snapshot cannot masquerade as 15% customer/5% provider.
  begin
    update private.f1_mock_f4_decisions
      set rider_total_cents=30450
      where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception '15 percent legacy amount accepted';
  exception
    when check_violation then null;
  end;
  begin
    update private.f1_mock_f4_decisions
      set provider_payable_cents=24550
      where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception '15 percent provider deduction accepted';
  exception
    when check_violation then null;
  end;
end $$;

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_financial_lifecycle_fixture('cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>1
 then raise exception 'Constraints retained valid split after rejected edits: unexpected address access'; end if;
end $$;
reset role;

rollback;
do $$
begin
 if (select enabled from private.f1_location_release_gate where singleton)
 or (select enabled from private.f1_mock_f4_release_gate where singleton)
 then raise exception 'Synthetic gate still enabled after rollback'; end if;
 if (select stage from private.f1_mock_f5_sessions)<>'awaiting_payment'
 or (select status from public.service_requests)<>'awaiting_payment'
 or (select risk_status from private.f1_mock_f4_decisions)<>'clear'
 then raise exception 'Fixture not reset after adversarial test'; end if;
end $$;
