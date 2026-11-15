# F4 — Evidências e pendências de homologação

**Escopo deste relatório:** backend financeiro **fictício** e simulador. Não existe pagamento, recebimento, saldo, transferência ou estorno no provedor.

**Repositório:** bonecodesign/salvamotoca · **PR:** #45 · **Base:** F3 PR #44 (por sua vez depende da F2 PR #42).

## Critérios de validação

| Gate | Estado | Evidência exigida |
| --- | --- | --- |
| Preço em centavos e comissão 15% só serviço | Testes locais | Node f4-finance.test.js e consulta SQL dos itens aceitos |
| Tarifa de processamento atribuída ao cliente | Regra simulada | Revisão legal e valor oficial do PSP ainda pendentes |
| Tentativa mock exclusiva do banco, sem acesso direto de usuários | Testes locais | PostgreSQL17 / Auth/RLS e grants |
| Mock de assinatura e janela temporal | Testes locais | Node f4-mock-webhook.test.js; **não é Stripe webhook** |
| Eventos duplicados e fora de ordem | Testes locais | Node + PostgreSQL inbox com chave única |
| Duas conexões e evento idêntico | Testes locais | tests/f4-concurrency.sh em PostgreSQL descartável |
| Ledger de teste imutável e estorno compensatório | Testes locais | SQL negando UPDATE/DELETE e compensação negativa |
| Rollback proibido com gate ativo ou registros | Testes locais | tests/f4-rollback-guard.sh |
| Rollback vazio preserva tabelas F1–F3 | Testes locais | supabase/rollback/f4_only_if_empty.sql |
| Backup restaurável de PostgreSQL/Auth/Storage | BLOQUEADO | Prova privada de restauração no ambiente existente |
| Esquema contábil real de partidas dobradas | NÃO EXECUTADO | Especificação auditada e migration revisada |
| PSP contratado ou homologado para Brasil | NÃO EXECUTADO | Direitos, CNPJ, Pix, cartão, contas conectadas e contratos |
| Webhook REAL assinado e conciliado | NÃO EXECUTADO | SDK oficial + sandbox autorizado, IDs, signature, event retries |
| Pagamento e tarifa do cliente realmente confirmados | NÃO EXECUTADO | Valor, moeda, método e transparência antes do aceite |
| Refundos/chargebacks/estornos parciais e divergências | NÃO EXECUTADO | Mediação, PSP, compensações e prazos |
| Repasse e liquidação ao prestador | NÃO EXECUTADO | Financeiro/compliance e confirmação bilateral F6 |
| Integração pagamento→chat/despacho F5 | NÃO EXECUTADO | E2E com pagamento autorizado, sem vazamento de endereço |
| Liberação comercial em piloto BH | NÃO EXECUTADO | Go/no-go de F7 com humanos responsáveis |

**Importante:** os testes locais não demonstram que um PSP irá confirmar ou reter fundos. A infraestrutura financeira candidata `supabase/drafts/f4_financial_backend_candidate.sql` só admite estados `mock_*`, permanece atrás de gate desligado e não modifica `service_requests.status`.

## Registros de incidentes

- Links dos workflows e commit SHA: atualizar após checagem completa do CI.
- Falhas e retestes: registrar erros e correções, sem credenciais.

## Decisão de liberação

**NO-GO para dinheiro real.** Flags F1–F4 continuam desativadas para fluxo financeiro e não há serviço contratado. PR #45 em revisão, sem merge.
