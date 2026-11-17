-- F456 adversarial fixture, disposable PostgreSQL 17 ONLY.
-- All modifications happen INSIDE a transaction and finish with ROLLBACK.
begin;
update private.f456_mock_gate set enabled=true where singleton;
set app.f456_test_only='disposable_pg17';

do $$
declare r uuid:='33333333-3333-4333-8333-333333333333';
 q jsonb; s record;
begin
 if has_function_privilege('anon',
   'private.f456_apply_mock_event(uuid,text,text,uuid,bigint,integer,boolean)','EXECUTE')
  or has_function_privilege('authenticated',
   'private.f456_apply_mock_event(uuid,text,text,uuid,bigint,integer,boolean)','EXECUTE')
 then raise exception 'UNSAFE_PUBLIC_EXECUTE'; end if;
 if has_table_privilege('authenticated','private.f456_mock_sessions','SELECT')
  or has_table_privilege('authenticated','private.f456_mock_events','INSERT')
 then raise exception 'UNSAFE_PRIVATE_TABLE_GRANTS'; end if;
 if not exists(select 1 from private.f456_mock_sessions where request_id=r
  and service_cents=23000 and travel_cents=4000 and customer_subtotal_cents=29300
  and provider_receivable_cents=24700 and platform_gross_cents=4600
  and real_payment_verified=false and real_dispatch_authorized=false
  and real_transfer_authorized=false)
 then raise exception 'BAD_10X10_FIXTURE'; end if;

 -- No dispatch, refund or outsider fake payment before a verified local fixture.
 begin
  perform private.f456_apply_mock_event(r,'evt_pre_dispatch','mock_dispatch',
   '22222222-2222-4222-8222-222222222222',1100);
  raise exception 'UNEXPECTED_PASS';
 exception when others then
  if sqlerrm not like '%DISPATCH_NOT_AUTHORIZED%' then raise; end if;
 end;
 begin
  perform private.f456_apply_mock_event(r,'evt_pre_risk','mock_dispute',
   '99999999-9999-4999-8999-999999999999',1100,29300);
  raise exception 'UNEXPECTED_PASS';
 exception when others then
  if sqlerrm not like '%RISK_NOT_AUTHORIZED%' then raise; end if;
 end;
 begin
  perform private.f456_apply_mock_event(r,'evt_fake_paid','mock_payment_verified',
   '99999999-9999-4999-8999-999999999999',1200,27000);
  raise exception 'UNEXPECTED_PASS';
 exception when others then
  if sqlerrm not like '%MOCK_PAYMENT_NOT_AUTHORIZED%' then raise; end if;
 end;
 begin
  perform private.f456_apply_mock_event(r,'evt_fake_actor','mock_payment_verified',
   '11111111-1111-4111-8111-111111111111',1200,29300);
  raise exception 'UNEXPECTED_PASS';
 exception when others then
  if sqlerrm not like '%MOCK_PAYMENT_NOT_AUTHORIZED%' then raise; end if;
 end;

 q:=private.f456_apply_mock_event(r,'evt_mock_paid_001',
  'mock_payment_verified','99999999-9999-4999-8999-999999999999',1200,29300);
 if q->>'outcome'<>'applied' or q->>'stage'<>'ready_for_dispatch'
 then raise exception 'PAYMENT_MOCK_NOT_RECORDED'; end if;
 if (select count(*) from private.f456_mock_journal)<>1
  or not exists(select 1 from private.f456_mock_journal
   where customer_debit_cents=29300 and provider_credit_cents=24700
   and platform_credit_cents=4600)
 then raise exception 'BAD_MOCK_JOURNAL'; end if;
 q:=private.f456_apply_mock_event(r,'evt_mock_paid_001',
  'mock_payment_verified','99999999-9999-4999-8999-999999999999',1200,29300);
 if q->>'outcome'<>'duplicate' then raise exception 'REPLAY_NOT_IDEMPOTENT'; end if;
 begin
  perform private.f456_apply_mock_event(r,'evt_mock_paid_001','mock_payment_verified',
   '99999999-9999-4999-8999-999999999999',1200,30450);
  raise exception 'UNEXPECTED_PASS';
 exception when others then
  if sqlerrm not like '%REPLAY_EVENT_ID_PAYLOAD_MISMATCH%' then raise; end if;
 end;

 -- Deny an unrelated provider; never accept a financial field in dispatch.
 begin
  perform private.f456_apply_mock_event(r,'evt_bad_owner','mock_dispatch',
   '55555555-5555-4555-8555-555555555555',1300);
  raise exception 'UNEXPECTED_PASS';
 exception when others then
  if sqlerrm not like '%DISPATCH_NOT_AUTHORIZED%' then raise; end if;
 end;
 begin
  perform private.f456_apply_mock_event(r,'evt_bad_field','mock_dispatch',
   '22222222-2222-4222-8222-222222222222',1300,1);
  raise exception 'UNEXPECTED_PASS';
 exception when others then
  if sqlerrm not like '%UNEXPECTED_FINANCIAL_FIELD%' then raise; end if;
 end;
 if (select stage from private.f456_mock_sessions where request_id=r)<>'ready_for_dispatch'
 then raise exception 'BAD_EVENT_MUTATED_SESSION'; end if;

 perform private.f456_apply_mock_event(r,'evt_dispatch_001','mock_dispatch',
  '22222222-2222-4222-8222-222222222222',1300);
 begin
  perform private.f456_apply_mock_event(r,'evt_dispatch_002','mock_dispatch',
   '22222222-2222-4222-8222-222222222222',1301);
  raise exception 'UNEXPECTED_PASS';
 exception when others then
  if sqlerrm not like '%DISPATCH_NOT_AUTHORIZED%' then raise; end if;
 end;
 perform private.f456_apply_mock_event(r,'evt_arrived_001','mock_arrival',
  '22222222-2222-4222-8222-222222222222',1400);
 perform private.f456_apply_mock_event(r,'evt_service_001','mock_service_started',
  '22222222-2222-4222-8222-222222222222',1500);
 perform private.f456_apply_mock_event(r,'evt_summary_001','mock_summary_submitted',
  '22222222-2222-4222-8222-222222222222',1600);
 begin
  perform private.f456_apply_mock_event(r,'evt_customer_unread','mock_customer_confirmed',
   '11111111-1111-4111-8111-111111111111',1700,null,false);
  raise exception 'UNEXPECTED_PASS';
 exception when others then
  if sqlerrm not like '%CUSTOMER_CONFIRM_NOT_AUTHORIZED%' then raise; end if;
 end;
 perform private.f456_apply_mock_event(r,'evt_customer_001','mock_customer_confirmed',
  '11111111-1111-4111-8111-111111111111',1700,null,true);
 if (select stage from private.f456_mock_sessions where request_id=r)<>'awaiting_both'
 then raise exception 'SINGLE_CONFIRMATION_COMPLETED'; end if;
 perform private.f456_apply_mock_event(r,'evt_provider_001','mock_provider_confirmed',
  '22222222-2222-4222-8222-222222222222',1800);
 if not exists(select 1 from private.f456_mock_sessions where request_id=r
  and stage='completed' and customer_confirmed and provider_confirmed
  and not real_transfer_authorized)
 then raise exception 'BILATERAL_COMPLETION_BAD'; end if;

 -- A late chargeback always overrides completion review and blocks further events.
 perform private.f456_apply_mock_event(r,'evt_dispute_001','mock_chargeback',
  '99999999-9999-4999-8999-999999999999',1900,29300);
 if (select stage from private.f456_mock_sessions where request_id=r)<>'mock_hold'
 then raise exception 'RISK_NOT_REVOKED'; end if;
 begin
  perform private.f456_apply_mock_event(r,'evt_after_risk','mock_dispatch',
   '22222222-2222-4222-8222-222222222222',2000);
  raise exception 'UNEXPECTED_PASS';
 exception when others then
  if sqlerrm not like '%DISPATCH_NOT_AUTHORIZED%' then raise; end if;
 end;
 if (select count(*) from private.f456_mock_journal)<>1
 then raise exception 'RISK_CREATED_EXTRA_JOURNAL'; end if;

 -- 15 percent legacy financial figures violate database constraints.
 begin
  update private.f456_mock_sessions set customer_subtotal_cents=30450
   where request_id=r;
  raise exception 'UNEXPECTED_PASS';
 exception when check_violation then null; end;
 begin
  update private.f456_mock_sessions set provider_receivable_cents=23550
   where request_id=r;
  raise exception 'UNEXPECTED_PASS';
 exception when check_violation then null; end;

 -- Second artificial request: 5-minute window cannot be bypassed.
 insert into private.f456_mock_sessions(request_id,quote_id,customer_id,
  provider_id,service_cents,travel_cents,quote_total_cents,rider_fee_cents,
  provider_fee_cents,customer_subtotal_cents,provider_receivable_cents,platform_gross_cents)
 values('55555555-5555-4555-8555-555555555556','55555555-5555-4555-8555-555555555557',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  23000,4000,27000,2300,2300,29300,24700,4600);
 r:='55555555-5555-4555-8555-555555555556';
 perform private.f456_apply_mock_event(r,'evt_paid_second_001','mock_payment_verified',
  '99999999-9999-4999-8999-999999999999',1200,29300);
 perform private.f456_apply_mock_event(r,'evt_dispatch_second','mock_dispatch',
  '22222222-2222-4222-8222-222222222222',1300);
 perform private.f456_apply_mock_event(r,'evt_arrive_second_1','mock_arrival',
  '22222222-2222-4222-8222-222222222222',1400);
 perform private.f456_apply_mock_event(r,'evt_start_second_1','mock_service_started',
  '22222222-2222-4222-8222-222222222222',1500);
 perform private.f456_apply_mock_event(r,'evt_summary_second','mock_summary_submitted',
  '22222222-2222-4222-8222-222222222222',1600);
 perform private.f456_apply_mock_event(r,'evt_provider_second','mock_provider_confirmed',
  '22222222-2222-4222-8222-222222222222',1700);
 begin
  perform private.f456_apply_mock_event(r,'evt_customer_late_1','mock_customer_confirmed',
   '11111111-1111-4111-8111-111111111111',301601,null,true);
  raise exception 'UNEXPECTED_PASS';
 exception when others then
  if sqlerrm not like '%CUSTOMER_CONFIRM_NOT_AUTHORIZED%' then raise; end if;
 end;
 if (select stage from private.f456_mock_sessions where request_id=r)<>'awaiting_both'
 then raise exception 'SILENCE_COMPLETED_SERVICE'; end if;
end $$;
rollback;
do $$
begin
 if (select enabled from private.f456_mock_gate where singleton)
 then raise exception 'MOCK_GATE_LEFT_ENABLED'; end if;
 if (select stage from private.f456_mock_sessions limit 1)<>'awaiting_mock_payment'
 or (select count(*) from private.f456_mock_events)<>0
 or (select count(*) from private.f456_mock_journal)<>0
 or (select count(*) from private.f456_mock_sessions)<>1
 then raise exception 'TEST_NOT_ROLLED_BACK'; end if;
end $$;
