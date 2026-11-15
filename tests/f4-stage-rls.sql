-- F4: testes SQL em PostgreSQL17 descartável, com usuários sintéticos.
-- NÃO usa Stripe, PIX, rede, saldo real, cartão, token nem Supabase remoto.
\set ON_ERROR_STOP on
begin;
insert into public.service_categories(id,code,paid_in_app)
 values(2,'borracharia_delivery',true);
insert into public.providers(id,owner_id,status,is_active) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222','approved',true);
insert into public.service_requests(
 id,customer_id,provider_id,category_id,service_types,status)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',2,
  array['pneu_furado'],'awaiting_payment');
insert into public.service_quotes(
 id,request_id,provider_id,amount_cents,status)
values('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',28000,'accepted');
insert into public.f2_quote_items(quote_id,line_no,kind,code,amount_cents)
values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,'service','pneu_furado',23000),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',2,'travel','deslocamento',4000),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',3,'part','Material',1000);

-- Nenhuma tabela financeira deve ser lida ou escrita diretamente por anon ou
-- authenticated. Apenas preview de leitura do próprio orçamento é executável.
do $security$
begin
 if (select enabled from private.f4_release_gate where singleton)
 then raise exception 'Gate F4 veio ligado'; end if;
 if has_table_privilege('authenticated','private.f4_mock_payment_attempts','SELECT')
  or has_table_privilege('authenticated','private.f4_mock_webhook_receipts','INSERT')
  or has_table_privilege('authenticated','private.f4_mock_ledger_entries','SELECT')
  or has_table_privilege('anon','private.f4_mock_payment_attempts','SELECT')
 then raise exception 'Banco F4 deu acesso direto a dados financeiros'; end if;
 if has_function_privilege('authenticated','private.f4_prepare_mock_attempt(uuid)','EXECUTE')
  or has_function_privilege('authenticated',
    'private.f4_ingest_mock_event(uuid,text,text,integer,text)','EXECUTE')
  or has_function_privilege('anon','public.f4_quote_preview(uuid)','EXECUTE')
 then raise exception 'RPC F4 permite simular pagamento pelo cliente'; end if;
 if not (select relrowsecurity from pg_class
   where oid='private.f4_mock_payment_attempts'::regclass)
 then raise exception 'RLS de tentativa F4 desligado'; end if;
end $security$;

set role authenticated;
select set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',false);
do $gate$
begin
 begin
   perform public.f4_quote_preview('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
   raise exception using message='FALHA: preview com gate off',errcode='ZX401';
 exception when others then
   if sqlstate='ZX401' then raise; end if;
   if sqlerrm not like '%F4 indisponível%' then raise; end if;
 end;
end $gate$;

reset role;
update private.f4_release_gate set enabled=true;
set role authenticated;
select set_config('request.jwt.claim.sub',
 '44444444-4444-4444-8444-444444444444',false);
do $third$
begin
 begin
   perform public.f4_quote_preview('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
   raise exception using message='FALHA: terceiro viu previsão financeira',errcode='ZX402';
 exception when others then
   if sqlstate='ZX402' then raise; end if;
   if sqlerrm not like '%não autorizado%' then raise; end if;
 end;
end $third$;
select set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',false);
do $provider$
begin
 begin
   perform public.f4_quote_preview('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
   raise exception using message='FALHA: prestador acessou preview exclusivo do cliente',errcode='ZX403';
 exception when others then if sqlstate='ZX403' then raise; end if;
 end;
end $provider$;
select set_config('request.jwt.claim.sub',
 '11111111-1111-4111-8111-111111111111',false);
do $preview$
declare j jsonb;
begin
 select public.f4_quote_preview('cccccccc-cccc-4ccc-8ccc-cccccccccccc') into j;
 if (j->>'serviceCents')::integer<>23000
  or (j->>'travelCents')::integer<>4000
  or (j->>'partsCents')::integer<>1000
  or (j->>'quoteTotalCents')::integer<>28000
  or (j->>'commissionCents')::integer<>3450
  or (j->>'expectedProviderCents')::integer<>24550
  or j->>'customerTotalCents' is not null
  or j->>'processingFeeCents' is not null
  or (j->>'paymentAuthorized')::boolean
 then raise exception 'Prévia não corresponde aos itens do orçamento'; end if;
end $preview$;

-- O navegador conhece IDs mas NÃO pode registrar pagamento.
do $no_browser$
begin
 begin
   perform private.f4_prepare_mock_attempt(
     'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
   raise exception using message='FALHA: usuário preparou tentativa privilegiada',errcode='ZX404';
 exception when others then
   if sqlstate='ZX404' then raise; end if;
 end;
end $no_browser$;

-- SOMENTE COMO POSTGRES ADMIN NO CONTAINER, em transaction rollback.
reset role;
select set_config('app.f4_test_only','local_fixture',false);
do $admin_gate$
begin
 begin
   perform private.f4_prepare_mock_attempt(
     'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
   -- gate true: this succeeds in local test fixture
 exception when others then
   raise exception 'Mock não prepara no container: %',sqlerrm;
 end;
end $admin_gate$;
select private.f4_prepare_mock_attempt(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') as repeated_attempt \gset
select set_config('test.f4_attempt',:'repeated_attempt',false);

do $idempotent_prepare$
begin
 if (select count(*) from private.f4_mock_payment_attempts)<>1
  or (select quote_total_cents from private.f4_mock_payment_attempts)<>28000
  or (select commission_cents from private.f4_mock_payment_attempts)<>3450
 then raise exception 'Tentativa duplicada ou valor de comissão adulterado'; end if;
end $idempotent_prepare$;

-- Falha do backend mock com valor errado, moeda errada ou reembolso precoce.
do $bad_events$
declare id uuid:=current_setting('test.f4_attempt')::uuid;
begin
 begin
   perform private.f4_ingest_mock_event(id,'evt_refund_too_early',
     'mock_refund_confirmed',28000);
   raise exception using message='FALHA: refund antes de pagamento',errcode='ZX405';
 exception when others then
   if sqlstate='ZX405' then raise; end if;
   if sqlerrm not like '%sem pagamento verificado%' then raise; end if;
 end;
 begin
   perform private.f4_ingest_mock_event(id,'evt_wrong_amount_mock',
     'mock_payment_verified',28001);
   raise exception using message='FALHA: valor adulterado',errcode='ZX406';
 exception when others then
   if sqlstate='ZX406' then raise; end if;
   if sqlerrm not like '%Divergência de valor%' then raise; end if;
 end;
 begin
   perform private.f4_ingest_mock_event(id,'evt_wrong_currency',
     'mock_payment_verified',28000,'USD');
   raise exception using message='FALHA: moeda errada',errcode='ZX407';
 exception when others then if sqlstate='ZX407' then raise; end if;
 end;
end $bad_events$;

select private.f4_ingest_mock_event(
 current_setting('test.f4_attempt')::uuid,
 'evt_mock_payment_001','mock_payment_verified',28000);
select private.f4_ingest_mock_event(
 current_setting('test.f4_attempt')::uuid,
 'evt_mock_payment_001','mock_payment_verified',28000) as duplicate_event \gset
select set_config('test.f4_dup',:'duplicate_event',false);

do $payment$
begin
 if current_setting('test.f4_dup')<>'duplicate'
  or (select count(*) from private.f4_mock_webhook_receipts)<>1
  or (select count(*) from private.f4_mock_ledger_entries)<>1
  or (select status from private.f4_mock_payment_attempts)<>'mock_verified'
 then raise exception 'Deduplicação de evento mock falhou'; end if;
 if (select status from public.service_requests
   where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>'awaiting_payment'
 then raise exception 'Evento F4 mock desbloqueou atendimento real'; end if;
end $payment$;

do $collision$
declare id uuid:=current_setting('test.f4_attempt')::uuid;
begin
 begin
   perform private.f4_ingest_mock_event(
     id,'evt_mock_payment_001','mock_refund_confirmed',28000);
   raise exception using message='FALHA: event ID colidiu com outro tipo',errcode='ZX408';
 exception when others then
   if sqlstate='ZX408' then raise; end if;
   if sqlerrm not like '%payload divergente%' then raise; end if;
 end;
 begin
   perform private.f4_ingest_mock_event(
     id,'evt_mock_payment_002','mock_payment_verified',28000);
   raise exception using message='FALHA: segundo pagamento aceito',errcode='ZX409';
 exception when others then if sqlstate='ZX409' then raise; end if;
 end;
end $collision$;

-- Teste de imutabilidade de histórico de lançamentos.
do $immutable$
begin
 begin
   update private.f4_mock_ledger_entries set amount_cents=1;
   raise exception using message='FALHA: ledger financeiro editável',errcode='ZX410';
 exception when others then if sqlstate='ZX410' then raise; end if;
 end;
 begin
   delete from private.f4_mock_ledger_entries;
   raise exception using message='FALHA: ledger financeiro pode ser apagado',errcode='ZX411';
 exception when others then if sqlstate='ZX411' then raise; end if;
 end;
end $immutable$;

select private.f4_ingest_mock_event(
 current_setting('test.f4_attempt')::uuid,
 'evt_mock_refund_001','mock_refund_confirmed',28000);
select private.f4_ingest_mock_event(
 current_setting('test.f4_attempt')::uuid,
 'evt_mock_refund_001','mock_refund_confirmed',28000) as refunded_duplicate \gset
select set_config('test.f4_refund_dup',:'refunded_duplicate',false);
do $refund$
begin
 if current_setting('test.f4_refund_dup')<>'duplicate'
  or (select count(*) from private.f4_mock_ledger_entries)<>2
  or (select coalesce(sum(amount_cents),0) from private.f4_mock_ledger_entries)<>0
  or (select status from private.f4_mock_payment_attempts)<>'mock_refunded'
 then raise exception 'Estorno ou ledger mock foi duplicado'; end if;
 if (select status from public.service_requests
   where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>'awaiting_payment'
 then raise exception 'Estorno fictício alterou pedido operacional'; end if;
end $refund$;
select 'F4 MOCK: PRIVACIDADE, COMISSÃO, EVENTOS E LEDGER PASSARAM SEM PAGAMENTO' as resultado;
rollback;
