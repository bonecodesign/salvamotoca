-- Salva Motoca! F1 + F4/F5 mock financial and lifecycle gates.
-- OFFLINE PG17 DISPOSABLE ONLY. Not a migration and not an RPC to publish.
-- Requires tests/f1-location-rpc-fixture.sql; no external connection or credentials.
-- The mock financial rows DO NOT represent an authenticated PSP receipt.
create table private.f1_mock_f4_release_gate(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into private.f1_mock_f4_release_gate(singleton,enabled) values(true,false);
revoke all on private.f1_mock_f4_release_gate from public,anon,authenticated;

-- Technical snapshot: 10% charged to rider, 10% deducted from provider;
-- materials included in service. Travel has no commission.
create table private.f1_mock_f4_decisions(
 request_id uuid primary key references public.service_requests(id),
 quote_id uuid not null references public.service_quotes(id),
 provider_id uuid not null references public.providers(id),
 service_cents integer not null check(service_cents between 1 and 500000),
 travel_cents integer not null check(travel_cents between 0 and 500000),
 rider_total_cents integer not null,
 provider_payable_cents integer not null,
 platform_gross_cents integer not null,
 fixture_marker text not null default 'NOT_A_PSP_RECEIPT'
   check(fixture_marker='NOT_A_PSP_RECEIPT'),
 status text not null check(status in('awaiting','mock_confirmed','mock_revoked')),
 risk_status text not null check(risk_status in('clear','disputed','refunded','chargeback')),
 revoked_at timestamptz,
 check(
   rider_total_cents=service_cents+travel_cents+(service_cents+5)/10
   and provider_payable_cents=service_cents+travel_cents-(service_cents+5)/10
   and platform_gross_cents=2*((service_cents+5)/10)
 )
);
revoke all on private.f1_mock_f4_decisions from public,anon,authenticated;

create table private.f1_mock_f5_sessions(
 request_id uuid primary key references public.service_requests(id),
 quote_id uuid not null references public.service_quotes(id),
 provider_id uuid not null references public.providers(id),
 stage text not null check(stage in(
   'awaiting_payment','ready_for_dispatch','en_route','arrived',
   'in_service','handoff_f6','support_review','completed','cancelled'
 ))
);
revoke all on private.f1_mock_f5_sessions from public,anon,authenticated;

-- NOTE: Provider branch always fails closed in production: the two gates
-- below are FALSE, and only the PG superuser sets them TRUE inside tests.
-- A real design needs signed PSP webhook verification and server-owned
-- authorization. F4 mocks and payment_records.status='paid' are insufficient.
create function private.f1_location_financial_lifecycle_fixture(p_request_id uuid)
returns table(address_details text,latitude numeric,longitude numeric)
language sql stable security definer set search_path='' as $$
 select r.address_details,r.latitude,r.longitude
 from public.service_requests r
 where r.id=p_request_id
   and (select auth.uid()) is not null
   and (
     r.customer_id=(select auth.uid())
     or (
       exists(select 1 from private.f1_location_release_gate g
         where g.singleton and g.enabled)
       and exists(select 1 from private.f1_mock_f4_release_gate g
         where g.singleton and g.enabled)
       and r.status in ('accepted','in_progress')
       and exists(select 1 from public.providers p
         where p.id=r.provider_id and p.owner_id=(select auth.uid())
         and p.status='approved' and p.is_active)
       and exists(select 1 from public.service_quotes q
         where q.request_id=r.id and q.provider_id=r.provider_id
         and q.status='accepted'
         and exists(select 1 from private.f1_mock_f4_decisions a
           where a.request_id=r.id and a.quote_id=q.id
           and a.provider_id=r.provider_id
           and a.status='mock_confirmed' and a.risk_status='clear'
           and a.revoked_at is null and a.service_cents>0))
       and exists(select 1 from private.f1_mock_f5_sessions s
         where s.request_id=r.id and s.provider_id=r.provider_id
         and s.stage='en_route'
         and exists(select 1 from public.service_quotes q2
           where q2.id=s.quote_id and q2.request_id=r.id
             and q2.provider_id=r.provider_id and q2.status='accepted'
             and exists(select 1 from private.f1_mock_f4_decisions a2
               where a2.request_id=r.id and a2.quote_id=s.quote_id
                 and a2.provider_id=r.provider_id
                 and a2.status='mock_confirmed' and a2.risk_status='clear'
                 and a2.revoked_at is null))
       and exists(select 1 from public.payment_records pay
         where pay.request_id=r.id and pay.status='paid'
           and pay.paid_at is not null and pay.paid_at<=pg_catalog.now())
     )
   );
$$;
revoke all on function private.f1_location_financial_lifecycle_fixture(uuid)
 from public,anon,authenticated;
grant execute on function private.f1_location_financial_lifecycle_fixture(uuid)
 to authenticated;

-- Everything below is invented and belongs only to this disposable database.
insert into private.f1_mock_f4_decisions(
 request_id,quote_id,provider_id,service_cents,travel_cents,
 rider_total_cents,provider_payable_cents,platform_gross_cents,
 status,risk_status)
values(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 23000,4000,29300,24700,4600,'mock_confirmed','clear');
insert into private.f1_mock_f5_sessions(request_id,quote_id,provider_id,stage)
values(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','awaiting_payment');
