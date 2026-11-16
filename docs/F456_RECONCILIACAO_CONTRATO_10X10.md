# Salva Motoca! — Reconciliação técnica SM-DEC-045/046 de F2 a F7

**Data:** 16/11/2026. **Estado:** candidato em Draft, **exclusivamente testes offline**. **Não instalar em produção.**

## Decisão comercial vigente

A regra substitui quaisquer referências históricas a comissão de 15% ou a cobrança de peças como terceira categoria:

- **Serviço**: orçamento do profissional inclui peças/materiais necessários, inclusive no reboque. Pode detalhar os serviços selecionados, mas jamais cobrar peças novamente.
- **Deslocamento**: mostrado à parte; nenhum percentual de intermediação incide sobre ele.
- **Motociclista**: paga **orçamento total + 10% do valor dos serviços** + tarifa PSP *somente se permitida, comprovada e informada antes do aceite*.
- **Prestador**: recebe como base de repasse **orçamento total − 10% do valor dos serviços**.
- **Plataforma**: receita bruta teórica de **20% dos serviços**, formada pela taxa de 10% do solicitante e pelo desconto de 10% do prestador.

### Exemplo com valores totalmente hipotéticos

| Parcela | Valor |
|---|---:|
| Serviço com materiais incluídos | R$ 230,00 |
| Deslocamento | R$ 40,00 |
| Orçamento prestador | R$ 270,00 |
| Taxa solicitante (10% sobre serviço) | R$ 23,00 |
| Total hipotético do solicitante, antes do PSP | **R$ 293,00** |
| Comissão descontada prestador (10% sobre serviço) | R$ 23,00 |
| Repasse-base hipotético prestador | **R$ 247,00** |
| Receita bruta teórica da plataforma | **R$ 46,00** |

Esses valores não demonstram disponibilidade financeira, faturamento, tributos ou autorização jurídica para cobrar.

## Cadeia técnica reconciliada neste ramo

- F1: código já integrado, mas **backup/restauração REAL, E2E Auth/Storage e homologação no hospedado pendentes**.
- F2/F3/F4: conteúdo técnico revisado do PR #56, com interface que mostra taxa de 10% antes do aceite, recusa orçamentos antigos com item `part` e candidatos PostgreSQL que só aceitam `service + travel`.
- F4: módulo de cálculo puro, ledger/risco **mock** sobre subtotal cobrado do solicitante, sem PSP, liquidação ou liberação de estado real.
- F5/F6: motores e SQLs **mock** herdados da cadeia #48–#51, com flags desligadas e isolamento de usuários. Não estão habilitados nem conectados a dinheiro real.
- F7: mantém preflight **NO-GO** herdado do PR #52.

A nova ponte `f456-financial-bridge-offline.js` usa efetivamente os motores F4, F5 e F6, unicamente em memória local. As transições são verificadas pelos testes em `tests/f456-financial-bridge-offline.test.js`.

### Contrato da ponte — segurança fail-closed

1. Vincula `requestId`, `quoteId`, cliente, prestador e o **subtotal cobrado** à cotação aceita. Recusa orçamento com `part`, preço adulterado, valor legado de 15% e IDs divergentes.
2. Recebe uma **fixture identificada explicitamente como NÃO-PSP** que tem de trazer exatamente R$ 293,00 no exemplo, não R$ 270,00 nem R$ 304,50. Nem um campo `paid` do navegador nem um recibo fictício podem autorizar qualquer ação real.
3. Só permite **chat e deslocamento fictícios** depois da fixture, mantendo `realChatAuthorized=false`, `realTrackingAuthorized=false` e `realDispatchAuthorized=false`.
4. Encerra o GPS mock após `provider_arrived`; o handoff para F6 só é possível depois de `service_started`.
5. Na F6, exige resumo, confirmação bilateral, janela de 5 minutos e tratamento de divergências. **Silêncio nunca autoriza conclusão.**
6. Estorno, disputa ou chargeback fictício bloqueiam imediatamente qualquer novo evento de atendimento mock e removem localização visível na ponte. Uma contestação após a dupla confirmação impede revisão.
7. `settlementReview()` pode apenas gerar **candidatura fictícia a revisão humana**, sem transferir dinheiro ou atestar saldo PSP. Mesmo com dupla confirmação, `transferAuthorized=false` e `pspFundsConfirmed=false`.

## PR #47: divergência financeira identificada, não integrada

`payment-f4.js` do PR #47 (branch paralela sobre `main`) ainda calcula `COMMISSION_BPS=1500`, considera `serviceAmountCents` como total do cliente e só desconta a comissão do prestador. **Não atende SM-DEC-045/046.** O fluxo antigo também pode retornar estados como `paid_held` e `ready_for_transfer` que não podem ser interpretados como recebimento de PSP. A recomendação técnica é **não mesclar #47 no mesmo caminho financeiro**; reconciliar ou encerrar essa alternativa mediante revisão humana.

A execução futura de pagamentos reais exige validação de webhook assinado, conciliação externa da moeda e valor cobrado (**incluindo os 10% do solicitante**), destinatário do repasse, tributação, política de estorno e regime de retenção; jamais assumir que Stripe oferece escrow.

## Compatibilidade de integração e próxima etapa

- Esta implementação foi **preparada para revisão técnica em branch**, não altera nem testa via HTTP o Supabase hospedado.
- Mocks F5/F6 PostgreSQL atuais não recebem recibo assinado e **não comprovam fluxo financeiro**; não converter seus modelos de fixture em migration.
- O cliente só aceita a proposta nova se todas as linhas de orçamento estiverem disponíveis, forem `service` ou `travel` e totalizarem o preço da proposta. Ainda deve ser testado contra corrida de edição no banco real, sob G1.
- A mudança contratual precisa de termos, nota fiscal e políticas de cobrança que distingam pagador da taxa de 10%, percentual do profissional e possível tarifa PSP.
- Após aprovação dos PRs encadeados, F5/F6 exigem backend real com Auth/RLS, verificação de pagamento e capacidade de revogação; GPS com expiração e provas de notificações; testes Android e revisão humana da operação.

**Bloqueio absoluto:** todos os recursos pagos e de despacho, chat e GPS real permanecem desativados. `G1=BLOCKED`, `RELEASE=NO_GO` até backup/restauração DB/Auth/Storage **do Supabase existente**, E2E, jurídico/PSP e autorização específica. **Não fazer merge/ativação automática.**
