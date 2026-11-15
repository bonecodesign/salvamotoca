# Plano Stripe Connect — Salva Motoca!

**Status:** decisão de arquitetura aprovada; não implementada, sem conta Stripe conectada, sem cobrança e sem repasse real.

## A. Configuração das contas

- **API:** Accounts v2 (`/v2/core/accounts`); não usar os tipos legados de conta.
- **Painel:** Express, com acesso do prestador pelo Salva Motoca e link seguro para o painel Stripe Express.
- **Cobrança de taxas:** a Salva Motoca gerencia a precificação.
- **Responsabilidade por saldos negativos:** Salva Motoca.

Cada prestador precisa da configuração de recebedor (`configuration.recipient`) com `stripe_transfers` em `stripe_balance`, para receber transferências da plataforma. Prestadores desse marketplace não devem solicitar configuração de comerciante nem capacidade de recebimento de cartão.

## B. Padrão de cobrança: cobranças separadas e transferências

O cliente paga dentro do Salva Motoca. O valor fica retido pela plataforma e somente é transferido ao prestador depois da confirmação de conclusão por cliente e prestador. Esse padrão atende ao pagamento protegido, ao chat liberado após pagamento e à mediação de divergências.

O Salva Motoca é o negócio que o cliente reconhece como recebedor do pagamento e que trata reembolsos e contestações. Não usar transferência automática no pagamento inicial.

## C. Onboarding de prestadores

1. O prestador cria o cadastro no Salva Motoca.
2. Após revisão operacional, o app cria a conta conectada e abre o onboarding incorporado do Stripe.
3. A verificação de identidade e dados bancários é concluída no fluxo do Stripe.
4. O app consulta continuamente os requisitos e as capacidades necessárias.
5. Prestadores sem capacidade ativa não aparecem como aptos a receber transferências.

O onboarding será incorporado ao Salva Motoca, reduzindo abandono e mantendo o contexto do cadastro. A plataforma também exibirá pendências e mudanças de requisitos antes de liberar novos repasses.

## D. Acesso ao painel do prestador

- Painel operacional completo dentro do Salva Motoca: chamados, orçamentos, deslocamento, saldo previsto, repasses, histórico e pendências.
- Painel Stripe Express complementar, aberto por link seguro gerado pela plataforma, para visão de saldo, repasses e requisitos da conta.
- O painel interno será a referência operacional; o painel Stripe não substitui as regras de atendimento, confirmação e suporte do Salva Motoca.

## E. Componentes incorporados

Componentes recomendados no painel web do Salva Motoca:

- `account_onboarding`
- `notification_banner` — obrigatório para avisar exigências que poderiam bloquear a conta
- `account_management`
- `payments`
- `payouts`
- `balance_report`
- `payout_reconciliation_report`

Com cobranças separadas e transferências, as visões de pagamento e contestação do Stripe podem ter detalhe reduzido. O Salva Motoca deve manter seu próprio histórico de pedido, orçamento, confirmação, transferência e suporte.

## F. Webhooks

Usar webhooks com validação obrigatória de assinatura para confirmar alterações financeiras e de verificação; os eventos e a implementação detalhada serão definidos na etapa de construção.

## G. Gate de habilitação

Antes de permitir transferência ao prestador, validar pela Accounts v2 que `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status` está `active` e conferir a capacidade de repasse correspondente. Não usar os indicadores legados `charges_enabled` ou `payouts_enabled` como gate.

## H. Comissão, taxa e fluxo de valores

- Comissão da Salva Motoca: **15%** do valor do serviço.
- Taxa de processamento: informada separadamente ao cliente antes de confirmar o pagamento.
- O cliente paga: valor do serviço + taxa de processamento visível.
- O prestador recebe após a conclusão: valor do serviço − 15%.
- A plataforma retém: 15% do serviço + taxa de processamento do cliente − custo efetivo de processamento.

`application_fee_amount` **não** deve ser usado neste padrão. Em cobranças separadas e transferências, a comissão é retida pela matemática do repasse: o valor transferido ao prestador é menor que o total cobrado do cliente.

```text
Cliente paga serviço + taxa de processamento
                  │
                  ▼
          Salva Motoca retém o pagamento
                  │
      conclusão confirmada pelas duas partes
                  │
                  ▼
Prestador recebe serviço − 15% de comissão
```

O custo de processamento varia por meio de pagamento, cartão e região. A taxa exibida ao cliente precisa ser transparente no orçamento e revisada com as regras de consumo aplicáveis. A plataforma deve conferir as tarifas vigentes em [Stripe Pricing](https://stripe.com/pricing) e acompanhar o [relatório de margem](https://docs.stripe.com/connect/margin-reports.md). Em transações muito pequenas, mínimos de cobrança e custos fixos podem reduzir a margem.

## I. Plano de implementação

1. Criar a modelagem de pagamento, transferência, reembolso, contestação e auditoria no Supabase por migration e RLS.
2. Implementar o cadastro de conta conectada e onboarding incorporado sem expor chaves secretas no cliente.
3. Adicionar checkout protegido, confirmação de pagamento por webhook e abertura do chat somente após confirmação persistida.
4. Implementar retenção, transferência após dupla confirmação, estorno antes do repasse e reversão de transferência quando necessária.
5. Exibir no orçamento serviço, comissão, taxa de processamento, valor final do cliente e valor líquido previsto do prestador.
6. Criar testes isolados de estados financeiros, idempotência, repetição de webhook, reembolso, contestação, falha de transferência e reconciliação.
7. Homologar em ambiente de teste autorizado antes de ativar qualquer método de pagamento real.

## J. Responsabilidade por saldos negativos

A Salva Motoca assume a responsabilidade por saldos negativos. Em uma contestação, a plataforma pode precisar reverter a transferência feita ao prestador; se o saldo do prestador não for suficiente, ele pode ficar negativo. Essa configuração torna possível recuperar valores de repasses e é necessária para o modelo de pagamento protegido.

## K. Gestão de risco

O Salva Motoca usará Radar como proteção base e adicionará regras próprias para padrões de fraude, ausências recorrentes, divergências, valores anormais e comportamento de conta suspeito. Gestão de risco é separada da responsabilidade por saldos negativos: Radar ajuda a prevenir fraude; a plataforma continua responsável quando houver saldo negativo não recuperado.

## L. Por que este desenho atende ao Salva Motoca

- Mantém o pagamento protegido até a confirmação de cliente e prestador.
- Libera o chat somente após pagamento confirmado, como definido no produto.
- Mantém comissão de 15% e deixa a taxa de processamento explícita ao cliente.
- Permite suporte, reembolso e mediação antes ou depois da transferência.
- Oferece painel operacional próprio e painel Stripe Express complementar ao prestador.

## M. Limites para a próxima etapa

Este plano não autoriza ativar pagamentos, criar conta Stripe, coletar dados bancários, cadastrar prestador real, enviar link de onboarding ou alterar a feature flag. A implementação deve ocorrer em PR separado, com segredos apenas no ambiente seguro, testes automatizados e aprovação humana antes de qualquer operação real.
