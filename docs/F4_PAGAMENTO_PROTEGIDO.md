# F4 — Pagamento protegido e repasse posterior

**Estado:** preparado em código puro; integração Stripe, cobrança, transferência, onboarding e ativação continuam desligados.

## Regras consolidadas

1. Cliente aprova o orçamento e vê valor do serviço, comissão e taxa de processamento antes de pagar.
2. Pagamento confirmado mantém o valor retido; somente então o chat pode abrir.
3. Cliente e prestador confirmam a conclusão pelo app.
4. O repasse ao prestador só pode ser solicitado após as duas confirmações.
5. A comissão é 15% do valor do serviço; a taxa de processamento é apresentada separadamente ao cliente.
6. Cancelamento do prestador antes do serviço e ausência comprovada do prestador são candidatos a reembolso automático. Divergências seguem para revisão do suporte.
7. A operação real exigirá webhook validado, idempotência, sigilo de credenciais, auditoria e aprovação humana.

## Estado financeiro preparado

```text
awaiting_payment_confirmation
  -> paid_held
  -> ready_for_transfer (cliente + prestador confirmaram)
  -> transfer_pending
  -> transferred

paid_held/ready_for_transfer
  -> auto_refund_pending | refund_review_pending
```

O módulo `payment-f4.js` só calcula valores e valida transições. Ele não se conecta ao Stripe nem ao Supabase, e não deve ser usado para marcar pagamento ou transferência real. A integração real será exclusivamente de backend em etapa posterior.

## Limites da fase

- `paymentFeatureEnabled` permanece desativado.
- Não há chave Stripe, conta conectada, checkout, URL de pagamento, webhook ou dado bancário no repositório.
- Não há alteração aplicada ao Supabase nesta fase.
- A modelagem final de tabelas e RLS será enviada em migration própria depois da revisão do desenho financeiro e antes dos testes em sandbox.
