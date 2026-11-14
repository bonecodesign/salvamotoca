-- PostgreSQL 17 descartável. Testes RLS + RPCs F2 sem qualquer integração remota.
\set ON_ERROR_STOP on
begin;

insert into public.service_categories(id,code) values(2,'borracharia_delivery');
insert into public.providers(id,owner_id,display_name,status,is_active,city,state_code,latitude,longitude) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','Oficina Alfa','approved',true,'Belo Horizonte','MG',-19.925,-43.939),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','Oficina Beta','approved',true,'Belo Horizonte','MG',-19.926,-43.939),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','44444444-4444-4444-8444-444444444444','Oficina Gama','pending',false,'Belo Horizonte','MG',-19.925,-43.938);
insert into public.provider_services(provider_id,category_id,is_active) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,true),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2,true),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc',2,false);
insert into public.bj_provider_presence(provider_id,online_requested,last_seen_at) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,now()),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,now()),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc',true,now());
insert into public.service_requests(id,customer_id,provider_id,category_id,service_types,
  latitude,longitude,photo_path,motorcycle_brand,motorcycle_model,motorcycle_year)
values('11111111-aaaa-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,array['pneu_furado','troca_camara'],
  -19.924,-43.938,'11111111-1111-4111-8111-111111111111/99999999-9999-4999-8999-999999999999.jpg',
  'Honda','CG 160',2024);
insert into storage.objects(bucket_id,name) values('request-photos',
  '11111111-1111-4111-8111-111111111111/99999999-9999-4999-8999-999999999999.jpg');

-- 1) Gate desligado e grants restritos em todas tabelas recém-criadas.
do $security$
begin
  if (select enabled from private.f2_release_gate) then
    raise exception 'F2 veio ativada incorretamente'; end if;
  if has_table_privilege('authenticated','public.f2_request_offers','INSERT')
    or has_table_privilege('authenticated','public.f2_quote_items','UPDATE')
    or has_table_privilege('authenticated','public.f2_provider_capacity','UPDATE')
    or has_table_privilege('anon','public.f2_request_offers','SELECT')
  then raise exception 'Grants F2 permitem escrita/leitura indevida'; end if;
  if has_function_privilege('anon','public.f2_offer_candidates(uuid,integer)','EXECUTE')
    or has_function_privilege('anon','public.f2_submit_quote(uuid,jsonb,text)','EXECUTE')
    or has_function_privilege('anon','public.f2_decide_quote(uuid,boolean)','EXECUTE')
  then raise exception 'Anonimo executa RPCs F2'; end if;
  if not (select relrowsecurity from pg_class where oid='public.f2_request_offers'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.f2_quote_items'::regclass)
  then raise exception 'RLS desligado'; end if;
end $security$;

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $capacity_gate$
begin
  begin
    perform public.f2_set_capacity(array['pneu_furado','troca_camara'],10);
    raise exception using message='FAIL: capacidade gravada com gate desligado',errcode='ZX008';
  exception when others then if sqlstate='ZX008' then raise; end if;
  end;
end $capacity_gate$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $gate$
begin
  begin
    perform public.f2_offer_candidates('11111111-aaaa-4111-8111-111111111111');
    raise exception using message='FAIL: gate desativado aceitou convites',errcode='ZX001';
  exception when others then
    if sqlstate='ZX001' then raise; end if;
  end;
end $gate$;

-- Gate é ligado SOMENTE nesta transação isolada, revertida por ROLLBACK.
reset role;
update private.f2_release_gate set enabled=true;
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select public.f2_set_capacity(array['pneu_furado','troca_camara'],10);
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select public.f2_set_capacity(array['pneu_furado','troca_camara'],10);
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
select public.f2_set_capacity(array['pneu_furado','troca_camara'],10);
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.f2_offer_candidates('11111111-aaaa-4111-8111-111111111111',3) as created_offers \gset
do $assert$
begin
  if (select count(*) from public.f2_request_offers where
     request_id='11111111-aaaa-4111-8111-111111111111') <> 2
  then raise exception 'Nao criou convites para dois prestadores'; end if;
  if (select count(*) from public.f2_request_offers o
    where o.provider_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>0
  then raise exception 'Prestador pendente recebeu convite'; end if;
  if not exists(select 1 from public.f2_request_offers where
    status='offered' and provider_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  then raise exception 'Prestador Beta não foi convidado'; end if;
  begin
    perform public.f2_offer_candidates('11111111-aaaa-4111-8111-111111111111');
    raise exception using message='FAIL: convite duplicado',errcode='ZX002';
  exception when others then if sqlstate='ZX002' then raise; end if;
  end;
end $assert$;

-- SQL selecionado pelo cliente: nunca devolve endereço exato.
do $priv$
begin
  if has_column_privilege('authenticated','public.service_requests','address_details','SELECT')
    or has_column_privilege('authenticated','public.service_requests','latitude','SELECT')
    or has_column_privilege('authenticated','public.service_requests','longitude','SELECT')
  then raise exception 'Localização privada exposta'; end if;
end $priv$;

-- Terceiro Gama não lê ofertas ou fotos.
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
do $deny$
begin
 if (select count(*) from public.f2_request_offers)>0 then
   raise exception 'Terceiro le ofertas'; end if;
 if (select count(*) from storage.objects)>0 then
   raise exception 'Terceiro le imagens'; end if;
 if (select count(*) from public.service_requests)>0 then
   raise exception 'Terceiro le solicitação'; end if;
end $deny$;

-- Prestador Beta convidado ganha apenas leitura da foto e dos dados permitidos.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
do $allow$
begin
 if (select count(*) from public.f2_request_offers)<>1 then
   raise exception 'Destinatário sem convite'; end if;
 if (select count(*) from public.service_requests)<>1 then
   raise exception 'Destinatário sem dados mínimos do pedido'; end if;
 if (select count(*) from storage.objects)<>1 then
   raise exception 'Destinatário sem acesso à foto'; end if;
end $allow$;

-- Um único prestador confirma o próprio convite: ACK autenticado.
select public.f2_ack_offer((select id from public.f2_request_offers
  where provider_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')) as ack_beta \gset
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select public.f2_ack_offer((select id from public.f2_request_offers
  where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) as ack_alfa \gset

-- Testar itemização: não aceitar serviço ausente ou falta de deslocamento.
do $missing$
declare v_offer uuid;
begin
  select id into v_offer from public.f2_request_offers
   where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  begin
    perform public.f2_submit_quote(v_offer,
      '[{"kind":"service","code":"pneu_furado","amountCents":8000}]'::jsonb);
    raise exception using message='FAIL: itens incompletos',errcode='ZX003';
  exception when others then if sqlstate='ZX003' then raise; end if;
  end;
end $missing$;

select public.f2_submit_quote(
  (select id from public.f2_request_offers
   where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '[{"kind":"service","code":"pneu_furado","amountCents":8000},
    {"kind":"service","code":"troca_camara","amountCents":3500},
    {"kind":"travel","code":"deslocamento","amountCents":1500},
    {"kind":"part","code":"Camara nova","amountCents":4500}]'::jsonb,
  'Orçamento Alfa fictício'
) as quote_a \gset
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
select public.f2_submit_quote(
  (select id from public.f2_request_offers
   where provider_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  '[{"kind":"service","code":"pneu_furado","amountCents":7500},
    {"kind":"service","code":"troca_camara","amountCents":3200},
    {"kind":"travel","code":"deslocamento","amountCents":1000}]'::jsonb,
  'Orçamento Beta fictício'
) as quote_b \gset

-- Autor pode ler ambas as propostas; prestador Beta não lê itens de Alfa.
do $item$
begin
 if (select count(*) from public.f2_quote_items)<>3 then
   raise exception 'Prestador leu itens de outro concorrente'; end if;
end $item$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $totals$
begin
 if (select amount_cents from public.service_quotes where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and request_id='11111111-aaaa-4111-8111-111111111111')<>17500
   or (select amount_cents from public.service_quotes where provider_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and request_id='11111111-aaaa-4111-8111-111111111111')<>11700
 then raise exception 'Total do orçamento nao reflete itens'; end if;
end $totals$;

-- Prestador/terceiro não podem escolher vencedor, mesmo conhecendo UUID de proposta.
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
do $not_owner$
begin
  begin
    perform public.f2_decide_quote('00000000-0000-4000-8000-000000000001',true);
    raise exception using message='FAIL: outro usuário aceitou',errcode='ZX004';
  exception when others then if sqlstate='ZX004' then raise; end if;
  end;
end $not_owner$;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.f2_decide_quote(:'quote_b'::uuid,true) as accepted_state \gset
do $winner$
begin
  if (select provider_id from public.service_requests
      where id='11111111-aaaa-4111-8111-111111111111')
        <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
  then raise exception 'Prestador vencedor errado'; end if;
  if (select status from public.service_requests
      where id='11111111-aaaa-4111-8111-111111111111')<>'awaiting_payment'
  then raise exception 'Aceite nao parou em aguardando pagamento'; end if;
  if (select count(*) from public.service_quotes where
      request_id='11111111-aaaa-4111-8111-111111111111' and status='accepted')<>1
  then raise exception 'Mais de uma proposta aceita'; end if;
  if (select status from public.service_quotes where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and request_id='11111111-aaaa-4111-8111-111111111111')<>'expired'
  then raise exception 'Proposta perdedora nao foi fechada'; end if;
  begin
    perform public.f2_decide_quote('00000000-0000-4000-8000-000000000001',true);
    raise exception using message='FAIL: segundo aceite aceito',errcode='ZX005';
  exception when others then if sqlstate='ZX005' then raise; end if;
  end;
end $winner$;

-- Prestador Alfa deixa de ver a foto após a seleção de Beta.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
do $after$
begin
 if (select count(*) from storage.objects)<>0 then
   raise exception 'Prestador perdedor manteve acesso à foto'; end if;
end $after$;

-- Um novo pedido permite testar expiração e contabilização sem notificações reais.
reset role;
insert into public.service_requests(id,customer_id,provider_id,category_id,service_types,
  latitude,longitude) values(
 '55555555-5555-4555-8555-555555555555',
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,array['pneu_furado','troca_camara'],
 -19.924,-43.938);
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.f2_offer_candidates('55555555-5555-4555-8555-555555555555',1);
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select public.f2_ack_offer((select id from public.f2_request_offers
  where request_id='55555555-5555-4555-8555-555555555555'));
reset role;
update public.f2_request_offers
set offered_at=now()-interval '7 minutes',
    delivered_at=now()-interval '6 minutes'
where request_id='55555555-5555-4555-8555-555555555555';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.f2_expire_offers('55555555-5555-4555-8555-555555555555') as expired_count \gset
do $timeout$
begin
 if (select count(*) from public.f2_request_offers
     where request_id='55555555-5555-4555-8555-555555555555'
       and status='expired')<>1
 then raise exception 'Nao expirou após 5min de ACK confirmado'; end if;
end $timeout$;

-- RPCs não liberam checkout, chat, push, nem transição paid.
select 'F2: MULTI-OFERTAS + RLS + ORÇAMENTO ITEMIZADO + VENCEDOR ÚNICO PASSARAM' as resultado;
rollback;