-- Salva Motoca! SM-PLAN-003 — candidato de persistência de incidentes de SUPORTE,
-- exclusivamente PostgreSQL 17 efêmero em GitHub Actions. NUNCA aplicar no Supabase
-- hospedado enquanto G1 e revisão jurídico/técnica estiverem pendentes.
-- Não é DDL de produção: não tem ingresso por usuário, push ou integração com PSP.

create table private.f23_mock_support_gate(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into private.f23_mock_support_gate(singleton,enabled) values(true,false);

create table private.f23_mock_admins(
 user_id uuid primary key,
 created_at timestamptz not null default now()
);
-- IMPORTANTE: não inserir identidades reais aqui, nem no GitHub.

create table public.f23_mock_incidents(
 case_key uuid primary key,
 category text not null check(category in
  ('general_question','service_issue','payment_dispute','safety_report')),
 request_key uuid,
 status text not null default 'queued_mock' check(status in
  ('queued_mock','escalated_uncovered_mock','acknowledged_mock',
   'under_review_mock','reviewed_mock')),
 opened_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 version integer not null default 0 check(version>=0),
 acknowledged_at timestamptz,
 reviewed_at timestamptz
);
create index f23_mock_incidents_queue
 on public.f23_mock_incidents(status,opened_at,case_key);

create table public.f23_mock_incident_events(
 seq bigint generated always as identity primary key,
 case_key uuid not null references public.f23_mock_incidents(case_key)
  on delete restrict,
 event_key uuid not null unique,
 action text not null check(action in
  ('flag_unanswered','acknowledge','start_review','resolve_review_mock')),
 actor_id uuid not null,
 before_status text not null,
 after_status text not null,
 reason_code text,
 occurred_at timestamptz not null default clock_timestamp()
);
create index f23_mock_incident_events_case on
 public.f23_mock_incident_events(case_key,seq);

-- Defesa em profundidade: nenhuma tabela pode ser escrita/consultada pelo
-- navegador, nem com a RLS habilitada. Somente RPC verificada e gate offline.
alter table public.f23_mock_incidents enable row level security;
alter table public.f23_mock_incident_events enable row level security;
alter table private.f23_mock_support_gate enable row level security;
alter table private.f23_mock_admins enable row level security;
revoke all on public.f23_mock_incidents,public.f23_mock_incident_events
 from public,anon,authenticated;
revoke all on private.f23_mock_support_gate,private.f23_mock_admins
 from public,anon,authenticated;
revoke all on sequence public.f23_mock_incident_events_seq_seq from public,anon,authenticated;

create or replace function private.f23_mock_require_admin()
returns void language plpgsql security definer set search_path = ''
as $f$
begin
 if not exists(select 1 from private.f23_mock_support_gate where singleton and enabled)
 then raise exception 'F23 incidentes desativados'; end if;
 if auth.uid() is null or not exists(
  select 1 from private.f23_mock_admins a where a.user_id=auth.uid())
 then raise exception 'F23 acesso administrativo negado'; end if;
end $f$;
revoke all on function private.f23_mock_require_admin() from public,anon,authenticated;

-- Apenas inserção de fixtures por administrador autenticado autorizado;
-- futuramente ingestão de usuários precisará de outra RPC com ownership/RLS.
create or replace function public.f23_mock_open_case(
 p_case_key uuid,p_category text,p_request_key uuid default null
) returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare v public.f23_mock_incidents%rowtype;
begin
 perform private.f23_mock_require_admin();
 if p_case_key is null or p_category is null
   or p_category not in
     ('general_question','service_issue','payment_dispute','safety_report')
 then raise exception 'Caso de teste inválido'; end if;
 insert into public.f23_mock_incidents(case_key,category,request_key)
 values(p_case_key,p_category,p_request_key)
 on conflict(case_key) do nothing;
 select * into strict v from public.f23_mock_incidents where case_key=p_case_key
 for update;
 if v.category is distinct from p_category or
    v.request_key is distinct from p_request_key
 then raise exception 'Idempotência: chave de caso reutilizada com dados diferentes'; end if;
 return jsonb_build_object('mockOnly',true,'caseKey',v.case_key,
   'category',v.category,'status',v.status,'version',v.version,
   'realTicketCreated',false,'productionAuthorized',false);
end $f$;

-- Serialização por lock de caso + event_key global exclusivo impede replay
-- concorrente; origem e ator vêm de auth.uid() validada no servidor.
create or replace function public.f23_mock_apply_event(
 p_case_key uuid,p_event_key uuid,p_action text,p_reason_code text default null
) returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare v public.f23_mock_incidents%rowtype;
 v_old public.f23_mock_incident_events%rowtype;
 v_next text;
 v_reason text;
 v_now timestamptz:=clock_timestamp();
begin
 perform private.f23_mock_require_admin();
 if p_case_key is null or p_event_key is null
   or p_action is null or p_action not in
     ('flag_unanswered','acknowledge','start_review','resolve_review_mock')
 then raise exception 'Evento de teste inválido'; end if;
 select * into strict v from public.f23_mock_incidents
 where case_key=p_case_key for update;
 select * into v_old from public.f23_mock_incident_events
 where event_key=p_event_key;
 if found then
   if v_old.case_key is distinct from p_case_key or
      v_old.actor_id is distinct from auth.uid() or
      v_old.action is distinct from p_action or
      v_old.reason_code is distinct from p_reason_code
   then raise exception 'Idempotência: event_key reutilizada com outro conteúdo'; end if;
   return jsonb_build_object('mockOnly',true,'duplicate',true,
     'status',v.status,'version',v.version,
     'paymentAuthorized',false,'productionAuthorized',false);
 end if;

 if p_action='flag_unanswered' then
   if v.category<>'safety_report' or v.status<>'queued_mock'
      or v_now<v.opened_at+interval '5 minutes'
      or p_reason_code is not null
   then raise exception 'Escalonamento fictício inválido'; end if;
   v_next:='escalated_uncovered_mock';
 elsif p_action='acknowledge' then
   if v.status not in ('queued_mock','escalated_uncovered_mock')
      or p_reason_code is not null
   then raise exception 'Reconhecimento fictício inválido'; end if;
   v_next:='acknowledged_mock';
 elsif p_action='start_review' then
   if v.status<>'acknowledged_mock' or p_reason_code is not null
   then raise exception 'Início de revisão fictícia inválido'; end if;
   v_next:='under_review_mock';
 else
   v_reason:=case v.category
      when 'general_question' then 'guidance_reviewed_mock'
      when 'service_issue' then 'service_reviewed_mock'
      when 'payment_dispute' then 'financial_reviewed_mock'
      when 'safety_report' then 'safety_reviewed_mock' end;
   if v.status<>'under_review_mock' or
       p_reason_code is distinct from v_reason
   then raise exception 'Fechamento fictício inválido'; end if;
   v_next:='reviewed_mock';
 end if;

 update public.f23_mock_incidents set status=v_next,version=version+1,
   updated_at=v_now,
   acknowledged_at=case when p_action='acknowledge' then v_now else acknowledged_at end,
   reviewed_at=case when p_action='resolve_review_mock' then v_now else reviewed_at end
 where case_key=p_case_key;
 insert into public.f23_mock_incident_events(case_key,event_key,action,actor_id,
   before_status,after_status,reason_code,occurred_at)
 values(p_case_key,p_event_key,p_action,auth.uid(),v.status,v_next,
   p_reason_code,v_now);
 return jsonb_build_object('mockOnly',true,'duplicate',false,
   'status',v_next,'version',v.version+1,'paymentAuthorized',false,
   'realTicketCreated',false,'productionAuthorized',false);
end $f$;

create or replace function public.f23_mock_admin_queue()
returns table(case_key uuid,category text,priority integer,
 status text,version integer,opened_at timestamptz)
language plpgsql security definer set search_path = ''
as $f$
begin
 perform private.f23_mock_require_admin();
 return query select i.case_key,i.category,
   case i.category when 'safety_report' then 0
     when 'payment_dispute' then 1 else 2 end as priority,
   i.status,i.version,i.opened_at
 from public.f23_mock_incidents i
 order by case when i.status='reviewed_mock' then 1 else 0 end,
  case i.category when 'safety_report' then 0
    when 'payment_dispute' then 1 else 2 end,
  i.opened_at,i.case_key;
end $f$;

-- Proprietário SQL tem bypass da RLS para RPCs SECURITY DEFINER.
-- Authenticated recebe EXECUTE somente, nunca acesso direto às tabelas.
revoke all on function public.f23_mock_open_case(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.f23_mock_apply_event(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.f23_mock_admin_queue() from public,anon,authenticated;
grant execute on function public.f23_mock_open_case(uuid,text,uuid),
 public.f23_mock_apply_event(uuid,uuid,text,text),
 public.f23_mock_admin_queue() to authenticated;

-- Reforço: a origem principal do app nunca importa este draft automaticamente.
-- Não há conexão com public.service_requests, pagamentos, push ou F1-F7.
