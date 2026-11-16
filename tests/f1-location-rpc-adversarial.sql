-- F1 — testes adversariais de LOCALIZACAO 100% FICTICIA.
-- Executar somente no Postgres 17 do GitHub Actions, NAO no Supabase real.
-- Depende de tests/f1-location-rpc-fixture.sql. Tudo volta ao estado inicial.
begin;

do $$
begin
 if (select enabled from private.f1_location_release_gate where singleton)
  then raise exception 'Gate de localizacao nasce habilitado'; end if;
 if has_function_privilege('anon','private.f1_location_hardened_fixture(uuid)','EXECUTE')
  or has_function_privilege('anon','private.f1_location_baseline_fixture(uuid)','EXECUTE')
  then raise exception 'Anon executa RPC mock'; end if;
 if has_table_privilege('authenticated','public.payment_records','INSERT')
   or has_table_privilege('authenticated','public.service_requests','UPDATE')
   or has_table_privilege('authenticated','public.service_requests','SELECT')
   then raise exception 'Cliente tem acesso direto nao autorizado as tabelas'; end if;
end $$;

-- Cliente A pode ler seus PROPRIOS dados mesmo com flag operacional desligada.
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$
begin
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>1
 then raise exception 'Cliente titular nao pode ver endereco proprio'; end if;
end $$;
reset role;

-- Terceiro C, mesmo conhecendo o UUID, jamais pode ler a posicao.
set role authenticated;
set request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';
do $$
begin
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Terceiro acessou endereco'; end if;
end $$;
reset role;

-- Prestador B selecionado: gate F1 local false bloqueia candidato;
-- simula-se que a RPC atual teria devolvido coordenadas, POIS payment=paid
-- artificialmente e pedido ainda awaiting_payment (regressao de desenho).
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_baseline_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>1
 then raise exception 'Fixture baseline nao corresponde ao comportamento observado'; end if;
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Gate false nao bloqueou localizacao do prestador'; end if;
end $$;
reset role;

-- Ligacao de gate so neste teste local, reversivel.
update private.f1_location_release_gate set enabled=true where singleton;

-- Mesmo se alguem marcar payment_records paid na fixture, o atendimento
-- em awaiting_payment nao pode liberar a localizacao ao prestador.
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Status awaiting_payment liberou endereco'; end if;
end $$;
reset role;

-- Pedido ficticio muda para accepted somente sob administrador do container.
update public.service_requests set status='accepted'
 where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>1
 then raise exception 'Cenario de fixture autorizado foi negado'; end if;
end $$;
reset role;

-- Prestador distinto nao selecionado e identidade qualquer sao negados.
set role authenticated;
set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444';
do $$
begin
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Prestador nao escolhido acessou endereco'; end if;
end $$;
reset role;

-- Suspensao retira acesso imediatamente, sem cron e sem invalidar JWT.
update public.providers set status='suspended',is_active=false
 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_baseline_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>1
 then raise exception 'Baseline nao demonstra falta de revogacao'; end if;
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Prestador suspenso viu localizacao'; end if;
end $$;
reset role;
update public.providers set status='approved',is_active=true
 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- A mera inativacao (sem suspensao) revoga acesso.
update public.providers set is_active=false
 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Prestador inativo viu localizacao'; end if;
end $$;
reset role;
update public.providers set is_active=true
 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- Pagamento reembolsado: antiga RPC ja nega, nova tambem.
update public.payment_records set status='refunded'
 where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Reembolso continuou visivel'; end if;
end $$;
reset role;
update public.payment_records set status='paid'
 where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

-- Status paid sem timestamp de pagamento confiavel fica negado.
update public.payment_records set paid_at=null
 where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'paid sem paid_at liberou endereco'; end if;
end $$;
reset role;
update public.payment_records set paid_at=now()
 where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

-- Orcamento recusado e atribuido ao mesmo prestador: consulta deve negar.
update public.service_quotes set status='declined'
 where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Sem orcamento aceito liberou endereco'; end if;
end $$;
reset role;
update public.service_quotes set status='accepted'
 where request_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

-- Reatribuicao para outro prestador revoga o acesso do anterior.
update public.service_requests
 set provider_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
 where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Antigo prestador viu endereco'; end if;
end $$;
reset role;
-- Novo prestador tambem nao recebe ate haver orcamento aceito valido.
set role authenticated;
set request.jwt.claim.sub='44444444-4444-4444-8444-444444444444';
do $$
begin
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Novo prestador sem orcamento recebeu localizacao'; end if;
end $$;
reset role;

update public.service_requests
 set provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status='cancelled'
 where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Pedido cancelado revelou endereco'; end if;
end $$;
reset role;
update public.service_requests set status='completed'
 where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
begin
 if (select count(*) from private.f1_location_hardened_fixture(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))<>0
 then raise exception 'Pedido concluido continuou liberando GPS/endereco'; end if;
end $$;
reset role;

rollback;

do $$
begin
 if (select enabled from private.f1_location_release_gate where singleton)
 then raise exception 'Gate ficou ligado apos rollback'; end if;
 if (select status from public.service_requests
  where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>'awaiting_payment'
 then raise exception 'Fixture sofreu mudanca persistente'; end if;
end $$;
