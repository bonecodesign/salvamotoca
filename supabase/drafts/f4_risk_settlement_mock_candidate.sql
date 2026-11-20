-- DECISÃO SM-DEC-045: simulação de reembolso considera subtotal pago pelo solicitante (com taxa 10%), sem PSP.
-- F4: EXTENSÃO DE RISCO E INTENÇÕES DE REPASSE 100% MOCK / POSTGRESQL DESCARTÁVEL.
-- Não instalar no Supabase hospedado. Não é migration. NÃO contata PSP, não reembolsa
-- ou transfere dinheiro. Depende de f4_financial_backend_candidate.sql e
-- f4_double_entry_mock_candidate.sql. Autorização apenas por fixture local fechada.
begin;

create table private.f4_mock_risk_cases (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references private.f4_mock_payment_attempts(id),
  case_key text not null unique check(case_key ~ '^case_[a-z0-9_-]{8,80}$'),
  kind text not null check(kind in (
    'refund_partial','refund_full','dispute','chargeback')),
  requested_cents integer not null check(requested_cents between 1 and 550000),
  status text not null default 'review_required'
    check(status in('review_required','closed_no_action')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint f4_mock_case_closed_consistency check(
    (status='review_required' and closed_at is null)
    or (status='closed_no_action' and closed_at is not null)
  )
);
create index f4_mock_cases_by_attempt
  on private.f4_mock_risk_cases(attempt_id,status,created_at);
create table private.f4_mock_settlement_intents (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references private.f4_mock_payment_attempts(id),
  intent_key text not null unique check(intent_key ~ '^settle_[a-z0-9_-]{8,80}$'),
  status text not null default 'review_only'
    check(status in('review_only','held')),
  created_at timestamptz not null default now(),
  held_at timestamptz
);
alter table private.f4_mock_risk_cases enable row level security;
alter table private.f4_mock_settlement_intents enable row level security;
revoke all on private.f4_mock_risk_cases,private.f4_mock_settlement_intents
 from public,anon,authenticated;

-- Qualquer risco aberto torna impossível continuar revisão de repasse
-- previamente enfileirada. Não libera automaticamente ao encerrar um caso.
create or replace function private.f4_hold_mock_settlement()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='review_required' then
   update private.f4_mock_settlement_intents
      set status='held',held_at=now()
    where attempt_id=new.attempt_id and status='review_only';
 end if;
 return new;
end;
$$;
create trigger f4_mock_risk_hold_settlement
 after insert on private.f4_mock_risk_cases
 for each row execute function private.f4_hold_mock_settlement();

-- Apenas propostas de revisão, jamais restituição financeira efetivada.
-- Bloqueio de linha em attempts impede exceder orçamento em duas transações.
create or replace function private.f4_open_mock_risk_case(
 p_attempt_id uuid,p_case_key text,p_kind text,p_requested_cents integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_attempt record;v_old record;v_id uuid;v_total bigint;
begin
 if not exists(select 1 from private.f4_release_gate where singleton and enabled)
  or current_setting('app.f4_test_only',true) is distinct from 'local_fixture'
 then raise exception 'Fila F4 mock indisponível.'; end if;
 if p_case_key is null or p_case_key !~ '^case_[a-z0-9_-]{8,80}$'
   or p_kind is null or p_kind not in('refund_partial','refund_full','dispute','chargeback')
   or p_requested_cents is null or p_requested_cents<=0
 then raise exception 'Caso de risco mock inválido.'; end if;
 select * into v_attempt from private.f4_mock_payment_attempts
   where id=p_attempt_id for update;
 if not found then raise exception 'Tentativa mock inexistente.'; end if;
 select * into v_old from private.f4_mock_risk_cases where case_key=p_case_key;
 if found then
   if v_old.attempt_id is distinct from p_attempt_id
     or v_old.kind is distinct from p_kind
     or v_old.requested_cents is distinct from p_requested_cents
   then raise exception 'Chave de caso reutilizada com dados diferentes.'; end if;
   return v_old.id;
 end if;
 if p_requested_cents>v_attempt.customer_subtotal_cents
 then raise exception 'Caso superior ao orçamento mock.'; end if;
 if v_attempt.status not in('mock_verified','mock_disputed')
   or not exists(
    select 1 from private.f4_mock_journals j
    where j.attempt_id=p_attempt_id and j.kind='mock_payment')
   or exists(
    select 1 from private.f4_mock_journals j
    where j.attempt_id=p_attempt_id and j.kind='mock_refund')
 then raise exception 'Caso requer pagamento fictício contabilizado sem estorno integral.'; end if;
 if p_kind in('refund_partial','refund_full') then
   if v_attempt.status<>'mock_verified'
     or exists(select 1 from private.f4_mock_risk_cases
       where attempt_id=p_attempt_id and status='review_required'
         and kind in('dispute','chargeback'))
   then raise exception 'Pagamento disputado exige mediação antes de estorno.'; end if;
   if p_kind='refund_full' and p_requested_cents<>v_attempt.customer_subtotal_cents
   then raise exception 'Estorno integral precisa corresponder ao valor do orçamento.'; end if;
   select coalesce(sum(requested_cents),0) into v_total
     from private.f4_mock_risk_cases
     where attempt_id=p_attempt_id and status='review_required'
       and kind in('refund_partial','refund_full');
   if v_total+p_requested_cents>v_attempt.customer_subtotal_cents
   then raise exception 'Estornos mock solicitados excedem orçamento.'; end if;
 end if;
 insert into private.f4_mock_risk_cases(
   attempt_id,case_key,kind,requested_cents)
 values(p_attempt_id,p_case_key,p_kind,p_requested_cents)
 returning id into v_id;
 return v_id;
end;
$$;

-- Encerramento significa SEM AÇÃO; não declara reembolso, chargeback resolvido,
-- ou liberação de saldo. Nova análise é sempre necessária.
create or replace function private.f4_close_mock_risk_case(
 p_case_id uuid
) returns text language plpgsql security definer set search_path='' as $$
declare v_case record;
begin
 if not exists(select 1 from private.f4_release_gate where singleton and enabled)
  or current_setting('app.f4_test_only',true) is distinct from 'local_fixture'
 then raise exception 'Encerramento F4 mock indisponível.'; end if;
 select * into v_case from private.f4_mock_risk_cases
   where id=p_case_id for update;
 if not found then raise exception 'Caso mock não existe.'; end if;
 if v_case.status='closed_no_action' then return 'already_closed'; end if;
 update private.f4_mock_risk_cases
 set status='closed_no_action',closed_at=now()
 where id=v_case.id;
 return 'closed_no_action';
end;
$$;

-- Enfileira somente uma revisão humana mock, SEM dinheiro e SEM autorização
-- operacional. p_*_confirmed são fixtures falsas, NÃO atestam ações F6.
create or replace function private.f4_queue_mock_settlement_review(
 p_attempt_id uuid,p_intent_key text,
 p_customer_confirmed boolean,p_provider_confirmed boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_attempt record;v_existing record;v_review jsonb;v_id uuid;
begin
 if not exists(select 1 from private.f4_release_gate where singleton and enabled)
  or current_setting('app.f4_test_only',true) is distinct from 'local_fixture'
 then raise exception 'Repasse F4 mock indisponível.'; end if;
 if p_intent_key is null or p_intent_key !~ '^settle_[a-z0-9_-]{8,80}$'
 then raise exception 'Chave de revisão mock inválida.'; end if;
 select * into v_attempt from private.f4_mock_payment_attempts
 where id=p_attempt_id for update;
 if not found then raise exception 'Tentativa de repasse mock inexistente.'; end if;
 -- Não retornar aprovação antiga quando surgem novos casos/disputas.
 if exists(select 1 from private.f4_mock_risk_cases
  where attempt_id=p_attempt_id and status='review_required')
 then
   update private.f4_mock_settlement_intents
   set status='held',held_at=now()
   where attempt_id=p_attempt_id and status='review_only';
   raise exception 'Revisão bloqueada por risco financeiro aberto.'; end if;
 if v_attempt.status<>'mock_verified'
 then raise exception 'Pagamento mock não está verificado.'; end if;
 if p_customer_confirmed is distinct from true
   or p_provider_confirmed is distinct from true
 then raise exception 'Duas confirmações mock são necessárias.'; end if;
 -- A revisão do diário é condição extra. Não substitui saldos e PSP reais.
 select private.f4_mock_settlement_review(
   p_attempt_id,p_customer_confirmed,p_provider_confirmed,false) into v_review;
 if (v_review->>'eligibleForHumanReview')::boolean is distinct from true
 then raise exception 'Diário F4 não está apto a revisão.'; end if;
 select * into v_existing from private.f4_mock_settlement_intents
   where attempt_id=p_attempt_id;
 if found then
   if v_existing.intent_key is distinct from p_intent_key
   then raise exception 'Tentativa já possui intenção de revisão diferente.'; end if;
   if v_existing.status<>'review_only'
   then raise exception 'Intenção de revisão já está bloqueada.'; end if;
   return jsonb_build_object('intentId',v_existing.id,'status','review_only',
      'idempotent',true,'transferAuthorized',false,'pspFundsConfirmed',false);
 end if;
 if exists(select 1 from private.f4_mock_settlement_intents
  where intent_key=p_intent_key)
 then raise exception 'Chave de intenção pertence a outra tentativa.'; end if;
 insert into private.f4_mock_settlement_intents(attempt_id,intent_key)
 values(p_attempt_id,p_intent_key) returning id into v_id;
 return jsonb_build_object('intentId',v_id,'status','review_only',
   'idempotent',false,'transferAuthorized',false,'pspFundsConfirmed',false);
end;
$$;
revoke all on function private.f4_hold_mock_settlement()
 from public,anon,authenticated;
revoke all on function private.f4_open_mock_risk_case(uuid,text,text,integer)
 from public,anon,authenticated;
revoke all on function private.f4_close_mock_risk_case(uuid)
 from public,anon,authenticated;
revoke all on function private.f4_queue_mock_settlement_review(uuid,text,boolean,boolean)
 from public,anon,authenticated;
commit;
