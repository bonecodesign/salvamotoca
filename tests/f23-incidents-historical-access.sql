-- SM-PLAN-005 — A -> B -> A: histórico é do período da atribuição.
-- Apenas em PG17 descartável, tudo sob rollback.
\set ON_ERROR_STOP on
begin;
insert into public.service_categories(id,code,paid_in_app)
 values(2,'borracharia_delivery',true);
insert into public.providers(id,owner_id,status,is_active,display_name) values
 ('55555555-5555-4555-8555-555555555555',
  '22222222-2222-4222-8222-222222222222','approved',true,'A mock'),
 ('66666666-6666-4666-8666-666666666666',
  '33333333-3333-4333-8333-333333333333','approved',true,'B mock');
insert into public.service_requests(id,customer_id,provider_id,category_id)
 values('77777777-7777-4777-8777-777777777777',
 '11111111-1111-4111-8111-111111111111',
 '55555555-5555-4555-8555-555555555555',2);
update private.f23_mock_support_gate set enabled=true where singleton;

set role authenticated;
select set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',false);
select public.f23_mock_submit_incident(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '77777777-7777-4777-8777-777777777777','service_issue');
do $a_access$
begin
 if public.f23_mock_reporter_status(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'status'<>'queued_mock'
 then raise exception 'Prestador A perdeu acesso antes da troca'; end if;
end $a_access$;
reset role;

-- Troca A -> B: não excluir a ocorrência, apenas revogar acesso do A.
update public.service_requests set
 provider_id='66666666-6666-4666-8666-666666666666'
 where id='77777777-7777-4777-8777-777777777777';
do $gen2$
begin
 if (select f23_mock_assignment_generation from public.service_requests
 where id='77777777-7777-4777-8777-777777777777')<>2
 then raise exception 'Versão não avançou em A -> B'; end if;
end $gen2$;

set role authenticated;
select set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',false);
do $a_revoked$
begin
 begin
  perform public.f23_mock_reporter_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  raise exception using message='A ainda vê caso após mudança',errcode='ZX401';
 exception when others then
  if sqlstate='ZX401' then raise; end if;
  if sqlerrm not like '%Caso não encontrado%' then raise; end if;
 end;
 begin
  perform public.f23_mock_submit_incident(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   '77777777-7777-4777-8777-777777777777','safety_report');
  raise exception using message='A ainda cria caso após mudança',errcode='ZX402';
 exception when others then
  if sqlstate='ZX402' then raise; end if;
  if sqlerrm not like '%Solicitação não autorizada%' then raise; end if;
 end;
end $a_revoked$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub',
 '33333333-3333-4333-8333-333333333333',false);
do $b_cannot_inherit$
begin
 begin
  perform public.f23_mock_reporter_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  raise exception using message='B herdou caso do A',errcode='ZX403';
 exception when others then
  if sqlstate='ZX403' then raise; end if;
  if sqlerrm not like '%Caso não encontrado%' then raise; end if;
 end;
end $b_cannot_inherit$;
select public.f23_mock_submit_incident(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '77777777-7777-4777-8777-777777777777','service_issue');
reset role;

-- Troca B -> A: A não readquire o incidente da sua atribuição antiga.
update public.service_requests set
 provider_id='55555555-5555-4555-8555-555555555555'
 where id='77777777-7777-4777-8777-777777777777';
do $gen3$
begin
 if (select f23_mock_assignment_generation from public.service_requests
 where id='77777777-7777-4777-8777-777777777777')<>3
 then raise exception 'Versão não avançou em B -> A'; end if;
end $gen3$;

set role authenticated;
select set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',false);
do $a_old_stays_revoked$
begin
 begin
  perform public.f23_mock_reporter_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  raise exception using message='A reabriu antigo relato em A-B-A',errcode='ZX404';
 exception when others then
  if sqlstate='ZX404' then raise; end if;
  if sqlerrm not like '%Caso não encontrado%' then raise; end if;
 end;
end $a_old_stays_revoked$;
-- Mesmo tema pode ser registrado em nova atribuição sem violar UNIQUE.
select public.f23_mock_submit_incident(
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 '77777777-7777-4777-8777-777777777777','service_issue');
do $a_new$
begin
 if public.f23_mock_reporter_status(
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')->>'status'<>'queued_mock'
 then raise exception 'Novo relato A3 não está disponível'; end if;
end $a_new$;
reset role;

-- Cliente permanece participante em todas as atribuições e nunca herda
-- as ocorrências do profissional.
set role authenticated;
select set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',false);
select public.f23_mock_submit_incident(
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 '77777777-7777-4777-8777-777777777777','safety_report');
do $client$
begin
 if public.f23_mock_reporter_status(
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')->>'status'<>'queued_mock'
 then raise exception 'Cliente não viu próprio relato'; end if;
 begin
  perform public.f23_mock_reporter_status('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  raise exception using message='Cliente herdou caso de prestador',errcode='ZX405';
 exception when others then
  if sqlstate='ZX405' then raise; end if;
  if sqlerrm not like '%Caso não encontrado%' then raise; end if;
 end;
end $client$;
reset role;

do $history$
begin
 if (select count(*) from public.f23_mock_incidents)<>4
 then raise exception 'Histórico foi perdido ou duplicado'; end if;
 if (select assignment_generation_at_report
  from public.f23_mock_incidents
  where case_key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>1
 or (select assignment_generation_at_report from public.f23_mock_incidents
  where case_key='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>2
 or (select assignment_generation_at_report from public.f23_mock_incidents
  where case_key='dddddddd-dddd-4ddd-8ddd-dddddddddddd')<>3
 then raise exception 'Épocas não foram preservadas no histórico'; end if;
 if (select count(*) from public.f23_mock_incident_events)<>0
 then raise exception 'Relato inicial provocou evento administrativo'; end if;
end $history$;

rollback;
do $clean$
begin
 if exists(select 1 from public.f23_mock_incidents)
 or exists(select 1 from public.service_requests)
 or (select enabled from private.f23_mock_support_gate where singleton)
 then raise exception 'Histórico não foi revertido'; end if;
end $clean$;
