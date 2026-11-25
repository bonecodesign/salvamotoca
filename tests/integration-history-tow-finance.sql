-- Replayed historical DB only. Roll back every fixture.
begin;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333');
insert into public.providers(id,owner_id,display_name,city,state_code,latitude,longitude,status,is_active,approved_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','Fixture Reboque','Betim','MG',-19.925,-43.939,'approved',true,now());
insert into public.provider_services(provider_id,category_id,is_active)
 select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id,true from public.service_categories where code='reboque_moto';
insert into public.f3_tow_provider_capacity(provider_id,equipment,max_moto_kg,coverage_km,tie_down_points,has_ramp,has_wheel_chock,verified_by_admin)
 values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','plataforma',220,60,4,true,true,true);
insert into storage.objects(bucket_id,name) values
 ('request-photos','11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-777777777777.jpg');
set local role authenticated;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $test$
begin
 begin
  perform public.bj_set_presence(true);
  raise exception using errcode='ZX001',message='Reboque online com gate desligado';
 exception when others then if sqlstate='ZX001' or sqlerrm not like 'Prestador ou modalidade%' then raise;end if;end;
end $test$;
reset role;
update private.f2_release_gate set enabled=true;
update private.f3_release_gate set enabled=true;
update private.f4_release_gate set enabled=true;
set local role authenticated;
do $test$
begin
 if not public.bj_set_presence(true) or not public.bj_ping_presence() then raise exception 'Presenca de reboque nao habilitada na fixture';end if;
end $test$;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select public.f3_create_tow_request('77777777-7777-4777-8777-777777777777',
 '11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-777777777777.jpg',
 'Honda','CG 160',2024,140,array['reboque_moto'],'Reboque sintetico de teste',
 -19.924,-43.938,'Betim','MG','Nova Lima','MG','Destino sintetico privado',25,'automatic',null) as request_id \gset
select set_config('test.request_id',:'request_id',true);
do $test$ begin
 if public.f3_offer_candidates(current_setting('test.request_id')::uuid,3)<>1 then raise exception 'Prestador exclusivo de reboque nao encontrado';end if;
end $test$;
reset role;
select id as offer_id from public.f2_request_offers where request_id=:'request_id' \gset
set local role authenticated;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select public.f2_ack_offer(:'offer_id');
select public.f3_submit_tow_quote(:'offer_id',
 '[{"kind":"service","code":"reboque_moto","amountCents":23000},{"kind":"travel","code":"deslocamento","amountCents":4000}]','Fixture') as quote_id \gset
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select public.f3_decide_tow_quote(:'quote_id',true);
select set_config('test.quote_id',:'quote_id',true);
do $test$
declare p jsonb;
begin
 p:=public.f4_quote_preview(current_setting('test.quote_id')::uuid);
 if (p->>'customerSubtotalBeforeProcessingCents')::integer is distinct from 29300
 or (p->>'expectedProviderCents')::integer is distinct from 24700
 or (p->>'commissionCents')::integer is distinct from 4600
 or p->'processingFeeCents' is distinct from 'null'::jsonb
 or p->'paymentAuthorized' is distinct from 'false'::jsonb
 then raise exception 'Comissao aprovada nao corresponde';end if;
end $test$;
reset role;
set local app.f4_test_only='local_fixture';
select private.f4_prepare_mock_attempt(:'quote_id') as attempt_id \gset
select private.f4_ingest_mock_event(:'attempt_id','fixture_tow_payment','mock_payment_verified',29300);
do $test$
begin
 if (select count(*) from public.payment_records)<>0
 or (select status from public.service_requests where id=current_setting('test.request_id')::uuid)<>'awaiting_payment'
 then raise exception 'Mock ativou fluxo real';end if;
 begin
  insert into public.payment_records(request_id,gross_amount_cents,commission_percent,status)
  values(current_setting('test.request_id')::uuid,27000,15,'paid');
  raise exception using errcode='ZX002',message='Pagamento legado em pedido gerenciado';
 exception when others then if sqlstate='ZX002' or sqlerrm not like 'Pagamento legado%' then raise;end if;end;
end $test$;
-- An accepted quote alone or a fabricated confirmation does not qualify.
update private.f5_mock_release_gate set enabled=true;
update private.f6_mock_release_gate set enabled=true;
select set_config('test.attempt_id',:'attempt_id',true);
do $test$
begin
 begin
  insert into public.f5_mock_sessions(request_id,quote_id,customer_id,provider_id,provider_owner_id,mock_paid,status)
  values(current_setting('test.request_id')::uuid,current_setting('test.quote_id')::uuid,
   '11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '22222222-2222-4222-8222-222222222222',true,'ready_for_dispatch');
  raise exception using errcode='ZX010',message='Sessao sem diario admitida';
 exception when others then if sqlstate='ZX010' or sqlerrm not like 'Sessao mock exige%' then raise;end if;end;
end $test$;
select private.f4_post_mock_double_entry(id) from private.f4_mock_webhook_receipts where mock_event_id='fixture_tow_payment';
do $test$
begin
 begin
  perform private.f4_queue_mock_settlement_review(current_setting('test.attempt_id')::uuid,'settle_tow_fixture',true,true);
  raise exception using errcode='ZX011',message='Confirmacoes inventadas admitidas';
 exception when others then if sqlstate='ZX011' or sqlerrm not like 'Revisao exige%' then raise;end if;end;
end $test$;
insert into public.f5_mock_sessions(id,request_id,quote_id,customer_id,provider_id,provider_owner_id,mock_paid,status)
 values('55555555-5555-4555-8555-555555555555',:'request_id',:'quote_id','11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222',true,'ready_for_dispatch');
set local role authenticated;
set local app.f5_test_only='local_fixture';
set local app.f6_test_only='local_fixture';
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $test$ begin
 begin
  perform public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000001','dispatch','{"consent":true}');
  raise exception using errcode='ZX020',message='Cliente despachou';
 exception when others then if sqlstate='ZX020' or sqlerrm not like 'Papel nao autorizado%' then raise;end if;end;
end $test$;
select public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000002','message','{"body":"Mensagem sintetica"}');
do $test$ begin
 if (public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000002','message','{"body":"Mensagem sintetica"}')->>'idempotent')::boolean is distinct from true then raise exception 'Replay falhou';end if;
 begin
  perform public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000002','message','{"body":"Outro texto"}');
  raise exception using errcode='ZX021',message='Replay divergente';
 exception when others then if sqlstate='ZX021' or sqlerrm not like 'Evento reutilizado%' then raise;end if;end;
end $test$;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000003','dispatch','{"consent":true}');
select public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000004','location',jsonb_build_object('lat',-19.92,'lng',-43.93,'accuracy',15,'sampledAt',now()));
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $test$ begin
 if (select count(*) from public.f5_mock_latest_location)<>1 or (select count(*) from public.f5_mock_messages)<>1 then raise exception 'Participante nao ve fixture';end if;
end $test$;
set local request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
do $test$ begin
 if (select count(*) from public.f5_mock_latest_location)<>0 or (select count(*) from public.f5_mock_messages)<>0 then raise exception 'Terceiro acessou fixture';end if;
 begin
  perform public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000005','message','{"body":"Terceiro"}');
  raise exception using errcode='ZX022',message='Terceiro gravou';
 exception when others then if sqlstate='ZX022' or sqlerrm not like 'Sessao nao autorizada%' then raise;end if;end;
end $test$;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000006','arrive','{}');
select public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000007','start','{}');
select public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000008','handoff','{}');
select public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000009','summary','{"body":"Resumo sintetico de atendimento"}');
select public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000010','provider_confirm','{}');
reset role;
do $test$ begin
 if exists(select 1 from public.f5_mock_latest_location) then raise exception 'GPS nao removido';end if;
end $test$;
do $test$ begin
 begin
  perform private.f4_queue_mock_settlement_review(current_setting('test.attempt_id')::uuid,'settle_tow_fixture',true,true);
  raise exception using errcode='ZX012',message='Confirmacao unilateral admitida';
 exception when others then if sqlstate='ZX012' or sqlerrm not like 'Revisao exige%' then raise;end if;end;
end $test$;
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000011','customer_confirm','{"summaryRead":true}');
select public.f56_apply_fixture('55555555-5555-4555-8555-555555555555','77777777-7777-4777-8777-000000000012','rating','{"stars":5}');
reset role;
select 'F56_AUTHENTICATED_FIXTURE=PASS WRONG_ROLE=DENIED REPLAY=PASS GPS_REMOVED=PASS';
do $test$
declare p jsonb;
begin
 p:=private.f4_queue_mock_settlement_review(current_setting('test.attempt_id')::uuid,'settle_tow_fixture',true,true);
 if p->>'status' is distinct from 'review_only' or p->'transferAuthorized' is distinct from 'false'::jsonb then raise exception 'Revisao sem transferencia esperada';end if;
end $test$;
update private.f23_mock_support_gate set enabled=true;
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select public.f23_mock_submit_incident('99999999-9999-4999-8999-999999999999',:'request_id','payment_dispute');
reset role;
do $test$
begin
 if (select status from private.f4_mock_settlement_intents where attempt_id=current_setting('test.attempt_id')::uuid) is distinct from 'held' then raise exception 'Incidente nao bloqueou revisao';end if;
 begin
  perform private.f4_queue_mock_settlement_review(current_setting('test.attempt_id')::uuid,'settle_tow_fixture',true,true);
  raise exception using errcode='ZX013',message='Revisao com incidente aberto admitida';
 exception when others then if sqlstate='ZX013' or sqlerrm not like 'Revisao exige%' then raise;end if;end;
 if exists(select 1 from public.payment_records) then raise exception 'Pagamento real criado';end if;
end $test$;
select 'PERSISTED_F456=PASS FORGED_CONFIRMATION=DENIED INCIDENT_HOLD=PASS TRANSFER=NONE';
-- Historical amount semantics remain intact on a distinct legacy request.
insert into public.service_requests(id,customer_id,category_id,provider_id,problem_description,status)
 values('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111',2,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Historico sintetico','completed');
insert into public.payment_records(request_id,gross_amount_cents,commission_percent,status)
 values('88888888-8888-4888-8888-888888888888',10000,15,'paid');
do $test$
begin
 if (select platform_fee_cents from public.payment_records where request_id='88888888-8888-4888-8888-888888888888')<>1500
 then raise exception 'Historico alterado';end if;
 begin
  update public.service_requests set f2_mode='automatic' where id='88888888-8888-4888-8888-888888888888';
  raise exception using errcode='ZX003',message='Conversao de historico financeiro permitida';
 exception when others then if sqlstate='ZX003' or sqlerrm not like 'Pedido com pagamento legado%' then raise;end if;end;
end $test$;
-- Revocation immediately checked at heartbeat, cannot remain online.
update public.f3_tow_provider_capacity set verified_by_admin=false;
set local role authenticated;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $test$ begin if public.bj_ping_presence() then raise exception 'Presenca nao revogada';end if;end $test$;
reset role;
do $test$ begin
 if exists(select 1 from public.bj_provider_presence where online_requested or last_seen_at is not null)
 then raise exception 'Presenca residual';end if;
end $test$;
rollback;
select 'TOW_ONLY_PRESENCE=PASS F4_10_PLUS_10=PASS LEGACY_15_ISOLATED=PASS MOCK_NO_REAL_PAYMENT=PASS RELEASE=NO_GO';
