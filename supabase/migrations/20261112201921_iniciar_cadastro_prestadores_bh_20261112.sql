-- Salva Motoca! — cadastro inicial BH/RMBH, 12/11/2026
-- Dados de prospecção NÃO são parceiros homologados.
-- RLS sem políticas públicas: somente acesso administrativo/privilegiado até homologação.

create table if not exists public.prestadores_prospeccao (
  id text primary key,
  nome_publico text not null,
  cidade text not null,
  bairro_base text,
  telefone_contato text,
  fonte_url text,
  status_cadastro text not null default 'prospectado'
    check (status_cadastro in ('prospectado','contato_iniciado','validado','homologado','inativo','recusou')),
  habilitado_para_chamados boolean not null default false,
  levantamento_em date not null default date '2026-11-12',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.ofertas_prospeccao (
  id text primary key,
  prestador_id text not null references public.prestadores_prospeccao(id),
  tipo text not null
    check (tipo in ('borracharia_movel','reboque_moto','borracharia_fisica')),
  situacao_oferta text not null
    check (situacao_oferta in ('anunciado','a_confirmar')),
  habilitada boolean not null default false,
  preco_base numeric(12,2),
  taxa_deslocamento numeric(12,2),
  criado_em timestamptz not null default now(),
  unique (prestador_id, tipo),
  check (preco_base is null or preco_base >= 0),
  check (taxa_deslocamento is null or taxa_deslocamento >= 0)
);

create table if not exists public.configuracao_comercial (
  chave text primary key,
  percentual numeric(5,4) not null check(percentual between 0 and 1),
  descricao text not null,
  atualizado_em timestamptz not null default now()
);

alter table public.prestadores_prospeccao enable row level security;
alter table public.ofertas_prospeccao enable row level security;
alter table public.configuracao_comercial enable row level security;
revoke all on public.prestadores_prospeccao from anon, authenticated;
revoke all on public.ofertas_prospeccao from anon, authenticated;
revoke all on public.configuracao_comercial from anon, authenticated;

-- A consulta pública ao mapa será uma camada separada após verificação dos estabelecimentos.
-- Nenhum acesso público é concedido a informações de prospecção ou contatos.
