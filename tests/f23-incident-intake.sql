-- SM-PLAN-004 — autenticação e vínculo de relato ao pedido F2/F3.
-- Executar APENAS no Postgres 17 descartável após SM-PLAN-003.
-- Transação inteira revertida; não deixa usuário, serviço ou incidente fictício.
\set ON_ERROR_STOP on
begin;

do $grants$
begin
 if (select enabled from private.f23_mock_support_gate where singleton)
 then raise exception 'F23: gate deveria continuar fechado após recuperação'; end if;
 if has_table_privilege('authenticated','public.f23_mock_incidents','INSERT')
  or has_table_privilege('authenticated','public.f23_mock_incidents','SELECT')
  or has_table_privilege('anon','public.f23_mock_incidents','SELECT')
  or has_table_privilege('authenticated','public.f23_mock_incident_events','SELECT')
  or has_function_privilege('anon','public.f23_mock_submit_incident(uuid,uuid,text)','EXECUTE')
  or has_function_privilege('anon','public.f23_mock_reporter_status(uuid)','EXECUTE')
 then raise exception 'F23: exposição do ingresso a browser ou anon'; end if;
 if not (select relrowsecurity from pg_class
  where oid='public.f23_mock_incidents'::regclass)
 then raise exception 'F23: RLS ausente'; end if;
end $grants$;

-- Criar solicitações sintéticas para cliente, prestador atribuído e terceiro.
insert into public.service_categories(id,code,paid_in_app)
 values(2,'borracharia_delivery',true);
insert into public.providers(id,owner_id,display_name,status,is_active)
 values
 ('55555555-5555-4555-8555-555555555555',
  '22222222-2222-4222-8222-222222222222','Fictício A','approved',true),
 ('66666666-6666-4666-8666-666666666666',
  '44444444-4444-4444-8444-444444444444','Fictício B','approved',true);
insert into public.service_requests(id,customer_id,provider_id,category_id)
 values
 ('77777777-7777-4777-8777-777777777777',
  '11111111-1111-4111-8111-111111111111',
  '55555555-5555-4555-8555-555555555555',2),
 ('88888888-8888-4888-8888-888888888888',
  '44444444-4444-4444-8444-444444444444',null,2);

-- Gate desligado bloqueia mesmo o verdadeiro participante simulado.
set role authenticated;
select set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',false);
do $off$
begin
 begin
  perform public.f23_mock_submit_incident(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '77777777-7777-4777-8777-777777777777','safety_report');
  raise exception using message='Falha: ingressou com gate desligado',errcode='ZX301';
 exception when others then
  if sqlstate='ZX301' then raise; end if;
  if sqlerrm not like '%F23 incidentes desativados%' then raise; end if;
 end;
end $off$;
reset role;
update private.f23_mock_support_gate set enabled=true where singleton;

-- Anon não executa as RPCs, nem com UUID conhecido.
set role anon;
do $anon$
begin
 begin
  perform public.f23_mock_submit_incident(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '77777777-7777-4777-8777-777777777777','safety_report');
  raise exception using message='Falha: anon abriu ocorrência',errcode='ZX302';
 exception when others then
  if sqlstate='ZX302' then raise; end if;
  if sqlstate<>'42501' then raise; end if;
 end;
end $anon$;
reset role;

-- Terceiro sem relação ao pedido não pode criar ou consultar ocorrência.
set role authenticated;
select set_config('request.jwt.claim.sub',
 '33333333-3333-4333-8333-333333333333',false);
do $outsider$
begin
 begin
  perform public.f23_mock_submit_incident(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '77777777-7777-4777-8777-777777777777','safety_report');
  raise exception using message='Falha: terceiro criou incidente',errcode='ZX303';
 exception when others then
  if sqlstate='ZX303' then raise; end if;
  if sqlerrm not like '%Solicitação não autorizada%' then raise; end if;
 end;
 begin
  perform public.f23_mock_reporter_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  raise exception using message='Falha: terceiro viu incidente',errcode='ZX304';
 exception when others then
  if sqlstate='ZX304' then raise; end if;
  if sqlerrm not like '%Caso não encontrado%' then raise; end if;
 end;
end $outsider$;
reset role;

-- O cliente real do pedido (fixture JWT) pode sinalizar segurança e pagamento.
set role authenticated;
select set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',false);
select public.f23_mock_submit_incident(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '77777777-7777-4777-8777-777777777777','safety_report');
select public.f23_mock_submit_incident(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '77777777-7777-4777-8777-777777777777','safety_report');
select public.f23_mock_submit_incident(
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '77777777-7777-4777-8777-777777777777','payment_dispute');

do $customer$
declare v jsonb;
begin
 v:=public.f23_mock_reporter_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 if v->>'status'<>'queued_mock' or v->>'productionAuthorized'<>'false'
  or v->>'realTicketCreated'<>'false'
 then raise exception 'A consulta de status de cliente não ficou offline'; end if;
 if v ? 'request_key' or v ? 'reporter_id' or v ? 'location'
 then raise exception 'Cliente recebeu informação privada extra'; end if;
 begin
  perform public.f23_mock_submit_incident(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   '77777777-7777-4777-8777-777777777777','safety_report');
  raise exception using message='Falha: duplicação ativa de segurança',errcode='ZX305';
 exception when others then
  if sqlstate='ZX305' then raise; end if;
  if sqlstate<>'23505' then raise; end if;
 end;
 begin
  perform public.f23_mock_submit_incident(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '77777777-7777-4777-8777-777777777777','payment_dispute');
  raise exception using message='Falha: case key reutilizado',errcode='ZX306';
 exception when others then
  if sqlstate='ZX306' then raise; end if;
  if sqlerrm not like '%Idempotência: caso reutilizado%' then raise; end if;
 end;
 begin
  perform public.f23_mock_submit_incident(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   '88888888-8888-4888-8888-888888888888','safety_report');
  raise exception using message='Falha: cliente leu outro pedido',errcode='ZX307';
 exception when others then
  if sqlstate='ZX307' then raise; end if;
  if sqlerrm not like '%Solicitação não autorizada%' then raise; end if;
 end;
end $customer$;

-- Mesmo participante não lê tabela diretamente.
do $direct_customer$
begin
 begin
  perform 1 from public.f23_mock_incidents;
  raise exception using message='Falha: SELECT direto liberado',errcode='ZX308';
 exception when others then
  if sqlstate='ZX308' then raise; end if;
  if sqlstate<>'42501' then raise; end if;
 end;
end $direct_customer$;
reset role;

-- Profissional atribuído ao pedido, cuja conta é dona do prestador,
-- pode abrir relato distinto, mas não consultar o relato do cliente.
set role authenticated;
select set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',false);
select public.f23_mock_submit_incident(
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 '77777777-7777-4777-8777-777777777777','service_issue');
do $provider$
begin
 if (public.f23_mock_reporter_status(
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')->>'status')<>'queued_mock'
 then raise exception 'Prestador atribuído não conseguiu consultar próprio caso'; end if;
 begin
  perform public.f23_mock_reporter_status(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  raise exception using message='Falha: prestador leu caso do cliente',errcode='ZX309';
 exception when others then
  if sqlstate='ZX309' then raise; end if;
  if sqlerrm not like '%Caso não encontrado%' then raise; end if;
 end;
 begin
  perform public.f23_mock_submit_incident(
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   '77777777-7777-4777-8777-777777777777','service_issue');
 exception when others then
  raise exception 'Prestador perdeu idempotência de caso'; end;
end $provider$;
reset role;

-- Prestador NÃO atribuído, mesmo aprovado, não pode registrar no pedido alheio.
set role authenticated;
select set_config('request.jwt.claim.sub',
 '44444444-4444-4444-8444-444444444444',false);
do $unassigned$
begin
 begin
  perform public.f23_mock_submit_incident(
   'ffffffff-ffff-4fff-8fff-ffffffffffff',
   '77777777-7777-4777-8777-777777777777','service_issue');
  raise exception using message='Falha: prestador não atribuído abriu caso',errcode='ZX310';
 exception when others then
  if sqlstate='ZX310' then raise; end if;
  if sqlerrm not like '%Solicitação não autorizada%' then raise; end if;
 end;
end $unassigned$;

-- Sem JWT, mesmo role authenticated não produz relato.
select set_config('request.jwt.claim.sub','',false);
do $without_claim$
begin
 begin
  perform public.f23_mock_submit_incident(
   'ffffffff-ffff-4fff-8fff-ffffffffffff',
   '77777777-7777-4777-8777-777777777777','service_issue');
  raise exception using message='Falha: claim ausente',errcode='ZX311';
 exception when others then
  if sqlstate='ZX311' then raise; end if;
  if sqlerrm not like '%autenticação necessária%' then raise; end if;
 end;
end $without_claim$;
reset role;

-- Auditoria interna de fixtures: autor e papel derivados pelo servidor SQL.
do $rows$
begin
 if (select count(*) from public.f23_mock_incidents)<>3
 then raise exception 'Ingressos esperados 3, sem duplicação'; end if;
 if (select reporter_role from public.f23_mock_incidents
   where case_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>'customer'
 or (select reporter_id from public.f23_mock_incidents
   where case_key='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')<>
  '22222222-2222-4222-8222-222222222222'::uuid
 then raise exception 'Origem de cliente ou prestador não foi determinada no servidor'; end if;
 if exists(select 1 from public.f23_mock_incident_events)
 then raise exception 'Ingresso de relato não autoriza evento humano/financeiro'; end if;
 if (select count(*) from public.f23_mock_incidents where status='queued_mock')<>3
 then raise exception 'Ingresso fez transição automática'; end if;
end $rows$;

rollback;

do $clean$
begin
 if exists(select 1 from public.f23_mock_incidents)
 or exists(select 1 from public.f23_mock_incident_events)
 or exists(select 1 from public.service_requests)
 or exists(select 1 from public.providers)
 or (select enabled from private.f23_mock_support_gate where singleton)
 then raise exception 'Rollback de intake deixou dados fictícios/gate ativos'; end if;
end $clean$;
