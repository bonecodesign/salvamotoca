-- F2/F3 -> F4/F5 adversarial check in ONE disposable PG17 transaction.
-- No PSP receipts, real messages, users, files, or remote SQL.
begin;
set local app.f234_test_only='disposable_pg17';
set local app.f456_test_only='disposable_pg17';
do $$
begin
 if (select enabled from private.f234_mock_gate where singleton)
  or (select enabled from private.f456_mock_gate where singleton)
  or (select count(*) from private.f456_mock_sessions)<>0
 then raise exception 'GATES_NOT_CLOSED_AT_START'; end if;
 if has_function_privilege('anon',
   'private.f234_mock_accept_quote(uuid,uuid,uuid,text,bigint)','EXECUTE')
  or has_function_privilege('authenticated',
   'private.f234_mock_accept_quote(uuid,uuid,uuid,text,bigint)','EXECUTE')
  or has_table_privilege('authenticated','private.f234_mock_quotes','SELECT')
  or has_table_privilege('authenticated','private.f234_mock_requests','UPDATE')
 then raise exception 'F234_MOCK_EXPOSED_TO_CLIENT'; end if;
 begin
  perform private.f234_mock_accept_quote(
   '33333333-3333-4333-8333-333333333333',
   '44444444-4444-4444-8444-444444444444',
   '11111111-1111-4111-8111-111111111111',
   'evt_accept_mock_initial',2000);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%F234_MOCK_GATE_DISABLED%' then raise; end if;
 end;
end $$;
update private.f234_mock_gate set enabled=true where singleton;
update private.f456_mock_gate set enabled=true where singleton;
do $$
declare
 r uuid:='33333333-3333-4333-8333-333333333333';
 c uuid:='11111111-1111-4111-8111-111111111111';
 p uuid:='22222222-2222-4222-8222-222222222222';
 a uuid:='44444444-4444-4444-8444-444444444444';
 b uuid:='55555555-5555-4555-8555-555555555555';
 tow uuid:='33333333-3333-4333-8333-333333333334';
 qt uuid:='66666666-6666-4666-8666-666666666666';
 bad_tow uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 fixture uuid:='99999999-9999-4999-8999-999999999999';
 z jsonb;
begin
 -- Wrong actor / wrong request/quote / expired quote / missing equipment.
 begin
  perform private.f234_mock_accept_quote(r,a,
   '55555555-5555-4555-8555-555555555555','evt_wrong_customer',2000);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%CUSTOMER_NOT_AUTHORIZED%' then raise; end if;
 end;
 begin
  perform private.f234_mock_accept_quote(r,qt,c,'evt_wrong_request',2000);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%QUOTE_NOT_CURRENT%' then raise; end if;
 end;
 begin
  perform private.f234_mock_accept_quote(r,a,c,'evt_expired_quote',3300);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%QUOTE_NOT_CURRENT%' then raise; end if;
 end;
 begin
  perform private.f234_mock_accept_quote(tow,bad_tow,c,'evt_bad_tow_01',2000);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%PROVIDER_NOT_ELIGIBLE%' then raise; end if;
 end;
 -- Cancel without accepted quote works, and cannot be undone via acceptance.
 if private.f234_mock_cancel_preaccept(
  '33333333-3333-4333-8333-333333333335',c)<>'cancelled_mock'
 then raise exception 'PRE_ACCEPT_CANCEL_NOT_APPLIED'; end if;
 begin
  perform private.f234_mock_accept_quote(
   '33333333-3333-4333-8333-333333333335',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',c,'evt_cancelled_reuse',2000);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%REQUEST_CLOSED%' then raise; end if;
 end;

 -- Selection creates the one and only frozen F456 session, NOT a payment.
 z:=private.f234_mock_accept_quote(r,a,c,'evt_select_tire_01',2000);
 if z->>'outcome'<>'accepted_mock' or z->>'realPspVerified'<>'false'
 then raise exception 'QUOTE_SELECTION_UNSAFE'; end if;
 if not exists(select 1 from private.f456_mock_sessions
  where request_id=r and quote_id=a and customer_id=c and provider_id=p
   and service_cents=23000 and travel_cents=4000
   and rider_fee_cents=2300 and provider_fee_cents=2300
   and customer_subtotal_cents=29300 and provider_receivable_cents=24700
   and platform_gross_cents=4600 and stage='awaiting_mock_payment'
   and not mock_paid and not real_payment_verified
   and not real_dispatch_authorized and not real_transfer_authorized)
 then raise exception 'BAD_F234_TO_F456_SNAPSHOT'; end if;
 if (select count(*) from private.f456_mock_journal)<>0
  or (select count(*) from private.f5_mock_outbox)<>0
 then raise exception 'ACCEPT_MUST_NOT_TRIGGER_PAYMENT_OR_DISPATCH'; end if;
 if (select count(*) from private.f234_mock_quotes
   where request_id=r and status='accepted')<>1
  or not exists(select 1 from private.f234_mock_quotes
    where quote_id=b and status='declined')
 then raise exception 'WINNER_NOT_EXCLUSIVE'; end if;
 z:=private.f234_mock_accept_quote(r,a,c,'evt_select_tire_01',2000);
 if z->>'outcome'<>'duplicate' or
  (select count(*) from private.f456_mock_sessions where request_id=r)<>1
 then raise exception 'SELECT_REPLAY_NOT_IDEMPOTENT'; end if;
 begin
  perform private.f234_mock_accept_quote(r,b,c,'evt_second_winner',2050);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%WINNER_ALREADY_SELECTED%' then raise; end if;
 end;
 begin
  update private.f234_mock_quotes set service_cents=19000 where quote_id=a;
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%ACCEPTED_QUOTE_IMMUTABLE%' then raise; end if;
 end;
 begin
  perform private.f234_mock_cancel_preaccept(r,c);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%FINANCIAL_SUPPORT_REVIEW_REQUIRED%' then raise; end if;
 end;
 begin
  perform private.f456_apply_mock_event(r,'evt_dispatch_before_paid',
    'mock_dispatch',p,2100);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%DISPATCH_NOT_AUTHORIZED%' then raise; end if;
 end;

 -- Attempt to adulterate F456 participant binding (rollback subtransaction).
 begin
  update private.f456_mock_sessions
   set provider_id='77777777-7777-4777-8777-777777777777'
   where request_id=r;
  perform private.f456_apply_mock_event(r,'evt_paid_bad_provider',
   'mock_payment_verified',fixture,2100,29300);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%PAYMENT_DISPATCH_BINDING_MISMATCH%' then raise; end if;
 end;

 -- Provider suspension between quote selection and payment must fail closed.
 update private.f234_mock_providers set active=false where provider_id=p;
 begin
  perform private.f456_apply_mock_event(r,'evt_paid_suspended',
   'mock_payment_verified',fixture,2100,29300);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%PROVIDER_REVOKED_AT_HANDOFF%' then raise; end if;
 end;
 update private.f234_mock_providers set active=true where provider_id=p;

 z:=private.f456_apply_mock_event(r,'evt_paid_fiction_01',
  'mock_payment_verified',fixture,2100,29300);
 if z->>'stage'<>'ready_for_dispatch'
 or (select count(*) from private.f456_mock_journal where request_id=r)<>1
 or (select count(*) from private.f5_mock_outbox)<>0
 then raise exception 'FICTITIOUS_PAYMENT_HANDOFF_BAD'; end if;
 z:=private.f456_apply_mock_event(r,'evt_paid_fiction_01',
  'mock_payment_verified',fixture,2100,29300);
 if z->>'outcome'<>'duplicate'
 then raise exception 'FICTITIOUS_PAYMENT_REPLAY_NOT_IDEMPOTENT'; end if;
 begin
  perform private.f456_apply_mock_event(r,'evt_paid_again_new_id',
   'mock_payment_verified',fixture,2150,29300);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%MOCK_PAYMENT_NOT_AUTHORIZED%' then raise; end if;
 end;

 -- After mock payment, but before dispatch, suspension must still deny.
 update private.f234_mock_providers set approved=false where provider_id=p;
 begin
  perform private.f456_apply_mock_event(r,'evt_dispatch_suspended',
   'mock_dispatch',p,2200);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%PROVIDER_REVOKED_AT_HANDOFF%' then raise; end if;
 end;
 update private.f234_mock_providers set approved=true where provider_id=p;
 z:=private.f456_apply_mock_event(r,'evt_dispatch_fiction_01',
  'mock_dispatch',p,2200);
 if z->>'stage'<>'en_route' or
  (select count(*) from private.f5_mock_outbox where request_id=r)<>1
  or not exists(select 1 from private.f5_mock_outbox
    where request_id=r and status='pending' and not external_sent)
 then raise exception 'F5_OUTBOX_NOT_ATOMIC'; end if;
 begin
  perform private.f456_apply_mock_event(r,'evt_dispatch_again',
    'mock_dispatch',p,2250);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%DISPATCH_NOT_AUTHORIZED%' then raise; end if;
 end;

 -- Chargeback fictício cancels pending outbox; no release or transfer.
 perform private.f456_apply_mock_event(r,'evt_mock_dispute_01',
  'mock_chargeback',fixture,2300,29300);
 if (select status from private.f456_mock_sessions where request_id=r)<>'mock_hold'
  or (select status from private.f5_mock_outbox where request_id=r)<>'cancelled'
  or exists(select 1 from private.f456_mock_sessions where request_id=r
   and (real_payment_verified or real_dispatch_authorized or real_transfer_authorized))
 then raise exception 'F5_RISK_NOT_REVOKED'; end if;

 -- Mixed reboque+troca_camara: only equipment-verified, weight-capable provider.
 z:=private.f234_mock_accept_quote(tow,qt,c,'evt_select_tow_01',2200);
 if z->>'stage'<>'awaiting_mock_payment'
  or not exists(select 1 from private.f456_mock_sessions
    where request_id=tow and quote_id=qt
    and provider_id='88888888-8888-4888-8888-888888888888'
    and service_cents=23500 and travel_cents=1500
    and customer_subtotal_cents=27350 and provider_receivable_cents=22650
    and platform_gross_cents=4700)
 then raise exception 'MIXED_TOW_NOT_HONOURED'; end if;
 if (select count(*) from private.f456_mock_journal)<>1
 then raise exception 'TOW_SELECTION_CREATED_FINANCIAL_JOURNAL'; end if;
end $$;
rollback;
do $$
begin
 if (select enabled from private.f234_mock_gate where singleton)
  or (select enabled from private.f456_mock_gate where singleton)
  or (select count(*) from private.f456_mock_sessions)<>0
  or (select count(*) from private.f456_mock_events)<>0
  or (select count(*) from private.f456_mock_journal)<>0
  or (select count(*) from private.f5_mock_outbox)<>0
  or (select count(*) from private.f234_mock_quotes where status='accepted')<>0
  or (select count(*) from private.f234_mock_requests
      where state<>'requested')<>0
 then raise exception 'F234_TRANSACTION_NOT_ROLLED_BACK'; end if;
end $$;
