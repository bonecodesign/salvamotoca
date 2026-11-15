-- Salva Motoca! F6 — CANDIDATO DE BANCO EXCLUSIVAMENTE MOCK / DESCARTAVEL.
-- NAO e migration. NAO aplicar ao projeto Supabase hospedado.
-- Requer tests/f2-stage-setup.sql e supabase/drafts/f5_backend_rls_mock_candidate.sql.
-- Sem pagamento, saldo, repasse, chat de suporte real, avaliacao publicada ou push.
begin;
create schema if not exists private;

create table private.f6_mock_release_gate (
 singleton boolean primary key default true check (singleton),
 enabled boolean not null default false
);
insert into private.f6_mock_release_gate(singleton,enabled) values(true,false);
revoke all on private.f6_mock_release_gate from public,anon,authenticated;

-- Contexto local de fixture: NAO pode ser usado como autenticacao ou prova de pagamento.
create function private.f6_mock_enabled()
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
  and current_setting('app.f6_test_only',true)='local_fixture'
  and exists(select 1 from private.f6_mock_release_gate where enabled);
$$;
revoke all on function private.f6_mock_enabled() from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.f6_mock_enabled() to authenticated;

create table public.f6_mock_completions (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null unique references public.f5_mock_sessions(id) on delete cascade,
 customer_id uuid not null,
 provider_owner_id uuid not null,
 status text not null default 'awaiting_summary'
  check(status in ('awaiting_summary','awaiting_both','completed','support_review')),
 summary text,
 summary_at timestamptz,
 -- Janela em 5min contados do resumo recebido no servidor na futura F6 real.
 customer_deadline_at timestamptz,
 provider_confirmed_at timestamptz,
 customer_confirmed_at timestamptz,
 rating_stars smallint check(rating_stars between 1 and 5),
 rating_comment text check(length(rating_comment)<=300),
 rating_at timestamptz,
 synthetic_photo_marker text check(synthetic_photo_marker is null or
   synthetic_photo_marker='F6_SYNTHETIC_PHOTO_ONLY'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 -- NENHUM campo 'paid', 'transfer', 'payout' ou 'settled'.
 constraint f6_mock_summary_valid check(
  (summary is null and summary_at is null and customer_deadline_at is null)
  or (summary is not null and length(btrim(summary)) between 15 and 600
   and summary_at is not null
   and customer_deadline_at=summary_at+interval '5 minutes')),
 constraint f6_mock_provider_ack_after_summary check(
  provider_confirmed_at is null or
   (summary_at is not null and provider_confirmed_at>=summary_at)),
 constraint f6_mock_customer_ack_in_window check(
  customer_confirmed_at is null or
   (summary_at is not null and
    customer_confirmed_at>=summary_at and
    customer_confirmed_at<=customer_deadline_at)),
 constraint f6_mock_completed_requires_both check (
  status<>'completed' or
  (customer_confirmed_at is not null and provider_confirmed_at is not null)),
 constraint f6_mock_rating_after_completion check (
  (rating_stars is null and rating_at is null and rating_comment is null)
  or (rating_stars is not null and rating_at is not null and status='completed')),
 constraint f6_mock_empty_summary_state check(
  status<>'awaiting_summary' or
  (summary is null and customer_confirmed_at is null
   and provider_confirmed_at is null))
);

-- Valida identidade ligada ao handoff da F5 mock, sem acreditar em dados do cliente.
-- SECURITY INVOKER: o teste cria fixtures usando administrador do Postgres efemero.
create function private.f6_mock_validate_completion()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (new.session_id,new.customer_id,new.provider_owner_id)
    is distinct from (old.session_id,old.customer_id,old.provider_owner_id)
  then raise exception 'Vinculo da conclusao F6 e imutavel.'; end if;
 end if;
 if not exists(
  select 1 from public.f5_mock_sessions s
   join public.providers p on p.id=s.provider_id
  where s.id=new.session_id and s.status='handoff_f6'
   and s.mock_paid and s.customer_id=new.customer_id
   and s.provider_owner_id=new.provider_owner_id
   and p.owner_id=new.provider_owner_id
   and p.status='approved' and p.is_active
 ) then raise exception 'F6 fixture exige handoff F5 mock integro e prestador homologado.'; end if;
 return new;
end;
$$;
revoke all on function private.f6_mock_validate_completion()
 from public,anon,authenticated;
create trigger f6_mock_completion_integrity
before insert or update on public.f6_mock_completions
for each row execute function private.f6_mock_validate_completion();

create table public.f6_mock_support_messages (
 id uuid primary key default gen_random_uuid(),
 completion_id uuid not null references public.f6_mock_completions(id) on delete cascade,
 actor_id uuid not null,
 body text not null check(length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index f6_mock_support_history
 on public.f6_mock_support_messages(completion_id,created_at,id);

create function private.f6_mock_validate_support()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_customer uuid; v_provider uuid; v_status text;
begin
 select c.customer_id,c.provider_owner_id,c.status
 into v_customer,v_provider,v_status
 from public.f6_mock_completions c where c.id=new.completion_id;
 if not found or new.actor_id not in (v_customer,v_provider)
    or v_status<>'support_review'
 then raise exception 'Suporte F6 mock restrito a participantes em divergencia.'; end if;
 return new;
end;
$$;
revoke all on function private.f6_mock_validate_support()
 from public,anon,authenticated;
create trigger f6_mock_support_integrity
before insert on public.f6_mock_support_messages
for each row execute function private.f6_mock_validate_support();

-- Proibicao total de INSERT/UPDATE/DELETE aos browsers (inclusive autenticados).
revoke all on public.f6_mock_completions,public.f6_mock_support_messages
 from public,anon,authenticated;
alter table public.f6_mock_completions enable row level security;
alter table public.f6_mock_support_messages enable row level security;
grant select(id,session_id,customer_id,provider_owner_id,status,summary,summary_at,
 customer_deadline_at,provider_confirmed_at,customer_confirmed_at,rating_stars,
 rating_comment,rating_at,synthetic_photo_marker,created_at,updated_at)
 on public.f6_mock_completions to authenticated;
grant select(id,completion_id,actor_id,body,created_at)
 on public.f6_mock_support_messages to authenticated;

create policy f6_mock_completion_participants on public.f6_mock_completions
for select to authenticated using (
 (select private.f6_mock_enabled()) and
 exists (
  select 1 from public.f5_mock_sessions s
   join public.providers p on p.id=s.provider_id
  where s.id=public.f6_mock_completions.session_id and s.status='handoff_f6'
    and s.customer_id=public.f6_mock_completions.customer_id
    and s.provider_owner_id=public.f6_mock_completions.provider_owner_id
    and (
      public.f6_mock_completions.customer_id=(select auth.uid())
      or (public.f6_mock_completions.provider_owner_id=(select auth.uid())
          and p.owner_id=(select auth.uid())
          and p.status='approved' and p.is_active)
    )
 )
);

create policy f6_mock_support_participants on public.f6_mock_support_messages
for select to authenticated using (
 (select private.f6_mock_enabled()) and
 exists (select 1 from public.f6_mock_completions c
  where c.id=completion_id and c.status='support_review')
);

-- Nao ha grants de mutation, REST RPC ou notificacoes externas.
commit;
