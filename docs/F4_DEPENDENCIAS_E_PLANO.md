# F4 — Pagamentos protegidos, comissões e estornos (pré-implementação segura)

**Projeto:** Salva Motoca! · **branch:** `feat/f4-pagamentos-protegidos-simulador-seguro` · **dependências:** PR #42 (F2) e PR #44 (F3).

**Estado:** regras financeiras e preparação offline. Nenhum checkout, token, conta, cobrança, pagamento, transferência, saldo, reembolso, webhook real ou obrigação contratual foi criado.

## Decisões financeiras já aprovadas

- Comissão **15% somente sobre o valor do(s) serviço(s)**, tanto borracharia delivery como reboque. Deslocamento, materiais e tarifa de processamento **não** integram a base da comissão.
- Cliente arca com a tarifa de processamento **quando juridicamente permitido e tecnicamente confirmado pelo PSP**; deve ser exibida separadamente, antes da confirmação. **Não fixar uma tarifa presumida**.
- Orçamento escolhido fica imutável; adicionais exigem novo orçamento, novo aceite e avaliação de diferença financeira.
- Cliente só pode ter confirmação financeira por **webhook/autorização no servidor com verificação de assinatura, valor, moeda, prestador e idempotência**, reconciliado com o provedor. Retorno do navegador ou sessão concluída na UI não habilitam prestação, chat, endereço exato ou deslocamento.
- Cancelamento pelo prestador: regra proposta de **reembolso integral ao cliente incluindo tarifa**. Cancelamento pelo cliente antes de início do deslocamento: mesma regra. Após deslocamento, reembolso passa por **mediação humana**, sem liberação automática de saldo.
- Repasse ao prestador somente após **confirmações bilaterais da conclusão**, ausência de disputa, liquidação/validação do pagamento e elegibilidade contratual. Mesmo se elegível, o módulo puro NÃO inicia transferência.

## Modelo de cálculo (exemplo exclusivamente fictício)

| Parcela | Exemplo |
| --- | ---: |
| Reboque (serviço) | R$ 230,00 |
| Deslocamento | R$ 40,00 |
| Material | R$ 10,00 |
| **Orçamento aceito** | **R$ 280,00** |
| Comissão da plataforma: 15% de R$ 230 | R$ 34,50 |
| Saldo econômico destinado ao prestador, **antes de tributos e demais obrigações** | R$ 245,50 |
| Tarifa de processamento | **Não definida**; depende de PSP e meio de pagamento |
| Total a pagar pelo motociclista | **Não definido** até confirmação do valor da tarifa |

A responsabilidade legal/contábil por eventuais impostos e despesas não é resolvida por esses cálculos; não confundir valor previsto com saldo disponível ou efetivamente repassado.

## Código da primeira entrega

- `f4-finance.js` — módulo puro sem dependências ou rede: valida linhas de orçamento em centavos, calcula comissão sem incluir deslocamento/materiais, aceita tarifa apenas quando fornecida como valor confirmado, simula decisões de reembolso e condições de análise de repasse. Não confirma pagamento vindo do navegador.
- `tests/f4-finance.test.js` — testa cálculo, serviço misto, tentativa de adulteração, centavos, duplicatas, fraude por evento do navegador, cancelamentos, mediação e bloqueio de transferência.
- `config.js` — `f4PaymentsEnabled: false`. Nenhum componente de checkout foi adicionado; pagamentos permanecem proibidos mesmo que a F1/F2/F3 sejam ativadas em outro momento.

## Provedor de pagamentos: pesquisa técnica, sem conexão comercial

A documentação atual do Stripe Connect descreve marketplaces com cobrança pela plataforma e `separate charges and transfers` ou `destination charges`, conforme compatibilidade. Isso é um **caminho a investigar**, não decisão técnica ou contratação.

A Stripe informa expressamente que **não presta serviço de escrow**. Payouts manuais podem ter prazos máximos conforme o país e disponibilidade da conta, portanto não devem ser descritos como custódia indefinida. Não construir a política de mediação supondo que a Stripe guardará fundos por tempo ilimitado.

- [Stripe — Build a marketplace](https://docs.stripe.com/connect/marketplace)
- [Stripe — Using manual payouts (não é escrow)](https://docs.stripe.com/connect/manual-payouts)

**Antes de usar Stripe ou qualquer PSP:** confirmar suporte efetivo ao CNPJ brasileiro, modalidade Connect/Marketplace, métodos Pix/cartão disponíveis, estrutura de contas conectadas, disponibilidade de `separate charges and transfers`, responsabilidade por chargebacks, prazos máximos, repasses, estornos incluindo tarifas, impostos, contratos, LGPD e custos. A tarifa ao cliente depende de revisão jurídica e financeira brasileira. Não criar conta, produto, preço, PaymentIntent, Checkout Session ou transferência nesta etapa.

## Modelo de estados proposto para futura integração

```mermaid
flowchart TD
  A["Orçamento aceito"] --> B["Aguardando pagamento"]
  B --> C["PSP: confirmação assinada e conciliada pelo servidor"]
  C --> D["Pagamento verificado / valor sob regras do PSP"]
  D --> E["Atendimento (F5)"]
  E --> F["Confirmação do prestador + motociclista (F6)"]
  F --> G{"Disputa, estorno ou pendência?"}
  G -- Sim --> H["Suporte/mediação humana"]
  G -- Não --> I["Analisar elegibilidade de repasse no servidor"]
  D --> J["Cancelamento conforme política"]
  J --> K["Solicitar restituição ao PSP / revisão"]
```

**Sem webhook validado: continuar em `awaiting_payment`.** Falhas e retries não podem criar cobrança, estorno ou repasse duplicado. A confirmação de pagamento não se baseia em campo que o cliente possa escrever no Supabase.

## Dependências e critérios impeditivos

1. F1–F3 homologadas, com backup restaurável real (DB/Auth/Storage) antes de qualquer DDL remoto.
2. Forma jurídica e cadastral da empresa e prestadores, termos de contratação e política financeira revisados.
3. Escolher PSP com prova contratual de suporte aos métodos e à retenção/transferência desejada no Brasil.
4. Segredos, credenciais, verificações de webhook, idempotência e reconciliação no servidor — nunca no frontend, nunca no GitHub.
5. Ledger financeiro de partidas/lançamentos auditáveis, idempotência persistente e máquina de estados resistente a concorrência; API de transferência autenticada e aprovada por regra de negócio.
6. Fluxo de consentimento, confirmação clara de preço total, taxa, reembolso e custos da operação, sem surpresas.
7. Cenários adversariais de webhooks assinados, duplicados, atrasados, fora de ordem, chargeback, devolução, perda de rede, estorno parcial e disputa, exclusivamente em sandbox isolado e após autorização apropriada.
8. Sem pagamento real, o chat e rastreamento da F5 continuam fechados.

**Conclusão:** primeira entrega F4 é um **simulador de regras de preço, estorno e repasse**, não uma implementação financeira homologada nem um checkout utilizável. Toda integração real permanecerá bloqueada até revisão e autorização futura.
