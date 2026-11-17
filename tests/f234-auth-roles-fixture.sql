-- Salva Motoca! F2-F5 authenticated-role BEHAVIOURAL fixture.
-- PostgreSQL 17 disposable CI ONLY. NOT real Supabase Auth, not a migration.
-- Requires F456 + F5 + F234 fixture SQL; NO external users, PSP, GPS or uploads.
-- pg setting request.jwt.claim.sub can be forged by DB owner: test selector ONLY.

create schema auth;
create function auth.uid() returns uuid language sql stable set search_path=''
as $$ select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid $$;
revoke all on function auth.uid() from public,anon,authenticated;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

create table private.f234_mock_provider_owners (
 provider_id uuid primary key references private.f234_mock_providers(provider_id),
 owner_id uuid not null unique
);
revoke all on private.f234_mock_provider_owners from public,anon,authenticated;
insert into private.f234_mock_provider_owners(provider_id,owner_id)
values
 ('22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('77777777-7777-4777-8777-777777777777',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
 ('88888888-8888-4888-8888-888888888888',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
 ('99999999-8888-4888-8888-888888888888',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');

-- Safe, read-only quote cards with RLS + column grants:
-- neither customer/provider ID (owner columns) nor internal text are SELECTable.
-- The RLS policy can still reference restricted owner columns.
create table public.f234_mock_quote_cards (
 quote_id uuid primary key,
 request_id uuid not null,
 customer_id uuid not null,
 provider_owner_id uuid not null,
 service_cents integer not null check(service_cents>0),
 travel_cents integer not null check(travel_cents>=0),
 quote_status text not null check(quote_status in('proposed','accepted','declined')),
 private_note text not null default 'PRIVATE_MOCK_PHONE_AND_GPS_NEVER_SHOW'
);
revoke all on public.f234_mock_quote_cards from public,anon,authenticated;
alter table public.f234_mock_quote_cards enable row level security;
create policy f234_quote_cards_actor_only on public.f234_mock_quote_cards
 for select to authenticated
 using (
  customer_id=(select auth.uid())
  or provider_owner_id=(select auth.uid())
 );
grant select(quote_id,request_id,service_cents,travel_cents,quote_status)
 on public.f234_mock_quote_cards to authenticated;

insert into public.f234_mock_quote_cards(
 quote_id,request_id,customer_id,provider_owner_id,
 service_cents,travel_cents,quote_status
)
select q.quote_id,q.request_id,r.customer_id,o.owner_id,
 q.service_cents,q.travel_cents,q.status
from private.f234_mock_quotes q
join private.f234_mock_requests r on r.request_id=q.request_id
join private.f234_mock_provider_owners o on o.provider_id=q.provider_id;

-- Keep the deliberately duplicated public projection consistent when mock
-- selection declines losers. Never use stale client-provided quote status.
create function private.f234_mock_sync_card()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status is distinct from old.status then
  update public.f234_mock_quote_cards
   set quote_status=new.status where quote_id=new.quote_id;
 end if;
 return new;
end $$;
create trigger f234_mock_sync_card_after_status
 after update of status on private.f234_mock_quotes
 for each row execute function private.f234_mock_sync_card();

-- Public mock adapters emulate the Authorization boundary in a disposable DB.
-- The caller supplies NO identity. Auth-like identity is pulled inside
-- SECURITY DEFINER, checked explicitly and passed to the internal mock.
-- NEVER deploy these functions: the GUC is not a verified JWT.
create function public.f234_mock_accept_as_customer(
 p_request_id uuid,p_quote_id uuid,p_event_id text,p_at_ms bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
 if v_actor is null then raise exception 'F234_LOGIN_REQUIRED'; end if;
 if current_setting('app.f234_test_only',true) is distinct from 'disposable_pg17'
  or not exists(select 1 from private.f234_mock_gate
   where singleton and enabled)
 then raise exception 'F234_MOCK_GATE_DISABLED'; end if;
 return private.f234_mock_accept_quote(
  p_request_id,p_quote_id,v_actor,p_event_id,p_at_ms);
end $$;

create function public.f234_mock_cancel_as_customer(p_request_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
 if v_actor is null then raise exception 'F234_LOGIN_REQUIRED'; end if;
 if current_setting('app.f234_test_only',true) is distinct from 'disposable_pg17'
  or not exists(select 1 from private.f234_mock_gate
   where singleton and enabled)
 then raise exception 'F234_MOCK_GATE_DISABLED'; end if;
 return private.f234_mock_cancel_preaccept(p_request_id,v_actor);
end $$;

-- Sanitized read: only request owner or the owner of the quote's provider.
-- No GPS, photo, customer email, user identifiers or PSP credentials in JSON.
create function public.f234_mock_read_quote(p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid();
 v_row record;
begin
 if v_actor is null then raise exception 'F234_LOGIN_REQUIRED'; end if;
 if current_setting('app.f234_test_only',true) is distinct from 'disposable_pg17'
  or not exists(select 1 from private.f234_mock_gate
   where singleton and enabled)
 then raise exception 'F234_MOCK_GATE_DISABLED'; end if;
 select q.quote_id,q.request_id,q.service_cents,q.travel_cents,q.status,
   r.customer_id,o.owner_id
 into v_row from private.f234_mock_quotes q
 join private.f234_mock_requests r on r.request_id=q.request_id
 join private.f234_mock_provider_owners o on o.provider_id=q.provider_id
 where q.quote_id=p_quote_id;
 if not found or (v_actor is distinct from v_row.customer_id
   and v_actor is distinct from v_row.owner_id)
 then raise exception 'F234_QUOTE_ACCESS_DENIED'; end if;
 return pg_catalog.jsonb_build_object(
  'quoteId',v_row.quote_id,'requestId',v_row.request_id,
  'serviceCents',v_row.service_cents,'travelCents',v_row.travel_cents,
  'status',v_row.status,'mockOnly',true,
  'realPspVerified',false,'chatAllowed',false,'exactLocationShared',false);
end $$;

-- A provider sees the request state only after that provider was SELECTED,
-- and even then NEVER exact GPS, private photo, payment provider receipt or chat.
create function public.f234_mock_read_session(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid();
 v_row record;
begin
 if v_actor is null then raise exception 'F234_LOGIN_REQUIRED'; end if;
 if current_setting('app.f234_test_only',true) is distinct from 'disposable_pg17'
  or not exists(select 1 from private.f234_mock_gate
   where singleton and enabled)
 then raise exception 'F234_MOCK_GATE_DISABLED'; end if;
 select r.request_id,r.customer_id,r.selected_provider_id,r.accepted_quote_id,
  s.stage,s.mock_paid,o.owner_id
 into v_row
 from private.f234_mock_requests r
 left join private.f456_mock_sessions s on s.request_id=r.request_id
 left join private.f234_mock_provider_owners o
   on o.provider_id=r.selected_provider_id
 where r.request_id=p_request_id;
 if not found or (
  v_actor is distinct from v_row.customer_id
  and (v_row.selected_provider_id is null
       or v_actor is distinct from v_row.owner_id)
 ) then raise exception 'F234_SESSION_ACCESS_DENIED'; end if;
 return pg_catalog.jsonb_build_object(
  'requestId',v_row.request_id,'stage',
    coalesce(v_row.stage,'not_selected_mock'),
  'mockPaymentRecorded',coalesce(v_row.mock_paid,false),
  'mockOnly',true,'realPspVerified',false,
  'chatAllowed',false,'exactLocationShared',false,
  'realTransferAuthorized',false);
end $$;

-- PostgreSQL defaults EXECUTE TO PUBLIC, so revoke within the fixture.
revoke all on function
 public.f234_mock_accept_as_customer(uuid,uuid,text,bigint),
 public.f234_mock_cancel_as_customer(uuid),
 public.f234_mock_read_quote(uuid),
 public.f234_mock_read_session(uuid)
 from public,anon,authenticated;
grant execute on function
 public.f234_mock_accept_as_customer(uuid,uuid,text,bigint),
 public.f234_mock_cancel_as_customer(uuid),
 public.f234_mock_read_quote(uuid),
 public.f234_mock_read_session(uuid)
 to authenticated;

revoke all on function private.f234_mock_sync_card()
 from public,anon,authenticated;
