-- F3/Salva Motoca: só PostgreSQL17 de CI; transação revertida ao final.
\set ON_ERROR_STOP on
begin;
insert into public.service_categories(id,code,paid_in_app)
values(2,'borracharia_delivery',true),(3,'reboque_moto',false);
insert into public.providers(id,owner_id,display_name,status,is_active,latitude,longitude)
values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','Reboque A','approved',true,-19.925,-43.939),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','Reboque B','approved',true,-19.926,-43.939),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','44444444-4444-4444-8444-444444444444','Não homologado','pending',false,-19.925,-43.939);
insert into public.provider_services(provider_id,category_id,is_active)
values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',3,true),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',3,true),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc',3,true);
insert into public.bj_provider_presence(provider_id,online_requested,last_seen_at)
values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,now()),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,now()),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc',true,now());
insert into storage.objects(bucket_id,name) values
('request-photos','11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555.jpg');

-- Controles de projeto e permissões.
do $initial$
begin
  if (select enabled from private.f3_release_gate where singleton)
    or (select enabled from private.f2_release_gate where singleton)
  then raise exception 'F3/F2 veio ativo indevidamente'; end if;
  if (select paid_in_app from public.service_categories where code='reboque_moto')
  then raise exception 'Reboque habilitado para pagamentos sem F4'; end if;
  if has_table_privilege('authenticated','public.f3_tow_requests','INSERT')
    or has_table_privilege('authenticated','public.f3_tow_provider_capacity','UPDATE')
    or has_table_privilege('anon','public.f3_tow_requests','SELECT')
  then raise exception 'Privilégios de tabelas F3 inseguros'; end if;
  if has_function_privilege('anon','public.f3_offer_candidates(uuid,integer)','EXECUTE')
    or has_function_privilege('anon','public.f3_submit_tow_quote(uuid,jsonb,text)','EXECUTE')
    or has_function_privilege('anon','public.f3_decide_tow_quote(uuid,boolean)','EXECUTE')
  then raise exception 'RPC pública F3 acessível sem autenticação'; end if;
  if not (select relrowsecurity from pg_class
    where oid='public.f3_tow_requests'::regclass)
  then raise exception 'F3 sem RLS'; end if;
end $initial$;

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $gate_off$
begin
  begin
    perform public.f3_set_tow_capacity('plataforma',250,25,4,true,true);
    raise exception using message='FALHA: F3 aceitou escrita desligada',errcode='ZX101';
  exception when others then
    if sqlstate='ZX101' then raise; end if;
    if sqlerrm not like '%F3 desativada%' then raise; end if;
  end;
end $gate_off$;
reset role;
update private.f2_release_gate set enabled=true;
set role authenticated;
do $f2_only$
begin
  begin
    perform public.f3_set_tow_capacity('plataforma',250,25,4,true,true);
    raise exception using message='FALHA: só F2 liberou F3',errcode='ZX102';
  exception when others then
    if sqlstate='ZX102' then raise; end if;
    if sqlerrm not like '%F3 desativada%' then raise; end if;
  end;
end $f2_only$;

-- Apenas no container descartável e dentro desta transação de teste!
reset role;
update private.f3_release_gate set enabled=true;
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select public.f3_set_tow_capacity('plataforma',250,25,4,true,true);
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select public.f3_set_tow_capacity('carretinha',250,25,4,true,true);
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
select public.f3_set_tow_capacity('plataforma',250,25,4,true,true);
do $pending$
begin
 if (select count(*) from public.f3_tow_provider_capacity where verified_by_admin)<>0
 then raise exception 'Prestador se autoaprovou'; end if;
end $pending$;

-- A sem certificado continua inelegível.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.f3_create_tow_request(
 '55555555-5555-4555-8555-555555555555',
 '11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555.jpg',
 'Honda','CG 160',2024,140,array['reboque_moto'],
 'A moto está imobilizada com defeito fictício no pneu.',
 -19.924,-43.938,'Belo Horizonte','MG',
 'Contagem','MG','Rua privada fictícia 123',20,'automatic',null
) as tow_request_id \gset
select set_config('test.f3_request_id',:'tow_request_id',false);
do $created$
begin
 if (select count(*) from public.f3_tow_requests)<>1
 then raise exception 'Pedido e destino não foram gravados em conjunto'; end if;
 if (select count(*) from public.service_requests where status='requested')<>1
 then raise exception 'Pedido F3 não está em requested'; end if;
end $created$;
select public.f3_offer_candidates(current_setting('test.f3_request_id')::uuid,3) as no_verified \gset
select set_config('test.f3_no_verified',:'no_verified',false);
do $noverified$
begin
 if current_setting('test.f3_no_verified')::integer<>0 then
   raise exception 'Capacidade não certificada entrou na fila'; end if;
end $noverified$;

-- A mesma chave deve ser idempotente APENAS com payload idêntico.
select public.f3_create_tow_request(
 '55555555-5555-4555-8555-555555555555',
 '11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555.jpg',
 'Honda','CG 160',2024,140,array['reboque_moto'],
 'A moto está imobilizada com defeito fictício no pneu.',
 -19.924,-43.938,'Belo Horizonte','MG',
 'Contagem','MG','Rua privada fictícia 123',20,'automatic',null
) as retry_id \gset
select set_config('test.f3_retry_id',:'retry_id',false);
do $idempotence$
begin
 if current_setting('test.f3_request_id')::uuid<>current_setting('test.f3_retry_id')::uuid
 then raise exception 'Retry idêntico criou duplicata'; end if;
 if (select count(*) from public.service_requests)<>1
 then raise exception 'Pedido duplicado'; end if;
end $idempotence$;
-- Valor diferente com mesmo request_key deve ser rejeitado.
do $different$
begin
 begin
   perform public.f3_create_tow_request(
     '55555555-5555-4555-8555-555555555555',
     '11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555.jpg',
     'Honda','CG 160',2024,140,array['reboque_moto'],
     'A moto está imobilizada com defeito fictício no pneu.',
     -19.924,-43.938,'Belo Horizonte','MG',
     'Contagem','MG','Rua diferente 987',20,'automatic',null);
   raise exception using message='FALHA: chave reutilizada',errcode='ZX103';
 exception when others then
   if sqlstate='ZX103' then raise; end if;
   if sqlerrm not like '%Chave de pedido reutilizada%' then raise; end if;
 end;
end $different$;

-- Sem certificado nem convite: terceiro não lê os dados privados.
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
do $third$
begin
 if (select count(*) from public.f3_tow_requests)<>0
 then raise exception 'Terceiro pode ler destino exato'; end if;
 begin
   perform public.f3_tow_summary(current_setting('test.f3_request_id')::uuid);
   raise exception using message='FALHA: resumo aberto para terceiro',errcode='ZX104';
 exception when others then if sqlstate='ZX104' then raise; end if;
 end;
end $third$;

-- Certificação administrativa somente como fixture explícita.
reset role;
update public.f3_tow_provider_capacity set verified_by_admin=true
  where provider_id in(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.f3_offer_candidates(current_setting('test.f3_request_id')::uuid,3) as offered \gset
select set_config('test.f3_offered',:'offered',false);
do $offers$
begin
 if current_setting('test.f3_offered')::integer<>2 or
  (select count(*) from public.f2_request_offers where
   request_id=current_setting('test.f3_request_id')::uuid)<>2
 then raise exception 'F3 não convidou exatamente A e B'; end if;
 if exists(select 1 from public.f2_request_offers
   where provider_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')
 then raise exception 'Prestador pendente recebeu convite'; end if;
end $offers$;

-- Prestador convidado pode consultar APENAS o resumo, sem endereço privado.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select public.f3_tow_summary(current_setting('test.f3_request_id')::uuid)::text as public_summary \gset
select set_config('test.f3_public_summary',:'public_summary',false);
do $summary$
begin
 if (select count(*) from public.f3_tow_requests)<>0
 then raise exception 'Prestador lê endereço de destino privado'; end if;
 if position('destinationAddress' in current_setting('test.f3_public_summary'))>0
   or position('Rua privada' in current_setting('test.f3_public_summary'))>0
 then raise exception 'RPC resumo vazou endereço'; end if;
 if (select count(*) from public.service_requests)<1
 then raise exception 'Prestador convidado não vê o pedido mínimo F2'; end if;
end $summary$;

-- F2 faz ACK de convites F3, após homologação de capacidade.
select public.f2_ack_offer((select id from public.f2_request_offers
  where provider_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')) as ack_b \gset
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select public.f2_ack_offer((select id from public.f2_request_offers
  where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) as ack_a \gset

-- Os dois orçamentos F3 são transacionais, com deslocamento e itens.
select public.f3_submit_tow_quote(
 (select id from public.f2_request_offers
   where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 '[{"kind":"service","code":"reboque_moto","amountCents":23000},
   {"kind":"travel","code":"deslocamento","amountCents":4000}]'::jsonb,
 'Reboque Alfa, somente teste'
) as quote_a \gset
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select public.f3_submit_tow_quote(
 (select id from public.f2_request_offers
   where provider_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 '[{"kind":"service","code":"reboque_moto","amountCents":21000},
   {"kind":"travel","code":"deslocamento","amountCents":3000}]'::jsonb,
 'Reboque Beta, somente teste'
) as quote_b \gset

-- Uma capacidade que perde homologação não pode ganhar nem via RPC F2.
reset role;
update public.f3_tow_provider_capacity set verified_by_admin=false
  where provider_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select set_config('test.f3_quote_b',:'quote_b',false);
do $generic_bypass$
begin
 begin
  perform public.f2_decide_quote(current_setting('test.f3_quote_b')::uuid,true);
  raise exception using message='FALHA: F2 aceitou equipamento não certificado',errcode='ZX105';
 exception when others then if sqlstate='ZX105' then raise; end if;
 end;
 begin
  perform public.f3_decide_tow_quote(current_setting('test.f3_quote_b')::uuid,true);
  raise exception using message='FALHA: F3 aceitou equipamento não certificado',errcode='ZX106';
 exception when others then if sqlstate='ZX106' then raise; end if;
 end;
end $generic_bypass$;
reset role;
update public.f3_tow_provider_capacity set verified_by_admin=true
  where provider_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.f3_decide_tow_quote(:'quote_b'::uuid,true) as accepted \gset
do $winner$
begin
 if (select status from public.service_requests
    where id=current_setting('test.f3_request_id')::uuid)<>'awaiting_payment'
 then raise exception 'Estado incorreto, cobrança indevida ou ausência de aceite'; end if;
 if (select provider_id from public.service_requests
    where id=current_setting('test.f3_request_id')::uuid)
    <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
 then raise exception 'Vencedor da F3 incorreto'; end if;
 if (select count(*) from public.service_quotes where status='accepted')<>1
 then raise exception 'Aceite duplicado'; end if;
 if (select count(*) from public.service_categories
     where code='reboque_moto' and paid_in_app)<>0
 then raise exception 'Categoria reboque permitiu pagamento'; end if;
end $winner$;
select 'F3: CRIAÇÃO ATÔMICA, PRIVACIDADE, HOMOLOGAÇÃO, 2 ORÇAMENTOS E 1 ACEITE OK' as resultado;
rollback;
