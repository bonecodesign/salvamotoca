-- DECISÃO SM-DEC-045: mock clearing = orçamento + taxa do cliente (10% serviço).
-- Receita da plataforma = taxa cliente + comissão prestador; passivo prestador = orçamento - 10% serviço.
-- F4: extensão CONTÁBIL MOCK, apenas PostgreSQL 17 descartável.
-- Depende de supabase/drafts/f4_financial_backend_candidate.sql.
-- NÃO é migration. NÃO aplicar ao Supabase existente. NÃO é saldo PSP nem escrow.
-- Partidas dobradas são demonstrativas; PSP real exigirá conciliação e accounting review.
begin;
create table private.f4_mock_journals(
  id bigint generated always as identity primary key,
  attempt_id uuid not null references private.f4_mock_payment_attempts(id),
  receipt_id bigint not null unique references private.f4_mock_webhook_receipts(id),
  kind text not null check(kind in ('mock_payment','mock_refund')),
  currency char(3) not null default 'BRL' check(currency='BRL'),
  posted_at timestamptz not null default now()
);
create table private.f4_mock_journal_lines(
  journal_id bigint not null references private.f4_mock_journals(id),
  line_no smallint not null check(line_no between 1 and 3),
  account text not null check(account in (
    'mock_psp_clearing','mock_provider_payable','mock_platform_commission')),
  side text not null check(side in('debit','credit')),
  amount_cents integer not null check(amount_cents>0),
  primary key(journal_id,line_no),
  unique(journal_id,account)
);
create index f4_mock_journal_by_attempt on private.f4_mock_journals(attempt_id,posted_at);
alter table private.f4_mock_journals enable row level security;
alter table private.f4_mock_journal_lines enable row level security;
revoke all on private.f4_mock_journals,private.f4_mock_journal_lines
 from public,anon,authenticated;
-- Imutabilidade do lote e de cada linha, mesmo para operador SQL durante ensaio.
create trigger f4_mock_journal_immutable
  before update or delete on private.f4_mock_journals
  for each row execute function private.f4_deny_ledger_mutation();
create trigger f4_mock_lines_immutable
  before update or delete on private.f4_mock_journal_lines
  for each row execute function private.f4_deny_ledger_mutation();

-- Defesa em profundidade: no COMMIT, lote deve ter débito=crédito e
-- EXATAMENTE as contas/valores esperados do orçamento imutável.
-- Trigger também no journal: inserir um cabeçalho sem linhas não é permitido.
create or replace function private.f4_check_mock_journal_balance()
returns trigger language plpgsql set search_path='' as $$
declare v_id bigint;v_j record;v_attempt record;
  v_count integer;v_debits bigint;v_credits bigint;v_matched integer;
  v_expected_lines integer;
begin
 if tg_table_name='f4_mock_journals' then v_id:=new.id;
 else v_id:=new.journal_id; end if;
 select * into v_j from private.f4_mock_journals where id=v_id;
 select * into v_attempt from private.f4_mock_payment_attempts
   where id=v_j.attempt_id;
 if not found then raise exception 'Tentativa contábil mock inexistente.'; end if;
 select count(*),
   coalesce(sum(amount_cents) filter(where side='debit'),0),
   coalesce(sum(amount_cents) filter(where side='credit'),0),
   count(*) filter(where
      (v_j.kind='mock_payment' and (
        (account='mock_psp_clearing' and side='debit'
          and amount_cents=v_attempt.customer_subtotal_cents)
        or (account='mock_provider_payable' and side='credit'
          and amount_cents=v_attempt.expected_provider_cents)
        or (account='mock_platform_commission' and side='credit'
          and amount_cents=v_attempt.commission_cents)))
      or (v_j.kind='mock_refund' and (
        (account='mock_psp_clearing' and side='credit'
          and amount_cents=v_attempt.customer_subtotal_cents)
        or (account='mock_provider_payable' and side='debit'
          and amount_cents=v_attempt.expected_provider_cents)
        or (account='mock_platform_commission' and side='debit'
          and amount_cents=v_attempt.commission_cents)))
   )
 into v_count,v_debits,v_credits,v_matched
 from private.f4_mock_journal_lines where journal_id=v_id;
 v_expected_lines:=2;
 if v_attempt.commission_cents>0 then v_expected_lines:=3; end if;
 if v_count<>v_expected_lines
   or v_count<>v_matched
   or v_debits<>v_credits
   or v_debits<>v_attempt.customer_subtotal_cents
 then raise exception 'Journal F4 mock incompleto, adulterado ou desbalanceado.'; end if;
 return null;
end;
$$;
create constraint trigger f4_journal_balance_on_header
 after insert on private.f4_mock_journals
 deferrable initially deferred for each row
 execute function private.f4_check_mock_journal_balance();
create constraint trigger f4_journal_balance_on_line
 after insert on private.f4_mock_journal_lines
 deferrable initially deferred for each row
 execute function private.f4_check_mock_journal_balance();

-- Somente o operador SQL da fixture local pode escriturar um evento MOCK
-- já recebido e idempotente pela camada F4 anterior.
create or replace function private.f4_post_mock_double_entry(
 p_receipt_id bigint
) returns bigint language plpgsql security definer set search_path='' as $$
declare v_receipt record;v_attempt record;v_id bigint;v_kind text;
begin
 if not exists(select 1 from private.f4_release_gate where singleton and enabled)
   or current_setting('app.f4_test_only',true) is distinct from 'local_fixture'
 then raise exception 'Journal F4 mock desativado fora do container.'; end if;
 select * into v_receipt from private.f4_mock_webhook_receipts
   where id=p_receipt_id;
 if not found then raise exception 'Recibo mock inexistente.'; end if;
 select * into v_attempt from private.f4_mock_payment_attempts
   where id=v_receipt.attempt_id for update;
 select id into v_id from private.f4_mock_journals
   where receipt_id=p_receipt_id;
 if v_id is not null then return v_id; end if;
 if v_receipt.kind='mock_payment_verified' then
   v_kind:='mock_payment';
   if exists(select 1 from private.f4_mock_journals
     where attempt_id=v_attempt.id and kind='mock_payment')
   then raise exception 'Tentativa já reconhecida contabilmente.'; end if;
 elsif v_receipt.kind='mock_refund_confirmed' then
   v_kind:='mock_refund';
   if not exists(select 1 from private.f4_mock_journals
     where attempt_id=v_attempt.id and kind='mock_payment')
   then raise exception 'Reembolso contábil exige pagamento previamente lançado.'; end if;
   if exists(select 1 from private.f4_mock_journals
     where attempt_id=v_attempt.id and kind='mock_refund')
   then raise exception 'Reembolso contábil duplicado.'; end if;
 else
   raise exception 'Disputa não lança automaticamente saída ou transferência.';
 end if;
 if v_receipt.amount_cents<>v_attempt.customer_subtotal_cents
  or v_receipt.currency<>'BRL'
 then raise exception 'Recibo não confere com orçamento persistido.'; end if;
 insert into private.f4_mock_journals(attempt_id,receipt_id,kind)
 values(v_attempt.id,p_receipt_id,v_kind) returning id into v_id;
 if v_kind='mock_payment' then
   insert into private.f4_mock_journal_lines(journal_id,line_no,account,side,amount_cents)
   values(v_id,1,'mock_psp_clearing','debit',v_attempt.customer_subtotal_cents),
     (v_id,2,'mock_provider_payable','credit',v_attempt.expected_provider_cents);
   if v_attempt.commission_cents>0 then
     insert into private.f4_mock_journal_lines(journal_id,line_no,account,side,amount_cents)
     values(v_id,3,'mock_platform_commission','credit',v_attempt.commission_cents);
   end if;
 else
   insert into private.f4_mock_journal_lines(journal_id,line_no,account,side,amount_cents)
   values(v_id,1,'mock_psp_clearing','credit',v_attempt.customer_subtotal_cents),
     (v_id,2,'mock_provider_payable','debit',v_attempt.expected_provider_cents);
   if v_attempt.commission_cents>0 then
     insert into private.f4_mock_journal_lines(journal_id,line_no,account,side,amount_cents)
     values(v_id,3,'mock_platform_commission','debit',v_attempt.commission_cents);
   end if;
 end if;
 return v_id;
end;
$$;

-- Resultado INFORMATIVO, sem modificar saldo ou iniciar repasse.
-- Confirmações são parâmetros artificiais de fixture; NÃO são assinaturas F6.
create or replace function private.f4_mock_settlement_review(
 p_attempt_id uuid,p_customer_confirmed boolean,
 p_provider_confirmed boolean,p_dispute_open boolean default false
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_attempt record;v_balance bigint;v_payment integer;v_refund integer;v_ok boolean;
begin
 if not exists(select 1 from private.f4_release_gate where singleton and enabled)
  or current_setting('app.f4_test_only',true) is distinct from 'local_fixture'
 then raise exception 'Revisão mock indisponível.'; end if;
 select * into v_attempt from private.f4_mock_payment_attempts
  where id=p_attempt_id;
 if not found then raise exception 'Tentativa mock inexistente.'; end if;
 select coalesce(sum(case when l.side='credit' then l.amount_cents
                      else -l.amount_cents end),0)
 into v_balance
 from private.f4_mock_journals j
 join private.f4_mock_journal_lines l on l.journal_id=j.id
 where j.attempt_id=p_attempt_id and l.account='mock_provider_payable';
 select count(*) filter(where kind='mock_payment'),
        count(*) filter(where kind='mock_refund')
 into v_payment,v_refund from private.f4_mock_journals
 where attempt_id=p_attempt_id;
 v_ok:=v_attempt.status='mock_verified'
  and p_customer_confirmed is true and p_provider_confirmed is true
  and p_dispute_open is false
  and v_payment=1 and v_refund=0
  and v_balance=v_attempt.expected_provider_cents;
 return jsonb_build_object(
  'eligibleForHumanReview',v_ok,'providerPayableMockCents',v_balance,
  'transferAuthorized',false,'canMarkPaid',false,
  'requiresPSPReconciliation',true,
  'requiresF6RealConfirmations',true);
end;
$$;
revoke all on function private.f4_check_mock_journal_balance()
 from public,anon,authenticated;
revoke all on function private.f4_post_mock_double_entry(bigint)
 from public,anon,authenticated;
revoke all on function private.f4_mock_settlement_review(uuid,boolean,boolean,boolean)
 from public,anon,authenticated;
commit;
