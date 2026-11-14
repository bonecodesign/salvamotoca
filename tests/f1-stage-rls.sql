-- F1: testes reais de DDL e RLS no PostgreSQL isolado do CI (NAO no Supabase ativo).
\set ON_ERROR_STOP on
-- Todos os testes/fixtures ficam na mesma transacao e sao descartados.
begin;
insert into public.providers (id, owner_id) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333');

do $verify$
begin
  if (select public from storage.buckets where id = 'request-photos') then
    raise exception 'Bucket de fotos nao e privado';
  end if;
  if (select file_size_limit from storage.buckets where id = 'request-photos') <> 5242880 then
    raise exception 'Limite do bucket incorreto';
  end if;
end $verify$;

-- Confirma acesso necessario a novos campos sem quebrar sigilo historico.
do $grants$
begin
  if not (
    has_column_privilege('authenticated','public.service_requests','motorcycle_brand','SELECT')
    and has_column_privilege('authenticated','public.service_requests','motorcycle_model','SELECT')
    and has_column_privilege('authenticated','public.service_requests','motorcycle_year','SELECT')
    and has_column_privilege('authenticated','public.service_requests','service_types','SELECT')
    and has_column_privilege('authenticated','public.service_requests','photo_path','SELECT')
  ) then
    raise exception 'Os novos campos F1 nao podem ser lidos pelo app autenticado';
  end if;
  if has_table_privilege('authenticated','public.service_requests','SELECT')
    or has_column_privilege('authenticated','public.service_requests','request_key','SELECT')
    or has_column_privilege('authenticated','public.service_requests','address_details','SELECT')
    or has_column_privilege('authenticated','public.service_requests','latitude','SELECT')
    or has_column_privilege('authenticated','public.service_requests','longitude','SELECT')
  then
    raise exception 'Exposicao indevida de endereco, GPS ou leitura geral da tabela';
  end if;
end $grants$;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

-- Quem enviou pode fazer upload no seu namespace, nao no de terceiros.
insert into storage.objects (bucket_id,name)
values ('request-photos','11111111-1111-4111-8111-111111111111/aaaaaaaa-1111-4111-8111-111111111111.jpg');
do $assert$
begin
  if (select count(*) from storage.objects where bucket_id='request-photos') <> 1 then
    raise exception 'Autor nao consegue ler foto propria';
  end if;
  begin
    insert into storage.objects(bucket_id,name)
    values ('request-photos','22222222-2222-4222-8222-222222222222/dddddddd-1111-4111-8111-111111111111.jpg');
    raise exception 'FALHA: upload em pasta de outra pessoa foi aceito';
  exception when insufficient_privilege then null;
  end;
end $assert$;

-- Cliente autorizado cria pedido com foto ja existente e metadados validados.
insert into public.service_requests (id,request_key,customer_id,provider_id,motorcycle_brand,
 motorcycle_model,motorcycle_year,service_types,photo_path)
values (
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 'aaaaaaaa-1111-4111-8111-111111111111',
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'Honda','CG 160',2024,array['pneu_furado','troca_camara']::text[],
 '11111111-1111-4111-8111-111111111111/aaaaaaaa-1111-4111-8111-111111111111.jpg'
);

-- Recuperação de duplicidade: consulta por foto vinculada e cliente, sem SELECT de request_key.
-- Confirma a consulta que o aplicativo faz após UNIQUE 23505 (filtro RLS autorizável).
do $recover$
declare found_id uuid;
begin
  select id into found_id from public.service_requests
  where customer_id = '11111111-1111-4111-8111-111111111111'
    and photo_path =
    '11111111-1111-4111-8111-111111111111/aaaaaaaa-1111-4111-8111-111111111111.jpg';
  if found_id is distinct from 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid then
    raise exception 'Falha na recuperação por foto e cliente sob RLS';
  end if;
end $recover$;

-- Estrategia de um Supabase: o aplicativo antigo pode continuar gravando sem campos F1.
insert into public.service_requests (id, request_key, customer_id, provider_id)
values ('12121212-1212-4212-8212-121212121212',
        '13131313-1313-4313-8313-131313131313',
        '11111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

do $verify_legacy$
begin
  if not exists (
    select 1 from public.service_requests
    where id = '12121212-1212-4212-8212-121212121212'
      and motorcycle_brand is null and motorcycle_model is null
      and motorcycle_year is null and service_types is null and photo_path is null
  ) then
    raise exception 'Pedido legado nao foi preservado na migration aditiva';
  end if;
end $verify_legacy$;

-- Dados F1 incompletos sao recusados, sem impor colunas F1 a pedidos antigos.
do $verify_partial$
begin
  begin
    insert into public.service_requests (
      id, request_key, customer_id, provider_id, motorcycle_brand
    ) values (
      '14141414-1414-4414-8414-141414141414',
      '15151515-1515-4515-8515-151515151515',
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Honda'
    );
    raise exception 'Falha: pedido F1 parcial aceito indevidamente';
  exception when check_violation then null;
  end;
end $verify_partial$;

-- Foto inexistente deve ser rejeitada pelo trigger invoker.
do $assert$
begin
  begin
    insert into public.service_requests (id,request_key,customer_id,provider_id,
      motorcycle_brand,motorcycle_model,motorcycle_year,service_types,photo_path)
    values ('ffffffff-ffff-4fff-8fff-ffffffffffff','bbbbbbbb-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Honda','CG 160',2024,array['pneu_furado']::text[],
      '11111111-1111-4111-8111-111111111111/bbbbbbbb-1111-4111-8111-111111111111.jpg');
    raise exception 'FALHA: pedido sem foto foi aceito';
  exception when check_violation then null;
  end;
end $assert$;

-- Dono nao pode apagar uma foto ja vinculada a um pedido.
delete from storage.objects where name =
'11111111-1111-4111-8111-111111111111/aaaaaaaa-1111-4111-8111-111111111111.jpg';
do $assert$
begin
  if (select count(*) from storage.objects) <> 1 then raise exception 'Foto vinculada foi apagada'; end if;
end $assert$;

-- Prestador atribuido pode ler foto; terceiro nao.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $assert$
begin
 if (select count(*) from storage.objects) <> 1 then raise exception 'Prestador atribuido sem acesso'; end if;
end $assert$;

select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $assert$
begin
 if (select count(*) from storage.objects) <> 0 then raise exception 'Terceiro le foto de outro prestador'; end if;
end $assert$;

-- Quando ha troca de prestador, o anterior perde acesso e o novo ganha.
reset role;
update public.service_requests set provider_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $assert$
begin
 if (select count(*) from storage.objects) <> 0 then raise exception 'Prestador anterior conservou acesso'; end if;
end $assert$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $assert$
begin
 if (select count(*) from storage.objects) <> 1 then raise exception 'Prestador novo nao ve foto'; end if;
end $assert$;

-- Autor pode apagar apenas fotos ainda orfas.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
insert into storage.objects(bucket_id,name)
values('request-photos','11111111-1111-4111-8111-111111111111/cccccccc-1111-4111-8111-111111111111.jpg');
delete from storage.objects where name =
'11111111-1111-4111-8111-111111111111/cccccccc-1111-4111-8111-111111111111.jpg';
do $assert$
begin
 if (select count(*) from storage.objects) <> 1 then raise exception 'Orfao nao foi excluido'; end if;
end $assert$;

-- Anaonimo nao pode listar nem ler metadados.
reset role;
set role anon;
do $assert$
begin
 if (select count(*) from storage.objects) <> 0 then raise exception 'Anonimo acessou foto'; end if;
end $assert$;
reset role;
select 'F1: migration + RLS fixtures PASSARAM (PostgreSQL isolado)' as resultado;
rollback;
