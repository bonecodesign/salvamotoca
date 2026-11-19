-- SM-PLAN-003: CI PostgreSQL17 descartável; primeiro processo de testes.
-- Os dados sintéticos são mantidos SOMENTE até um segundo processo de recuperação.
\set ON_ERROR_STOP on
do $guard$
begin
 if (select enabled from private.f23_mock_support_gate where singleton)
 then raise exception 'Gate de incidentes deveria iniciar fechado'; end if;
 if not (select relrowsecurity from pg_class
   where oid='public.f23_mock_incidents'::regclass)
    or not (select relrowsecurity from pg_class
   where oid='public.f23_mock_incident_events'::regclass)
 then raise exception 'RLS de ocorrências desativada'; end if;
 if has_table_privilege('authenticated','public.f23_mock_incidents','SELECT')
   or has_table_privilege('authenticated','public.f23_mock_incidents','INSERT')
   or has_table_privilege('authenticated','public.f23_mock_incident_events','SELECT')
   or has_table_privilege('authenticated','private.f23_mock_admins','SELECT')
   or has_function_privilege('anon','public.f23_mock_open_case(uuid,text,uuid)','EXECUTE')
   or has_function_privilege('anon','public.f23_mock_apply_event(uuid,uuid,text,text)','EXECUTE')
   or has_function_privilege('anon','public.f23_mock_admin_queue()','EXECUTE')
 then raise exception 'F23: grants excessivos'; end if;
end $guard$;

-- Testa flag de gate mesmo com administrador designado por fixture.
insert into private.f23_mock_admins(user_id) values
 ('11111111-1111-4111-8111-111111111111');

set role authenticated;
select set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',false);
do $gate$
begin
 begin
  perform public.f23_mock_open_case(
   '11111111-aaaa-4111-8111-111111111111','safety_report',null);
  raise exception using message='Falha: gate aceitou incidente',errcode='ZX201';
 exception when others then
  if sqlstate='ZX201' then raise; end if;
  if sqlerrm not like '%F23 incidentes desativados%' then raise; end if;
 end;
end $gate$;
reset role;
update private.f23_mock_support_gate set enabled=true where singleton;
-- Autenticado que não é fundador nunca acessa a central.
set role authenticated;
select set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',false);
do $stranger$
begin
 begin
  perform public.f23_mock_admin_queue();
  raise exception using message='Falha: terceiro acessou fila',errcode='ZX202';
 exception when others then
  if sqlstate='ZX202' then raise; end if;
  if sqlerrm not like '%acesso administrativo negado%' then raise; end if;
 end;
 begin
  perform public.f23_mock_open_case(
   '11111111-aaaa-4111-8111-111111111111','safety_report',null);
  raise exception using message='Falha: terceiro criou caso',errcode='ZX203';
 exception when others then
  if sqlstate='ZX203' then raise; end if;
  if sqlerrm not like '%acesso administrativo negado%' then raise; end if;
 end;
end $stranger$;
-- Testa também ausência completa de JWT.
select set_config('request.jwt.claim.sub','',false);
do $null_jwt$
begin
 begin
  perform public.f23_mock_admin_queue();
  raise exception using message='Falha: sem JWT acessou fila',errcode='ZX204';
 exception when others then
  if sqlstate='ZX204' then raise; end if;
  if sqlerrm not like '%acesso administrativo negado%' then raise; end if;
 end;
end $null_jwt$;
reset role;

-- Fundador sintético. Não há usuário real, mensagem ou detalhe pessoal.
set role authenticated;
select set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',false);
select public.f23_mock_open_case(
 '11111111-aaaa-4111-8111-111111111111','safety_report',
 '99999999-9999-4999-8999-999999999999');
select public.f23_mock_open_case(
 '22222222-aaaa-4222-8222-222222222222','payment_dispute',null);
select public.f23_mock_open_case(
 '33333333-aaaa-4333-8333-333333333333','general_question',null);
-- Abre duas vezes com mesmo caso: idempotente.
select public.f23_mock_open_case(
 '11111111-aaaa-4111-8111-111111111111','safety_report',
 '99999999-9999-4999-8999-999999999999');
do $collision$
begin
 begin
  perform public.f23_mock_open_case(
   '11111111-aaaa-4111-8111-111111111111','payment_dispute',null);
  raise exception using message='Falha: case_key reutilizado',errcode='ZX205';
 exception when others then
  if sqlstate='ZX205' then raise; end if;
  if sqlerrm not like '%Idempotência: chave de caso%' then raise; end if;
 end;
end $collision$;
reset role;

-- Modificação temporal APENAS por dono/superusuário da fixture efêmera.
update public.f23_mock_incidents set opened_at=clock_timestamp()-interval '6 minutes'
 where case_key='11111111-aaaa-4111-8111-111111111111';

set role authenticated;
select set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',false);
select public.f23_mock_apply_event(
 '11111111-aaaa-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','flag_unanswered',null);
select public.f23_mock_apply_event(
 '11111111-aaaa-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','flag_unanswered',null);
do $event_collision$
begin
 begin
  perform public.f23_mock_apply_event(
   '11111111-aaaa-4111-8111-111111111111',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','acknowledge',null);
  raise exception using message='Falha: event_key reutilizado',errcode='ZX206';
 exception when others then
  if sqlstate='ZX206' then raise; end if;
  if sqlerrm not like '%Idempotência: event_key%' then raise; end if;
 end;
 begin
  perform public.f23_mock_apply_event(
   '22222222-aaaa-4222-8222-222222222222',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','acknowledge',null);
  raise exception using message='Falha: id global duplicado',errcode='ZX207';
 exception when others then
  if sqlstate='ZX207' then raise; end if;
  if sqlerrm not like '%Idempotência: event_key%' then raise; end if;
 end;
end $event_collision$;
select public.f23_mock_apply_event(
 '11111111-aaaa-4111-8111-111111111111',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','acknowledge',null);
select public.f23_mock_apply_event(
 '11111111-aaaa-4111-8111-111111111111',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','start_review',null);
do $bad_review$
begin
 begin
  perform public.f23_mock_apply_event(
   '11111111-aaaa-4111-8111-111111111111',
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd','resolve_review_mock',
   'financial_reviewed_mock');
  raise exception using message='Falha: motivo errado',errcode='ZX208';
 exception when others then
  if sqlstate='ZX208' then raise; end if;
  if sqlerrm not like '%Fechamento fictício inválido%' then raise; end if;
 end;
end $bad_review$;

-- Disputa financeira: recebida mas NÃO encerrada nem autorizada para repasse.
select public.f23_mock_apply_event(
 '22222222-aaaa-4222-8222-222222222222',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','acknowledge',null);
do $no_auto_review$
begin
 begin
  perform public.f23_mock_apply_event(
   '22222222-aaaa-4222-8222-222222222222',
   'ffffffff-ffff-4fff-8fff-ffffffffffff','resolve_review_mock',
   'financial_reviewed_mock');
  raise exception using message='Falha: disputa liberada sem revisão',errcode='ZX209';
 exception when others then
  if sqlstate='ZX209' then raise; end if;
  if sqlerrm not like '%Fechamento fictício inválido%' then raise; end if;
 end;
end $no_auto_review$;

do $assert$
begin
 if (select count(*) from public.f23_mock_admin_queue())<>3
 then raise exception 'A fila administrativa perdeu casos'; end if;
 if (select count(*) from public.f23_mock_incidents)<>3
 then raise exception 'Casos persistidos divergem'; end if;
 if (select count(*) from public.f23_mock_incident_events)<>4
 then raise exception 'A trilha duplicou eventos'; end if;
 if (select version from public.f23_mock_incidents
     where case_key='11111111-aaaa-4111-8111-111111111111')<>3
 then raise exception 'Versão deveria ser 3'; end if;
 if (select actor_id from public.f23_mock_incident_events
     where event_key='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>
     '11111111-1111-4111-8111-111111111111'::uuid
 then raise exception 'Ator de auditoria divergente'; end if;
end $assert$;
reset role;
-- Este processo termina e COMMITA os casos sintéticos no banco EFÊMERO.
-- O segundo processo provará recuperação e apagará tudo.
