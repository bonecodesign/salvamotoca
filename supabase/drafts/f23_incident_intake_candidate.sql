-- Salva Motoca! SM-PLAN-004 — ingresso de ocorrências F2/F3 por cliente/prestador.
-- APENAS candidato para PostgreSQL 17 descartável na CI. Nunca executar no
-- Supabase hospedado. Sem textos livres, fotos, SMS, dados pessoais ou PSP.
-- Dependência: supabase/drafts/f23_incidents_persistence_candidate.sql
-- Dependência da fixture: public.service_requests, public.providers, auth.uid().

alter table public.f23_mock_incidents
 add column reporter_id uuid,
 add column reporter_role text
  check(reporter_role in ('customer','provider')),
 add constraint f23_mock_reporter_consistency check (
  (reporter_id is null and reporter_role is null) or
  (reporter_id is not null and reporter_role is not null)
 );

-- Um incidente ativo por usuário/solicitação/categoria. Clientes podem
-- reabrir outro registro após revisão; incidentes de outros tipos não são
-- bloqueados. A constraint reduz duplicação também sob concorrência.
create unique index f23_mock_incident_active_reporter
 on public.f23_mock_incidents(request_key,reporter_id,category)
 where reporter_id is not null and status <> 'reviewed_mock';

-- Somente a pessoa autenticada ligada ao pedido pode registrar um relato.
-- Não confia em actor_id, role, status, horário, endereço ou anexos do browser.
create or replace function public.f23_mock_submit_incident(
 p_case_key uuid,p_request_key uuid,p_category text
) returns jsonb
language plpgsql security definer set search_path = ''
as $f$
declare
 v_caller uuid;
 v_customer uuid;
 v_provider uuid;
 v_reporter_role text;
 v_existing public.f23_mock_incidents%rowtype;
begin
 if not exists(select 1 from private.f23_mock_support_gate
  where singleton and enabled)
 then raise exception 'F23 incidentes desativados'; end if;
 v_caller:=auth.uid();
 if v_caller is null
 then raise exception 'F23 autenticação necessária'; end if;
 if p_case_key is null or p_request_key is null or
  p_category is null or p_category not in
  ('general_question','service_issue','payment_dispute','safety_report')
 then raise exception 'Relato de teste inválido'; end if;

 -- Captura vínculo atual de pedido, não um campo de cliente.
 select r.customer_id,r.provider_id
  into v_customer,v_provider
 from public.service_requests r where r.id=p_request_key
 for key share;
 if not found
 then raise exception 'Solicitação não autorizada'; end if;

 if v_customer=v_caller then
   v_reporter_role:='customer';
 elsif exists(select 1 from public.providers p
    where p.id=v_provider and p.owner_id=v_caller) then
   v_reporter_role:='provider';
 else
   raise exception 'Solicitação não autorizada';
 end if;

 insert into public.f23_mock_incidents(
  case_key,category,request_key,reporter_id,reporter_role)
 values(p_case_key,p_category,p_request_key,v_caller,v_reporter_role)
 on conflict(case_key) do nothing;

 select * into strict v_existing
 from public.f23_mock_incidents where case_key=p_case_key for update;
 if v_existing.category is distinct from p_category
   or v_existing.request_key is distinct from p_request_key
   or v_existing.reporter_id is distinct from v_caller
   or v_existing.reporter_role is distinct from v_reporter_role
 then raise exception 'Idempotência: caso reutilizado com outro vínculo/autor'; end if;

 return jsonb_build_object('mockOnly',true,
  'caseKey',v_existing.case_key,
  'status',v_existing.status,
  'version',v_existing.version,
  'realTicketCreated',false,
  'humanNotified',false,
  'financialAuthorization',false,
  'productionAuthorized',false);
end $f$;

-- Consulta de status pelo autor de teste sem vazar outros casos, pedido,
-- endereço, proprietário do prestador ou autor. Não cria chat nem ACK humano.
create or replace function public.f23_mock_reporter_status(p_case_key uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare
 v_case public.f23_mock_incidents%rowtype;
begin
 if not exists(select 1 from private.f23_mock_support_gate
  where singleton and enabled)
 then raise exception 'F23 incidentes desativados'; end if;
 if auth.uid() is null or p_case_key is null
 then raise exception 'F23 autenticação necessária'; end if;
 select * into v_case from public.f23_mock_incidents
  where case_key=p_case_key and reporter_id=auth.uid();
 if not found then raise exception 'Caso não encontrado'; end if;

 return jsonb_build_object(
  'mockOnly',true,'caseKey',v_case.case_key,
  'status',v_case.status,'version',v_case.version,
  'realTicketCreated',false,
  'humanAcknowledged',false,
  'payoutAllowed',false,'productionAuthorized',false);
end $f$;

-- As RPCs não criam f23_mock_incident_events: o ingresso é registro puro.
-- Reconhecimento e mediação continuam exclusivos da RPC administrativa.
revoke all on function public.f23_mock_submit_incident(uuid,uuid,text)
 from public,anon,authenticated;
revoke all on function public.f23_mock_reporter_status(uuid)
 from public,anon,authenticated;
grant execute on function public.f23_mock_submit_incident(uuid,uuid,text),
 public.f23_mock_reporter_status(uuid) to authenticated;

-- Nunca abrir grant direto às tabelas (nem para o autor do incidente).
-- As flags do mock e os privilégios não são autorização para envio real.
