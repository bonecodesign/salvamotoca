-- Functional proof over the actual 11-migration history + candidate overlay.
-- Entire test is rolled back, never executed against the hosted project.
begin;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444');
insert into public.providers(id,owner_id,display_name,city,state_code,latitude,longitude,status,is_active,approved_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','Fixture A','Betim','MG',-19.925,-43.939,'approved',true,now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','Fixture B','Contagem','MG',-19.926,-43.938,'approved',true,now());
insert into public.provider_services(provider_id,category_id,is_active)
 select id,2,true from public.providers;
insert into public.bj_provider_presence(provider_id,online_requested,last_seen_at)
 select id,true,now() from public.providers;
insert into public.f2_provider_capacity(provider_id,service_types,coverage_km)
 select id,array['pneu_furado'],60 from public.providers;
insert into storage.objects(bucket_id,name) values
 ('request-photos','11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-777777777777.jpg');

set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $test$
begin
 begin
  insert into public.service_requests(id,request_key,customer_id,category_id,service_types,
    motorcycle_brand,motorcycle_model,motorcycle_year,photo_path,latitude,longitude,problem_description,f2_mode)
  values('77777777-7777-4777-8777-777777777777','77777777-7777-4777-8777-777777777777',auth.uid(),2,array['pneu_furado'],
    'Honda','CG 160',2024,'11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-777777777777.jpg',
    -19.924,-43.938,'Problema sintetico','automatic');
  raise exception using errcode='ZX001',message='Gate false aceitou pedido';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
update private.f2_release_gate set enabled=true;
set local role authenticated;
insert into public.service_requests(id,request_key,customer_id,category_id,service_types,
 motorcycle_brand,motorcycle_model,motorcycle_year,photo_path,latitude,longitude,problem_description,f2_mode)
values('77777777-7777-4777-8777-777777777777','77777777-7777-4777-8777-777777777777',auth.uid(),2,array['pneu_furado'],
 'Honda','CG 160',2024,'11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-777777777777.jpg',
 -19.924,-43.938,'Problema sintetico','automatic');
do $test$ begin
 if public.f2_offer_candidates('77777777-7777-4777-8777-777777777777',3)<>2 then raise exception 'Dois candidatos esperados';end if;
end $test$;
reset role;
select id as offer_a from public.f2_request_offers where provider_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' \gset
select id as offer_b from public.f2_request_offers where provider_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' \gset
set local role authenticated;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select public.f2_ack_offer(:'offer_a');
select public.f2_submit_quote(:'offer_a','[{"kind":"service","code":"pneu_furado","amountCents":23000},{"kind":"travel","code":"deslocamento","amountCents":4000}]','Fixture A') as qa \gset
set local request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
select public.f2_ack_offer(:'offer_b');
select public.f2_submit_quote(:'offer_b','[{"kind":"service","code":"pneu_furado","amountCents":24000},{"kind":"travel","code":"deslocamento","amountCents":4000}]','Fixture B') as qb \gset
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select set_config('test.qa',:'qa',true);
do $test$
begin
 if (select count(*) from public.service_quotes where status='proposed')<>2 then raise exception 'Comparacao de propostas falhou';end if;
 begin
  perform public.bj_answer_quote(current_setting('test.qa')::uuid,true);
  raise exception using errcode='ZX002',message='RPC legada aceitou proposta gerenciada';
 exception when others then if sqlstate='ZX002' or sqlerrm not like 'Pedido gerenciado:%' then raise;end if;end;
 if public.f2_decide_quote(current_setting('test.qa')::uuid,true)<>'awaiting_payment'
 then raise exception 'Aceite F2 falhou';end if;
end $test$;
reset role;
do $test$
begin
 if (select count(*) from public.service_quotes where status='accepted')<>1
 or (select count(*) from public.service_quotes where status='expired')<>1
 or (select count(*) from public.f2_request_offers where status='selected')<>1
 or (select count(*) from public.payment_records)<>0
 then raise exception 'Escolha unica ou ausencia de pagamento falhou';end if;
end $test$;
set local role authenticated;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $test$
begin
 if exists(select 1 from public.bj_get_request_location('77777777-7777-4777-8777-777777777777'))
 then raise exception 'Localizacao antes do pagamento';end if;
 begin
  insert into public.request_messages(request_id,sender_id,body) values('77777777-7777-4777-8777-777777777777',auth.uid(),'Fixture');
  raise exception using errcode='ZX003',message='Chat antes do pagamento';
 exception when insufficient_privilege then null;end;
end $test$;
reset role;
-- Legacy path still allows the old assigned provider flow, exactly one quote.
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
insert into public.service_requests(id,customer_id,category_id,provider_id,problem_description)
 values('88888888-8888-4888-8888-888888888888',auth.uid(),2,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Pedido legado sintetico');
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select public.bj_submit_quote('88888888-8888-4888-8888-888888888888',10000,'Fixture legado') as legacy_quote \gset
reset role;
do $test$
begin
 begin
  insert into public.service_quotes(request_id,provider_id,amount_cents,status)
   values('88888888-8888-4888-8888-888888888888','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',12000,'proposed');
  raise exception using errcode='ZX004',message='Segunda proposta legada aceita';
 exception when others then if sqlstate='ZX004' or sqlerrm not like 'Pedido legado permite%' then raise;end if;end;
end $test$;
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select set_config('test.legacy_quote',:'legacy_quote',true);
do $test$
begin
 if public.bj_answer_quote(current_setting('test.legacy_quote')::uuid,true)<>'awaiting_payment'
 then raise exception 'Compatibilidade legada falhou';end if;
 if public.bj_finish_request('88888888-8888-4888-8888-888888888888')<>'cancelled'
 then raise exception 'Cancelamento legado falhou';end if;
end $test$;
reset role;
rollback;
select 'MANAGED_MULTI_QUOTE=PASS LEGACY_SINGLE_QUOTE=PASS CHAT_LOCATION_BEFORE_PAYMENT=DENIED RELEASE=NO_GO';
