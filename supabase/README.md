# Supabase de testes — Salva Motoca!

## Projeto exclusivo

- **Projeto de testes:** Salva Motoca!
- **Project ref:** `yivkqyjdeouxnwtwfekc`
- **Região do banco:** `sa-east-1` (servidores em São Paulo)
- **Operação inicial do produto:** Belo Horizonte e região metropolitana, Minas Gerais

A região do servidor não define a área de atendimento do aplicativo. A marca pública e operacional é **Salva Motoca!**.

## Esquema inicial

| Tabela | Finalidade |
|---|---|
| `app_profiles` | Perfis vinculados ao Supabase Auth |
| `service_categories` | Mapa gratuito, borracharia no local e reboque |
| `providers` | Prestadores e estabelecimentos, sujeitos a aprovação |
| `provider_services` | Um fornecedor pode oferecer mais de um serviço |
| `service_requests` | Chamados do cliente |
| `service_quotes` | Orçamentos de prestadores |
| `request_messages` | Conversas internas do atendimento |
| `payment_records` | Registro financeiro; **não cobra pagamentos reais** |

Categorias oficiais:
- `map_borracharia` — gratuita, sem comissão;
- `borracharia_delivery` — comissão de **15%**;
- `reboque_moto` — comissão de **15%**.

Todas as oito tabelas têm Row Level Security (RLS) ativado. Aprovação de prestadores, alterações de pedidos e escrita financeira ficam reservadas ao backend com permissões adequadas; nenhuma chave secreta deve ser publicada.

## Prospecção de prestadores em BH e RMBH

Foi incluído um cadastro **privado de prospecção**, separado do cadastro de fornecedores homologados do marketplace:

- `prestadores_prospeccao` — 36 possíveis fornecedores cadastrados para avaliação;
- `ofertas_prospeccao` — 40 modalidades/ofertas anunciadas ou a confirmar;
- `configuracao_comercial` — parâmetro comercial de comissão.

As três tabelas têm RLS ativado e **não possuem políticas de acesso público de propósito**; acessos `anon` e `authenticated` foram revogados. Isso produz avisos informativos de RLS sem policy no Advisor, mas não significa exposição de dados. Os possíveis prestadores **não são parceiros homologados nem estão disponíveis no mapa público**.

## Controle de versões e sincronização

A pasta `supabase/migrations/` contém as migrações aplicadas neste projeto. O histórico no GitHub serve como referência de código para reproduzir o esquema. **Não existe sincronização automática ou implantação contínua configurada** neste momento.

Migrações aplicadas:
1. `20261112201752_initial_salva_motoca_mvp_bh.sql`
2. `20261112201920_indexar_chaves_de_atendimentos.sql`
3. `20261112201921_iniciar_cadastro_prestadores_bh_20261112.sql`

Procedimento para alterações futuras:
1. Revisar SQL e impacto em autenticação/RLS.
2. Aplicar e verificar a migração **somente** no projeto Supabase de testes Salva Motoca!.
3. Versionar o SQL correspondente **somente** no repositório `bonecodesign/salvamotoca`.
4. Rodar consultas de validação e Supabase Advisors após a mudança.

**Segurança:** jamais versionar dados reais de clientes, dados privados de fornecedores, chaves `service_role`, tokens ou segredos. Chats não impedem por si sós que usuários digitem telefones; controles antifraude e moderação serão desenvolvidos separadamente.

**MVP em desenvolvimento:** não aceitar pagamentos reais ou solicitar atendimentos emergenciais até implementar e homologar fluxos externos, segurança e operação.
