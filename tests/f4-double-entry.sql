-- F4 double-entry MOCK: só PostgreSQL 17 de CI, transação revertida.
-- Pré-requisito: f4-concurrency.sh criou uma tentativa mock verificada.
\set ON_ERROR_STOP on
begin;
do $preflight$
begin
  if (select count(*) from private.f4_mock_payment_attempts)<>1
    or (select count(*) from private.f4_mock_webhook_receipts)<>1
    or (select status from private.f4_mock_payment_attempts)<>'mock_verified'
  then raise exception 'Fixture de concorrência F4 ausente'; end if;
  if (select enabled from private.f4_release_gate)
  then raise exception 'Gate deve começar desligado'; end if;
  if has_table_privilege('authenticated','private.f4_mock_journals','SELECT')
    or has_table_privilege('authenticated','private.f4_mock_journal_lines','INSERT')
    or has_function_privilege('authenticated','private.f4_post_mock_double_entry(bigint)','EXECUTE')
    or has_function_privilege('anon','private.f4_mock_settlement_review(uuid,boolean,boolean,boolean)','EXECUTE')
  then raise exception 'Permissões de diário financeiro expostas'; end if;
end $preflight$;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $no_browser$
begin
 begin
   perform private.f4_post_mock_double_entry(1);
   raise exception using message='FALHA: cliente lançou entradas',errcode='ZX601';
 exception when others then if sqlstate='ZX601' then raise; end if;
 end;
end $no_browser$;
reset role;
select set_config('app.f4_test_only','local_fixture',false);
do $closed$
begin
 begin
   perform private.f4_post_mock_double_entry(
    (select id from private.f4_mock_webhook_receipts limit 1));
   raise exception using message='FALHA: gate desligado autorizou journal',errcode='ZX602';
 exception when others then
   if sqlstate='ZX602' then raise; end if;
   if sqlerrm not like '%desativado%' then raise; end if;
 end;
end $closed$;
update private.f4_release_gate set enabled=true;

select private.f4_post_mock_double_entry(
  (select id from private.f4_mock_webhook_receipts limit 1)) as payment_journal \gset
select set_config('test.f4_journal',:'payment_journal',false);
select private.f4_post_mock_double_entry(
  (select id from private.f4_mock_webhook_receipts limit 1)) as duplicate_journal \gset
select set_config('test.f4_journal_duplicate',:'duplicate_journal',false);
do $balanced$
declare v_id bigint:=current_setting('test.f4_journal')::bigint;
begin
 if v_id<>current_setting('test.f4_journal_duplicate')::bigint
   or (select count(*) from private.f4_mock_journals)<>1
   or (select count(*) from private.f4_mock_journal_lines)<>3
   or (select sum(amount_cents) from private.f4_mock_journal_lines
      where side='debit')<>29300
   or (select sum(amount_cents) from private.f4_mock_journal_lines
      where side='credit')<>29300
   or (select amount_cents from private.f4_mock_journal_lines
      where account='mock_platform_commission')<>4600
   or (select amount_cents from private.f4_mock_journal_lines
      where account='mock_provider_payable')<>24700
 then raise exception 'Partidas dobradas do pagamento mock inválidas'; end if;
end $balanced$;

do $review$
declare j jsonb;v_attempt uuid;
begin
 select id into v_attempt from private.f4_mock_payment_attempts limit 1;
 select private.f4_mock_settlement_review(v_attempt,true,true,false) into j;
 if (j->>'eligibleForHumanReview')::boolean is distinct from true
   or (j->>'transferAuthorized')::boolean is distinct from false
   or (j->>'providerPayableMockCents')::integer<>24700
 then raise exception 'Confirmação bilateral mock não apenas revisou'; end if;
 select private.f4_mock_settlement_review(v_attempt,true,false,false) into j;
 if (j->>'eligibleForHumanReview')::boolean
 then raise exception 'Confirmação unilateral permitiu repasse'; end if;
 select private.f4_mock_settlement_review(v_attempt,true,true,true) into j;
 if (j->>'eligibleForHumanReview')::boolean
 then raise exception 'Disputa permitiu repasse'; end if;
end $review$;

-- Estorno completo: um débito de passivo e comissão + crédito de clearing.
select private.f4_ingest_mock_event(
 (select id from private.f4_mock_payment_attempts limit 1),
 'evt_mock_refund_journal_001','mock_refund_confirmed',29300);
select private.f4_post_mock_double_entry(
 (select id from private.f4_mock_webhook_receipts
   where mock_event_id='evt_mock_refund_journal_001')) as refund_journal \gset
do $refunded$
declare j jsonb;v_attempt uuid;
begin
 select id into v_attempt from private.f4_mock_payment_attempts limit 1;
 if (select count(*) from private.f4_mock_journals)<>2
   or (select count(*) from private.f4_mock_journal_lines)<>6
   or (select sum(case when l.side='debit' then l.amount_cents
                    else -l.amount_cents end)
      from private.f4_mock_journal_lines l)<>0
 then raise exception 'Estorno contábil não zerou débitos e créditos'; end if;
 if exists(select 1 from (
     select account,sum(case when side='debit' then amount_cents
                       else -amount_cents end) as balance
     from private.f4_mock_journal_lines group by account
   ) s where balance<>0)
 then raise exception 'Conta contábil não zerou no estorno'; end if;
 select private.f4_mock_settlement_review(v_attempt,true,true,false) into j;
 if (j->>'eligibleForHumanReview')::boolean
 then raise exception 'Estorno integral permitiu repasse'; end if;
end $refunded$;

-- Histórico é imutável: toda correção é um novo lançamento compensatório.
do $immutable$
begin
 begin
   update private.f4_mock_journal_lines set amount_cents=1;
   raise exception using message='FALHA: linha editável',errcode='ZX603';
 exception when others then if sqlstate='ZX603' then raise; end if;
 end;
 begin
   delete from private.f4_mock_journals;
   raise exception using message='FALHA: journal apagado',errcode='ZX604';
 exception when others then if sqlstate='ZX604' then raise; end if;
 end;
end $immutable$;

-- Exigir journal COMPLETO até no COMMIT; rodar constraint manualmente
-- dentro de subtransação e provar que lote vazio não passa.
-- Criar recibo mock de disputa associado a novo pedido fictício para não
-- conflitar com idempotência do primeiro pedido, que já foi reembolsado.
insert into public.service_requests(id,customer_id,provider_id,category_id,
 service_types,status)
values('dddddddd-1111-4111-8111-dddddddddddd',
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,
 array['pneu_furado'],'awaiting_payment');
insert into public.service_quotes(id,request_id,provider_id,amount_cents,status)
values('eeeeeeee-1111-4111-8111-eeeeeeeeeeee',
 'dddddddd-1111-4111-8111-dddddddddddd',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',10000,'accepted');
insert into public.f2_quote_items(quote_id,line_no,kind,code,amount_cents)
values('eeeeeeee-1111-4111-8111-eeeeeeeeeeee',1,'service','pneu_furado',9000),
 ('eeeeeeee-1111-4111-8111-eeeeeeeeeeee',2,'travel','deslocamento',1000);
select private.f4_prepare_mock_attempt('eeeeeeee-1111-4111-8111-eeeeeeeeeeee')
 as second_attempt \gset
select set_config('test.f4_second',:'second_attempt',false);
select private.f4_ingest_mock_event(current_setting('test.f4_second')::uuid,
 'evt_mock_payment_second','mock_payment_verified',10900);
select private.f4_ingest_mock_event(current_setting('test.f4_second')::uuid,
 'evt_mock_dispute_second','mock_dispute_opened',10900);
do $dispute_no_journal$
declare v_id bigint;
begin
 select id into v_id from private.f4_mock_webhook_receipts
  where mock_event_id='evt_mock_dispute_second';
 begin
  perform private.f4_post_mock_double_entry(v_id);
  raise exception using message='FALHA: disputa criou transferência',errcode='ZX605';
 exception when others then if sqlstate='ZX605' then raise; end if;
 end;
 if (select count(*) from private.f4_mock_journals)<>2 then
   raise exception 'Disputa criou lançamentos inesperados'; end if;
end $dispute_no_journal$;
do $missing_lines$
declare v_receipt bigint;v_attempt uuid;
begin
 select r.id,r.attempt_id into v_receipt,v_attempt
 from private.f4_mock_webhook_receipts r
 where r.mock_event_id='evt_mock_payment_second';
 begin
   insert into private.f4_mock_journals(attempt_id,receipt_id,kind)
   values(v_attempt,v_receipt,'mock_payment');
   execute 'set constraints f4_journal_balance_on_header immediate';
   raise exception using message='FALHA: journal vazio passou',errcode='ZX606';
 exception when others then if sqlstate='ZX606' then raise; end if;
 end;
 if exists(select 1 from private.f4_mock_journals
    where receipt_id=v_receipt) then
  raise exception 'Journal vazio persistiu após rejeição'; end if;
end $missing_lines$;
-- A mesma operação legítima preenche as linhas e passa na verificação.
select private.f4_post_mock_double_entry(
 (select id from private.f4_mock_webhook_receipts
  where mock_event_id='evt_mock_payment_second'));
do $dispute_blocks$
declare j jsonb;
begin
 select private.f4_mock_settlement_review(
  current_setting('test.f4_second')::uuid,true,true,false) into j;
 if (j->>'eligibleForHumanReview')::boolean then
   raise exception 'Disputa registrada permitiu análise favorável'; end if;
 if (j->>'transferAuthorized')::boolean then
   raise exception 'Dinheiro real liberado'; end if;
end $dispute_blocks$;
-- Canto de arredondamento: serviço de R$ 0,01 dá comissão R$ 0,00.
-- O diário deve ter DUAS linhas (sem linha de comissão de valor zero).
insert into public.service_requests(id,customer_id,provider_id,category_id,
 service_types,status)
values('dddddddd-2222-4222-8222-dddddddddddd',
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,
 array['pneu_furado'],'awaiting_payment');
insert into public.service_quotes(id,request_id,provider_id,amount_cents,status)
values('eeeeeeee-2222-4222-8222-eeeeeeeeeeee',
 'dddddddd-2222-4222-8222-dddddddddddd',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',100,'accepted');
insert into public.f2_quote_items(quote_id,line_no,kind,code,amount_cents)
values('eeeeeeee-2222-4222-8222-eeeeeeeeeeee',1,'service','pneu_furado',1),
 ('eeeeeeee-2222-4222-8222-eeeeeeeeeeee',2,'travel','deslocamento',99);
select private.f4_prepare_mock_attempt('eeeeeeee-2222-4222-8222-eeeeeeeeeeee') as cents_attempt \gset
select set_config('test.f4_zero_fee_attempt',:'cents_attempt',false);
select private.f4_ingest_mock_event(
 current_setting('test.f4_zero_fee_attempt')::uuid,
 'evt_mock_zero_commission','mock_payment_verified',100);
select private.f4_post_mock_double_entry(
 (select id from private.f4_mock_webhook_receipts
  where mock_event_id='evt_mock_zero_commission')) as cents_journal \gset
select set_config('test.f4_zero_fee_journal',:'cents_journal',false);
do $zero_commission$
declare v_attempt uuid:=current_setting('test.f4_zero_fee_attempt')::uuid;
begin
 if (select commission_cents from private.f4_mock_payment_attempts
   where id=v_attempt)<>0
   or (select count(*) from private.f4_mock_journal_lines where
     journal_id=current_setting('test.f4_zero_fee_journal')::bigint)<>2
   or (select count(*) from private.f4_mock_journal_lines where
     journal_id=current_setting('test.f4_zero_fee_journal')::bigint
     and account='mock_platform_commission')<>0
   or (select sum(amount_cents) from private.f4_mock_journal_lines where
     journal_id=current_setting('test.f4_zero_fee_journal')::bigint
     and side='debit')<>100
   or (select sum(amount_cents) from private.f4_mock_journal_lines where
     journal_id=current_setting('test.f4_zero_fee_journal')::bigint
     and side='credit')<>100
 then raise exception 'Canto de arredondamento gerou journal inválido'; end if;
end $zero_commission$;
select 'F4: JOURNAL MOCK BALANCEADO, ESTORNO, REPLAY, DISPUTA E SEM REPASSE OK' as resultado;
rollback;
