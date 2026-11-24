-- Salva Motoca! F4 — BACKEND CANDIDATO EXCLUSIVAMENTE PARA TESTES EM POSTGRES DESCARTÁVEL.
-- NÃO É MIGRATION. NÃO APLICAR NO SUPABASE HOSPEDADO. NÃO PROCESSA PAGAMENTOS.
-- Pré-requisito local: schema F1/F2 com service_requests, service_quotes, f2_quote_items.
-- Eventos recebidos por f4_ingest_mock_event são FICTÍCIOS e não atualizam status real do pedido.
begin;

create table private.f4_release_gate(
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
insert into private.f4_release_gate(singleton,enabled) values(true,false);
revoke all on private.f4_release_gate from public,anon,authenticated;

create table private.f4_mock_payment_attempts(
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests(id),
  quote_id uuid not null unique references public.service_quotes(id),
  customer_id uuid not null,
  provider_id uuid not null references public.providers(id),
  currency text not null default 'BRL' check(currency='BRL'),
  service_cents integer not null check(service_cents>0),
  travel_cents integer not null check(travel_cents>=0),
  parts_cents integer not null check(parts_cents=0), -- legado mock: materiais inclusos no serviço
  rider_fee_cents integer not null check(rider_fee_cents>=0),
  provider_fee_cents integer not null check(provider_fee_cents>=0),
  customer_subtotal_cents integer not null check(customer_subtotal_cents between 100 and 550000),
  quote_total_cents integer not null check(quote_total_cents between 100 and 500000),
  commission_cents integer not null check(commission_cents>=0),
  expected_provider_cents integer not null check(expected_provider_cents>=0),
  processing_fee_cents integer,
  customer_total_cents integer,
  status text not null default 'mock_prepared' check(
    status in('mock_prepared','mock_verified','mock_refunded','mock_disputed')),
  created_at timestamptz not null default now(),
  constraint f4_components_match check(
    quote_total_cents=service_cents+travel_cents
    and parts_cents=0
    and rider_fee_cents=(service_cents*1000+5000)/10000
    and provider_fee_cents=(service_cents*1000+5000)/10000
    and expected_provider_cents=quote_total_cents-provider_fee_cents
    and commission_cents=rider_fee_cents+provider_fee_cents
    and customer_subtotal_cents=quote_total_cents+rider_fee_cents
  ),
  constraint f4_fee_not_manufactured check(
    processing_fee_cents is null and customer_total_cents is null
  )
);
create table private.f4_mock_webhook_receipts(
  id bigint generated always as identity primary key,
  attempt_id uuid not null references private.f4_mock_payment_attempts(id),
  mock_event_id text not null unique check(length(mock_event_id) between 8 and 100),
  kind text not null check(kind in ('mock_payment_verified','mock_refund_confirmed','mock_dispute_opened')),
  amount_cents integer not null check(amount_cents between 1 and 550000),
  currency text not null default 'BRL' check(currency='BRL'),
  received_at timestamptz not null default now()
);
create table private.f4_mock_ledger_entries(
  id bigint generated always as identity primary key,
  attempt_id uuid not null references private.f4_mock_payment_attempts(id),
  receipt_id bigint not null unique references private.f4_mock_webhook_receipts(id),
  kind text not null check(kind in('mock_payment','mock_refund')),
  amount_cents integer not null check(amount_cents<>0),
  currency text not null default 'BRL' check(currency='BRL'),
  recorded_at timestamptz not null default now()
);
create index f4_receipts_by_attempt on private.f4_mock_webhook_receipts(attempt_id,received_at);
create index f4_ledger_by_attempt on private.f4_mock_ledger_entries(attempt_id,id);
alter table private.f4_mock_payment_attempts enable row level security;
alter table private.f4_mock_webhook_receipts enable row level security;
alter table private.f4_mock_ledger_entries enable row level security;
revoke all on private.f4_mock_payment_attempts,
  private.f4_mock_webhook_receipts,private.f4_mock_ledger_entries
  from public,anon,authenticated;

-- Lançamentos não são atualizados/deletados: compensações precisam de novo evento.
create or replace function private.f4_deny_ledger_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Ledger F4 imutável: correções exigem eventos compensatórios.';
end;
$$;
create trigger f4_ledger_no_update_delete before update or delete
  on private.f4_mock_ledger_entries for each row
  execute function private.f4_deny_ledger_mutation();

-- Prévia de leitura só para o cliente dono; nunca marca pagamento como aprovado.
-- Calcula parcelas 10% solicitante + 10% prestador das linhas de SERVIÇO.
-- Os materiais já estão inclusos; deslocamento não entra em nenhuma comissão.
-- SOMENTE MOCK. Sem liquidação, PSP ou autorização de pagamento.
create or replace function public.f4_quote_preview(p_quote_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid();v_quote record;
 v_svc bigint;v_travel bigint;v_part_lines bigint;v_travel_lines integer;
 v_total bigint;v_rider bigint;v_provider bigint;v_comm bigint;
 v_valid_items boolean;
begin
 if v_user is null or not exists(select 1 from private.f4_release_gate where enabled)
 then raise exception 'F4 indisponível para cliente.'; end if;
 select q.id,q.request_id,q.provider_id,q.amount_cents,q.status as quote_status,
   r.customer_id,r.status as request_status,r.provider_id as chosen_provider,r.service_types
 into v_quote
 from public.service_quotes q
 join public.service_requests r on r.id=q.request_id
 where q.id=p_quote_id;
 if not found or v_quote.customer_id<>v_user or v_quote.quote_status<>'accepted'
   or v_quote.request_status<>'awaiting_payment'
   or v_quote.provider_id is distinct from v_quote.chosen_provider
 then raise exception 'Orçamento F4 não autorizado ou não aceito.'; end if;
 select count(*) filter(where kind='travel'),
   coalesce(sum(amount_cents) filter(where kind='service'),0),
   coalesce(sum(amount_cents) filter(where kind='travel'),0),
   count(*) filter(where kind='part'),
   coalesce(bool_and((kind='travel' and code='deslocamento') or
     (kind='service' and code=any(v_quote.service_types) and amount_cents>0)),false)
     and count(*) filter(where kind='service')=cardinality(v_quote.service_types)
     and count(distinct code) filter(where kind='service')=cardinality(v_quote.service_types)
 into v_travel_lines,v_svc,v_travel,v_part_lines,v_valid_items
 from public.f2_quote_items where quote_id=p_quote_id;
 v_total:=v_svc+v_travel;
 if v_valid_items is distinct from true or v_svc<=0 or v_part_lines<>0 or v_travel_lines<>1 or v_total<>v_quote.amount_cents
   or v_total not between 100 and 500000
 then raise exception 'Itens de orçamento não correspondem ao valor aceito.'; end if;
 v_rider:=(v_svc*1000+5000)/10000;
 v_provider:=(v_svc*1000+5000)/10000;
 v_comm:=v_rider+v_provider;
 return jsonb_build_object(
  'requestId',v_quote.request_id,'quoteId',v_quote.id,'currency','BRL',
  'serviceCents',v_svc,'travelCents',v_travel,'partsCents',0,
  'materialsIncludedInService',true,
  'quoteTotalCents',v_total,'commissionCents',v_comm,
  'riderFeeCents',v_rider,'providerFeeCents',v_provider,
  'customerSubtotalBeforeProcessingCents',v_total+v_rider,
  'expectedProviderCents',v_total-v_provider,
  'processingFeeCents',null,'customerTotalCents',null,
  'paymentAuthorized',false,'settlementAuthorized',false);
end;
$$;

-- Somente ambiente privilegiado; NÃO há grant para authenticated nem anon.
-- Registra uma intenção MOCK, nunca uma cobrança real nem PaymentIntent.
create or replace function private.f4_prepare_mock_attempt(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_quote record;v_req record;v_svc bigint;v_travel bigint;
 v_part_lines bigint;v_travel_lines integer;v_total bigint;
 v_rider bigint;v_provider bigint;v_comm bigint;v_id uuid;
 v_valid_items boolean;v_request_id uuid;
begin
 if not exists(select 1 from private.f4_release_gate where enabled)
   or current_setting('app.f4_test_only',true) is distinct from 'local_fixture'
 then raise exception 'Operação F4 mock bloqueada fora de fixture isolada.'; end if;
 -- Same lock order as F2: request before quote.
 select request_id into v_request_id from public.service_quotes where id=p_quote_id;
 if not found then raise exception 'Proposta não aceita.'; end if;
 select * into v_req from public.service_requests where id=v_request_id for update;
 if not found then raise exception 'Pedido não aguarda pagamento deste prestador.'; end if;
 select * into v_quote from public.service_quotes where id=p_quote_id for update;
 if not found or v_quote.status<>'accepted' or v_quote.request_id is distinct from v_req.id
 then raise exception 'Proposta não aceita.'; end if;
 if v_req.status<>'awaiting_payment'
   or v_req.provider_id is distinct from v_quote.provider_id
 then raise exception 'Pedido não aguarda pagamento deste prestador.'; end if;
 select count(*) filter(where kind='travel'),
    coalesce(sum(amount_cents) filter(where kind='service'),0),
    coalesce(sum(amount_cents) filter(where kind='travel'),0),
    count(*) filter(where kind='part'),
    coalesce(bool_and((kind='travel' and code='deslocamento') or
      (kind='service' and code=any(v_req.service_types) and amount_cents>0)),false)
      and count(*) filter(where kind='service')=cardinality(v_req.service_types)
      and count(distinct code) filter(where kind='service')=cardinality(v_req.service_types)
 into v_travel_lines,v_svc,v_travel,v_part_lines,v_valid_items
 from public.f2_quote_items where quote_id=v_quote.id;
 v_total:=v_svc+v_travel;
 if v_valid_items is distinct from true or v_svc<=0 or v_part_lines<>0 or v_travel_lines<>1 or v_total<>v_quote.amount_cents
   or v_total not between 100 and 500000
 then raise exception 'Orçamento não confere com itens persistidos.'; end if;
 v_rider:=(v_svc*1000+5000)/10000;
 v_provider:=(v_svc*1000+5000)/10000;
 v_comm:=v_rider+v_provider;
 insert into private.f4_mock_payment_attempts(
   request_id,quote_id,customer_id,provider_id,
   service_cents,travel_cents,parts_cents,quote_total_cents,
   rider_fee_cents,provider_fee_cents,customer_subtotal_cents,
   commission_cents,expected_provider_cents)
 values(v_req.id,v_quote.id,v_req.customer_id,v_quote.provider_id,
   v_svc,v_travel,0,v_total,v_rider,v_provider,v_total+v_rider,
   v_comm,v_total-v_provider)
 on conflict(request_id) do nothing returning id into v_id;
 if v_id is null then
   select id into v_id from private.f4_mock_payment_attempts
   where request_id=v_req.id and quote_id=v_quote.id
     and customer_id=v_req.customer_id and provider_id=v_quote.provider_id
     and service_cents=v_svc and travel_cents=v_travel
     and quote_total_cents=v_total and customer_subtotal_cents=v_total+v_rider
     and rider_fee_cents=v_rider and provider_fee_cents=v_provider
     and commission_cents=v_comm and expected_provider_cents=v_total-v_provider;
   if v_id is null then
     raise exception 'Já existe tentativa com orçamento ou valores divergentes do mesmo pedido.'; end if;
 end if;
 return v_id;
end;
$$;

-- Ingestão MOCK exclusivamente por operador SQL em banco descartável.
-- A futura API financeira DEVERÁ validar assinaturas reais e conciliar no PSP;
-- esta função NÃO é um webhook de produção e não altera status de atendimento.
create or replace function private.f4_ingest_mock_event(
 p_attempt_id uuid,p_mock_event_id text,p_kind text,p_amount_cents integer,
 p_currency text default 'BRL'
) returns text language plpgsql security definer set search_path='' as $$
declare v_attempt record;v_old record;v_receipt bigint;v_next text;
begin
 if not exists(select 1 from private.f4_release_gate where enabled)
   or current_setting('app.f4_test_only',true) is distinct from 'local_fixture'
 then raise exception 'Eventos F4 de teste desativados.'; end if;
 if p_mock_event_id is null or length(p_mock_event_id) not between 8 and 100
   or p_kind not in('mock_payment_verified','mock_refund_confirmed','mock_dispute_opened')
   or p_currency is distinct from 'BRL'
 then raise exception 'Evento mock inválido.'; end if;
 select * into v_attempt from private.f4_mock_payment_attempts
   where id=p_attempt_id for update;
 if not found then raise exception 'Tentativa mock inexistente.'; end if;
 if p_amount_cents is distinct from v_attempt.customer_subtotal_cents
 then raise exception 'Divergência de valor frente ao total cobrado do solicitante (sem PSP).'; end if;
 select * into v_old from private.f4_mock_webhook_receipts where mock_event_id=p_mock_event_id;
 if found then
   if v_old.attempt_id<>p_attempt_id or v_old.kind<>p_kind
     or v_old.amount_cents<>p_amount_cents or v_old.currency<>p_currency
   then raise exception 'Event ID repetido com payload divergente.'; end if;
   return 'duplicate';
 end if;
 if p_kind='mock_payment_verified' then
   if v_attempt.status<>'mock_prepared'
   then raise exception 'Evento de pagamento fora de ordem.'; end if;
   v_next:='mock_verified';
 elsif p_kind='mock_refund_confirmed' then
   if v_attempt.status<>'mock_verified'
   then raise exception 'Reembolso sem pagamento verificado ou já processado.'; end if;
   v_next:='mock_refunded';
 else
   if v_attempt.status<>'mock_verified'
   then raise exception 'Disputa sem pagamento confirmado.'; end if;
   v_next:='mock_disputed';
 end if;
 insert into private.f4_mock_webhook_receipts(
    attempt_id,mock_event_id,kind,amount_cents,currency)
 values(p_attempt_id,p_mock_event_id,p_kind,p_amount_cents,p_currency)
 returning id into v_receipt;
 if p_kind='mock_payment_verified' then
   insert into private.f4_mock_ledger_entries(
      attempt_id,receipt_id,kind,amount_cents)
   values(p_attempt_id,v_receipt,'mock_payment',p_amount_cents);
 elsif p_kind='mock_refund_confirmed' then
   insert into private.f4_mock_ledger_entries(
      attempt_id,receipt_id,kind,amount_cents)
   values(p_attempt_id,v_receipt,'mock_refund',-p_amount_cents);
 end if;
 update private.f4_mock_payment_attempts set status=v_next where id=p_attempt_id;
 return v_next;
end;
$$;

-- Segurança contra tentativa acidental de publicar a API de simulação.
revoke all on function public.f4_quote_preview(uuid) from public,anon,authenticated;
grant execute on function public.f4_quote_preview(uuid) to authenticated;
revoke all on function private.f4_prepare_mock_attempt(uuid) from public,anon,authenticated;
revoke all on function private.f4_ingest_mock_event(uuid,text,text,integer,text)
 from public,anon,authenticated;
revoke all on function private.f4_deny_ledger_mutation() from public,anon,authenticated;
commit;
