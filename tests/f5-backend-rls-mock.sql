-- F5 SQL mock: executar somente em Postgres 17 DESCARTAVEL.
-- Pre-requisitos: tests/f2-stage-setup.sql + drafts/f5_backend_rls_mock_candidate.sql
begin;
insert into public.service_categories(id,code) values(1,'borracharia_delivery');
insert into public.providers(id,owner_id,status,is_active)
 values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
         '22222222-2222-4222-8222-222222222222','approved',true),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
         '99999999-9999-4999-8999-999999999999','pending',false);
insert into public.service_requests
 (id,customer_id,category_id,provider_id,status)
 values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111',1,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','awaiting_payment'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '33333333-3333-4333-8333-333333333333',1,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','awaiting_payment');
insert into public.service_quotes
 (id,request_id,provider_id,amount_cents,status)
 values
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',28000,'accepted'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',4500,'accepted');

-- O cliente nao possui como manipular mock_paid: fixture inserida so pelo postgres.
insert into public.f5_mock_sessions
 (id,request_id,quote_id,customer_id,provider_id,provider_owner_id,
  mock_paid,status,tracking_consent)
 values
 ('10101010-1010-4010-8010-101010101010',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  true,'en_route',true),
 ('20202020-2020-4020-8020-202020202020',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  '33333333-3333-4333-8333-333333333333',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  true,'support_review',false);
insert into public.f5_mock_messages(session_id,actor_id,kind,body)
 values
 ('10101010-1010-4010-8010-101010101010',
  '11111111-1111-4111-8111-111111111111','participant','Teste local cliente'),
 ('10101010-1010-4010-8010-101010101010',
  '22222222-2222-4222-8222-222222222222','participant','Teste local prestador'),
 ('20202020-2020-4020-8020-202020202020',
  '33333333-3333-4333-8333-333333333333','support','Suporte ficticio');
insert into public.f5_mock_latest_location(session_id,latitude,longitude,accuracy_meters,sampled_at)
 values('10101010-1010-4010-8010-101010101010',-19.924000,-43.938000,25,now()-interval '30 seconds');

-- A flag e false antes dos testes, e a camada real F1 nunca muda status para paid.
do $$
begin
 if exists(select 1 from private.f5_mock_release_gate where enabled)
    then raise exception 'F5 mock nao nasce fechada'; end if;
 if exists(select 1 from public.service_requests where status='paid')
    then raise exception 'Fixture nao pode marcar pedido pago'; end if;
 if has_table_privilege('anon','public.f5_mock_sessions','SELECT')
    or has_table_privilege('anon','public.f5_mock_messages','SELECT')
    or has_table_privilege('anon','public.f5_mock_latest_location','SELECT')
    then raise exception 'Anon possui privilegio F5'; end if;
 if has_table_privilege('authenticated','public.f5_mock_messages','INSERT')
    or has_table_privilege('authenticated','public.f5_mock_sessions','UPDATE')
    or has_table_privilege('authenticated','public.f5_mock_latest_location','DELETE')
    then raise exception 'Browser possui escrita F5'; end if;
 if has_column_privilege('authenticated','public.f5_mock_sessions','mock_paid','SELECT')
    or has_column_privilege('authenticated','public.f5_mock_sessions','fixture_receipt','SELECT')
    then raise exception 'Colunas internas visiveis'; end if;
end $$;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set app.f5_test_only = 'local_fixture';
do $$
begin
 if (select count(*) from public.f5_mock_sessions)<>0
 or (select count(*) from public.f5_mock_messages)<>0
 or (select count(*) from public.f5_mock_latest_location)<>0
 or private.f5_mock_binding_visible('10101010-1010-4010-8010-101010101010')
 then raise exception 'Gate false nao bloqueou acesso'; end if;
end $$;
reset role;

-- Simular gate habilitado so dentro desta transacao local, revertida no fim.
update private.f5_mock_release_gate set enabled=true where singleton;

-- Cliente 1 acessa somente propria sessao, 2 mensagens e localizacao fresca.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set app.f5_test_only = 'local_fixture';
do $$
begin
 if (select count(*) from public.f5_mock_sessions)<>1
 or (select count(*) from public.f5_mock_messages)<>2
 or (select count(*) from public.f5_mock_latest_location)<>1
 then raise exception 'Cliente 1: RLS incorreto'; end if;
end $$;
reset role;

-- Terceiro autenticado nao acessa nenhuma informacao.
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
set app.f5_test_only = 'local_fixture';
do $$
begin
 if (select count(*) from public.f5_mock_sessions)<>0
 or (select count(*) from public.f5_mock_messages)<>0
 or (select count(*) from public.f5_mock_latest_location)<>0
 then raise exception 'Terceiro invadiu RLS'; end if;
end $$;
reset role;

-- Outro cliente ve somente seu chamado de suporte, sem GPS nem chat alheio.
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
set app.f5_test_only = 'local_fixture';
do $$
begin
 if (select count(*) from public.f5_mock_sessions)<>1
 or (select count(*) from public.f5_mock_messages)<>1
 or (select count(*) from public.f5_mock_latest_location)<>0
 then raise exception 'Cliente 2 invadiu outra sessao'; end if;
end $$;
reset role;

-- Prestador homologado escolhido pode consultar ambos os casos mock.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set app.f5_test_only = 'local_fixture';
do $$
begin
 if (select count(*) from public.f5_mock_sessions)<>2
 or (select count(*) from public.f5_mock_messages)<>3
 or (select count(*) from public.f5_mock_latest_location)<>1
 then raise exception 'Prestador autorizado nao enxerga caso'; end if;
end $$;
reset role;

-- Sem contexto local, mesmo com flag testada true, tudo e negado.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
reset app.f5_test_only;
do $$
begin
 if (select count(*) from public.f5_mock_sessions)<>0
 then raise exception 'Ausencia de contexto test_only permitiu leitura'; end if;
end $$;
reset role;

-- Localizacao deve desaparecer ao ficar velha mesmo sem cron.
update public.f5_mock_latest_location
 set sampled_at=now()-interval '5 minutes';
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set app.f5_test_only = 'local_fixture';
do $$
begin
 if (select count(*) from public.f5_mock_latest_location)<>0
 then raise exception 'GPS vencido permaneceu visivel'; end if;
end $$;
reset role;

-- Restaurar GPS e registrar chegada: SELECT continua bloqueado pelo status.
update public.f5_mock_latest_location set sampled_at=now();
update public.f5_mock_sessions
 set status='arrived',tracking_consent=false;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set app.f5_test_only = 'local_fixture';
do $$
begin
 if (select count(*) from public.f5_mock_latest_location)<>0
 then raise exception 'Chegada nao encerrou rastreamento'; end if;
end $$;
reset role;

-- Suspensao do prestador revoga acesso ao chat comum e da propria sessao.
update public.providers
 set status='suspended',is_active=false
 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set app.f5_test_only = 'local_fixture';
do $$
begin
 if (select count(*) from public.f5_mock_messages)<>0
 then raise exception 'Chat ativo de prestador suspenso permaneceu visivel'; end if;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set app.f5_test_only = 'local_fixture';
do $$
begin
 if (select count(*) from public.f5_mock_sessions)<>0
 then raise exception 'Prestador suspenso manteve sessao'; end if;
end $$;
reset role;

-- A -> B -> A must not resurrect the original session, even after approval returns.
update public.providers set status='approved',is_active=true where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.service_requests set provider_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
update public.service_requests set provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
set app.f5_test_only='local_fixture';
do $ begin
 if (select count(*) from public.f5_mock_sessions)<>0 or (select count(*) from public.f5_mock_messages)<>0 or (select count(*) from public.f5_mock_latest_location)<>0
 then raise exception 'Sessao antiga voltou apos reatribuicao'; end if;
end $;
reset role;
do $ begin
 if (select count(*) from private.f5_mock_revocations)<>1 then raise exception 'Revogacao nao persistiu'; end if;
end $;

-- Nenhum fixture nem alteracao do gate deve sobreviver ao teste.
rollback;
do $$
begin
 if exists(select 1 from private.f5_mock_release_gate where enabled)
 then raise exception 'Gate persistiu habilitado'; end if;
 if exists(select 1 from public.f5_mock_sessions)
 then raise exception 'Dados ficticios sobreviveram ao rollback'; end if;
end $$;
