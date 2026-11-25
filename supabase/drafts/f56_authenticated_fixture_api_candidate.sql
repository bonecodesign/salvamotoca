-- Disposable integration fixture only. No hosted migration, PSP or actual GPS.
begin;
-- Empty by default, only a verified disposable native runner inserts this row.
create table private.f56_native_fixture_marker(
 singleton boolean primary key default true check(singleton),
 purpose text not null check(purpose='SM_NATIVE_EPHEMERAL_CI_ONLY')
);
alter table private.f56_native_fixture_marker enable row level security;
revoke all on private.f56_native_fixture_marker from public,anon,authenticated;
create function private.f56_fixture_context()
returns boolean language plpgsql stable security definer set search_path='' as $context$
declare sid text;
begin
 if current_database()='sm_history_disposable' then return true; end if;
 if current_database()<>'postgres' or auth.uid() is null or not exists(
  select 1 from private.f56_native_fixture_marker where singleton and purpose='SM_NATIVE_EPHEMERAL_CI_ONLY')
 then return false; end if;
 sid:=nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id';
 if sid is null or sid !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
 return exists(select 1 from auth.sessions s where s.id=sid::uuid and s.user_id=auth.uid());
end $context$;
revoke all on function private.f56_fixture_context() from public,anon,authenticated;

create table private.f56_mock_events(
 session_id uuid not null references public.f5_mock_sessions(id),
 event_id uuid not null,
 actor_id uuid not null,
 action text not null,
 payload_digest bytea not null,
 outcome jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(session_id,event_id)
);
alter table private.f56_mock_events enable row level security;
revoke all on private.f56_mock_events from public,anon,authenticated;

-- Private definer, explicit identity and current binding; public invoker below.
create function private.f56_apply_fixture(p_session uuid,p_event uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $api$
declare
 u uuid:=auth.uid(); s public.f5_mock_sessions%rowtype;
 c public.f6_mock_completions%rowtype; prior private.f56_mock_events%rowtype;
 req uuid; t timestamptz; sample timestamptz; digest bytea;
 is_provider boolean; is_customer boolean; result jsonb; expected text[]; next_status text;
begin
 if private.f56_fixture_context() is distinct from true or u is null or p_session is null or p_event is null
 or private.f5_mock_enabled() is distinct from true or private.f6_mock_enabled() is distinct from true
 or not exists(select 1 from private.f4_release_gate where enabled)
 then raise exception 'API fixture indisponivel.'; end if;
 if p_action is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
 or octet_length(p_payload::text)>12000 then raise exception 'Evento invalido.';end if;
 expected:=case p_action
 when 'dispatch' then array['consent']
 when 'location' then array['lat','lng','accuracy','sampledAt']
 when 'message' then array['body']
 when 'summary' then array['body']
 when 'customer_confirm' then array['summaryRead']
 when 'rating' then array['stars']
 when 'support_message' then array['body']
 when 'arrive' then array[]::text[]
 when 'start' then array[]::text[]
 when 'handoff' then array[]::text[]
 when 'provider_confirm' then array[]::text[]
 when 'expire' then array[]::text[]
 when 'dispute' then array[]::text[]
 else null end;
 if expected is null or not (p_payload ?& expected)
 or exists(select 1 from jsonb_object_keys(p_payload) k where not(k=any(expected)))
 then raise exception 'Campos de evento invalidos.';end if;
 select request_id into req from public.f5_mock_sessions where id=p_session;
 perform 1 from public.service_requests where id=req for update;
 select * into s from public.f5_mock_sessions where id=p_session for update;
 if not found or private.f5_mock_binding_visible(p_session) is distinct from true
 then raise exception 'Sessao nao autorizada.';end if;
 is_provider:=u=s.provider_owner_id;
 is_customer:=u=s.customer_id;
 if s.customer_id=s.provider_owner_id or not (is_customer or is_provider) or not s.mock_paid
 then raise exception 'Sessao nao autorizada.';end if;
 if not exists(select 1 from public.providers p where p.id=s.provider_id and p.owner_id=s.provider_owner_id
 and p.status='approved' and p.is_active) then raise exception 'Prestador nao homologado.';end if;
 -- Lock the financial attempt to serialize against risk opening/refunds.
 perform 1 from private.f4_mock_payment_attempts a where a.request_id=s.request_id and a.quote_id=s.quote_id for update;
 if not found or not exists(select 1 from private.f4_mock_payment_attempts a
 where a.request_id=s.request_id and a.quote_id=s.quote_id and a.customer_id=s.customer_id and a.provider_id=s.provider_id
 and a.status='mock_verified'
 and exists(select 1 from private.f4_mock_journals j where j.attempt_id=a.id and j.kind='mock_payment')
 and not exists(select 1 from private.f4_mock_journals j where j.attempt_id=a.id and j.kind='mock_refund')
 and not exists(select 1 from private.f4_mock_risk_cases k where k.attempt_id=a.id and k.status='review_required'))
 then raise exception 'Financeiro mock bloqueado; use relato de incidente.';end if;
 if exists(select 1 from public.f23_mock_incidents i where i.request_key=s.request_id
 and i.category in ('payment_dispute','safety_report') and i.status<>'reviewed_mock')
 then raise exception 'Incidente aberto; use central de suporte.';end if;
 digest:=sha256(convert_to(p_payload::text,'UTF8'));
 select * into prior from private.f56_mock_events where session_id=p_session and event_id=p_event;
 if found then
  if prior.actor_id<>u or prior.action<>p_action or prior.payload_digest<>digest
  then raise exception 'Evento reutilizado com dados diferentes.';end if;
  return prior.outcome||jsonb_build_object('idempotent',true);
 end if;
 if (select count(*) from private.f56_mock_events where session_id=p_session)>=1000
 then raise exception 'Limite de eventos da fixture.';end if;
 t:=clock_timestamp();
 if p_action in ('dispatch','arrive','start','handoff','location','summary','provider_confirm') and not is_provider
 or p_action in ('customer_confirm','rating') and not is_customer
 then raise exception 'Papel nao autorizado.';end if;
 if p_action in ('dispatch','arrive','start','handoff') then
  next_status:=case
   when p_action='dispatch' and s.status='ready_for_dispatch' then 'en_route'
   when p_action='arrive' and s.status='en_route' then 'arrived'
   when p_action='start' and s.status='arrived' then 'in_service'
   when p_action='handoff' and s.status='in_service' then 'handoff_f6' end;
  if next_status is null or (p_action='dispatch' and jsonb_typeof(p_payload->'consent') is distinct from 'boolean')
  then raise exception 'Transicao invalida.';end if;
  update public.f5_mock_sessions set status=next_status,updated_at=t,
   tracking_consent=case when p_action='dispatch' then (p_payload->>'consent')::boolean else false end
   where id=p_session;
  if next_status<>'en_route' then delete from public.f5_mock_latest_location where session_id=p_session;end if;
  if next_status='handoff_f6' then
   insert into public.f6_mock_completions(session_id,customer_id,provider_owner_id,created_at,updated_at)
   values(s.id,s.customer_id,s.provider_owner_id,t,t);
  end if;
 elsif p_action='location' then
  if s.status<>'en_route' or not s.tracking_consent
  or jsonb_typeof(p_payload->'lat') is distinct from 'number'
  or jsonb_typeof(p_payload->'lng') is distinct from 'number'
  or jsonb_typeof(p_payload->'accuracy') is distinct from 'number'
  or jsonb_typeof(p_payload->'sampledAt') is distinct from 'string'
  then raise exception 'Localizacao nao autorizada.';end if;
  sample:=(p_payload->>'sampledAt')::timestamptz;
  if sample>t or sample<t-interval '120 seconds' or exists(
   select 1 from public.f5_mock_latest_location l where l.session_id=p_session and l.sampled_at>=sample)
  then raise exception 'Amostra fora da janela ou anterior.';end if;
  insert into public.f5_mock_latest_location(session_id,latitude,longitude,accuracy_meters,sampled_at,updated_at)
  values(p_session,(p_payload->>'lat')::numeric,(p_payload->>'lng')::numeric,(p_payload->>'accuracy')::numeric,sample,t)
  on conflict(session_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,
   accuracy_meters=excluded.accuracy_meters,sampled_at=excluded.sampled_at,updated_at=excluded.updated_at;
 elsif p_action='message' then
  if jsonb_typeof(p_payload->'body') is distinct from 'string' then raise exception 'Mensagem invalida.';end if;
  insert into public.f5_mock_messages(session_id,actor_id,body,created_at)
  values(p_session,u,btrim(p_payload->>'body'),t);
 else
  select * into c from public.f6_mock_completions where session_id=p_session for update;
  if not found or s.status<>'handoff_f6' then raise exception 'Conclusao indisponivel.';end if;
  if p_action='summary' and c.status='awaiting_summary' and jsonb_typeof(p_payload->'body')='string' then
   update public.f6_mock_completions set status='awaiting_both',summary=btrim(p_payload->>'body'),
    summary_at=t,customer_deadline_at=t+interval '5 minutes',updated_at=t where id=c.id;
  elsif p_action='provider_confirm' and c.status='awaiting_both' and c.provider_confirmed_at is null
   and (c.customer_confirmed_at is not null or t<=c.customer_deadline_at) then
   update public.f6_mock_completions set provider_confirmed_at=t,updated_at=t,
    status=case when c.customer_confirmed_at is not null then 'completed' else 'awaiting_both' end where id=c.id;
  elsif p_action='customer_confirm' and c.status='awaiting_both' and c.customer_confirmed_at is null
   and t<=c.customer_deadline_at and p_payload->'summaryRead'='true'::jsonb then
   update public.f6_mock_completions set customer_confirmed_at=t,updated_at=t,
    status=case when c.provider_confirmed_at is not null then 'completed' else 'awaiting_both' end where id=c.id;
  elsif p_action='expire' and c.status='awaiting_both' and c.customer_confirmed_at is null and t>c.customer_deadline_at
   or p_action='dispute' and c.status in ('awaiting_both','completed') then
   update public.f6_mock_completions set status='support_review',updated_at=t where id=c.id;
  elsif p_action='rating' and c.status='completed' and c.rating_stars is null and jsonb_typeof(p_payload->'stars')='number'
   and (p_payload->>'stars') ~ '^[1-5]$' then
   update public.f6_mock_completions set rating_stars=(p_payload->>'stars')::smallint,rating_at=t,updated_at=t where id=c.id;
  elsif p_action='support_message' and c.status='support_review' and jsonb_typeof(p_payload->'body')='string' then
   insert into public.f6_mock_support_messages(completion_id,actor_id,body,created_at)
    values(c.id,u,btrim(p_payload->>'body'),t);
  else raise exception 'Evento de conclusao invalido.';end if;
 end if;
 select jsonb_build_object('mockOnly',true,'realPayment',false,'transferAuthorized',false,
 'sessionStatus',x.status,'completionStatus',y.status,'idempotent',false) into result
 from public.f5_mock_sessions x left join public.f6_mock_completions y on y.session_id=x.id where x.id=p_session;
 insert into private.f56_mock_events(session_id,event_id,actor_id,action,payload_digest,outcome)
 values(p_session,p_event,u,p_action,digest,result);
 return result;
end $api$;
revoke all on function private.f56_apply_fixture(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.f56_apply_fixture(uuid,uuid,text,jsonb) to authenticated;
create function public.f56_apply_fixture(p_session uuid,p_event uuid,p_action text,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $api$
 select private.f56_apply_fixture(p_session,p_event,p_action,p_payload);
$api$;
revoke all on function public.f56_apply_fixture(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.f56_apply_fixture(uuid,uuid,text,jsonb) to authenticated;
commit;
