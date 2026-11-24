-- SM-PLAN-003: SEGUNDO processo psql sobre o mesmo PostgreSQL17 descartável.
-- Prova sobrevivência ao fechamento de conexão, controle de acesso, rollback
-- e limpeza completa. Não executar contra Supabase hospedado.
\set ON_ERROR_STOP on
do $persist$
begin
 if (select count(*) from public.f23_mock_incidents)<>3
   or (select count(*) from public.f23_mock_incident_events)<>4
 then raise exception 'Persistência não sobreviveu à conexão anterior'; end if;
 if (select status from public.f23_mock_incidents
   where case_key='11111111-aaaa-4111-8111-111111111111')
     <>'under_review_mock'
 then raise exception 'Estado do caso foi perdido'; end if;
 if not (select enabled from private.f23_mock_support_gate where singleton)
 then raise exception 'Gate de teste não persistiu'; end if;
 if (select count(*) from public.f23_mock_incident_events
   where actor_id='11111111-1111-4111-8111-111111111111')<>4
 then raise exception 'Trilha não mantém identidade fictícia do ator'; end if;
end $persist$;

set role authenticated;
select set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',false);
do $owner$
declare v_first uuid;
begin
 select case_key into v_first from public.f23_mock_admin_queue() limit 1;
 if v_first<>'11111111-aaaa-4111-8111-111111111111'::uuid
 then raise exception 'Fila não retorna prioridade crítica primeiro'; end if;
end $owner$;
-- Mesmo o administrador NÃO lê/edita tabelas base pelo token do navegador.
do $direct$
begin
 begin
  perform 1 from public.f23_mock_incidents;
  raise exception using message='Falha: leitura direta liberada',errcode='ZX211';
 exception when others then
  if sqlstate='ZX211' then raise; end if;
  if sqlstate<>'42501' then raise; end if;
 end;
 begin
  update public.f23_mock_incidents
   set status='reviewed_mock'
   where case_key='11111111-aaaa-4111-8111-111111111111';
  raise exception using message='Falha: update direto liberado',errcode='ZX212';
 exception when others then
  if sqlstate='ZX212' then raise; end if;
  if sqlstate<>'42501' then raise; end if;
 end;
end $direct$;
reset role;

-- Rollback de uma "resolução" sintética não pode deixar evento órfão.
begin;
set role authenticated;
select set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',false);
select public.f23_mock_apply_event(
 '11111111-aaaa-4111-8111-111111111111',
 '12121212-1212-4212-8212-121212121212','resolve_review_mock',
 'safety_reviewed_mock');
reset role;
do $temp$
begin
 if (select count(*) from public.f23_mock_incident_events)<>5
 or (select status from public.f23_mock_incidents where
 case_key='11111111-aaaa-4111-8111-111111111111')<>'reviewed_mock'
 then raise exception 'Resolução de transação temporária não ocorreu'; end if;
end $temp$;
rollback;
do $rolled_back$
begin
 if (select count(*) from public.f23_mock_incident_events)<>4
 or (select status from public.f23_mock_incidents where
 case_key='11111111-aaaa-4111-8111-111111111111')<>'under_review_mock'
 then raise exception 'ROLLBACK perdeu integridade de evento/estado'; end if;
end $rolled_back$;

-- Testar revogação de admin: sem esse vínculo, nenhum token pode operar.
begin;
delete from private.f23_mock_admins where
 user_id='11111111-1111-4111-8111-111111111111';
set role authenticated;
select set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',false);
do $revoked$
begin
 begin
  perform public.f23_mock_admin_queue();
  raise exception using message='Falha: revogado lê fila',errcode='ZX213';
 exception when others then
  if sqlstate='ZX213' then raise; end if;
  if sqlerrm not like '%acesso administrativo negado%' then raise; end if;
 end;
end $revoked$;
reset role;
rollback;

-- Prova que autoria/segurança se recuperaram após rollback da revogação.
set role authenticated;
select set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',false);
do $restored$
begin
 if (select count(*) from public.f23_mock_admin_queue())<>3
 then raise exception 'Rollback da revogação não restaurou acesso'; end if;
end $restored$;
reset role;

-- Limpeza final irrevogável, exclusivamente no PostgreSQL DESCARTÁVEL da CI.
truncate public.f23_mock_incident_events,public.f23_mock_incidents
 restart identity;
delete from private.f23_mock_admins;
update private.f23_mock_support_gate set enabled=false where singleton;

do $final$
begin
 if exists(select 1 from public.f23_mock_incidents)
 or exists(select 1 from public.f23_mock_incident_events)
 or exists(select 1 from private.f23_mock_admins)
 or (select enabled from private.f23_mock_support_gate where singleton)
 then raise exception 'Dados fictícios ou gate de incidente ficaram ativos'; end if;
end $final$;
