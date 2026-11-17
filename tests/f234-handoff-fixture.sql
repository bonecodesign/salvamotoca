-- Salva Motoca! F2/F3 -> F4/F5 handoff CONTRACT, all identities artificial.
-- POSTGRES 17 DISPOSABLE ONLY, NEVER run against hosted Supabase.
-- Requires tests/f456-transactional-fixture.sql and tests/f5-outbox-fixture.sql.
-- No auth provider, PSP webhook, push notification, real service, or migration.
-- This test setup removes ONLY the synthetic default session from F456.
delete from private.f456_mock_sessions where request_id=
 '33333333-3333-4333-8333-333333333333';

create table private.f234_mock_gate(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into private.f234_mock_gate(singleton,enabled) values(true,false);

create table private.f234_mock_requests(
 request_id uuid primary key,
 customer_id uuid not null,
 category_code text not null check(category_code in ('borracharia_delivery','reboque_moto')),
 service_types text[] not null check(cardinality(service_types) between 1 and 6),
 motorcycle_weight_kg integer,
 state text not null default 'requested' check(state in('requested','accepted_mock','cancelled')),
 accepted_quote_id uuid unique,
 selected_provider_id uuid,
 accept_event_id text unique,
 accepted_at_ms bigint,
 check(('reboque_moto'=any(service_types))=(category_code='reboque_moto')),
 check (
  (state='accepted_mock' and accepted_quote_id is not null
   and selected_provider_id is not null and accept_event_id is not null
   and accepted_at_ms is not null)
  or (state<>'accepted_mock' and accepted_quote_id is null
   and selected_provider_id is null and accept_event_id is null
   and accepted_at_ms is null)
 ),
 check(category_code<>'reboque_moto'
  or motorcycle_weight_kg between 40 and 650)
);

create table private.f234_mock_providers(
 provider_id uuid primary key,
 approved boolean not null default false,
 active boolean not null default false,
 online_requested boolean not null default false,
 presence_at_ms bigint not null default 0,
 coverage_eligible_mock boolean not null default false,
 available_services text[] not null default '{}'::text[],
 tow_equipment_verified boolean not null default false,
 max_moto_kg integer not null default 0
);

create table private.f234_mock_quotes(
 quote_id uuid primary key,
 request_id uuid not null references private.f234_mock_requests(request_id),
 provider_id uuid not null references private.f234_mock_providers(provider_id),
 offer_id text not null unique,
 status text not null default 'proposed'
  check(status in('proposed','accepted','declined')),
 offered_at_ms bigint not null check(offered_at_ms>0),
 opened_at_ms bigint not null,
 quoted_at_ms bigint not null,
 valid_until_ms bigint not null,
 service_cents integer not null check(service_cents between 100 and 500000),
 travel_cents integer not null check(travel_cents between 0 and 500000),
 materials_included boolean not null default true check(materials_included),
 unique(request_id,provider_id),
 check(quoted_at_ms >= opened_at_ms),
 check(opened_at_ms>=offered_at_ms),
 check(quoted_at_ms<=opened_at_ms+300000),
 check(valid_until_ms>=quoted_at_ms),
 check(service_cents+travel_cents<=500000)
);
create unique index f234_one_accepted_quote_per_request
 on private.f234_mock_quotes(request_id) where status='accepted';
alter table private.f234_mock_requests enable row level security;
alter table private.f234_mock_providers enable row level security;
alter table private.f234_mock_quotes enable row level security;
revoke all on private.f234_mock_gate,private.f234_mock_requests,
 private.f234_mock_providers,private.f234_mock_quotes from public,anon,authenticated;

-- Prevent re-pricing after selection; all consumers re-check the frozen quote.
create function private.f234_mock_quote_freeze()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.status='accepted' then
  raise exception 'ACCEPTED_QUOTE_IMMUTABLE'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger f234_freeze_accepted_quotes
 before update or delete on private.f234_mock_quotes
 for each row execute function private.f234_mock_quote_freeze();

-- Acquires the same request row for competing accepts.
-- Actor is a synthetic explicit parameter: NEVER use it as Auth proof in a real API.
create function private.f234_mock_accept_quote(
 p_request_id uuid,p_quote_id uuid,p_actor_id uuid,
 p_event_id text,p_at_ms bigint
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 r private.f234_mock_requests%rowtype;
 q private.f234_mock_quotes%rowtype;
 p private.f234_mock_providers%rowtype;
 v_fee integer;
begin
 if current_setting('app.f234_test_only',true) is distinct from 'disposable_pg17'
  or not exists(select 1 from private.f234_mock_gate where singleton and enabled)
 then raise exception 'F234_MOCK_GATE_DISABLED'; end if;
 if p_request_id is null or p_quote_id is null or p_actor_id is null
  or p_event_id is null or p_event_id !~ '^[a-z0-9_-]{8,80}$'
  or p_at_ms is null or p_at_ms<=0
 then raise exception 'INVALID_MOCK_ACCEPT_EVENT'; end if;
 select * into r from private.f234_mock_requests
  where request_id=p_request_id for update;
 if not found or r.customer_id<>p_actor_id
 then raise exception 'CUSTOMER_NOT_AUTHORIZED'; end if;
 if r.state='accepted_mock' then
  if r.accepted_quote_id=p_quote_id and r.accept_event_id=p_event_id
   and r.accepted_at_ms=p_at_ms
  then
   return pg_catalog.jsonb_build_object(
    'outcome','duplicate','stage','awaiting_mock_payment',
    'requestId',r.request_id,'mockOnly',true,'realPspVerified',false);
  end if;
  raise exception 'WINNER_ALREADY_SELECTED'; end if;
 if r.state<>'requested' then raise exception 'REQUEST_CLOSED'; end if;
 select * into q from private.f234_mock_quotes
  where quote_id=p_quote_id and request_id=p_request_id for update;
 if not found or q.status<>'proposed'
  or p_at_ms<q.quoted_at_ms or p_at_ms>q.valid_until_ms
 then raise exception 'QUOTE_NOT_CURRENT'; end if;
 select * into p from private.f234_mock_providers
  where provider_id=q.provider_id;
 if not found or not p.approved or not p.active
  or not p.online_requested or not p.coverage_eligible_mock
  or p.presence_at_ms>p_at_ms
  or p_at_ms-p.presence_at_ms>90000
  or not p.available_services @> r.service_types
  or (r.category_code='reboque_moto' and (
    not p.tow_equipment_verified or p.max_moto_kg<r.motorcycle_weight_kg))
 then raise exception 'PROVIDER_NOT_ELIGIBLE'; end if;
 v_fee:=(q.service_cents*1000+5000)/10000;

 -- Mark one accepted quote before constructing F4/F5 snapshot.
 update private.f234_mock_quotes
   set status='declined' where request_id=p_request_id
   and quote_id<>q.quote_id and status='proposed';
 update private.f234_mock_quotes set status='accepted'
  where quote_id=q.quote_id;
 update private.f234_mock_requests set
  state='accepted_mock',accepted_quote_id=q.quote_id,
  selected_provider_id=q.provider_id,accept_event_id=p_event_id,
  accepted_at_ms=p_at_ms
  where request_id=p_request_id;

 insert into private.f456_mock_sessions(
  request_id,quote_id,customer_id,provider_id,
  service_cents,travel_cents,quote_total_cents,
  rider_fee_cents,provider_fee_cents,customer_subtotal_cents,
  provider_receivable_cents,platform_gross_cents,last_at_ms
 ) values(
  r.request_id,q.quote_id,r.customer_id,q.provider_id,
  q.service_cents,q.travel_cents,q.service_cents+q.travel_cents,
  v_fee,v_fee,q.service_cents+q.travel_cents+v_fee,
  q.service_cents+q.travel_cents-v_fee,v_fee*2,p_at_ms
 );
 return pg_catalog.jsonb_build_object(
  'outcome','accepted_mock','stage','awaiting_mock_payment',
  'requestId',r.request_id,'quoteId',q.quote_id,
  'providerId',q.provider_id,'customerSubtotalCents',
  q.service_cents+q.travel_cents+v_fee,'mockOnly',true,
  'realPspVerified',false,'externalDispatchAuthorized',false);
end $$;

create function private.f234_mock_cancel_preaccept(
 p_request_id uuid,p_actor_id uuid
) returns text language plpgsql security invoker set search_path='' as $$
declare r private.f234_mock_requests%rowtype;
begin
 if current_setting('app.f234_test_only',true) is distinct from 'disposable_pg17'
  or not exists(select 1 from private.f234_mock_gate where singleton and enabled)
 then raise exception 'F234_MOCK_GATE_DISABLED'; end if;
 select * into r from private.f234_mock_requests
  where request_id=p_request_id for update;
 if not found or r.customer_id is distinct from p_actor_id
 then raise exception 'CUSTOMER_NOT_AUTHORIZED'; end if;
 if r.state='cancelled' then return 'cancelled_mock'; end if;
 if r.state<>'requested' then
  raise exception 'FINANCIAL_SUPPORT_REVIEW_REQUIRED'; end if;
 update private.f234_mock_requests set state='cancelled'
  where request_id=p_request_id;
 update private.f234_mock_quotes set status='declined'
  where request_id=p_request_id and status='proposed';
 return 'cancelled_mock';
end $$;

-- Existing F456 event function performs its own row lock and idempotency.
-- Add a fail-closed bridge validation BEFORE its event insert, ensuring
-- actor/binding/quote/price remain aligned and provider is still eligible.
-- This DOES NOT authenticate PSP. A mock receipt remains fake.
create function private.f234_mock_guard_f456_event()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
 r private.f234_mock_requests%rowtype;
 q private.f234_mock_quotes%rowtype;
 s private.f456_mock_sessions%rowtype;
 p private.f234_mock_providers%rowtype;
 k text:=new.payload->>'kind';
begin
 if current_setting('app.f234_test_only',true) is distinct from 'disposable_pg17'
  or not exists(select 1 from private.f234_mock_gate where singleton and enabled)
 then raise exception 'F234_MOCK_GATE_DISABLED'; end if;
 select * into r from private.f234_mock_requests
   where request_id=new.request_id;
 select * into s from private.f456_mock_sessions
   where request_id=new.request_id;
 select * into q from private.f234_mock_quotes
   where quote_id=r.accepted_quote_id;
 if r.state is distinct from 'accepted_mock'
  or q.status is distinct from 'accepted'
  or s.request_id is null
  or q.request_id is distinct from r.request_id
  or q.provider_id is distinct from r.selected_provider_id
  or s.quote_id is distinct from q.quote_id
  or s.provider_id is distinct from q.provider_id
  or s.customer_id is distinct from r.customer_id
  or s.service_cents is distinct from q.service_cents
  or s.travel_cents is distinct from q.travel_cents
  or new.payload->>'quoteId' is distinct from q.quote_id::text
  or new.payload->>'customerId' is distinct from r.customer_id::text
  or new.payload->>'providerId' is distinct from q.provider_id::text
 then raise exception 'PAYMENT_DISPATCH_BINDING_MISMATCH'; end if;
 if k in('mock_payment_verified','mock_dispatch') then
  select * into p from private.f234_mock_providers
    where provider_id=r.selected_provider_id;
  if not found or not p.approved or not p.active
   or not p.online_requested or not p.coverage_eligible_mock
   or not p.available_services @> r.service_types
   or (r.category_code='reboque_moto' and (
    not p.tow_equipment_verified or p.max_moto_kg<r.motorcycle_weight_kg))
  then raise exception 'PROVIDER_REVOKED_AT_HANDOFF'; end if;
 end if;
 if k='mock_dispatch' and (
  not s.mock_paid or s.stage<>'ready_for_dispatch'
  or not exists(select 1 from private.f456_mock_journal j
    where j.request_id=s.request_id and
      j.customer_debit_cents=s.customer_subtotal_cents
      and j.provider_credit_cents=s.provider_receivable_cents
      and j.platform_credit_cents=s.platform_gross_cents)
 ) then raise exception 'MOCK_FINANCIAL_RECONCILIATION_REQUIRED'; end if;
 return new;
end $$;
create trigger f234_mock_guard_before_f456_event
 before insert on private.f456_mock_events
 for each row execute function private.f234_mock_guard_f456_event();

revoke all on function private.f234_mock_quote_freeze(),
 private.f234_mock_accept_quote(uuid,uuid,uuid,text,bigint),
 private.f234_mock_cancel_preaccept(uuid,uuid),
 private.f234_mock_guard_f456_event()
 from public,anon,authenticated;

-- All seeded rows and values are intentionally fictitious.
insert into private.f234_mock_requests(
 request_id,customer_id,category_code,service_types,motorcycle_weight_kg
) values
 ('33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'borracharia_delivery',array['pneu_furado']::text[],null),
 ('33333333-3333-4333-8333-333333333334',
  '11111111-1111-4111-8111-111111111111',
  'reboque_moto',array['reboque_moto','troca_camara']::text[],180),
 ('33333333-3333-4333-8333-333333333335',
  '11111111-1111-4111-8111-111111111111',
  'borracharia_delivery',array['pneu_furado']::text[],null);

insert into private.f234_mock_providers(
 provider_id,approved,active,online_requested,presence_at_ms,
 coverage_eligible_mock,available_services,tow_equipment_verified,max_moto_kg
) values
 ('22222222-2222-4222-8222-222222222222',
  true,true,true,1900,true,array['pneu_furado'],false,0),
 ('77777777-7777-4777-8777-777777777777',
  true,true,true,1900,true,array['pneu_furado'],false,0),
 ('88888888-8888-4888-8888-888888888888',
  true,true,true,1900,true,
  array['reboque_moto','troca_camara'],true,300),
 ('99999999-8888-4888-8888-888888888888',
  true,true,true,1900,true,
  array['reboque_moto','troca_camara'],false,120);

insert into private.f234_mock_quotes(
 quote_id,request_id,provider_id,offer_id,
 offered_at_ms,opened_at_ms,quoted_at_ms,valid_until_ms,
 service_cents,travel_cents
) values
 ('44444444-4444-4444-8444-444444444444',
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  'offer_mock_tire_a',1000,1100,1500,3200,23000,4000),
 ('55555555-5555-4555-8555-555555555555',
  '33333333-3333-4333-8333-333333333333',
  '77777777-7777-4777-8777-777777777777',
  'offer_mock_tire_b',1000,1100,1500,3200,22000,5000),
 ('66666666-6666-4666-8666-666666666666',
  '33333333-3333-4333-8333-333333333334',
  '88888888-8888-4888-8888-888888888888',
  'offer_mock_tow_a',1000,1100,1500,3200,23500,1500),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '33333333-3333-4333-8333-333333333334',
  '99999999-8888-4888-8888-888888888888',
  'offer_mock_tow_bad',1000,1100,1500,3200,23500,1500),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '33333333-3333-4333-8333-333333333335',
  '22222222-2222-4222-8222-222222222222',
  'offer_mock_cancel',1000,1100,1500,3200,23000,4000);
