# Salva Motoca! — consolidação de release em 20/11/2026

## Fonte de verdade e limite de escopo

- Marca pública: **Salva Motoca!**.
- Repositório canônico: `bonecodesign/salvamotoca`.
- Supabase `yivkqyjdeouxnwtwfekc`: **ambiente de testes**, nunca produção nesta etapa.
- Estado de liberação: **NO-GO**. Não ativar pagamentos, despacho, atendimento, notificações externas ou contas reais.

Identificadores técnicos devem ser alterados somente com migração planejada, revisão de dependências e validação no ambiente de testes.

## Política comercial vigente

| Item | Regra vigente |
| --- | --- |
| Comissão da plataforma | 10% pago pelo motociclista + 10% descontado do prestador, somente sobre o serviço delivery ou de reboque |
| Deslocamento | obrigatório quando aplicável e fora da base de comissão |
| Taxa de processamento | encargo do cliente, exibida separadamente antes da confirmação |
| Mapa e ida direta ao estabelecimento | gratuitos e sem comissão |
| Repasse | somente depois de pagamento homologado e confirmação bilateral; pendências seguem para suporte |

A divisão **10% + 10%** é a política comercial vigente e substitui referências anteriores de 15%.

## Regra de integração de PRs

1. O código incorporado à `main` é a única base contada como entregue.
2. PRs em rascunho são evidência de pesquisa/teste; não representam funcionalidade liberada.
3. A cadeia de backup G1 deve ser revisada e integrada do PR mais recente para a base correta, evitando mesclar PRs empilhados em ordem errada.
4. Antes de integrar F2–F6, consolidar as regras de produto e os testes em uma única cadeia com a política financeira canônica de 10% + 10%.
5. Nenhuma fixture PostgreSQL offline pode ser aplicada ao Supabase hospedado sem migration revisada, backup/restauração comprovados e autorização específica.

## Metas de consolidação

| Prioridade | Critério de aceite | Situação |
| --- | --- | --- |
| P1 — documentação e marca | referências públicas usam Salva Motoca!, com legado técnico explicitado | em execução neste PR |
| P2 — regra comercial | 10% + 10%, deslocamento e taxa do cliente sem contradições | em execução neste PR |
| P3 — G1 backup | backup cifrado real do ambiente de testes e restauração isolada comprovada | bloqueada por configuração privada e execução controlada |
| P4 — Auth/RLS | testes A/B/C autenticados no Supabase de testes, sem dados pessoais | bloqueada por G1 |
| P5 — F2–F6 | pedidos, ofertas, pagamento sandbox, deslocamento, confirmação e suporte integrados | não iniciar antes de P3 e P4 |

## Próxima execução autorizável

Depois da revisão desta consolidação, a próxima atividade técnica é concluir a cadeia G1 em uma única PR revisável e executar seu workflow manual apenas quando o Environment protegido, a chave pública `age` e os secrets privados forem configurados fora do repositório. A saída obrigatória é uma evidência de exportação cifrada e restauração isolada; não é uma autorização de lançamento.
