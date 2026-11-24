-- Salva Motoca! F5 — APENAS CANDIDATO PARA POSTGRES 17 DESCARTAVEL.
-- NAO e migration. NAO implantar no Supabase ativo. NENHUM PSP/CHAT/GPS REAIS.
-- Depende da fixture tests/f2-stage-setup.sql, nao dos schemas hospedados.
begin;

create schema if not exists private;

create table private.f5_mock_release_gate (
 singleton boolean primary key default true check (singleton),
 enabled boolean not null default false
);
insert into private.f5_mock_release_gate(singleton,enabled) values(true,false);
revoke all on private.f5_mock_release_gate from public,anon,authenticated;

-- Uma segunda defesa exige contexto explicito de testes e login;
-- ALTERAR FLAG DE FRONTEND NUNCA HABILITA ESTE BANCO.
create function private.f5_mock_enabled()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and current_setting('app.f5_test_only',true)='local_fixture'
    and exists (select 1 from private.f5_mock_release_gate where enabled);
$$;
revoke all on function private.f5_mock_enabled() from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.f5_mock_enabled() to authenticated;

create table public.f5_mock_sessions (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique references public.service_requests(id),
 quote_id uuid not null unique references public.service_quotes(id),
 customer_id uuid not null,
 provider_id uuid not null references public.providers(id),
 provider_owner_id uuid not null,
 -- Uma fixture (nao PSP): proibido reutilizar este recibo para F4 real.
 fixture_receipt text not null default 'F5_LOCAL_FIXTURE_NOT_PSP'
    check (fixture_receipt='F5_LOCAL_FIXTURE_NOT_PSP'),
 mock_paid boolean not null default false,
 status text not null default 'awaiting_payment'
   check (status in ('awaiting_payment','ready_for_dispatch','en_route',
                    'arrived','in_service','handoff_f6','support_review')),
 tracking_consent boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint f5_mock_status_requires_fixture check
   ((status='awaiting_payment' and mock_paid=false) or
    (status<>'awaiting_payment' and mock_paid=true)),
 constraint f5_mock_gps_only_en_route check
   (not tracking_consent or (status='en_route' and mock_paid))
);

-- Revogação permanente da sessão sintética quando o vínculo do pedido muda.
-- A -> B -> A não ressuscita mensagens nem GPS de uma atribuição encerrada.
create table private.f5_mock_revocations (
 session_id uuid primary key references public.f5_mock_sessions(id) on delete cascade,
 revoked_at timestamptz not null default clock_timestamp()
);
alter table private.f5_mock_revocations enable row level security;
revoke all on private.f5_mock_revocations from public,anon,authenticated;

create function private.f5_mock_revoke_request_binding()
returns trigger language plpgsql security definer set search_path='' as $
begin
 if (new.customer_id,new.provider_id,new.status) is distinct from
    (old.customer_id,old.provider_id,old.status) then
   insert into private.f5_mock_revocations(session_id)
   select s.id from public.f5_mock_sessions s where s.request_id=old.id
   on conflict(session_id) do nothing;
 end if;
 return new;
end;
$;
revoke all on function private.f5_mock_revoke_request_binding() from public,anon,authenticated;
create trigger f5_mock_revoke_binding after update of customer_id,provider_id,status
 on public.service_requests for each row execute function private.f5_mock_revoke_request_binding();

-- Consulta privada de vínculo: também valida o próprio chamador, não expõe dados.
create function private.f5_mock_binding_visible(p_session_id uuid)
returns boolean language sql stable security definer set search_path='' as $
 select private.f5_mock_enabled() is true and auth.uid() is not null and exists (
  select 1 from public.f5_mock_sessions s
  join public.service_requests r on r.id=s.request_id
  join public.service_quotes q on q.id=s.quote_id and q.request_id=r.id
  join public.providers p on p.id=s.provider_id
  where s.id=p_session_id
   and r.status='awaiting_payment' and r.customer_id=s.customer_id
   and r.provider_id=s.provider_id
   and q.status='accepted' and q.provider_id=s.provider_id
   and not exists(select 1 from private.f5_mock_revocations x where x.session_id=s.id)
   and (s.customer_id=auth.uid() or
    (s.provider_owner_id=auth.uid() and p.owner_id=auth.uid()
     and p.status='approved' and p.is_active))
 );
$;
revoke all on function private.f5_mock_binding_visible(uuid) from public,anon,authenticated;
grant execute on function private.f5_mock_binding_visible(uuid) to authenticated;

create function private.f5_validate_mock_session()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
   if (new.request_id,new.quote_id,new.customer_id,new.provider_id,new.provider_owner_id)
       is distinct from
      (old.request_id,old.quote_id,old.customer_id,old.provider_id,old.provider_owner_id)
   then raise exception 'Vinculos da sessao mock imutaveis.'; end if;
 end if;
 if exists(select 1 from private.f5_mock_revocations x where x.session_id=new.id)
 then raise exception 'Vinculo da sessao mock revogado.'; end if;
 if not exists (
   select 1 from public.service_requests r
   join public.service_quotes q on q.request_id=r.id
   join public.providers p on p.id=q.provider_id
   where r.id=new.request_id and r.customer_id=new.customer_id
     and r.status='awaiting_payment'
     and r.provider_id=new.provider_id
     and q.id=new.quote_id and q.status='accepted'
     and q.provider_id=new.provider_id
     and p.owner_id=new.provider_owner_id
     and p.status='approved' and p.is_active
 ) then raise exception 'Fixture F5 exige pedido e orcamento coerentes, nunca prova de pagamento.'; end if;
 return new;
end;
$$;
revoke all on function private.f5_validate_mock_session() from public,anon,authenticated;
create trigger f5_fixture_session_check
before insert or update on public.f5_mock_sessions
for each row execute function private.f5_validate_mock_session();

create table public.f5_mock_messages (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.f5_mock_sessions(id) on delete cascade,
 actor_id uuid not null,
 kind text not null default 'participant' check (kind in ('participant','support')),
 body text not null check (length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index f5_mock_messages_session_idx
 on public.f5_mock_messages(session_id,created_at,id);

create function private.f5_validate_mock_message()
returns trigger language plpgsql security invoker set search_path='' as $$
declare s record;
begin
 select customer_id,provider_owner_id,status,mock_paid into s
 from public.f5_mock_sessions where id=new.session_id;
 if not found or not s.mock_paid
   or new.actor_id not in (s.customer_id,s.provider_owner_id)
   or (new.kind='participant' and s.status not in
       ('ready_for_dispatch','en_route','arrived','in_service'))
   or (new.kind='support' and s.status<>'support_review')
 then raise exception 'Mensagem mock sem participante e etapa validos.'; end if;
 return new;
end;
$$;
revoke all on function private.f5_validate_mock_message() from public,anon,authenticated;
create trigger f5_mock_message_check before insert on public.f5_mock_messages
for each row execute function private.f5_validate_mock_message();

-- Somente a ULTIMA localizacao; nunca percursos. Leitura condicionada ao
-- STATUS DO SERVIDOR, consentimento, prestador homologado e frescor.
create table public.f5_mock_latest_location (
 session_id uuid primary key references public.f5_mock_sessions(id) on delete cascade,
 latitude numeric(9,6) not null check(latitude between -90 and 90),
 longitude numeric(9,6) not null check(longitude between -180 and 180),
 accuracy_meters numeric(7,2) not null check(accuracy_meters between 0 and 500),
 sampled_at timestamptz not null,
 updated_at timestamptz not null default now()
);

-- Sem qualquer permissao de escrita pelo navegador, inclusive "authenticated".
revoke all on public.f5_mock_sessions,public.f5_mock_messages,
  public.f5_mock_latest_location from public,anon,authenticated;
alter table public.f5_mock_sessions enable row level security;
alter table public.f5_mock_messages enable row level security;
alter table public.f5_mock_latest_location enable row level security;

-- Nao conceder fixture_receipt/mock_paid no Data API.
grant select(id,request_id,quote_id,customer_id,provider_id,provider_owner_id,
             status,tracking_consent,created_at,updated_at)
  on public.f5_mock_sessions to authenticated;
grant select(id,session_id,actor_id,kind,body,created_at)
  on public.f5_mock_messages to authenticated;
grant select(session_id,latitude,longitude,accuracy_meters,sampled_at,updated_at)
  on public.f5_mock_latest_location to authenticated;

create policy f5_mock_session_participants on public.f5_mock_sessions
for select to authenticated using (
  (select private.f5_mock_enabled()) and private.f5_mock_binding_visible(id)
);
create policy f5_mock_messages_participants on public.f5_mock_messages
for select to authenticated using (
  (select private.f5_mock_enabled())
  and exists(select 1 from public.f5_mock_sessions s
     join public.providers p on p.id=s.provider_id
     where s.id=session_id and
        ((kind='participant' and s.status in
          ('ready_for_dispatch','en_route','arrived','in_service')
          and p.status='approved' and p.is_active)
         or (kind='support' and s.status='support_review')))
);
create policy f5_mock_presence_en_route on public.f5_mock_latest_location
for select to authenticated using (
  (select private.f5_mock_enabled())
  and sampled_at>=now()-interval '120 seconds' and sampled_at<=now()
  and exists(select 1 from public.f5_mock_sessions s
    join public.providers p on p.id=s.provider_id
    where s.id=session_id and s.status='en_route'
      and s.tracking_consent
      and p.status='approved' and p.is_active)
);

-- Nao criar RPC/Edge Function, Webhook, Realtime publication, cron ou trigger
-- de notificacoes. Sem grant de alteracao para anon/authenticated.
commit;
