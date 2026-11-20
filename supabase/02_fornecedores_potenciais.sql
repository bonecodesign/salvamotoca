-- Salva Motoca! — Etapa 4: lista PRIVADA de fornecedores potenciais.
-- Execute UMA vez, DEPOIS de supabase/schema.sql, no SQL Editor de um projeto de testes.
-- Cadastro de prospecção NÃO equivale a prestador ativo nem aparece no mapa.

create table public.bj_supplier_leads (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique check (char_length(source_key) between 5 and 180),
  business_name text not null check (char_length(trim(business_name)) between 3 and 120),
  neighborhood text not null default '' check (char_length(neighborhood) <= 100),
  city text not null default 'Belo Horizonte' check (char_length(trim(city)) between 2 and 100),
  offers_workshop boolean not null default false,
  offers_delivery boolean not null default false,
  offers_tow boolean not null default false,
  source_note text not null default 'Lista preliminar' check (char_length(source_note) <= 250),
  contact_private text not null default '' check (char_length(contact_private) <= 250),
  notes text not null default '' check (char_length(notes) <= 700),
  status text not null default 'prospect'
    check (status in ('prospect','contacted','invited','declined','onboarded')),
  linked_provider_id uuid references public.bj_providers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bj_lead_has_type check (offers_workshop or offers_delivery or offers_tow)
);

comment on table public.bj_supplier_leads is
  'Prospecção exclusivamente administrativa. Nunca expor no mapa nem compartilhar contato_private com usuários.';

create index bj_supplier_leads_status_idx on public.bj_supplier_leads(status, created_at desc);

create or replace function private.bj_touch_supplier_lead()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger bj_supplier_lead_touch before update on public.bj_supplier_leads
for each row execute function private.bj_touch_supplier_lead();

alter table public.bj_supplier_leads enable row level security;
revoke all on table public.bj_supplier_leads from anon, authenticated;
grant select, insert, update on table public.bj_supplier_leads to authenticated;

create policy bj_supplier_leads_admin_read on public.bj_supplier_leads
for select to authenticated using ((select private.bj_is_admin()));
create policy bj_supplier_leads_admin_insert on public.bj_supplier_leads
for insert to authenticated with check ((select private.bj_is_admin()));
create policy bj_supplier_leads_admin_update on public.bj_supplier_leads
for update to authenticated
using ((select private.bj_is_admin())) with check ((select private.bj_is_admin()));

-- Nenhuma permissão é concedida a anon. Nenhuma política de DELETE é criada.
-- Para remoções necessárias, usar SQL Editor com trilha de auditoria administrativa.
-- Nenhuma integração ou migração automática altera bj_providers ou seu status verified.
