-- Offline candidate only. Dedicated PG17 CI database; not a hosted migration.
begin;
do $guard$ begin
 if current_database()<>'f4_stripe_disposable' then raise exception 'Disposable Stripe fixture required'; end if;
end $guard$;
create table private.f4_stripe_fixture_bindings(
 attempt_id uuid primary key references private.f4_mock_payment_attempts(id),
 intent_id text not null unique check(intent_id ~ '^pi_[A-Za-z0-9]{8,100}$'),
 stripe_customer_id text not null check(stripe_customer_id ~ '^cus_[A-Za-z0-9]{8,100}$'),
 fee_fixture_cents integer not null check(fee_fixture_cents between 0 and 500000),
 created_at timestamptz not null default now()
);
create table private.f4_stripe_fixture_evidence(
 attempt_id uuid primary key references private.f4_stripe_fixture_bindings(attempt_id),
 charge_id text not null unique check(charge_id ~ '^ch_[A-Za-z0-9]{8,100}$'),
 total_cents integer not null check(total_cents between 100 and 1050000),
 reconciled_at timestamptz not null default clock_timestamp()
);
create table private.f4_stripe_fixture_receipts(
 event_id text primary key check(event_id ~ '^evt_[A-Za-z0-9]{8,100}$'),
 attempt_id uuid not null references private.f4_stripe_fixture_evidence(attempt_id),
 body_sha256 text not null check(body_sha256 ~ '^[0-9a-f]{64}$'),
 received_at timestamptz not null default clock_timestamp()
);
alter table private.f4_stripe_fixture_bindings enable row level security;
alter table private.f4_stripe_fixture_evidence enable row level security;
alter table private.f4_stripe_fixture_receipts enable row level security;
revoke all on private.f4_stripe_fixture_bindings,private.f4_stripe_fixture_evidence,private.f4_stripe_fixture_receipts from public,anon,authenticated;
create function private.f4_stripe_fixture_immutable() returns trigger language plpgsql set search_path='' as $f$
begin raise exception 'Evidencia Stripe fixture imutavel';end $f$;
create trigger f4_stripe_binding_immutable before update or delete on private.f4_stripe_fixture_bindings for each row execute function private.f4_stripe_fixture_immutable();
create trigger f4_stripe_evidence_immutable before update or delete on private.f4_stripe_fixture_evidence for each row execute function private.f4_stripe_fixture_immutable();
create trigger f4_stripe_receipt_immutable before update or delete on private.f4_stripe_fixture_receipts for each row execute function private.f4_stripe_fixture_immutable();
revoke all on function private.f4_stripe_fixture_immutable() from public,anon,authenticated;

-- Trusted CI caller ONLY, not a webhook endpoint or real payment receipt.
-- Request first, then attempt lock, then binding; unique event across attempts.
create function private.f4_stripe_store_fixture(p_attempt uuid,p_event text,p_hash text,p_intent text,p_charge text,
 p_request uuid,p_quote uuid,p_customer uuid,p_provider uuid,p_stripe_customer text,p_total integer)
returns jsonb language plpgsql security invoker set search_path='' as $f$
declare a record;b record;e record;receipt record;rid uuid; inserted_count integer; existed boolean;
begin
 if current_database()<>'f4_stripe_disposable'
 or current_setting('app.f4_test_only',true) is distinct from 'local_fixture'
 or not exists(select 1 from private.f4_release_gate where enabled)
 then raise exception 'Stripe fixture indisponivel';end if;
 if p_attempt is null or p_event is null or p_event !~ '^evt_[A-Za-z0-9]{8,100}$'
 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
 or p_charge is null or p_charge !~ '^ch_[A-Za-z0-9]{8,100}$'
 then raise exception 'Recibo fixture invalido';end if;
 select request_id into rid from private.f4_mock_payment_attempts where id=p_attempt;
 perform 1 from public.service_requests where id=rid for update;
 select * into a from private.f4_mock_payment_attempts where id=p_attempt for update;
 if not found then raise exception 'Tentativa fixture inexistente';end if;
 select * into b from private.f4_stripe_fixture_bindings where attempt_id=p_attempt;
 if not found or a.request_id is distinct from p_request or a.quote_id is distinct from p_quote
 or a.customer_id is distinct from p_customer or a.provider_id is distinct from p_provider
 or b.intent_id is distinct from p_intent or b.stripe_customer_id is distinct from p_stripe_customer
 or p_total is distinct from a.customer_subtotal_cents+b.fee_fixture_cents
 or a.status<>'mock_prepared'
 or not exists(select 1 from public.service_requests r join public.service_quotes q on q.request_id=r.id
 where r.id=a.request_id and r.customer_id=a.customer_id and r.provider_id=a.provider_id
 and r.status='awaiting_payment' and q.id=a.quote_id and q.status='accepted' and q.provider_id=a.provider_id)
 then raise exception 'Vinculo Stripe fixture divergente';end if;
 select * into receipt from private.f4_stripe_fixture_receipts where event_id=p_event;
 if found then
  if receipt.attempt_id is distinct from p_attempt or receipt.body_sha256 is distinct from p_hash
  or not exists(select 1 from private.f4_stripe_fixture_evidence x where x.attempt_id=p_attempt and x.charge_id=p_charge and x.total_cents=p_total)
  then raise exception 'Replay Stripe fixture divergente';end if;
  return jsonb_build_object('duplicate',true,'evidenceAlreadyExists',true,'realPaymentVerified',false,'transferAuthorized',false);
 end if;
 select * into e from private.f4_stripe_fixture_evidence where attempt_id=p_attempt;
 existed:=found;
 if existed then
  if e.charge_id is distinct from p_charge or e.total_cents is distinct from p_total
  then raise exception 'Evidencia Stripe fixture divergente';end if;
 else
  insert into private.f4_stripe_fixture_evidence(attempt_id,charge_id,total_cents) values(p_attempt,p_charge,p_total);
 end if;
 insert into private.f4_stripe_fixture_receipts(event_id,attempt_id,body_sha256) values(p_event,p_attempt,p_hash)
 on conflict(event_id) do nothing;
 get diagnostics inserted_count=row_count;
 if inserted_count=0 then
  select * into receipt from private.f4_stripe_fixture_receipts where event_id=p_event;
  if receipt.attempt_id is distinct from p_attempt or receipt.body_sha256 is distinct from p_hash
  then raise exception 'Replay Stripe fixture divergente';end if;
 end if;
 return jsonb_build_object('duplicate',inserted_count=0,'evidenceAlreadyExists',existed,'realPaymentVerified',false,'transferAuthorized',false);
end $f$;
revoke all on function private.f4_stripe_store_fixture(uuid,text,text,text,text,uuid,uuid,uuid,uuid,text,integer) from public,anon,authenticated;
commit;
