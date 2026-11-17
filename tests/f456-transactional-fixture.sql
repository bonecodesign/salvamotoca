-- Salva Motoca! F4/F5/F6: transactional idempotency DEMONSTRATOR.
-- ONLY for a disposable PostgreSQL 17 container. NOT a Supabase migration,
-- payment processor, production API, or proof of hosted concurrency.
-- All UUIDs and money represent synthetic fixtures.
create role anon nologin;
create role authenticated nologin;
create schema private;
revoke all on schema private from public,anon,authenticated;

create table private.f456_mock_gate(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into private.f456_mock_gate(singleton,enabled) values(true);
create table private.f456_mock_sessions(
 request_id uuid primary key,
 quote_id uuid not null unique,
 customer_id uuid not null,
 provider_id uuid not null check(provider_id<>customer_id),
 currency char(3) not null default 'BRL' check(currency='BRL'),
 service_cents integer not null check(service_cents between 100 and 500000),
 travel_cents integer not null check(travel_cents between 0 and 500000),
 quote_total_cents integer not null check(quote_total_cents between 100 and 500000),
 rider_fee_cents integer not null,
 provider_fee_cents integer not null,
 customer_subtotal_cents integer not null,
 provider_receivable_cents integer not null,
 platform_gross_cents integer not null,
 materials_included boolean not null default true check(materials_included),
 stage text not null default 'awaiting_mock_payment' check(stage in(
  'awaiting_mock_payment','ready_for_dispatch','en_route','arrived',
  'in_service','awaiting_both','completed','mock_hold')),
 mock_paid boolean not null default false,
 customer_confirmed boolean not null default false,
 provider_confirmed boolean not null default false,
 summary_at_ms bigint,
 last_at_ms bigint not null default 1000,
 version integer not null default 0,
 -- Guarantees a fixture can NEVER produce a real authority flag.
 real_payment_verified boolean not null default false check(not real_payment_verified),
 real_dispatch_authorized boolean not null default false check(not real_dispatch_authorized),
 real_transfer_authorized boolean not null default false check(not real_transfer_authorized),
 constraint f456_mock_10x10 check(
  quote_total_cents=service_cents+travel_cents and
  rider_fee_cents=(service_cents*1000+5000)/10000 and
  provider_fee_cents=(service_cents*1000+5000)/10000 and
  customer_subtotal_cents=quote_total_cents+rider_fee_cents and
  provider_receivable_cents=quote_total_cents-provider_fee_cents and
  platform_gross_cents=rider_fee_cents+provider_fee_cents
 )
);
create table private.f456_mock_events(
 event_id text primary key check(event_id ~ '^[a-z0-9_-]{8,80}$'),
 request_id uuid not null references private.f456_mock_sessions(request_id),
 payload jsonb not null,
 stage_after text not null,
 accepted_at timestamptz not null default now()
);
create table private.f456_mock_journal(
 request_id uuid primary key references private.f456_mock_sessions(request_id),
 event_id text not null unique references private.f456_mock_events(event_id),
 customer_debit_cents integer not null check(customer_debit_cents>0),
 provider_credit_cents integer not null check(provider_credit_cents>0),
 platform_credit_cents integer not null check(platform_credit_cents>0),
 check(customer_debit_cents=provider_credit_cents+platform_credit_cents)
);
alter table private.f456_mock_sessions enable row level security;
alter table private.f456_mock_events enable row level security;
alter table private.f456_mock_journal enable row level security;
revoke all on private.f456_mock_gate,private.f456_mock_sessions,
 private.f456_mock_events,private.f456_mock_journal
 from public,anon,authenticated;

-- Function intentionally has NO grants for anon/authenticated.
-- GUC is only an additional test selector, never an authentication substitute.
-- Exclusively runnable by PostgreSQL owner in a disposable CI database.
create function private.f456_apply_mock_event(
 p_request_id uuid,p_event_id text,p_kind text,p_actor_id uuid,
 p_at_ms bigint,p_amount_cents integer default null,p_summary_read boolean default false
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 s private.f456_mock_sessions%rowtype;
 old private.f456_mock_events%rowtype;
 body jsonb;
begin
 if current_setting('app.f456_test_only',true) is distinct from 'disposable_pg17'
   or not exists(select 1 from private.f456_mock_gate where singleton and enabled)
 then raise exception 'OFFLINE_ONLY_GATE_DISABLED'; end if;
 if p_event_id is null or p_event_id !~ '^[a-z0-9_-]{8,80}$'
  or p_at_ms is null or p_actor_id is null or p_kind is null
 then raise exception 'INVALID_EVENT'; end if;
 -- Lock BEFORE looking up event-id, so concurrent retries on one request
 -- serialize and see the durable receipt after the first transaction commits.
 select * into s from private.f456_mock_sessions
 where request_id=p_request_id for update;
 if not found then raise exception 'UNKNOWN_REQUEST'; end if;
 body:=pg_catalog.jsonb_build_object(
  'requestId',p_request_id,'quoteId',s.quote_id,
  'customerId',s.customer_id,'providerId',s.provider_id,
  'eventId',p_event_id,'kind',p_kind,'actor',p_actor_id,
  'atMs',p_at_ms,'amountCents',p_amount_cents,
  'summaryRead',p_summary_read);
 select * into old from private.f456_mock_events where event_id=p_event_id;
 if found then
  if old.request_id<>p_request_id or old.payload<>body
  then raise exception 'REPLAY_EVENT_ID_PAYLOAD_MISMATCH'; end if;
  return pg_catalog.jsonb_build_object('outcome','duplicate','stage',s.stage,
    'version',s.version,'realTransferAuthorized',false);
 end if;
 if p_at_ms<s.last_at_ms then raise exception 'OUT_OF_ORDER_EVENT'; end if;
 if p_kind='mock_payment_verified' then
  if s.stage<>'awaiting_mock_payment' or p_actor_id<>
    '99999999-9999-4999-8999-999999999999'::uuid
    or p_amount_cents is distinct from s.customer_subtotal_cents
  then raise exception 'MOCK_PAYMENT_NOT_AUTHORIZED'; end if;
  s.mock_paid:=true;s.stage:='ready_for_dispatch';
 elsif p_kind='mock_dispatch' then
  if s.stage<>'ready_for_dispatch' or not s.mock_paid or p_actor_id<>s.provider_id
  then raise exception 'DISPATCH_NOT_AUTHORIZED'; end if;
  s.stage:='en_route';
 elsif p_kind='mock_arrival' then
  if s.stage<>'en_route' or p_actor_id<>s.provider_id
  then raise exception 'ARRIVAL_NOT_AUTHORIZED'; end if;
  s.stage:='arrived';
 elsif p_kind='mock_service_started' then
  if s.stage<>'arrived' or p_actor_id<>s.provider_id
  then raise exception 'SERVICE_NOT_AUTHORIZED'; end if;
  s.stage:='in_service';
 elsif p_kind='mock_summary_submitted' then
  if s.stage<>'in_service' or p_actor_id<>s.provider_id
  then raise exception 'SUMMARY_NOT_AUTHORIZED'; end if;
  s.stage:='awaiting_both';s.summary_at_ms:=p_at_ms;
 elsif p_kind='mock_provider_confirmed' then
  if s.stage<>'awaiting_both' or p_actor_id<>s.provider_id
    or s.provider_confirmed
  then raise exception 'PROVIDER_CONFIRM_NOT_AUTHORIZED'; end if;
  s.provider_confirmed:=true;
  if s.customer_confirmed then s.stage:='completed'; end if;
 elsif p_kind='mock_customer_confirmed' then
  if s.stage<>'awaiting_both' or p_actor_id<>s.customer_id
    or s.customer_confirmed or p_summary_read is distinct from true
    or p_at_ms>s.summary_at_ms+300000
  then raise exception 'CUSTOMER_CONFIRM_NOT_AUTHORIZED'; end if;
  s.customer_confirmed:=true;
  if s.provider_confirmed then s.stage:='completed'; end if;
 elsif p_kind in ('mock_dispute','mock_chargeback','mock_refund_requested') then
  if not s.mock_paid or s.stage='mock_hold'
    or p_actor_id<>'99999999-9999-4999-8999-999999999999'::uuid
    or p_amount_cents is null or p_amount_cents<1
    or p_amount_cents>s.customer_subtotal_cents
  then raise exception 'RISK_NOT_AUTHORIZED'; end if;
  s.stage:='mock_hold';
 else
  raise exception 'UNKNOWN_MOCK_EVENT_KIND';
 end if;
 if p_kind not in ('mock_payment_verified','mock_dispute','mock_chargeback',
  'mock_refund_requested') and p_amount_cents is not null
 then raise exception 'UNEXPECTED_FINANCIAL_FIELD'; end if;
 s.version:=s.version+1;
 s.last_at_ms:=p_at_ms;
 insert into private.f456_mock_events(event_id,request_id,payload,stage_after)
 values(p_event_id,p_request_id,body,s.stage);
 if p_kind='mock_payment_verified' then
  insert into private.f456_mock_journal(request_id,event_id,
    customer_debit_cents,provider_credit_cents,platform_credit_cents)
  values(p_request_id,p_event_id,s.customer_subtotal_cents,
    s.provider_receivable_cents,s.platform_gross_cents);
 end if;
 update private.f456_mock_sessions
 set stage=s.stage,mock_paid=s.mock_paid,customer_confirmed=s.customer_confirmed,
 provider_confirmed=s.provider_confirmed,summary_at_ms=s.summary_at_ms,
 last_at_ms=s.last_at_ms,version=s.version
 where request_id=p_request_id;
 return pg_catalog.jsonb_build_object(
  'outcome','applied','stage',s.stage,'version',s.version,
  'realPaymentVerified',false,'realDispatchAuthorized',false,
  'realTransferAuthorized',false);
end;
$$;
revoke all on function private.f456_apply_mock_event(
 uuid,text,text,uuid,bigint,integer,boolean) from public,anon,authenticated;

insert into private.f456_mock_sessions(
 request_id,quote_id,customer_id,provider_id,
 service_cents,travel_cents,quote_total_cents,
 rider_fee_cents,provider_fee_cents,
 customer_subtotal_cents,provider_receivable_cents,platform_gross_cents)
values(
 '33333333-3333-4333-8333-333333333333',
 '44444444-4444-4444-8444-444444444444',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 23000,4000,27000,2300,2300,29300,24700,4600);
