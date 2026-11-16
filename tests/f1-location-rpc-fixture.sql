-- Salva Motoca! F1 — cenario 100% artificial para testes de RPC.
-- SOMENTE PostgreSQL 17 descartavel. NAO e migration e NAO aplicar no Supabase hospedado.
-- Simula a forma da RPC implantada em 16/11/2026 e uma revisao candidata.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable set search_path=''
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
revoke all on function auth.uid() from public,anon,authenticated;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

create table public.providers (
 id uuid primary key,
 owner_id uuid not null,
 status text not null check(status in('approved','suspended','pending')),
 is_active boolean not null
);
create table public.service_requests (
 id uuid primary key,
 customer_id uuid not null,
 provider_id uuid references public.providers(id),
 status text not null check(status in
  ('requested','quoted','awaiting_payment','accepted','in_progress','completed','cancelled')),
 address_details text,latitude numeric,longitude numeric
);
create table public.payment_records (
 request_id uuid primary key references public.service_requests(id),
 status text not null check(status in('pending','authorized','paid','failed','refunded')),
 paid_at timestamptz
);
create table public.service_quotes (
 id uuid primary key,
 request_id uuid not null references public.service_requests(id),
 provider_id uuid not null references public.providers(id),
 status text not null check(status in('proposed','accepted','declined','expired'))
);
create table private.f1_location_release_gate (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into private.f1_location_release_gate(singleton,enabled) values(true,false);
revoke all on private.f1_location_release_gate from public,anon,authenticated;
revoke all on public.providers,public.service_requests,public.payment_records,
 public.service_quotes from public,anon,authenticated;
alter table public.providers enable row level security;
alter table public.service_requests enable row level security;
alter table public.payment_records enable row level security;
alter table public.service_quotes enable row level security;

-- REGRESSAO HISTORICA (fixture da query de producao, NAO funcao a implantar):
-- permite localizacao a dono do prestador atribuido se payment_records.status='paid',
-- mesmo quando o prestador esta suspenso, request ainda awaiting_payment etc.
create function private.f1_location_baseline_fixture(p_request_id uuid)
returns table(address_details text,latitude numeric,longitude numeric)
language sql stable security definer set search_path='' as $$
 select r.address_details,r.latitude,r.longitude
 from public.service_requests r
 where r.id=p_request_id
  and (select auth.uid()) is not null
  and (
   r.customer_id=(select auth.uid())
   or (
    exists(select 1 from public.providers p
     where p.id=r.provider_id and p.owner_id=(select auth.uid()))
    and exists(select 1 from public.payment_records pay
     where pay.request_id=r.id and pay.status='paid')
   )
  );
$$;

-- CANDIDATO DE LOGICA (somente no schema private do PostgreSQL descartavel):
-- nao habilita operacoes reais. Sem flag no servidor, apenas o cliente le seu endereco.
-- Mesmo com flag ON no teste, exige prestador aprovado/ativo, estado adequado,
-- orcamento vencedor coerente e pagamento com status+timestamp consistente.
-- Um payment_records artificial NAO seria prova de PSP real: a futura F4 precisa
-- validar recibo assinado, proposta vencedora, antifraude, estorno/disputa e ledger.
create function private.f1_location_hardened_fixture(p_request_id uuid)
returns table(address_details text,latitude numeric,longitude numeric)
language sql stable security definer set search_path='' as $$
 select r.address_details,r.latitude,r.longitude
 from public.service_requests r
 where r.id=p_request_id
   and (select auth.uid()) is not null
   and (
     r.customer_id=(select auth.uid())
     or (
       exists(select 1 from private.f1_location_release_gate g
          where g.singleton and g.enabled)
       and r.status in ('accepted','in_progress')
       and exists(select 1 from public.providers p
         where p.id=r.provider_id
           and p.owner_id=(select auth.uid())
           and p.status='approved' and p.is_active)
       and exists(select 1 from public.service_quotes q
         where q.request_id=r.id and q.provider_id=r.provider_id
           and q.status='accepted')
       and exists(select 1 from public.payment_records pay
         where pay.request_id=r.id and pay.status='paid'
           and pay.paid_at is not null and pay.paid_at<=now())
     )
   );
$$;
revoke all on function private.f1_location_baseline_fixture(uuid) from public,anon,authenticated;
revoke all on function private.f1_location_hardened_fixture(uuid) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.f1_location_baseline_fixture(uuid),
  private.f1_location_hardened_fixture(uuid) to authenticated;

-- ID/tokens/enderecos 100% ficticios, sem emails, celular nem pessoa real.
insert into public.providers(id,owner_id,status,is_active)
values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222','approved',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '44444444-4444-4444-8444-444444444444','approved',true);
insert into public.service_requests(id,customer_id,provider_id,status,
 address_details,latitude,longitude)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'awaiting_payment','FAKE_TEST_LOCATION',-19.0,-43.0);
insert into public.service_quotes(id,request_id,provider_id,status)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','accepted');
-- Esse registro e SOMENTE fixture: NENHUM PSP, transacao, usuario ou pagamento REAL.
insert into public.payment_records(request_id,status,paid_at)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','paid',now()-interval '1 minute');
