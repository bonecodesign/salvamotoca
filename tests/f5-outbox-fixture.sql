-- Salva Motoca! F5 outbound notification OUTBOX demo, PostgreSQL 17 disposable only.
-- Requires tests/f456-transactional-fixture.sql.
-- NOT a migration, push integration, SMS, geolocation or network sender.
-- The ONLY possible state after a simulated acknowledgement is acked_mock.
-- No actual notification is ever transmitted. This schema is PRIVATE and fixture-only.

create table private.f5_mock_outbox(
 job_id bigint generated always as identity primary key,
 source_event_id text not null unique references private.f456_mock_events(event_id),
 request_id uuid not null references private.f456_mock_sessions(request_id),
 recipient_id uuid not null,
 kind text not null default 'mock_dispatch_notice'
   check(kind='mock_dispatch_notice'),
 status text not null default 'pending'
   check(status in('pending','leased','acked_mock','cancelled','dead')),
 attempts smallint not null default 0 check(attempts between 0 and 3),
 available_at_ms bigint not null default 0 check(available_at_ms>=0),
 lease_expires_at_ms bigint,
 claim_token uuid,
 leased_by text,
 check(
   (status='leased' and lease_expires_at_ms is not null
    and claim_token is not null and leased_by is not null)
   or status<>'leased'
 )
);
create index f5_mock_outbox_ready_idx on private.f5_mock_outbox(
 status,available_at_ms,job_id);
alter table private.f5_mock_outbox enable row level security;
revoke all on private.f5_mock_outbox from public,anon,authenticated;

-- Transactional outbox: creation and cancellation belong to the SAME
-- transaction as f456_apply_mock_event. If event commit fails, no queued job.
-- No address, precise GPS, phone, content, payment receipt or personal data.
create function private.f5_mock_outbox_on_event()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.payload->>'kind'='mock_dispatch' then
   if new.stage_after<>'en_route' then
     raise exception 'DISPATCH_OUTBOX_INVALID_STAGE'; end if;
   insert into private.f5_mock_outbox(
     source_event_id,request_id,recipient_id)
   select new.event_id,new.request_id,s.provider_id
   from private.f456_mock_sessions s
   where s.request_id=new.request_id and s.mock_paid
   on conflict(source_event_id) do nothing;
   if not found then
     raise exception 'DISPATCH_OUTBOX_MISSING_SESSION'; end if;
 elsif new.payload->>'kind' in(
   'mock_arrival','mock_dispute','mock_chargeback','mock_refund_requested')
 then
   update private.f5_mock_outbox
     set status='cancelled',claim_token=null,leased_by=null,
       lease_expires_at_ms=null
   where request_id=new.request_id and status in('pending','leased');
 end if;
 return new;
end;
$$;
create trigger f5_mock_outbox_insert
 after insert on private.f456_mock_events
 for each row execute function private.f5_mock_outbox_on_event();

-- No application/worker privileges are granted. Only PG test owner calls it.
-- The client cannot set these functions or choose a destination to notify.
create function private.f5_mock_outbox_claim(p_worker text,p_now_ms bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_job private.f5_mock_outbox%rowtype;
begin
 if current_setting('app.f456_test_only',true) is distinct from 'disposable_pg17'
   or not exists(select 1 from private.f456_mock_gate
     where singleton and enabled)
 then raise exception 'OFFLINE_ONLY_GATE_DISABLED'; end if;
 if p_worker is null or p_worker !~ '^worker_[a-z0-9_]{2,30}$'
   or p_now_ms is null or p_now_ms<=0
 then raise exception 'INVALID_WORKER_OR_CLOCK'; end if;

 -- A crashed worker on its third lease is dead-lettered. No automatic send.
 update private.f5_mock_outbox o set status='dead',claim_token=null,
   leased_by=null,lease_expires_at_ms=null
 where o.status='leased' and o.attempts>=3
   and o.lease_expires_at_ms<=p_now_ms;

 select o.* into v_job from private.f5_mock_outbox o
 join private.f456_mock_sessions s on s.request_id=o.request_id
 where s.stage='en_route'
  and o.attempts<3
  and (
   (o.status='pending' and o.available_at_ms<=p_now_ms)
   or (o.status='leased' and o.lease_expires_at_ms<=p_now_ms)
  )
 order by o.job_id for update of o skip locked limit 1;
 if not found then
  return pg_catalog.jsonb_build_object('status','empty',
    'mockOnly',true,'externalSent',false); end if;

 update private.f5_mock_outbox set status='leased',attempts=attempts+1,
  claim_token=pg_catalog.gen_random_uuid(),leased_by=p_worker,
  lease_expires_at_ms=p_now_ms+30000
 where job_id=v_job.job_id
 returning * into v_job;
 return pg_catalog.jsonb_build_object(
   'status','leased','jobId',v_job.job_id,
   'claimToken',v_job.claim_token,'kind',v_job.kind,
   'requestId',v_job.request_id,'recipientId',v_job.recipient_id,
   'attempt',v_job.attempts,'mockOnly',true,'externalSent',false);
end;
$$;

create function private.f5_mock_outbox_ack(
 p_job_id bigint,p_worker text,p_token uuid,p_now_ms bigint)
returns text language plpgsql security invoker set search_path='' as $$
declare v_job private.f5_mock_outbox%rowtype;v_stage text;
begin
 if current_setting('app.f456_test_only',true) is distinct from 'disposable_pg17'
  or not exists(select 1 from private.f456_mock_gate
    where singleton and enabled)
 then raise exception 'OFFLINE_ONLY_GATE_DISABLED'; end if;
 if p_job_id is null or p_worker is null or p_token is null
   or p_now_ms is null or p_now_ms<=0
 then raise exception 'INVALID_ACK'; end if;
 select * into v_job from private.f5_mock_outbox
 where job_id=p_job_id for update;
 if not found then raise exception 'UNKNOWN_MOCK_JOB'; end if;
 if v_job.status='acked_mock' and v_job.claim_token=p_token
   and v_job.leased_by=p_worker
 then return 'duplicate_mock_ack'; end if;
 if v_job.status<>'leased'
    or v_job.leased_by is distinct from p_worker
    or v_job.claim_token is distinct from p_token
    or p_now_ms>v_job.lease_expires_at_ms
 then raise exception 'STALE_OR_FOREIGN_CLAIM'; end if;
 select stage into v_stage from private.f456_mock_sessions
 where request_id=v_job.request_id;
 if v_stage is distinct from 'en_route'
 then raise exception 'OUTBOX_SESSION_NO_LONGER_EN_ROUTE'; end if;
 update private.f5_mock_outbox set status='acked_mock'
 where job_id=p_job_id;
 return 'acked_mock';
end;
$$;

create function private.f5_mock_outbox_fail(
 p_job_id bigint,p_worker text,p_token uuid,p_now_ms bigint)
returns text language plpgsql security invoker set search_path='' as $$
declare v_job private.f5_mock_outbox%rowtype;v_next text;
begin
 if current_setting('app.f456_test_only',true) is distinct from 'disposable_pg17'
  or not exists(select 1 from private.f456_mock_gate
    where singleton and enabled)
 then raise exception 'OFFLINE_ONLY_GATE_DISABLED'; end if;
 if p_job_id is null or p_worker is null or p_token is null
   or p_now_ms is null or p_now_ms<=0
 then raise exception 'INVALID_FAILURE'; end if;
 select * into v_job from private.f5_mock_outbox
 where job_id=p_job_id for update;
 if not found or v_job.status<>'leased'
  or v_job.leased_by is distinct from p_worker
  or v_job.claim_token is distinct from p_token
  or p_now_ms>v_job.lease_expires_at_ms
 then raise exception 'STALE_OR_FOREIGN_CLAIM'; end if;
 if v_job.attempts>=3 then v_next:='dead';
 else v_next:='pending'; end if;
 update private.f5_mock_outbox
 set status=v_next,available_at_ms=p_now_ms+
  case when v_next='dead' then 0 else v_job.attempts*1000 end,
   claim_token=null,leased_by=null,lease_expires_at_ms=null
 where job_id=p_job_id;
 return v_next;
end;
$$;

revoke all on function private.f5_mock_outbox_on_event(),
 private.f5_mock_outbox_claim(text,bigint),
 private.f5_mock_outbox_ack(bigint,text,uuid,bigint),
 private.f5_mock_outbox_fail(bigint,text,uuid,bigint)
 from public,anon,authenticated;
