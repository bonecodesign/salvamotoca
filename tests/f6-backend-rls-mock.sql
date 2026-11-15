-- F6 mock: testes negativos de Auth/RLS/estado somente em PG17 DESCARTAVEL.
-- Requer tests/f2-stage-setup.sql + candidatos F5 e F6. Tudo em rollback.
begin;

insert into public.service_categories(id,code)
values (1,'borracharia_delivery');
insert into public.providers(id,owner_id,status,is_active)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '22222222-2222-4222-8222-222222222222','approved',true),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        '99999999-9999-4999-8999-999999999999','pending',false);
insert into public.service_requests(id,customer_id,category_id,provider_id,status)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        '11111111-1111-4111-8111-111111111111',1,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','awaiting_payment'),
       ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        '33333333-3333-4333-8333-333333333333',1,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','awaiting_payment');
insert into public.service_quotes(id,request_id,provider_id,amount_cents,status)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',28000,'accepted'),
       ('ffffffff-ffff-4fff-8fff-ffffffffffff',
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',4000,'accepted');

-- Handoff ficticio F5: continua service_requests.awaiting_payment.
insert into public.f5_mock_sessions
(id,request_id,quote_id,customer_id,provider_id,provider_owner_id,
 mock_paid,status)
values ('10101010-1010-4010-8010-101010101010',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        '11111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '22222222-2222-4222-8222-222222222222',true,'handoff_f6'),
       ('20202020-2020-4020-8020-202020202020',
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        'ffffffff-ffff-4fff-8fff-ffffffffffff',
        '33333333-3333-4333-8333-333333333333',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '22222222-2222-4222-8222-222222222222',true,'handoff_f6');

insert into public.f6_mock_completions
(id,session_id,customer_id,provider_owner_id,status,summary,summary_at,
 customer_deadline_at,provider_confirmed_at,customer_confirmed_at,
 rating_stars,rating_comment,rating_at,synthetic_photo_marker)
values ('30303030-3030-4030-8030-303030303030',
        '10101010-1010-4010-8010-101010101010',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'completed','Servico ficticio finalizado e pneu examinado.',
        now()-interval '1 minute',now()+interval '4 minutes',
        now(),now(),5,'Atendimento ficticio',now(),'F6_SYNTHETIC_PHOTO_ONLY'),
       ('40404040-4040-4040-8040-404040404040',
        '20202020-2020-4020-8020-202020202020',
        '33333333-3333-4333-8333-333333333333',
        '22222222-2222-4222-8222-222222222222',
        'support_review','Cliente contesta o atendimento simulado.',
        now()-interval '6 minutes',now()-interval '1 minute',
        now()-interval '5 minutes',null,null,null,null,null);

insert into public.f6_mock_support_messages
(id,completion_id,actor_id,body)
values ('50505050-5050-4050-8050-505050505050',
        '40404040-4040-4040-8040-404040404040',
        '33333333-3333-4333-8333-333333333333',
        'Caso de suporte apenas local.');

-- Prova inicial de privilegios/release gate
do $$
begin
 if exists(select 1 from private.f6_mock_release_gate where enabled)
 then raise exception 'Gate F6 nao nasce desligado'; end if;
 if not (select relrowsecurity from pg_class
  where oid='public.f6_mock_completions'::regclass)
  or not (select relrowsecurity from pg_class
  where oid='public.f6_mock_support_messages'::regclass)
 then raise exception 'F6 precisa de RLS em todas as tabelas publicas'; end if;
 if has_table_privilege('anon','public.f6_mock_completions','SELECT')
  or has_table_privilege('anon','public.f6_mock_support_messages','SELECT')
 then raise exception 'Anon recebeu SELECT F6'; end if;
 if has_table_privilege('authenticated','public.f6_mock_completions','INSERT')
  or has_table_privilege('authenticated','public.f6_mock_completions','UPDATE')
  or has_table_privilege('authenticated','public.f6_mock_completions','DELETE')
  or has_table_privilege('authenticated','public.f6_mock_support_messages','INSERT')
 then raise exception 'Browser recebeu escrita F6'; end if;
 if not has_column_privilege('authenticated','public.f6_mock_completions',
      'rating_stars','SELECT')
 then raise exception 'Coluna autorizada nao foi exposta para ler'; end if;
 if (select count(*) from public.service_requests where status='paid')<>0
 then raise exception 'Fixture alterou pedido real para paid'; end if;
end $$;

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
set app.f6_test_only='local_fixture';
do $$
begin
 if (select count(*) from public.f6_mock_completions)<>0
 or (select count(*) from public.f6_mock_support_messages)<>0
 then raise exception 'Gate false permitiu leitura'; end if;
end $$;
reset role;

-- Teste forca gate local ligado, mas somente nesta transacao revertida.
update private.f6_mock_release_gate set enabled=true where singleton;

-- Cliente A: apenas propria conclusao e avaliacao; nenhum suporte de B
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
set app.f6_test_only='local_fixture';
do $$
begin
 if (select count(*) from public.f6_mock_completions)<>1
 or (select count(*) from public.f6_mock_support_messages)<>0
 or (select max(rating_stars) from public.f6_mock_completions)<>5
 then raise exception 'Cliente A: isolamento incorreto'; end if;
end $$;
reset role;

-- Cliente C: somente sua disputa e sua unica mensagem
set role authenticated;
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
set app.f6_test_only='local_fixture';
do $$
begin
 if (select count(*) from public.f6_mock_completions)<>1
 or (select count(*) from public.f6_mock_support_messages)<>1
 or (select count(rating_stars) from public.f6_mock_completions)<>0
 then raise exception 'Cliente C: isolamento incorreto'; end if;
end $$;
reset role;

-- Prestador escolhido e aprovado pode ler suas duas sessoes
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
set app.f6_test_only='local_fixture';
do $$
begin
 if (select count(*) from public.f6_mock_completions)<>2
 or (select count(*) from public.f6_mock_support_messages)<>1
 then raise exception 'Prestador nao enxerga casos legitimamente vinculados'; end if;
end $$;
reset role;

-- Terceiro nunca ve outro cliente ou prestador
set role authenticated;
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
set app.f6_test_only='local_fixture';
do $$
begin
 if (select count(*) from public.f6_mock_completions)<>0
 or (select count(*) from public.f6_mock_support_messages)<>0
 then raise exception 'Terceiro quebrou RLS'; end if;
end $$;
reset role;

-- O contexto de teste deve ser explicito. Nao e medida real contra cliente
-- malicioso: ele so existe no container, sem grants de escrita.
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
reset app.f6_test_only;
do $$
begin
 if (select count(*) from public.f6_mock_completions)<>0
 then raise exception 'F6 leu sem contexto de teste'; end if;
end $$;
reset role;

-- Handoff revogado pela F5: F6 fica invisivel sem cron.
update public.f5_mock_sessions set status='support_review'
 where id='10101010-1010-4010-8010-101010101010';
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
set app.f6_test_only='local_fixture';
do $$
begin
 if (select count(*) from public.f6_mock_completions)<>0
 then raise exception 'Handoff F5 revogado continuou autorizando F6'; end if;
end $$;
reset role;
update public.f5_mock_sessions set status='handoff_f6'
 where id='10101010-1010-4010-8010-101010101010';

-- Conclusao sem dupla confirmacao e invalida ate mesmo em fixture privilegiada.
do $$
declare blocked boolean:=false;
begin
 begin
  update public.f6_mock_completions
   set customer_confirmed_at=null
   where id='30303030-3030-4030-8030-303030303030';
 exception when check_violation then blocked:=true;
 end;
 if not blocked then raise exception 'Estado completed aceitou confirmacao unica'; end if;
end $$;

-- Fora da janela de cinco minutos nao se confirma automaticamente.
do $$
declare blocked boolean:=false;
begin
 begin
  update public.f6_mock_completions
   set status='completed',
       customer_confirmed_at=now()
   where id='40404040-4040-4040-8040-404040404040';
 exception when check_violation then blocked:=true;
 end;
 if not blocked then raise exception 'Aceitou confirmacao tardia'; end if;
end $$;

-- Integridade de identidade do cliente nao e alteravel no backend.
do $$
declare blocked boolean:=false;
begin
 begin
  update public.f6_mock_completions
    set customer_id='55555555-5555-4555-8555-555555555555'
    where id='30303030-3030-4030-8030-303030303030';
 exception when raise_exception then blocked:=true;
 end;
 if not blocked then raise exception 'Sessao foi transferida para terceiro'; end if;
end $$;

-- So mensagens em divergencia recebem insercao (ainda que seja a fixture).
do $$
declare blocked boolean:=false;
begin
 begin
  insert into public.f6_mock_support_messages(completion_id,actor_id,body)
  values ('30303030-3030-4030-8030-303030303030',
  '11111111-1111-4111-8111-111111111111','Tentativa fora de suporte');
 exception when raise_exception then blocked:=true;
 end;
 if not blocked then raise exception 'Mensagem de suporte fora de divergencia'; end if;
end $$;

-- Perda da homologacao revoga o acesso do prestador (cliente ainda ve dados).
update public.providers set status='suspended',is_active=false
 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
set app.f6_test_only='local_fixture';
do $$
begin
 if (select count(*) from public.f6_mock_completions)<>0
 or (select count(*) from public.f6_mock_support_messages)<>0
 then raise exception 'Prestador suspenso ainda ve dados'; end if;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
set app.f6_test_only='local_fixture';
do $$
begin
 if (select count(*) from public.f6_mock_completions)<>1
 or (select count(*) from public.f6_mock_support_messages)<>1
 then raise exception 'Cliente perdeu acesso ao proprio caso de suporte'; end if;
end $$;
reset role;

rollback;

-- As duas tabelas persistem vazias; flags voltaram para false.
do $$
begin
 if (select enabled from private.f6_mock_release_gate where singleton)
    or (select count(*) from public.f6_mock_completions)<>0
    or (select count(*) from public.f6_mock_support_messages)<>0
 then raise exception 'Fixture nao foi totalmente revertida'; end if;
end $$;
