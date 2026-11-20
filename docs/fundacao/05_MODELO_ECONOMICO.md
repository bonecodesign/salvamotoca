# FND-05 — Modelo econômico-financeiro e hipóteses

**Versão 0.2 — estudo interno, não previsão de faturamento**

## Hipóteses aprovadas ou registradas

- **Mapa e consulta:** gratuitos, sem cobrança pela ida direta à oficina.
- **Borracharia delivery intermediada:** 10% pagos pelo motociclista e 10% descontados do prestador sobre o valor do serviço efetivamente pago e liquidado pelo aplicativo. A aplicação prática permanece condicionada a contratos, regras de estorno, tributação e integração financeira homologada.
- **Reboque:** já está implementado no produto, mas não possui checkout nem cobrança real habilitados; sua ativação comercial depende de homologação. A divisão aprovada é de **10% + 10% sobre o valor do serviço de reboque**, sem incluir deslocamento, tarifa de processamento ou extras.
- **Preço de serviço:** definido pelo prestador em orçamento discriminado; serviços, deslocamento obrigatório e peças/materiais aparecem separadamente. Cliente aceita ou recusa o total. No piloto não há tabela fixa: valores potencialmente abusivos ou incoerentes podem ser encaminhados para revisão humana, sem ajuste automático.
- **Pagamento:** Pix/cartões e split ainda não conectados nem homologados.
- **Cancelamento pós-pagamento:** se o prestador cancelar, reembolso integral ao cliente, inclusive tarifa de processamento; se o cliente cancelar antes de o prestador marcar “em deslocamento”, reembolso integral; depois disso, valor retido até mediação, sem repasse automático.
- **Retenção e repasse:** após o aceite, o valor pago fica retido pelo intermediador até a confirmação de conclusão pelas duas partes. Depois, o intermediador realiza o repasse ao prestador conforme regras homologadas; sem confirmação bilateral, não há liberação automática e o caso segue para suporte/mediação. Esta regra depende de PSP compatível e validação jurídica, tributária e contratual.
- **Custo inicial de desenvolvimento:** priorizar ferramentas gratuitas quando possível, **não** considerar que a operação real terá custo zero.

## Unidade econômica de uma transação

Definições (valores em reais):
- P = preço total aceito e liquidado;
- c = comissão nominal (referência 0,15);
- F = custo total da transação de pagamento;
- V = custo variável de infraestrutura, mensagens e suporte atribuível ao pedido;
- T = tributos incidentes na operação da plataforma, conforme enquadramento;
- D = perda média esperada com disputas/estornos/fraudes;
- R = ajustes, reembolsos e repasses reversos.

**Comissão bruta definida para cálculo = P × 0,15**, incidindo sobre o valor do serviço aceito, sem incluir deslocamento, tarifa de processamento ou extras não aprovados.

**Resultado de contribuição estimado da plataforma = (P × c) − V − T − D − R.** A tarifa de processamento é cobrada separadamente do cliente e não compõe a comissão do serviço; sua cobrança, liquidação e eventuais reembolsos dependem do PSP homologado.

O valor financeiro líquido do prestador parte do valor do serviço menos a comissão aplicável, tributos dele, restituições e regras de split. A tarifa de processamento é encargo do cliente e deve aparecer destacada antes da confirmação. Não assumir que o simples percentual de comissão representa margem ou caixa disponível.

### Exemplo meramente ilustrativo — NÃO é preço de mercado

| Valor aceito hipotético | Divisão 10% + 10% | Parcelas antes de outras taxas e tributos |
| ---: | ---: | ---: |
| R$ 80,00 | R$ 12,00 | R$ 68,00 |
| R$ 100,00 | R$ 15,00 | R$ 85,00 |
| R$ 150,00 | R$ 22,50 | R$ 127,50 |

**Atenção:** números acima ignoram custos de pagamento, suporte, impostos e eventuais devoluções; não são promessa de repasse líquido.

## Variáveis para a planilha de viabilidade

| Variável | Unidade | Situação |
| --- | --- | --- |
| Prestadores homologados | quantidade | Sem base operacional ainda |
| Prestadores online ativos por hora | quantidade | Medir em piloto |
| Pedidos iniciados por dia | quantidade | Hipótese a levantar |
| Pedidos que recebem orçamento | % | Teste real pendente |
| Taxa de aceite | % | Teste real pendente |
| Ticket médio efetivamente pago | R$ | Pesquisa e piloto pendentes |
| Comissão nominal | % | **10% do motociclista + 10% do prestador**; implementação pendente |
| Taxa de processamento | R$/pedido e % | Negociar com provedor |
| Custo variável de atendimento | R$/pedido | Medir |
| Impostos e obrigações | % e R$ | Contador/jurídico definir |
| Chargeback/refund | % e R$ | Medir |
| Custo fixo mensal | R$ | Orçar |
| Capital de giro e reserva | R$ | Definir |

## Fórmulas de planejamento

**Pedidos liquidados mensais = pedidos iniciados × % com orçamento × % de aceite × % liquidados.**

**Receita bruta mensal = pedidos liquidados × ticket médio dos serviços × 20%, composta por 10% do motociclista e 10% do prestador.**

**Margem de contribuição mensal = comissão bruta − custos variáveis da plataforma − devoluções e ajustes associados.**

**Resultado operacional estimado = margem de contribuição − custos fixos − despesas e tributos adicionais que caibam à plataforma.**

**Ponto de equilíbrio**, quando a margem média unitária for positiva: custos fixos mensais ÷ margem média por pedido. Não publicar ponto de equilíbrio sem medir custos reais.

## Riscos financeiros

1. Comissão insuficiente para custo de pagamento e suporte em tickets baixos.
2. Estornos/chargebacks, golpes e disputas sobre serviço prestado.
3. Repasses antecipados antes de confirmação de liquidação.
4. Impostos e retenções não modelados corretamente.
5. Necessidade de atendimento humano em casos de risco e reclamação.
6. Processador que não ofereça split, conciliação ou reembolso adequados.
7. Falta de prestadores online suficiente para gerar conversão.

## Controles obrigatórios

- Não manter dados brutos de cartão.
- Conciliar pagamento pelo servidor, com webhook validado, deduplicado e auditável.
- Separar valores de terceiros de receita da plataforma no planejamento contábil.
- Relatório de conciliação, estorno, retenção e imposto por período.
- Exibir ao cliente valor final antes de confirmação, sem taxas surpresas.
- Aplicar a decisão aprovada: tarifa de processamento como encargo do cliente, destacada antes da confirmação; definir tributos, cancelamento e chargeback.
- Não habilitar cobranças até testes reais e revisão contratual.

## Decisões comerciais pendentes

**A divisão de 10% + 10%, a tarifa de processamento como encargo do cliente e a composição transparente do orçamento já estão aprovadas.** Ainda é necessário decidir: preço mínimo de serviço; política de deslocamento por área; eventuais condições promocionais; split automático; calendário de repasses; reserva financeira para contingências; estornos parciais e tratamento de fraudes.

## Cenários propostos para análise futura

Construir planilha com **conservador**, **base** e **expansão**, alimentada por dados de entrevistas e do piloto (não inserir números arbitrários como estimativa real). Registrar por cenário: prestadores ativos, horários, pedidos, ticket, conversão, taxa de pagamento, reembolso, margem e necessidade de caixa.
