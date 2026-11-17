-- F5 private outbox adversarial proof, ALL rows synthetic, PG17 disposable only.
-- Every modification is rolled back. No API/notification/SMS/push/GPS.
begin;
update private.f456_mock_gate set enabled=true where singleton;
set local app.f456_test_only='disposable_pg17';

do $$
declare
 r uuid:='33333333-3333-4333-8333-333333333333';
 p uuid:='22222222-2222-4222-8222-222222222222';
 fixture uuid:='99999999-9999-4999-8999-999999999999';
 j jsonb; job bigint; token uuid; next_token uuid; r2 uuid;
begin
 if has_table_privilege('authenticated','private.f5_mock_outbox','SELECT')
  or has_table_privilege('authenticated','private.f5_mock_outbox','UPDATE')
  or has_function_privilege('anon','private.f5_mock_outbox_claim(text,bigint)','EXECUTE')
  or has_function_privilege('authenticated','private.f5_mock_outbox_ack(bigint,text,uuid,bigint)','EXECUTE')
 then raise exception 'OUTBOX_PRIVILEGE_LEAK'; end if;
 if (select count(*) from private.f5_mock_outbox)<>0
 then raise exception 'OUTBOX_INIT_NOT_EMPTY'; end if;

 -- A payment alone does not produce an outbound notification.
 perform private.f456_apply_mock_event(r,'evt_ob_paid_01',
  'mock_payment_verified',fixture,1100,29300);
 if (select count(*) from private.f5_mock_outbox)<>0
 then raise exception 'PAYMENT_NOT_ALLOWED_TO_DISPATCH'; end if;
 perform private.f456_apply_mock_event(r,'evt_ob_dispatch_01',
  'mock_dispatch',p,1200);
 if (select count(*) from private.f5_mock_outbox)<>1
 then raise exception 'OUTBOX_NOT_ATOMIC_WITH_DISPATCH'; end if;
 if exists(select 1 from private.f5_mock_outbox where recipient_id<>p)
 then raise exception 'OUTBOX_WRONG_RECIPIENT'; end if;
 j:=private.f5_mock_outbox_claim('worker_alpha',1300);
 if j->>'status'<>'leased' or j->>'externalSent'<>'false'
  or (j->>'attempt')::int<>1
 then raise exception 'BAD_CLAIM'; end if;
 job:=(j->>'jobId')::bigint;token:=(j->>'claimToken')::uuid;
 begin
  perform private.f5_mock_outbox_ack(job,'worker_beta',token,1400);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%STALE_OR_FOREIGN_CLAIM%' then raise; end if;
 end;
 begin
  perform private.f5_mock_outbox_ack(job,'worker_alpha',token,31301);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%STALE_OR_FOREIGN_CLAIM%' then raise; end if;
 end;
 if private.f5_mock_outbox_fail(job,'worker_alpha',token,1400)<>'pending'
 then raise exception 'RETRY_NOT_PENDING'; end if;
 if (private.f5_mock_outbox_claim('worker_alpha',2000))->>'status'<>'empty'
 then raise exception 'BACKOFF_IGNORED'; end if;
 j:=private.f5_mock_outbox_claim('worker_beta',2400);
 if j->>'status'<>'leased' or (j->>'attempt')::int<>2
 then raise exception 'RETRY_NOT_LEASED'; end if;
 next_token:=(j->>'claimToken')::uuid;
 begin
  perform private.f5_mock_outbox_ack(job,'worker_alpha',token,2500);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%STALE_OR_FOREIGN_CLAIM%' then raise; end if;
 end;
 if private.f5_mock_outbox_ack(job,'worker_beta',next_token,2500)<>'acked_mock'
 then raise exception 'ACK_NOT_MOCK_ONLY'; end if;
 if private.f5_mock_outbox_ack(job,'worker_beta',next_token,2600)<>'duplicate_mock_ack'
 then raise exception 'ACK_REPLAY_NOT_IDEMPOTENT'; end if;
 if (private.f5_mock_outbox_claim('worker_alpha',2700))->>'status'<>'empty'
 then raise exception 'ACKED_JOB_REDELIVERED'; end if;
 perform private.f456_apply_mock_event(r,'evt_ob_arrived_01',
  'mock_arrival',p,2800);
 if (select status from private.f5_mock_outbox where job_id=job)<>'acked_mock'
 then raise exception 'ACKED_JOB_NOT_STABLE'; end if;
 perform private.f456_apply_mock_event(r,'evt_ob_risk_01',
  'mock_chargeback',fixture,2900,29300);
 if (private.f5_mock_outbox_claim('worker_alpha',3000))->>'status'<>'empty'
 then raise exception 'RISK_DID_NOT_BLOCK_NEW_JOBS'; end if;

 -- A dispute before any worker claims a job cancels the job immediately.
 r2:='33333333-3333-4333-8333-333333333334';
 insert into private.f456_mock_sessions(request_id,quote_id,customer_id,
  provider_id,service_cents,travel_cents,quote_total_cents,
  rider_fee_cents,provider_fee_cents,customer_subtotal_cents,
  provider_receivable_cents,platform_gross_cents)
 values(r2,'44444444-4444-4444-8444-444444444445',
 '11111111-1111-4111-8111-111111111111',p,
 23000,4000,27000,2300,2300,29300,24700,4600);
 perform private.f456_apply_mock_event(r2,'evt_ob_paid_02',
  'mock_payment_verified',fixture,1100,29300);
 perform private.f456_apply_mock_event(r2,'evt_ob_dispatch_02',
  'mock_dispatch',p,1200);
 perform private.f456_apply_mock_event(r2,'evt_ob_risk_02',
  'mock_dispute',fixture,1300,29300);
 if not exists(select 1 from private.f5_mock_outbox where request_id=r2
   and status='cancelled')
 then raise exception 'DISPUTE_DID_NOT_REVOKE_PENDING'; end if;
 if (private.f5_mock_outbox_claim('worker_alpha',3200))->>'status'<>'empty'
 then raise exception 'CANCELLED_JOB_WAS_CLAIMED'; end if;

 -- If worker claimed but the provider arrived, pending lease is revoked.
 r2:='33333333-3333-4333-8333-333333333335';
 insert into private.f456_mock_sessions(request_id,quote_id,customer_id,
  provider_id,service_cents,travel_cents,quote_total_cents,
  rider_fee_cents,provider_fee_cents,customer_subtotal_cents,
  provider_receivable_cents,platform_gross_cents)
 values(r2,'44444444-4444-4444-8444-444444444446',
 '11111111-1111-4111-8111-111111111111',p,
 23000,4000,27000,2300,2300,29300,24700,4600);
 perform private.f456_apply_mock_event(r2,'evt_ob_paid_03',
  'mock_payment_verified',fixture,1100,29300);
 perform private.f456_apply_mock_event(r2,'evt_ob_dispatch_03',
  'mock_dispatch',p,1200);
 j:=private.f5_mock_outbox_claim('worker_gamma',2000);
 job:=(j->>'jobId')::bigint;token:=(j->>'claimToken')::uuid;
 perform private.f456_apply_mock_event(r2,'evt_ob_arrive_03',
  'mock_arrival',p,2100);
 if (select status from private.f5_mock_outbox where job_id=job)<>'cancelled'
 then raise exception 'ARRIVAL_DID_NOT_REVOKE_LEASE'; end if;
 begin
  perform private.f5_mock_outbox_ack(job,'worker_gamma',token,2150);
  raise exception 'UNEXPECTED_ALLOWED';
 exception when others then
  if sqlerrm not like '%STALE_OR_FOREIGN_CLAIM%' then raise; end if;
 end;

 -- Exhaust all three retries and dead-letter a job, without sending.
 r2:='33333333-3333-4333-8333-333333333336';
 insert into private.f456_mock_sessions(request_id,quote_id,customer_id,
  provider_id,service_cents,travel_cents,quote_total_cents,
  rider_fee_cents,provider_fee_cents,customer_subtotal_cents,
  provider_receivable_cents,platform_gross_cents)
 values(r2,'44444444-4444-4444-8444-444444444447',
 '11111111-1111-4111-8111-111111111111',p,
 23000,4000,27000,2300,2300,29300,24700,4600);
 perform private.f456_apply_mock_event(r2,'evt_ob_paid_04',
  'mock_payment_verified',fixture,1100,29300);
 perform private.f456_apply_mock_event(r2,'evt_ob_dispatch_04',
  'mock_dispatch',p,1200);
 j:=private.f5_mock_outbox_claim('worker_alpha',2000);
 job:=(j->>'jobId')::bigint;token:=(j->>'claimToken')::uuid;
 if private.f5_mock_outbox_fail(job,'worker_alpha',token,2100)<>'pending'
 then raise exception 'RETRY_1_FAILED'; end if;
 j:=private.f5_mock_outbox_claim('worker_alpha',3100);
 token:=(j->>'claimToken')::uuid;
 if (j->>'attempt')::int<>2
  or private.f5_mock_outbox_fail(job,'worker_alpha',token,3200)<>'pending'
 then raise exception 'RETRY_2_FAILED'; end if;
 j:=private.f5_mock_outbox_claim('worker_alpha',5200);
 token:=(j->>'claimToken')::uuid;
 if (j->>'attempt')::int<>3
  or private.f5_mock_outbox_fail(job,'worker_alpha',token,5300)<>'dead'
 then raise exception 'RETRY_3_NOT_DEAD'; end if;
 if (private.f5_mock_outbox_claim('worker_alpha',6000))->>'status'<>'empty'
 then raise exception 'DEAD_JOB_RECLAIMED'; end if;
 if (select count(*) from private.f5_mock_outbox)<>4 then
  raise exception 'OUTBOX_EVENT_COUNT_INCONSISTENT'; end if;
 if exists(select 1 from private.f5_mock_outbox where
  status='leased' or attempts>3)
 then raise exception 'OUTBOX_UNSAFE_FINAL_STATE'; end if;
end $$;
rollback;
do $$
begin
 if (select enabled from private.f456_mock_gate where singleton)
  or (select count(*) from private.f5_mock_outbox)<>0
  or (select count(*) from private.f456_mock_events)<>0
  or (select count(*) from private.f456_mock_journal)<>0
 then raise exception 'OUTBOX_ADVERSARIAL_DID_NOT_ROLLBACK'; end if;
end $$;
