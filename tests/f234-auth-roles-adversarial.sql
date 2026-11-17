-- Salva Motoca! authenticated A/B/C adversarial test in PG17 disposable only.
-- auth.uid() is simulated via a PostgreSQL GUC; it is NOT JWT verification.
-- Every mutation rolls back. No hosted Auth/Storage/PSP activity.
begin;
set local app.f234_test_only='disposable_pg17';
set local app.f456_test_only='disposable_pg17';

do $$
begin
 if (select enabled from private.f234_mock_gate where singleton)
  or (select enabled from private.f456_mock_gate where singleton)
 then raise exception 'F234_GATES_ENABLED_ON_START'; end if;
 if has_function_privilege('anon',
  'public.f234_mock_accept_as_customer(uuid,uuid,text,bigint)','EXECUTE')
  or has_function_privilege('anon',
  'public.f234_mock_read_quote(uuid)','EXECUTE')
  or has_function_privilege('anon',
  'public.f234_mock_read_session(uuid)','EXECUTE')
 then raise exception 'ANON_RPC_EXECUTE_LEAK'; end if;
 if not has_function_privilege('authenticated',
  'public.f234_mock_accept_as_customer(uuid,uuid,text,bigint)','EXECUTE')
 then raise exception 'AUTH_MOCK_RPC_NOT_REACHABLE'; end if;
 if has_function_privilege('authenticated',
  'private.f234_mock_accept_quote(uuid,uuid,uuid,text,bigint)','EXECUTE')
  or has_function_privilege('authenticated',
  'private.f456_apply_mock_event(uuid,text,text,uuid,bigint,integer,boolean)','EXECUTE')
  or has_function_privilege('authenticated',
  'private.f5_mock_outbox_claim(text,bigint)','EXECUTE')
 then raise exception 'CLIENT_CAN_CALL_PRIVATE_MOCK_PAYMENT_OR_OUTBOX'; end if;
 if has_column_privilege('authenticated','public.f234_mock_quote_cards',
  'customer_id','SELECT')
  or has_column_privilege('authenticated','public.f234_mock_quote_cards',
  'provider_owner_id','SELECT')
  or has_column_privilege('authenticated','public.f234_mock_quote_cards',
  'private_note','SELECT')
 then raise exception 'HIDDEN_OWNER_OR_PRIVATE_NOTE_EXPOSED'; end if;
 if has_table_privilege('authenticated','public.f234_mock_quote_cards','UPDATE')
  or has_table_privilege('authenticated','public.f234_mock_quote_cards','INSERT')
  or has_table_privilege('authenticated','public.f234_mock_quote_cards','DELETE')
 then raise exception 'AUTH_CAN_MUTATE_READONLY_PROJECTION'; end if;
 if (select count(*) from public.f234_mock_quote_cards)<>5
 then raise exception 'MISSING_INITIAL_PRIVATE_MOCK_CARDS'; end if;
end $$;

-- Public read is NOT available without auth or a valid gate.
set role anon;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$
begin
 begin
  perform public.f234_mock_read_quote(
    '44444444-4444-4444-8444-444444444444');
  raise exception 'UNEXPECTED_ANON_READ';
 exception when insufficient_privilege then null; end;
 begin
  perform quote_id from public.f234_mock_quote_cards;
  raise exception 'UNEXPECTED_ANON_RLS_READ';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

set role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$
begin
 begin
  perform public.f234_mock_accept_as_customer(
   '33333333-3333-4333-8333-333333333333',
   '44444444-4444-4444-8444-444444444444',
   'evt_auth_gate_off',2000);
  raise exception 'UNEXPECTED_GATE_OFF_ACCEPT';
 exception when others then
  if sqlerrm not like '%F234_MOCK_GATE_DISABLED%' then raise; end if;
 end;
end $$;
reset role;

update private.f234_mock_gate set enabled=true where singleton;
-- Do NOT enable F456 gate for these tests: accepts are not money.

-- C = third party with a valid *mock identity* but no ownership.
set role authenticated;
set local request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
do $$
begin
 if (select count(*) from public.f234_mock_quote_cards)<>0
 then raise exception 'THIRD_PARTY_RLS_BYPASS'; end if;
 begin
  perform public.f234_mock_read_quote(
   '44444444-4444-4444-8444-444444444444');
  raise exception 'THIRD_PARTY_READ_GRANTED';
 exception when others then
  if sqlerrm not like '%F234_QUOTE_ACCESS_DENIED%' then raise; end if;
 end;
 begin
  perform public.f234_mock_read_session(
   '33333333-3333-4333-8333-333333333333');
  raise exception 'THIRD_PARTY_SESSION_GRANTED';
 exception when others then
  if sqlerrm not like '%F234_SESSION_ACCESS_DENIED%' then raise; end if;
 end;
 begin
  perform public.f234_mock_accept_as_customer(
   '33333333-3333-4333-8333-333333333333',
   '44444444-4444-4444-8444-444444444444',
   'evt_third_try_accept',2000);
  raise exception 'THIRD_PARTY_ACCEPT_GRANTED';
 exception when others then
  if sqlerrm not like '%CUSTOMER_NOT_AUTHORIZED%' then raise; end if;
 end;
 begin
  perform public.f234_mock_cancel_as_customer(
   '33333333-3333-4333-8333-333333333333');
  raise exception 'THIRD_PARTY_CANCEL_GRANTED';
 exception when others then
  if sqlerrm not like '%CUSTOMER_NOT_AUTHORIZED%' then raise; end if;
 end;
 begin
  perform customer_id from public.f234_mock_quote_cards;
  raise exception 'HIDDEN_OWNER_ID_SELECT_GRANTED';
 exception when insufficient_privilege then null; end;
 begin
  update public.f234_mock_quote_cards
   set service_cents=10 where quote_id=
    '44444444-4444-4444-8444-444444444444';
  raise exception 'CLIENT_QUOTE_TAMPER_GRANTED';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- B = provider owner; only its own quote is visible via RLS.
set role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
do $$
declare j jsonb;
begin
 if (select count(*) from public.f234_mock_quote_cards)<>1
  or not exists(select 1 from public.f234_mock_quote_cards where quote_id=
   '44444444-4444-4444-8444-444444444444')
 then raise exception 'PROVIDER_RLS_WRONG_VISIBLE_QUOTES'; end if;
 j:=public.f234_mock_read_quote(
  '44444444-4444-4444-8444-444444444444');
 if j->>'status'<>'proposed' or j->>'mockOnly'<>'true'
  or j->>'chatAllowed'<>'false'
  or j->>'exactLocationShared'<>'false'
  or j ? 'customerId' or j ? 'privateNote'
 then raise exception 'PROVIDER_QUOTE_PRIVACY_FAIL'; end if;
 begin
  perform public.f234_mock_read_quote(
   '55555555-5555-4555-8555-555555555555');
  raise exception 'OTHER_PROVIDER_QUOTE_READ';
 exception when others then
  if sqlerrm not like '%F234_QUOTE_ACCESS_DENIED%' then raise; end if;
 end;
 begin
  perform public.f234_mock_read_session(
   '33333333-3333-4333-8333-333333333333');
  raise exception 'UNSELECTED_PROVIDER_SESSION_READ';
 exception when others then
  if sqlerrm not like '%F234_SESSION_ACCESS_DENIED%' then raise; end if;
 end;
 begin
  perform public.f234_mock_accept_as_customer(
   '33333333-3333-4333-8333-333333333333',
   '44444444-4444-4444-8444-444444444444',
   'evt_provider_tried_accept',2000);
  raise exception 'PROVIDER_ACCEPTED_AS_CUSTOMER';
 exception when others then
  if sqlerrm not like '%CUSTOMER_NOT_AUTHORIZED%' then raise; end if;
 end;
end $$;
reset role;

-- Another provider sees its own losing quote but not provider B's quote.
set role authenticated;
set local request.jwt.claim.sub='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
do $$
begin
 if (select count(*) from public.f234_mock_quote_cards)<>1
  or not exists(select 1 from public.f234_mock_quote_cards where quote_id=
   '55555555-5555-4555-8555-555555555555')
 then raise exception 'LOSING_PROVIDER_RLS_FAIL'; end if;
end $$;
reset role;

-- A = legitimate mock customer, may view own offers and accept one.
set role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$
declare j jsonb;
begin
 if (select count(*) from public.f234_mock_quote_cards)<>5
 then raise exception 'CUSTOMER_RLS_OWN_QUOTES_MISSING'; end if;
 j:=public.f234_mock_read_session(
  '33333333-3333-4333-8333-333333333333');
 if j->>'stage'<>'not_selected_mock'
  or j->>'chatAllowed'<>'false'
 then raise exception 'CUSTOMER_PRESELECT_SESSION_UNSAFE'; end if;
 j:=public.f234_mock_accept_as_customer(
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  'evt_auth_customer_selected',2000);
 if j->>'outcome'<>'accepted_mock' or j->>'stage'<>'awaiting_mock_payment'
  or j->>'realPspVerified'<>'false'
 then raise exception 'AUTH_CUSTOMER_QUOTE_SELECTION_FAIL'; end if;
 j:=public.f234_mock_accept_as_customer(
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  'evt_auth_customer_selected',2000);
 if j->>'outcome'<>'duplicate'
 then raise exception 'AUTH_ACCEPT_IDEMPOTENCY_FAIL'; end if;
 if not exists(select 1 from public.f234_mock_quote_cards where
  quote_id='44444444-4444-4444-8444-444444444444' and quote_status='accepted')
  or not exists(select 1 from public.f234_mock_quote_cards where
  quote_id='55555555-5555-4555-8555-555555555555' and quote_status='declined')
 then raise exception 'AUTH_RLS_CARD_STATUS_STALE'; end if;
 j:=public.f234_mock_read_session(
  '33333333-3333-4333-8333-333333333333');
 if j->>'stage'<>'awaiting_mock_payment'
  or j->>'realPspVerified'<>'false'
  or j->>'chatAllowed'<>'false'
  or j->>'exactLocationShared'<>'false'
  or j->>'realTransferAuthorized'<>'false'
  or j ? 'providerOwnerId'
 then raise exception 'AUTH_SESSION_EXPOSED_REAL_PERMISSION'; end if;
 begin
  perform public.f234_mock_accept_as_customer(
   '33333333-3333-4333-8333-333333333333',
   '55555555-5555-4555-8555-555555555555',
   'evt_auth_second_winner',2000);
  raise exception 'SECOND_WINNER_ACCEPTED';
 exception when others then
  if sqlerrm not like '%WINNER_ALREADY_SELECTED%' then raise; end if;
 end;
 -- Public quote card never authorizes writes or reveals sensitive owner columns.
 begin
  perform private_note from public.f234_mock_quote_cards;
  raise exception 'PRIVATE_CARD_COLUMN_EXPOSED';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- B can now read only the session of the selected request; losing provider C cannot.
set role authenticated;
set local request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
do $$
declare j jsonb;
begin
 j:=public.f234_mock_read_session(
  '33333333-3333-4333-8333-333333333333');
 if j->>'stage'<>'awaiting_mock_payment'
  or j->>'realPspVerified'<>'false'
  or j->>'chatAllowed'<>'false' then
   raise exception 'SELECTED_PROVIDER_SESSION_CONTAINS_REAL_PERMISSION'; end if;
end $$;
reset role;

set role authenticated;
set local request.jwt.claim.sub='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
do $$
begin
 begin
  perform public.f234_mock_read_session(
   '33333333-3333-4333-8333-333333333333');
  raise exception 'LOSING_PROVIDER_SESSION_ACCESS';
 exception when others then
  if sqlerrm not like '%F234_SESSION_ACCESS_DENIED%' then raise; end if;
 end;
end $$;
reset role;

-- Cancellation and stale session remain fail-closed even with a real mock identity.
set role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$
begin
 begin
  perform public.f234_mock_cancel_as_customer(
   '33333333-3333-4333-8333-333333333333');
  raise exception 'AUTH_CANCEL_POST_ACCEPT_GRANTED';
 exception when others then
  if sqlerrm not like '%FINANCIAL_SUPPORT_REVIEW_REQUIRED%' then raise; end if;
 end;
 if public.f234_mock_cancel_as_customer(
   '33333333-3333-4333-8333-333333333335')<>'cancelled_mock'
 then raise exception 'AUTH_CANCEL_PRE_ACCEPT_FAILED'; end if;
end $$;
reset role;

do $$
begin
 if (select count(*) from private.f456_mock_journal)<>0
  or (select count(*) from private.f5_mock_outbox)<>0
  or (select count(*) from private.f456_mock_sessions)<>1
 then raise exception 'AUTH_MOCK_ACCEPT_CREATED_FAKE_MONEY_OR_DISPATCH'; end if;
end $$;
rollback;

-- Independent confirmation all fake actions have reverted.
do $$
begin
 if (select enabled from private.f234_mock_gate where singleton)
  or (select enabled from private.f456_mock_gate where singleton)
  or (select count(*) from private.f456_mock_sessions)<>0
  or (select count(*) from private.f456_mock_journal)<>0
  or (select count(*) from private.f5_mock_outbox)<>0
  or (select count(*) from private.f234_mock_quotes where status='accepted')<>0
  or (select count(*) from public.f234_mock_quote_cards where quote_status<>'proposed')<>0
 then raise exception 'AUTH_MOCK_TEST_ROLLBACK_FAILED'; end if;
end $$;
