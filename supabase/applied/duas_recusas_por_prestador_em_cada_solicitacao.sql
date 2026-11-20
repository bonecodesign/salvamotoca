-- Migração aplicada ao projeto Supabase de testes; consulte list_migrations para versão remota.
-- Salva Motoca! — até duas recusas do mesmo cliente por prestador em CADA pedido.
-- "Rodada" = um service_requests.id. Novo pedido inicia contagens zeradas.
alter table public.bj_request_attempts
  add column if not exists rejection_count integer not null default 0,
  add column if not exists last_declined_at timestamptz;
-- Atualiza histórico legado (se houver) sem superar o limite por rodada.
update public.bj_request_attempts a
set rejection_count=least(2, historical.total),
    last_declined_at=historical.last_declined_at
from (
  select request_id,provider_id,count(*)::integer total,max(created_at) last_declined_at
  from public.service_quotes
  where status='declined'
  group by request_id,provider_id
) historical
where a.request_id=historical.request_id
  and a.provider_id=historical.provider_id
  and a.rejection_count=0;
alter table public.bj_request_attempts
  add constraint bj_attempts_max_two_refusals check(rejection_count between 0 and 2);

create or replace function public.bj_answer_quote(p_quote_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_customer uuid:=auth.uid();
  v_order uuid; v_provider uuid; v_quote_status text;
  v_owner uuid; v_order_status text; v_category smallint;
  v_lat numeric; v_lng numeric; v_next uuid; v_city text;
begin
  if v_customer is null or p_accept is null then
    raise exception 'Faça login para decidir.';
  end if;
  select q.request_id,q.provider_id,q.status,r.customer_id,r.status,r.category_id,
         r.latitude,r.longitude,p.city
    into v_order,v_provider,v_quote_status,v_owner,v_order_status,v_category,v_lat,v_lng,v_city
  from public.service_quotes q
  join public.service_requests r on r.id=q.request_id
  join public.providers p on p.id=q.provider_id
  where q.id=p_quote_id
  for update of q,r;

  if v_order is null or v_owner<>v_customer or
     v_quote_status<>'proposed' or v_order_status<>'quoted' or
     not exists(select 1 from public.service_requests r where r.id=v_order and r.provider_id=v_provider)
  then raise exception 'Orçamento indisponível ou não autorizado.'; end if;

  if p_accept then
    update public.service_quotes set status='accepted' where id=p_quote_id;
    update public.service_requests set status='awaiting_payment',updated_at=now() where id=v_order;
    return 'awaiting_payment';
  end if;

  -- Primeira recusa: continua elegível para ser chamado outra vez nesta rodada,
  -- mas não IMEDIATAMENTE no mesmo encaminhamento.
  -- Segunda recusa: rejection_count=2, excluído desta rodada.
  update public.service_quotes set status='declined' where id=p_quote_id;
  insert into public.bj_request_attempts(request_id,provider_id,rejection_count,last_declined_at)
  values (v_order,v_provider,1,now())
  on conflict(request_id,provider_id) do update
  set rejection_count=least(public.bj_request_attempts.rejection_count+1,2),
      last_declined_at=now();

  -- Candidatos nunca recusados vêm primeiro; depois os recusados uma vez.
  -- Prestador recusado agora não recebe o MESMO pedido imediatamente.
  select p.id into v_next
  from public.providers p
  join public.provider_services ps on ps.provider_id=p.id and ps.category_id=v_category and ps.is_active
  join public.bj_provider_presence presence on presence.provider_id=p.id
  left join public.bj_request_attempts prior
    on prior.request_id=v_order and prior.provider_id=p.id
  where p.id<>v_provider and p.status='approved' and p.is_active
    and p.city=v_city
    and presence.online_requested and presence.last_seen_at>=now()-interval '90 seconds'
    and coalesce(prior.rejection_count,0)<2
  order by coalesce(prior.rejection_count,0) asc,
    case when v_lat is not null and v_lng is not null
              and p.latitude is not null and p.longitude is not null
         then power((p.latitude-v_lat)::double precision,2)
             +power((p.longitude-v_lng)::double precision,2)
         else null end asc nulls last,
    p.created_at asc,p.id asc
  limit 1;

  if v_next is null then
    update public.service_requests
    set provider_id=null,status='no_provider',updated_at=now()
    where id=v_order;
    return 'no_provider';
  end if;

  update public.service_requests
  set provider_id=v_next,status='requested',updated_at=now()
  where id=v_order;
  insert into public.bj_request_attempts(request_id,provider_id)
  values(v_order,v_next) on conflict do nothing;
  return 'next_provider';
end;
$$;
revoke all on function public.bj_answer_quote(uuid,boolean) from public,anon,authenticated;
grant execute on function public.bj_answer_quote(uuid,boolean) to authenticated;

-- Encerramento explícito pelo solicitante, sem alterar pagamentos reais.
-- Um pedido novo terá ID distinto e contagem de recusas independente.
create or replace function public.bj_finish_request(p_request_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_customer uuid:=auth.uid(); v_owner uuid; v_status text;
begin
  if v_customer is null or p_request_id is null then raise exception 'É necessário entrar na conta.'; end if;
  -- Mantém a mesma ordem de locks da decisão de orçamento: quote, request.
  perform 1 from public.service_quotes q
  where q.request_id=p_request_id and q.status='proposed'
  for update;
  select r.customer_id,r.status into v_owner,v_status
  from public.service_requests r where r.id=p_request_id for update;
  if v_owner is null or v_owner<>v_customer then raise exception 'Solicitação não autorizada.'; end if;
  if v_status='cancelled' then return 'cancelled'; end if;
  if v_status not in ('requested','quoted','no_provider','awaiting_payment') then
    raise exception 'Solicitação não pode ser encerrada nesse estado.';
  end if;
  if exists(
    select 1 from public.payment_records pay
    where pay.request_id=p_request_id and pay.status in ('authorized','paid')
  ) then raise exception 'Solicitação com pagamento exige análise do suporte.'; end if;
  update public.service_quotes set status='expired'
  where request_id=p_request_id and status='proposed';
  update public.service_requests
  set status='cancelled',updated_at=now() where id=p_request_id;
  return 'cancelled';
end;
$$;
revoke all on function public.bj_finish_request(uuid) from public,anon,authenticated;
grant execute on function public.bj_finish_request(uuid) to authenticated;
