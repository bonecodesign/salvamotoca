-- Salva Motoca! SM-PLAN-005 — histórico seguro e concorrência de incidentes.
-- DEPENDE de f23_incident_intake_candidate.sql; PG17 EFÊMERO NA CI SOMENTE.
-- NÃO É migration autorizada para Supabase hospedado. Sem dados reais.

-- Uma versão de atribuição aumenta a cada troca de prestador, inclusive
-- A -> B -> A. Protege contra reaproveitar permissão de uma relação encerrada.
-- Somente no PG17 descartável: trigger não aprovado para banco real.
alter table public.service_requests
 add column f23_mock_assignment_generation bigint not null default 1
 check(f23_mock_assignment_generation >= 1);

create or replace function private.f23_mock_bump_assignment_generation()
returns trigger language plpgsql security definer set search_path = ''
as $f$
begin
 if new.provider_id is distinct from old.provider_id then
   new.f23_mock_assignment_generation:=old.f23_mock_assignment_generation+1;
 else
   new.f23_mock_assignment_generation:=old.f23_mock_assignment_generation;
 end if;
 return new;
end $f$;
revoke all on function private.f23_mock_bump_assignment_generation()
 from public,anon,authenticated;
create trigger f23_mock_assignment_generation_trg
 before update on public.service_requests for each row
 execute function private.f23_mock_bump_assignment_generation();

-- Um novo prestador jamais herda acesso a ocorrência de relação anterior.
alter table public.f23_mock_incidents
 add column provider_at_report uuid,
 add column assignment_generation_at_report bigint;

-- Serialize a checagem de vínculo de cliente/prestador com eventual troca
-- de prestador. FOR UPDATE impede TOCTOU enquanto a submissão está aberta.
-- FOR SHARE no prestador impede mudança concorrente de owner_id.
create or replace function public.f23_mock_submit_incident(
 p_case_key uuid,p_request_key uuid,p_category text
) returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare
 v_caller uuid;
 v_customer uuid;
 v_provider uuid;
 v_assignment_generation bigint;
 v_reporter_role text;
 v_owner uuid;
 v_existing public.f23_mock_incidents%rowtype;
begin
 if not exists(select 1 from private.f23_mock_support_gate
   where singleton and enabled)
 then raise exception 'F23 incidentes desativados'; end if;
 v_caller:=auth.uid();
 if v_caller is null then raise exception 'F23 autenticação necessária'; end if;
 if p_case_key is null or p_request_key is null or
   p_category is null or p_category not in
   ('general_question','service_issue','payment_dispute','safety_report')
 then raise exception 'Relato de teste inválido'; end if;

 select r.customer_id,r.provider_id,r.f23_mock_assignment_generation
   into v_customer,v_provider,v_assignment_generation
 from public.service_requests r where r.id=p_request_key
 for update;
 if not found then raise exception 'Solicitação não autorizada'; end if;

 if v_customer=v_caller then
   v_reporter_role:='customer';
 elsif v_provider is not null then
   select p.owner_id into v_owner
   from public.providers p where p.id=v_provider for share;
   if v_owner is distinct from v_caller then
     raise exception 'Solicitação não autorizada'; end if;
   v_reporter_role:='provider';
 else
   raise exception 'Solicitação não autorizada';
 end if;

 insert into public.f23_mock_incidents(
   case_key,category,request_key,reporter_id,reporter_role,
   provider_at_report,assignment_generation_at_report)
 values(p_case_key,p_category,p_request_key,v_caller,v_reporter_role,
   case when v_reporter_role='provider' then v_provider else null end,
   case when v_reporter_role='provider' then v_assignment_generation else null end)
 on conflict(case_key) do nothing;

 select * into strict v_existing from public.f23_mock_incidents
 where case_key=p_case_key for update;
 if v_existing.category is distinct from p_category or
   v_existing.request_key is distinct from p_request_key or
   v_existing.reporter_id is distinct from v_caller or
   v_existing.reporter_role is distinct from v_reporter_role or
   v_existing.provider_at_report is distinct from
       (case when v_reporter_role='provider' then v_provider else null end) or
   v_existing.assignment_generation_at_report is distinct from
       (case when v_reporter_role='provider' then v_assignment_generation else null end)
 then raise exception 'Idempotência: caso reutilizado com outro vínculo/autor'; end if;

 return jsonb_build_object('mockOnly',true,'caseKey',v_existing.case_key,
  'status',v_existing.status,'version',v_existing.version,
  'realTicketCreated',false,'humanNotified',false,
  'financialAuthorization',false,'productionAuthorized',false);
end $f$;

-- Um prestador que deixou de ser atribuído NÃO pode consultar sequer
-- o status do próprio relato após a troca. O caso permanece na fila do
-- administrador para mediar a controvérsia. Também não transfere a outro.
create or replace function public.f23_mock_reporter_status(p_case_key uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare v_case public.f23_mock_incidents%rowtype;
begin
 if not exists(select 1 from private.f23_mock_support_gate
   where singleton and enabled)
 then raise exception 'F23 incidentes desativados'; end if;
 if auth.uid() is null or p_case_key is null
 then raise exception 'F23 autenticação necessária'; end if;
 select c.* into v_case
 from public.f23_mock_incidents c
 join public.service_requests r on r.id=c.request_key
 left join public.providers p on p.id=r.provider_id
 where c.case_key=p_case_key and c.reporter_id=auth.uid()
   and (
    (c.reporter_role='customer' and r.customer_id=auth.uid())
    or
    (c.reporter_role='provider' and r.provider_id=c.provider_at_report
      and r.f23_mock_assignment_generation=c.assignment_generation_at_report
      and p.owner_id=auth.uid())
   );
 if not found then raise exception 'Caso não encontrado'; end if;

 return jsonb_build_object('mockOnly',true,
  'caseKey',v_case.case_key,'status',v_case.status,
  'version',v_case.version,'realTicketCreated',false,
  'humanAcknowledged',false,'payoutAllowed',false,
  'productionAuthorized',false);
end $f$;

-- Identidades vêm de auth.uid() na fixture SQL, jamais de input livre.
-- As RPCs existentes continuam EXECUTE somente por authenticated e
-- tabelas mantêm RLS / nenhum GRANT ao navegador. Sem integração F4/PSP.
revoke all on function public.f23_mock_submit_incident(uuid,uuid,text),
 public.f23_mock_reporter_status(uuid) from public,anon,authenticated;
grant execute on function public.f23_mock_submit_incident(uuid,uuid,text),
 public.f23_mock_reporter_status(uuid) to authenticated;
