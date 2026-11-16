-- F4 RISK MOCK: apenas PostgreSQL17 descartável. ROLLBACK final.
-- Precondição do CI: base F2, F4 mock, double-entry mock e risco já instalados.
\set ON_ERROR_STOP on
begin;
do $preflight$
begin
 if (select enabled from private.f4_release_gate where singleton)
 then raise exception 'F4 gate chegou habilitado'; end if;
 if (select count(*) from private.f4_mock_payment_attempts)<>1
   or (select status from private.f4_mock_payment_attempts)<>'mock_verified'
 then raise exception 'Fixture de concorrência anterior ausente'; end if;
 if exists(select 1 from private.f4_mock_risk_cases)
   or exists(select 1 from private.f4_mock_settlement_intents)
 then raise exception 'Risco e repasses chegaram com registros'; end if;
 if has_table_privilege('authenticated','private.f4_mock_risk_cases','SELECT')
   or has_table_privilege('authenticated','private.f4_mock_settlement_intents','INSERT')
   or has_function_privilege('authenticated',
      'private.f4_open_mock_risk_case(uuid,text,text,integer)','EXECUTE')
   or has_function_privilege('anon',
      'private.f4_queue_mock_settlement_review(uuid,text,boolean,boolean)','EXECUTE')
 then raise exception 'Acesso cliente/anon à fila de risco/repasses'; end if;
end $preflight$;
reset role;
do $gate_off$
begin
 begin
   perform private.f4_open_mock_risk_case(
     (select id from private.f4_mock_payment_attempts limit 1),
     'case_mock_disabled_001','refund_partial',2000);
   raise exception using message='FALHA: caso criado com gate off',errcode='ZX701';
 exception when others then
  if sqlstate='ZX701' then raise; end if;
  if sqlerrm not like '%indisponível%' then raise; end if;
 end;
end $gate_off$;

-- Somente conta SQL da fixture pode operar; nunca na API Auth.
set role authenticated;
do $auth_denied$
begin
 begin
   perform private.f4_open_mock_risk_case(
     (select id from public.service_requests limit 1),
     'case_mock_denied_0001','dispute',100);
   raise exception using message='FALHA: authenticated invocou RPC privada',errcode='ZX702';
 exception when others then if sqlstate='ZX702' then raise; end if;
 end;
end $auth_denied$;
reset role;
select set_config('app.f4_test_only','local_fixture',true);
update private.f4_release_gate set enabled=true;

-- Caso só pode ser aberto após lançamento do mock payment no ledger.
select private.f4_post_mock_double_entry(
 (select id from private.f4_mock_webhook_receipts
  where mock_event_id='evt_concurrent_mock_001')) as journal_id \gset
select id as attempt_id from private.f4_mock_payment_attempts limit 1 \gset
select set_config('test.f4_risk_attempt',:'attempt_id',true);

-- A dupla confirmação é APENAS fixture. A função sempre retorna transferAuthorized=false.
select private.f4_queue_mock_settlement_review(
 current_setting('test.f4_risk_attempt')::uuid,
 'settle_mock_review_0001',true,true) as first_intent \gset
select set_config('test.f4_intent_result',:'first_intent',true);
select private.f4_queue_mock_settlement_review(
 current_setting('test.f4_risk_attempt')::uuid,
 'settle_mock_review_0001',true,true) as repeat_intent \gset
select set_config('test.f4_intent_duplicate',:'repeat_intent',true);
do $idempotency$
declare first_json jsonb:=current_setting('test.f4_intent_result')::jsonb;
        second_json jsonb:=current_setting('test.f4_intent_duplicate')::jsonb;
begin
 if first_json->>'intentId' is distinct from second_json->>'intentId'
    or (first_json->>'transferAuthorized')::boolean is distinct from false
    or (first_json->>'pspFundsConfirmed')::boolean is distinct from false
    or (second_json->>'idempotent')::boolean is distinct from true
    or (select count(*) from private.f4_mock_settlement_intents)<>1
 then raise exception 'Intenção financeira mock duplicou ou autorizou dinheiro'; end if;
end $idempotency$;
do $unilateral$
declare attempt_id uuid:=current_setting('test.f4_risk_attempt')::uuid;
begin
 begin
  perform private.f4_queue_mock_settlement_review(attempt_id,
    'settle_mock_wrong_key',false,true);
  raise exception using message='FALHA: confirmação unilateral',errcode='ZX703';
 exception when others then if sqlstate='ZX703' then raise; end if;
 end;
 begin
  perform private.f4_queue_mock_settlement_review(attempt_id,
    'settle_mock_new_key_01',true,true);
  raise exception using message='FALHA: segunda intenção',errcode='ZX704';
 exception when others then
  if sqlstate='ZX704' then raise; end if;
  if sqlerrm not like '%intenção de revisão diferente%' then raise; end if;
 end;
end $unilateral$;

select private.f4_open_mock_risk_case(
 current_setting('test.f4_risk_attempt')::uuid,
 'case_mock_partial_0001','refund_partial',7000) as partial_case \gset
select set_config('test.f4_partial_case',:'partial_case',true);
select private.f4_open_mock_risk_case(
 current_setting('test.f4_risk_attempt')::uuid,
 'case_mock_partial_0001','refund_partial',7000) as duplicate_case \gset
select set_config('test.f4_case_duplicate',:'duplicate_case',true);
do $held$
begin
 if current_setting('test.f4_partial_case')<>current_setting('test.f4_case_duplicate')
   or (select count(*) from private.f4_mock_risk_cases)<>1
   or (select status from private.f4_mock_settlement_intents)<>'held'
   or (select held_at from private.f4_mock_settlement_intents) is null
 then raise exception 'Risco não bloqueou intenção financeira existente'; end if;
end $held$;
do $overcommit$
declare a uuid:=current_setting('test.f4_risk_attempt')::uuid;
begin
 begin
   perform private.f4_open_mock_risk_case(a,
    'case_mock_partial_over','refund_partial',25000);
   raise exception using message='FALHA: excedeu valor de orçamento',errcode='ZX705';
 exception when others then
   if sqlstate='ZX705' then raise; end if;
   if sqlerrm not like '%excedem orçamento%' then raise; end if;
 end;
 begin
   perform private.f4_open_mock_risk_case(a,
    'case_mock_full_conflict','refund_full',29300);
   raise exception using message='FALHA: estorno integral após parcial',errcode='ZX706';
 exception when others then
   if sqlstate='ZX706' then raise; end if;
   if sqlerrm not like '%excedem orçamento%' then raise; end if;
 end;
 begin
   perform private.f4_open_mock_risk_case(a,
    'case_mock_partial_0001','refund_partial',8000);
   raise exception using message='FALHA: chave repetida com valor diferente',errcode='ZX707';
 exception when others then
   if sqlstate='ZX707' then raise; end if;
   if sqlerrm not like '%Chave de caso reutilizada%' then raise; end if;
 end;
 begin
   perform private.f4_queue_mock_settlement_review(a,
    'settle_mock_review_0001',true,true);
   raise exception using message='FALHA: risco não bloqueou repasse',errcode='ZX708';
 exception when others then
   if sqlstate='ZX708' then raise; end if;
   if sqlerrm not like '%risco financeiro aberto%' then raise; end if;
 end;
end $overcommit$;
select private.f4_close_mock_risk_case(current_setting('test.f4_partial_case')::uuid);
do $no_reopen$
declare a uuid:=current_setting('test.f4_risk_attempt')::uuid;
begin
 if (select status from private.f4_mock_settlement_intents)<>'held'
 then raise exception 'Fechar disputa reativou repasse automaticamente'; end if;
 begin
  perform private.f4_queue_mock_settlement_review(a,
     'settle_mock_review_0001',true,true);
  raise exception using message='FALHA: intenção held reativada',errcode='ZX709';
 exception when others then
  if sqlstate='ZX709' then raise; end if;
  if sqlerrm not like '%já está bloqueada%' then raise; end if;
 end;
end $no_reopen$;

-- Segundo pedido fictício para simular refund_full e colisão de idempotência.
insert into public.service_requests(id,customer_id,provider_id,category_id,
 service_types,status)
values('dddddddd-3333-4333-8333-dddddddddddd',
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,
 array['pneu_furado'],'awaiting_payment');
insert into public.service_quotes(id,request_id,provider_id,amount_cents,status)
values('eeeeeeee-3333-4333-8333-eeeeeeeeeeee',
 'dddddddd-3333-4333-8333-dddddddddddd',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',10000,'accepted');
insert into public.f2_quote_items(quote_id,line_no,kind,code,amount_cents)
 values('eeeeeeee-3333-4333-8333-eeeeeeeeeeee',1,'service','pneu_furado',9000),
 ('eeeeeeee-3333-4333-8333-eeeeeeeeeeee',2,'travel','deslocamento',1000);
select private.f4_prepare_mock_attempt('eeeeeeee-3333-4333-8333-eeeeeeeeeeee')
 as next_attempt \gset
select set_config('test.f4_risk_other',:'next_attempt',true);
select private.f4_ingest_mock_event(
 current_setting('test.f4_risk_other')::uuid,
 'evt_mock_other_verified','mock_payment_verified',10000);
select private.f4_post_mock_double_entry(
 (select id from private.f4_mock_webhook_receipts
   where mock_event_id='evt_mock_other_verified'));

do $cross_attempt$
begin
 begin
  perform private.f4_open_mock_risk_case(
     current_setting('test.f4_risk_other')::uuid,
     'case_mock_partial_0001','refund_partial',7000);
  raise exception using message='FALHA: mesma chave em outro pedido',errcode='ZX710';
 exception when others then
  if sqlstate='ZX710' then raise; end if;
  if sqlerrm not like '%Chave de caso reutilizada%' then raise; end if;
 end;
end $cross_attempt$;
select private.f4_open_mock_risk_case(
  current_setting('test.f4_risk_other')::uuid,
  'case_mock_full_00001','refund_full',10000);
do $full$
begin
 if (select count(*) from private.f4_mock_risk_cases
   where kind='refund_full' and status='review_required')<>1
 then raise exception 'Caso de reembolso integral mock ausente'; end if;
 if (select count(*) from private.f4_mock_journals
   where attempt_id=current_setting('test.f4_risk_other')::uuid)<>1
 then raise exception 'Solicitar reembolso executou lançamentos reais'; end if;
 if (select status from public.service_requests
   where id='dddddddd-3333-4333-8333-dddddddddddd')<>'awaiting_payment'
 then raise exception 'Solicitar reembolso fictício alterou estado comercial'; end if;
end $full$;

-- Chargeback mock só abre caso humano, não lança nova movimentação PSP.
select private.f4_open_mock_risk_case(
 current_setting('test.f4_risk_attempt')::uuid,
 'case_mock_chargeback','chargeback',29300);
do $chargeback$
begin
 if (select count(*) from private.f4_mock_risk_cases
   where kind='chargeback')<>1
 then raise exception 'Chargeback mock não criou hold'; end if;
 if (select count(*) from private.f4_mock_journals)<>2
 then raise exception 'Chargeback mock criou lançamento no PSP'; end if;
 begin
  perform private.f4_open_mock_risk_case(
    current_setting('test.f4_risk_attempt')::uuid,
    'case_mock_refund_on_dispute','refund_partial',1000);
  raise exception using message='FALHA: estorno novo durante chargeback',errcode='ZX711';
 exception when others then
   if sqlstate='ZX711' then raise; end if;
   if sqlerrm not like '%disputado exige mediação%' then raise; end if;
 end;
end $chargeback$;
select 'F4: RISCO PRIVADO, ESTORNO PARCIAL/INTEGRAL, HOLDS E 1 INTENÇÃO REVIEW-ONLY OK' as resultado;
rollback;
