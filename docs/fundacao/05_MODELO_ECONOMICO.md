# FND-05 — Modelo econômico-financeiro e hipóteses

**Versão 0.3 — decisão de incidência da taxa atualizada em 16/11/2026; estudo interno, não previsão de faturamento**

## Hipóteses aprovadas ou registradas

- **Mapa e consulta:** gratuitos, sem cobrança pela ida direta à oficina.
- **Borracharia delivery intermediada:** comissão de **15% aprovada internamente em 12/11/2026** sobre o valor do serviço efetivamente pago e liquidado pelo aplicativo (SM-DEC-014). A taxa é **acrescentada ao total pago pelo solicitante**, e **não deduzida do orçamento do prestador**. A aplicação prática permanece condicionada a contratos, regras de estorno, tributação e integração financeira homologada.
- **Reboque:** já está implementado no produto, mas não possui checkout nem cobrança real habilitados; sua ativação comercial depende de homologação. A comissão aprovada é de **15% sobre o valor do serviço de reboque**, sem incluir deslocamento, tarifa de processamento ou extras; ela é **cobrada do solicitante**, além do orçamento do prestador.
- **Preço de serviço:** definido pelo prestador em orçamento discriminado; serviços, deslocamento obrigatório e peças/materiais aparecem separadamente. Cliente aceita ou recusa o total. No piloto não há tabela fixa: valores potencialmente abusivos ou incoerentes podem ser encaminhados para revisão humana, sem ajuste automático.
- **Pagamento:** Pix/cartões e split ainda não conectados nem homologados.
- **Cancelamento pós-pagamento:** se o prestador cancelar, reembolso integral ao cliente, inclusive tarifa de processamento; se o cliente cancelar antes de o prestador marcar “em deslocamento”, reembolso integral; depois disso, valor retido até mediação, sem repasse automático.
- **Retenção e repasse:** após o aceite, o valor pago fica retido pelo intermediador até a confirmação de conclusão pelas duas partes. Depois, o intermediador realiza o repasse ao prestador conforme regras homologadas; sem confirmação bilateral, não há liberação automática e o caso segue para suporte/mediação. Esta regra depende de PSP compatível e validação jurídica, tributária e contratual.
- **Custo inicial de desenvolvimento:** priorizar ferramentas gratuitas quando possível, **não** considerar que a operação real terá custo zero.

## Unidade econômica de uma transação

**Decisão de pagador em 16/11/2026: o solicitante paga a taxa de intermediação de 15%; o prestador não arca com ela.**

Definições, valores em reais:
- **S** = soma dos itens **serviço** do orçamento aceito;
- **D** = deslocamento orçado pelo prestador;
- **M** = peças/materiais orçados;
- **O = S + D + M** = orçamento integral devido ao prestador;
- **C = arredondar(S × 0,15)** = taxa da plataforma **paga pelo solicitante**;
- **F** = eventual tarifa financeira do PSP cobrada do solicitante, se juridicamente permitida e previamente informada;
- **T = O + C + F** = total exibido para aprovação do solicitante;
- **V, I, R** = custos variáveis da plataforma, impostos e ajustes de reembolso/chargeback (quando cabíveis).

**Repasse-base ao prestador = O = S + D + M; não subtrair C.** Repasse efetivamente liquidado permanece condicionado ao PSP, ao cumprimento do serviço, a eventuais cancelamentos/estornos e às obrigações próprias do prestador.

**Receita bruta teórica da plataforma = C**, antes de seus custos, tributos e ajustes; **margem de contribuição estimada = C − V − I − R**, sem considerar tarifas de passagem como receita líquida.

### Exemplo meramente ilustrativo — NÃO é preço de mercado

| Serviço S | Deslocamento D | Materiais M | Prestador recebe O | Plataforma C (15% de S) | Solicitante paga O + C, sem F |
| ---: | ---: | ---: | ---: | ---: | ---: |
| R$ 80,00 | R$ 0,00 | R$ 0,00 | R$ 80,00 | R$ 12,00 | R$ 92,00 |
| R$ 100,00 | R$ 20,00 | R$ 10,00 | R$ 130,00 | R$ 15,00 | R$ 145,00 |
| R$ 230,00 | R$ 40,00 | R$ 10,00 | R$ 280,00 | R$ 34,50 | R$ 314,50 |

Com tarifa hipotética do PSP de R$ 3,50 no último exemplo, o solicitante pagaria **R$ 318,00**, o prestador teria base de repasse **R$ 280,00** e a plataforma teria receita bruta da taxa de **R$ 34,50**. O PSP não foi contratado nem homologado; o valor de R$ 3,50 é apenas aritmética ilustrativa.

**Atenção:** taxas, repasses, cancelamentos e tributos precisam de enquadramento jurídico-contábil e validação do processador. Não prometer repasse líquido final de R$ 280,00 caso existam impostos próprios do prestador ou ajustes autorizados.

## Variáveis para a planilha de viabilidade

| Variável | Unidade | Situação |
| --- | --- | --- |
| Prestadores homologados | quantidade | Sem base operacional ainda |
| Prestadores online ativos por hora | quantidade | Medir em piloto |
| Pedidos iniciados por dia | quantidade | Hipótese a levantar |
| Pedidos que recebem orçamento | % | Teste real pendente |
| Taxa de aceite | % | Teste real pendente |
| Ticket médio efetivamente pago | R$ | Pesquisa e piloto pendentes |
| Comissão nominal | % | **15% aprovada internamente**; implementação pendente |
| Taxa de processamento | R$/pedido e % | Negociar com provedor |
| Custo variável de atendimento | R$/pedido | Medir |
| Impostos e obrigações | % e R$ | Contador/jurídico definir |
| Chargeback/refund | % e R$ | Medir |
| Custo fixo mensal | R$ | Orçar |
| Capital de giro e reserva | R$ | Definir |

## Fórmulas de planejamento

**Pedidos liquidados mensais = pedidos iniciados × % com orçamento × % de aceite × % liquidados.**

**Taxa de intermediação bruta mensal = pedidos liquidados × valor médio das linhas de serviço × 15%.** A taxa é paga pelo solicitante, fora do orçamento do prestador.

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

**A taxa de intermediação de 15% cobrada do solicitante (sem desconto no orçamento do prestador), a tarifa de processamento como encargo do cliente sujeita a revisão jurídica e a composição transparente do orçamento já estão aprovadas internamente.** Ainda é necessário decidir: preço mínimo de serviço; política de deslocamento por área; eventuais condições promocionais; split automático; calendário de repasses; reserva financeira para contingências; estornos parciais e tratamento de fraudes.

## Cenários propostos para análise futura

Construir planilha com **conservador**, **base** e **expansão**, alimentada por dados de entrevistas e do piloto (não inserir números arbitrários como estimativa real). Registrar por cenário: prestadores ativos, horários, pedidos, ticket, conversão, taxa de pagamento, reembolso, margem e necessidade de caixa.
