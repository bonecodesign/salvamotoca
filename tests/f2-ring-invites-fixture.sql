-- Salva Motoca! F2 proximity/radius invitation test candidate.
-- PostgreSQL 17 DISPOSABLE ONLY; requires F2 stage/setup and F2 backend candidate.
-- Not a migration, no push, no SMS, no GPS disclosure, no Supabase hosted writes.
-- SM-DEC-047: 5/15/60 km approved by founder, offline-only candidate.

create table private.f2_mock_ring_gate(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into private.f2_mock_ring_gate(singleton,enabled) values(true,false);
create table private.f2_mock_ring_progress(
 request_id uuid primary key references public.service_requests(id),
 ring_index smallint not null default 0 check(ring_index between 0 and 3),
 last_step_ms bigint not null default 0
);
create table private.f2_mock_invites(
 offer_id uuid primary key references public.f2_request_offers(id),
 request_id uuid not null references public.service_requests(id),
 provider_id uuid not null references public.providers(id),
 ring_index smallint not null check(ring_index between 1 and 3),
 offered_ms bigint not null check(offered_ms>0),
 acknowledged_ms bigint,
 status text not null default 'pending' check(status in(
  'pending','acknowledged_mock','declined',
  'expired_no_delivery','expired_after_ack','cancelled')),
 external_sent boolean not null default false check(not external_sent),
 delivery_verified boolean not null default false check(not delivery_verified),
 absence_counted boolean not null default false check(not absence_counted),
 unique(request_id,provider_id),
 check(acknowledged_ms is null or acknowledged_ms>=offered_ms)
);
create index f2_mock_invite_active on private.f2_mock_invites(
 request_id,status,offered_ms);
alter table private.f2_mock_ring_progress enable row level security;
alter table private.f2_mock_invites enable row level security;
revoke all on private.f2_mock_ring_gate,private.f2_mock_ring_progress,
 private.f2_mock_invites from public,anon,authenticated;

create function private.f2_mock_advance_ring(p_request_id uuid,p_now_ms bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_req public.service_requests%rowtype;
 v_progress private.f2_mock_ring_progress%rowtype;
 v_invite private.f2_mock_invites%rowtype;
 v_ring smallint;
 v_radius integer;
 v_provider uuid;
 v_offer uuid;
begin
 if current_setting('app.f2_ring_test_only',true) is distinct from 'disposable_pg17'
  or not exists(select 1 from private.f2_mock_ring_gate
   where singleton and enabled)
 then raise exception 'F2_OFFLINE_GATE_DISABLED'; end if;
 if p_request_id is null or p_now_ms is null or p_now_ms<=0
 then raise exception 'INVALID_REQUEST_OR_CLOCK'; end if;
 -- Row lock serializes concurrent attempts BEFORE checking eligibility.
 select * into v_req from public.service_requests
 where id=p_request_id for update;
 if not found then raise exception 'REQUEST_UNKNOWN'; end if;
 if v_req.status<>'requested' then
   update private.f2_mock_invites set status='cancelled'
   where request_id=p_request_id and status in('pending','acknowledged_mock');
   return pg_catalog.jsonb_build_object('status','blocked',
     'reason','request_no_longer_requested','mockOnly',true,
     'externalSent',false);
 end if;
 if v_req.f2_mode is distinct from 'automatic' or v_req.latitude is null
  or v_req.longitude is null or v_req.latitude not between -90 and 90
  or v_req.longitude not between -180 and 180
  or v_req.service_types is null
  or cardinality(v_req.service_types) not between 1 and 5
  or (select count(distinct x) from unnest(v_req.service_types) x)
     <>cardinality(v_req.service_types)
  or 'reboque_moto'=any(v_req.service_types)
  or not exists(select 1 from public.service_categories c
   where c.id=v_req.category_id and c.code='borracharia_delivery')
 then raise exception 'REQUEST_NOT_ELIGIBLE_FOR_F2_AUTOMATIC'; end if;
 if exists(select 1 from public.service_quotes q
   where q.request_id=p_request_id and q.status='accepted')
 then raise exception 'QUOTE_ALREADY_ACCEPTED'; end if;
 insert into private.f2_mock_ring_progress(request_id)
 values(p_request_id) on conflict(request_id) do nothing;
 select * into v_progress from private.f2_mock_ring_progress
 where request_id=p_request_id for update;

 -- Expire only if no response and AFTER a full 5 minutes from the
 -- provider's MOCK opening/ACK. If unacknowledged, expire after 5 minutes
 -- from offer creation, but NEVER count an absence or claim delivery.
 update private.f2_mock_invites i set
 status=case when acknowledged_ms is null then 'expired_no_delivery'
     else 'expired_after_ack' end
 where i.request_id=p_request_id
   and i.status in('pending','acknowledged_mock')
   and p_now_ms>=coalesce(i.acknowledged_ms,i.offered_ms)+300000;
 update public.f2_request_offers o set status='expired'
 where exists(select 1 from private.f2_mock_invites i
  where i.offer_id=o.id and i.request_id=p_request_id
    and i.status in('expired_no_delivery','expired_after_ack'))
   and o.status in('offered','delivered');
 if exists(select 1 from private.f2_mock_invites i where i.request_id=p_request_id
    and i.status in('pending','acknowledged_mock'))
 then return pg_catalog.jsonb_build_object('status','waiting',
   'ring',v_progress.ring_index,'mockOnly',true,'externalSent',false);
 end if;
 -- Retry the current ring with the NEXT nearest eligible provider before
 -- expanding to a more distant ring. Never duplicate invitations.
 -- Each call invites at most ONE provider; active invites block progression.
 for v_ring in greatest(1,v_progress.ring_index)..3 loop
   v_radius:=case v_ring when 1 then 5 when 2 then 15 else 60 end;
   select p.id into v_provider from public.providers p
   join public.provider_services ps on ps.provider_id=p.id
     and ps.category_id=v_req.category_id and ps.is_active
   join public.bj_provider_presence presence on presence.provider_id=p.id
     and presence.online_requested and
       presence.last_seen_at>=pg_catalog.now()-interval '90 seconds'
   join public.f2_provider_capacity cap on cap.provider_id=p.id
     and cap.service_types @> v_req.service_types
   where p.status='approved' and p.is_active
     and p.city='Belo Horizonte' and p.state_code='MG'
     and p.latitude between -90 and 90
     and p.longitude between -180 and 180
     and cap.coverage_km>=private.f2_distance_km(
       v_req.latitude,v_req.longitude,p.latitude,p.longitude)
     and private.f2_distance_km(
       v_req.latitude,v_req.longitude,p.latitude,p.longitude)<=v_radius
     and not exists(select 1 from private.f2_mock_invites i
        where i.request_id=p_request_id and i.provider_id=p.id)
     and (select count(*) from public.f2_request_offers o
       where o.request_id=p_request_id and o.provider_id=p.id
        and o.status='declined')<2
   order by private.f2_distance_km(
       v_req.latitude,v_req.longitude,p.latitude,p.longitude),
     p.created_at,p.id
   limit 1;
   if v_provider is not null then
     insert into public.f2_request_offers(
       request_id,provider_id,round_number,status)
     values(p_request_id,v_provider,v_ring,'offered')
     returning id into v_offer;
     insert into private.f2_mock_invites(
       offer_id,request_id,provider_id,ring_index,offered_ms)
     values(v_offer,p_request_id,v_provider,v_ring,p_now_ms);
     update private.f2_mock_ring_progress set
       ring_index=v_ring,last_step_ms=p_now_ms
       where request_id=p_request_id;
     -- Any previous F1 assignment must not stay alive in parallel.
     update public.service_requests set provider_id=null,
       updated_at=pg_catalog.now() where id=p_request_id;
     return pg_catalog.jsonb_build_object(
       'status','invited_mock','ring',v_ring,'radiusKm',v_radius,
       'offerId',v_offer,'providerId',v_provider,
       'mockOnly',true,'externalSent',false);
   end if;
   update private.f2_mock_ring_progress
     set ring_index=v_ring,last_step_ms=p_now_ms
     where request_id=p_request_id;
 end loop;
 return pg_catalog.jsonb_build_object('status','exhausted','ring',3,
   'mockOnly',true,'externalSent',false);
end;
$$;

create function private.f2_mock_open_invite(
 p_offer_id uuid,p_provider_id uuid,p_now_ms bigint)
returns text language plpgsql security invoker set search_path='' as $$
declare v_inv private.f2_mock_invites%rowtype;v_stage text;
begin
 if current_setting('app.f2_ring_test_only',true) is distinct from 'disposable_pg17'
 or not exists(select 1 from private.f2_mock_ring_gate where singleton and enabled)
 then raise exception 'F2_OFFLINE_GATE_DISABLED'; end if;
 select * into v_inv from private.f2_mock_invites
 where offer_id=p_offer_id for update;
 if v_inv.offer_id is null or v_inv.provider_id is distinct from p_provider_id
  or p_now_ms is null or p_now_ms<v_inv.offered_ms
 then raise exception 'UNAUTHORIZED_MOCK_OPEN'; end if;
 if v_inv.status='acknowledged_mock' then return 'duplicate_mock_open'; end if;
 if v_inv.status<>'pending' or p_now_ms>=v_inv.offered_ms+300000
 then raise exception 'INVITE_NO_LONGER_OPEN'; end if;
 select status into v_stage from public.service_requests where id=v_inv.request_id;
 if v_stage is distinct from 'requested' then raise exception 'REQUEST_NOT_OPEN'; end if;
 update private.f2_mock_invites set status='acknowledged_mock',
   acknowledged_ms=p_now_ms where offer_id=p_offer_id;
 -- This is a provider opening the offer, NOT a verified push delivery.
 update public.f2_request_offers set status='delivered',
   delivered_at=pg_catalog.now() where id=p_offer_id;
 return 'opened_mock';
end;
$$;

create function private.f2_mock_decline_invite(
 p_offer_id uuid,p_provider_id uuid,p_now_ms bigint)
returns text language plpgsql security invoker set search_path='' as $$
declare v_inv private.f2_mock_invites%rowtype;v_stage text;
begin
 if current_setting('app.f2_ring_test_only',true) is distinct from 'disposable_pg17'
 or not exists(select 1 from private.f2_mock_ring_gate where singleton and enabled)
 then raise exception 'F2_OFFLINE_GATE_DISABLED'; end if;
 select * into v_inv from private.f2_mock_invites
 where offer_id=p_offer_id for update;
 if v_inv.offer_id is null or v_inv.provider_id is distinct from p_provider_id
  or p_now_ms is null or p_now_ms<v_inv.offered_ms
  or v_inv.status not in('pending','acknowledged_mock')
  or p_now_ms>=coalesce(v_inv.acknowledged_ms,v_inv.offered_ms)+300000
 then raise exception 'DECLINE_NOT_AUTHORIZED'; end if;
 select status into v_stage from public.service_requests where id=v_inv.request_id;
 if v_stage is distinct from 'requested' then raise exception 'REQUEST_NOT_OPEN'; end if;
 update private.f2_mock_invites set status='declined'
 where offer_id=p_offer_id;
 update public.f2_request_offers set status='declined',
   replied_at=pg_catalog.now() where id=p_offer_id;
 return 'declined_mock';
end;
$$;

revoke all on function
 private.f2_mock_advance_ring(uuid,bigint),
 private.f2_mock_open_invite(uuid,uuid,bigint),
 private.f2_mock_decline_invite(uuid,uuid,bigint)
 from public,anon,authenticated;
