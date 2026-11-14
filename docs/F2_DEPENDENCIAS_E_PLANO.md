# F2 — Prestadores, distribuição e orçamentos | arquitetura segura

**Status:** preparação e simulação offline em branch isolada; **não implantado no Supabase**, não liberado para usuários.
**Projeto único:** Supabase Salva Motoca ref `yivkqyjdeouxnwtwfekc`.
**Fonte de decisões:** `docs/PRODUTO_OFICIAL.md`, `docs/fundacao/08_REGISTRO_DE_DECISOES.md`, `docs/fundacao/03_PRD_PRODUTO.md` e `docs/F1_WORK_EXECUCAO.md`.

## 1. Levantamento do estado REAL (leitura, sem SQL de escrita)

Conferido contra a `main` e a definição do banco atual:

| Tema | Implementado hoje | Lacuna para F2 |
| --- | --- | --- |
| Cadastro e aprovação | `providers`, `provider_services`, status `pending/approved/suspended`, RLS; cadastro via app | Painel de homologação com validação documental e trilha de auditoria; não publicar candidatos |
| Presença | `bj_provider_presence`, `bj_set_presence`, heartbeat `bj_ping_presence`, `bj_online_providers` (90s) | Canais de notificação com confirmação efetiva de entrega |
| Solicitação | F1 com foto privada, moto e serviços múltiplos; flag desligada | Validação **server-side** de cobertura declarada, compatibilidade com TODOS os serviços e busca progressiva |
| Seleção manual/automática | Filtro básico e distância em linha reta no navegador | Distância/cobertura/rodadas devem ser revalidadas no servidor, sem expor endereço privado |
| Histórico de recusas | `bj_request_attempts`, 1 recusa permite nova oportunidade, 2 excluem na rodada | Integração da regra com ofertas simultâneas e notificações confiáveis |
| Orçamentos | `bj_submit_quote` e `bj_answer_quote` operam sobre **um** `service_requests.provider_id` ativo | Múltiplos prestadores e propostas, itens separados por serviço/deslocamento/peças, expiração após 5min, seleção única e segura |
| Dados financeiros | `service_quotes.amount_cents` total simples; `awaiting_payment` sem cobrar | Total itemizado + invariantes no servidor; F4 (PSP) é bloqueio de pagamento |
| Cronômetros | Regras aprovadas, mas sem agendador confiável | 5min para responder e 5min para validade de orçamento, 2 e 4min30s para lembretes; nunca depender de timer de browser |
| Incidentes | Aprovação e suporte ainda parciais | 10 ausências/30dias = **revisão humana**, não suspensão automática |

**Importante:** o esquema atual é **sequencial** e as RPCs privilegiadas têm checagens de titularidade/estado. NÃO liberar seleção múltipla ou proposta em paralelo por manipulação de `provider_id` no frontend. Nenhuma nova tabela, política, função ou migration F2 foi aplicada ao projeto hospedado.

## 2. O que foi entregue neste PR (100% offline)

- `f2-flow.js` — módulo UMD com funções determinísticas, sem dependências, SDK, `fetch`, autenticação ou efeitos colaterais:
  - elegibilidade: homologação, serviço ativo, online voluntário, heartbeat até 90s, município/UF, cobertura declarada, **todos** os tipos solicitados;
  - busca progressiva em anéis informados pela chamada, ordenando recusas (0 antes de 1), proximidade e desempate determinístico com semente, sem reputação;
  - recusa recente sem reoferta imediata; segunda recusa exclui só da rodada;
  - tempo de resposta de 5min **contado após entrega comprovada**, lembretes em 2min e 4min30s depois dessa entrega, ausência contável **apenas se notificação entregue**;
  - revisão humana após dez ausências confirmadas nos últimos 30dias, sem suspensão automática;
  - preços **inteiros em centavos** por serviço escolhido, deslocamento explícito obrigatório e peças, teto de segurança de simulação R$ 5.000; reboque bloqueado até F3;
  - aceite/recusa pelo cliente titular, validade de orçamento 5min, **escolha única entre várias propostas**, transição simulada para `awaiting_payment`, pagamento/chat/despacho sempre bloqueados.
- `docs/F2_PREVIEW.html`: visualização interativa responsiva que usa o mesmo módulo. Demonstra comparação entre prestadores, duas propostas fictícias e seleção de um único vencedor. **Somente dados sintéticos**; nenhum login, GPS, chamada ao Supabase ou envio externo. Raios de exemplo 1/3/10 km são **parâmetros ilustrativos**, não política geográfica do app.
- `tests/f2-flow.test.js` e `tests/f2-browser.test.js`: regressões Node e Chrome com bloqueio de tráfego externo.

Essas funções representam o **modelo esperado**, não constituem autorização real de servidor. O orçamento demonstrativo não entra na tabela `service_quotes`.

## 3. Dependências para implementar backend F2 após F1/backup

Planejar as mudanças em migrations versionadas, com SQL e segurança avaliados em Postgres **descartável** antes de qualquer aplicação remota:

1. **Catálogo e área do prestador:** mapear códigos granulares para capacidades/área declarada. O `provider_services` atual registra só categorias `map_borracharia` e `borracharia_delivery`; não comprova que um prestador atende todos os tipos marcados na F1. A área deve ser confirmada pelo prestador e nunca autoconcedida pela interface.
2. **Múltiplas ofertas de uma solicitação:** nova relação de convite `request_offers` (identificador, pedido, prestador, rodada, entrega, resposta, vencimento, estado, idempotência). `service_requests.provider_id` e RPCs antigos precisam de compatibilidade/migração cuidadosa. Autorização exclusiva do titular, destinatário e administrador; nenhuma oferta a prestador pendente/offline/fora da área.
3. **Orçamento discriminado:** `quote_items` com tipo `service/travel/part`, código, quantidade e centavos, vinculados à proposta. Total persistido é **derivado no banco**, não escolhido pelo navegador. Deslocamento sempre presente, mesmo se custo zero. Alteração posterior exige outra proposta e novo aceite. Restrições para múltiplas propostas e único aceite por pedido.
4. **Distribuição transacional:** RPCs/worker com bloqueios concorrentes e idempotência; verificar `service_types`, município, cobertura, heartbeat e elegibilidade em **toda** oferta. Priorizar mais perto e ampliar busca somente se a etapa não retornar candidato; não revelar GPS/endereço exato na consulta pública. A busca de várias propostas e a escolha de uma pelo motociclista exigem um modelo diferente da simples atribuição sequencial atual.
5. **Eventos e ausência:** registro append-only de oferta, entrega real quando mensurável, abertura, resposta e expiração. Sem prova de entrega não contar ausência. Dez ausências registradas em 30 dias criam um caso para revisão humana; **não bloquear automaticamente**.
6. **Notificações PWA:** pedir consentimento, tratar offline/conexão instável, som/vibração conforme plataforma, lembretes em 2min e 4min30s. Registrar resultados verificáveis. Proibir SMS/WhatsApp e qualquer notificação externa antes da homologação.
7. **Administração:** aprovação/suspensão com autorização independente, dados mínimos e logs; quotas de uploads e limpeza segura de fotos órfãs; área de suporte para recontatos.
8. **Compatibilidade F1/F4:** manter `f1TestRequestsEnabled=false` até completar homologação real; F2 sem feature flag de produção nesta etapa; sem cobrança, chat nem despacho. Nunca simular `paid`/captura no banco.

### Modelo transacional desejado (especificação, NÃO SQL implantável)

`request` → `eligible_candidates` → `offers` (um ou mais convidados elegíveis) → `quotes` (itemizados) → **cliente escolhe uma** → `awaiting_payment`.

- Convite e orçamento são autoria autenticada e registrados em transação, nunca atualizações livres de cliente.
- Expiração e mudança de disponibilidade revalidam permissões sem depender de JavaScript/cronômetro local.
- Recusa não libera outro candidato imediatamente se a rodada já contém propostas pendentes; preservar histórico para auditoria.
- Aceite único atomicamente impede concorrência; preços e propostas são imutáveis após aceite.
- Somente o prestador vencedor poderá ser vinculado à execução após pagamento legitimamente confirmado em F4.
- Endereço exato só é disponibilizado ao prestador após pagamento real validado pela função autorizadora.

## 4. Gate da próxima implementação

**Não autorizado nesta etapa:** aplicar migrations, alterar RLS/remoto, criar prestadores ou contas, simular envio no Supabase, disparar push, contratar serviços, ativar a F1, liberar atendimento ou pagamento.

**Passos para continuidade:** backup recuperável e testes Auth/Storage da F1 via Work; aprovar o desenho da F2/multi-propostas e parâmetros de área; implementar backend em nova branch com testes isolados; homologar RLS/HTTP com perfis A, B e C; validar notificações em aparelhos reais; revisão humana; ativação deliberada por gate separado.

**Decisão de engenharia:** este PR pode ser integrado apenas como **pré-implementação segura** de F2 e documentação. Não significa que F2 funciona ponta a ponta no Supabase ou esteja pronta para liberação.
