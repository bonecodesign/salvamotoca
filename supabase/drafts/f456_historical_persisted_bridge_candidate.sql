-- Disposable historical replay only. Not a migration, no real payment or dispatch.
begin;
-- A paid fixture must reference the same verified and journaled mock attempt.
create function private.f456_require_mock_finance()
returns trigger language plpgsql security invoker set search_path='' as $bridge$
begin
 if new.mock_paid and not exists(
   select 1 from private.f4_mock_payment_attempts a
   where a.request_id=new.request_id and a.quote_id=new.quote_id
     and a.customer_id=new.customer_id and a.provider_id=new.provider_id
     and a.status='mock_verified'
     and exists(select 1 from private.f4_mock_journals j where j.attempt_id=a.id and j.kind='mock_payment')
     and not exists(select 1 from private.f4_mock_journals j where j.attempt_id=a.id and j.kind='mock_refund')
     and not exists(select 1 from private.f4_mock_risk_cases k where k.attempt_id=a.id and k.status='review_required')
 ) then raise exception 'Sessao mock exige prova financeira contabilizada sem risco aberto.'; end if;
 return new;
end $bridge$;
revoke all on function private.f456_require_mock_finance() from public,anon,authenticated;
create trigger f456_require_finance before insert or update on public.f5_mock_sessions
 for each row execute function private.f456_require_mock_finance();

-- Preserve the tested financial implementation; the historical integration
-- additionally requires persisted bilateral completion, not caller booleans.
alter function private.f4_queue_mock_settlement_review(uuid,text,boolean,boolean)
 rename to f456_queue_mock_review_internal;
revoke all on function private.f456_queue_mock_review_internal(uuid,text,boolean,boolean) from public,anon,authenticated;
create function private.f4_queue_mock_settlement_review(
 p_attempt_id uuid,p_intent_key text,p_customer_confirmed boolean,p_provider_confirmed boolean)
returns jsonb language plpgsql security invoker set search_path='' as $bridge$
declare v_request uuid;
begin
 if current_setting('app.f4_test_only',true) is distinct from 'local_fixture'
 or not exists(select 1 from private.f4_release_gate where enabled)
 or not exists(select 1 from private.f5_mock_release_gate where enabled)
 or not exists(select 1 from private.f6_mock_release_gate where enabled)
 then raise exception 'Revisao integrada mock desativada.'; end if;
 select request_id into v_request from private.f4_mock_payment_attempts where id=p_attempt_id;
 perform 1 from public.service_requests where id=v_request for update;
 if p_customer_confirmed is distinct from true or p_provider_confirmed is distinct from true
 or not exists(
   select 1 from private.f4_mock_payment_attempts a
   join public.f5_mock_sessions s on s.request_id=a.request_id and s.quote_id=a.quote_id
     and s.customer_id=a.customer_id and s.provider_id=a.provider_id
   join public.f6_mock_completions c on c.session_id=s.id
     and c.customer_id=s.customer_id and c.provider_owner_id=s.provider_owner_id
   join public.service_requests r on r.id=s.request_id and r.customer_id=s.customer_id and r.provider_id=s.provider_id
   join public.service_quotes q on q.id=s.quote_id and q.status='accepted' and q.provider_id=s.provider_id
   join public.providers p on p.id=s.provider_id and p.owner_id=s.provider_owner_id
   where a.id=p_attempt_id and r.status='awaiting_payment' and s.mock_paid and s.status='handoff_f6'
     and c.status='completed' and c.customer_confirmed_at is not null and c.provider_confirmed_at is not null
     and p.status='approved' and p.is_active
     and not exists(select 1 from private.f5_mock_revocations x where x.session_id=s.id)
     and not exists(select 1 from public.f23_mock_incidents i where i.request_key=s.request_id
       and i.category in ('payment_dispute','safety_report') and i.status<>'reviewed_mock')
 ) then raise exception 'Revisao exige conclusao bilateral persistida sem incidente aberto.'; end if;
 return private.f456_queue_mock_review_internal(p_attempt_id,p_intent_key,true,true);
end $bridge$;
revoke all on function private.f4_queue_mock_settlement_review(uuid,text,boolean,boolean) from public,anon,authenticated;

-- A later divergence or revoked assignment holds an existing review intent.
create function private.f456_hold_on_completion()
returns trigger language plpgsql security invoker set search_path='' as $bridge$
begin
 if new.status='support_review' then
  update private.f4_mock_settlement_intents i set status='held',held_at=now()
  from private.f4_mock_payment_attempts a,public.f5_mock_sessions s
  where i.attempt_id=a.id and a.request_id=s.request_id and a.quote_id=s.quote_id
   and s.id=new.session_id and i.status='review_only';
 end if;
 return new;
end $bridge$;
revoke all on function private.f456_hold_on_completion() from public,anon,authenticated;
create trigger f456_hold_on_completion after update of status on public.f6_mock_completions
 for each row execute function private.f456_hold_on_completion();
create function private.f456_hold_on_revocation()
returns trigger language plpgsql security invoker set search_path='' as $bridge$
begin
 update private.f4_mock_settlement_intents i set status='held',held_at=now()
 from private.f4_mock_payment_attempts a,public.f5_mock_sessions s
 where i.attempt_id=a.id and a.request_id=s.request_id and a.quote_id=s.quote_id
 and s.id=new.session_id and i.status='review_only';
 return new;
end $bridge$;
revoke all on function private.f456_hold_on_revocation() from public,anon,authenticated;
create trigger f456_hold_on_revocation after insert on private.f5_mock_revocations
 for each row execute function private.f456_hold_on_revocation();
-- Incident intake already locks the request; take the same order for review.
create function private.f456_hold_on_incident()
returns trigger language plpgsql security definer set search_path='' as $bridge$
begin
 if new.request_key is not null and new.category in ('payment_dispute','safety_report') and new.status<>'reviewed_mock' then
  perform 1 from public.service_requests where id=new.request_key for update;
  update private.f4_mock_settlement_intents i set status='held',held_at=now()
  from private.f4_mock_payment_attempts a
  where i.attempt_id=a.id and a.request_id=new.request_key and i.status='review_only';
 end if;
 return new;
end $bridge$;
revoke all on function private.f456_hold_on_incident() from public,anon,authenticated;
create trigger f456_hold_on_incident after insert on public.f23_mock_incidents
 for each row execute function private.f456_hold_on_incident();
commit;
