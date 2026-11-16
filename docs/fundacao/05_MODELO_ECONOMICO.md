# FND-05 — Modelo econômico-financeiro e hipóteses

**Versão 0.3 — SM-DEC-045/046, 16/11/2026; estudo interno, não previsão de faturamento**

## Hipóteses aprovadas ou registradas

- **Mapa e consulta:** gratuitos, sem cobrança pela ida direta à oficina.
- **Borracharia delivery intermediada:** **10% de taxa acrescida ao pagamento do solicitante e 10% de comissão descontada do prestador**, somente sobre o valor do serviço com materiais incluídos (SM-DEC-045, que substitui o percentual anterior de 15%). A aplicação prática permanece condicionada a contratos, regras de estorno, tributação e integração financeira homologada.
- **Reboque:** já está implementado no produto, mas não possui checkout nem cobrança real habilitados; sua ativação comercial depende de homologação. A decisão vigente é **10% para o solicitante + 10% para o prestador**, calculados sobre o valor do serviço de reboque com materiais incluídos, sem incidir sobre deslocamento ou processamento.
- **Preço de serviço:** definido pelo prestador em orçamento discriminado; somente **serviço (materiais/peças já incluídos)** e **deslocamento obrigatório** aparecem como categorias de cobrança, sem terceira linha de peças. Cliente aceita ou recusa o total. No piloto não há tabela fixa: valores potencialmente abusivos ou incoerentes podem ser encaminhados para revisão humana, sem ajuste automático.
- **Pagamento:** Pix/cartões e split ainda não conectados nem homologados.
- **Cancelamento pós-pagamento:** se o prestador cancelar, reembolso integral ao cliente, inclusive tarifa de processamento; se o cliente cancelar antes de o prestador marcar “em deslocamento”, reembolso integral; depois disso, valor retido até mediação, sem repasse automático.
- **Retenção e repasse:** após o aceite, o valor pago fica retido pelo intermediador até a confirmação de conclusão pelas duas partes. Depois, o intermediador realiza o repasse ao prestador conforme regras homologadas; sem confirmação bilateral, não há liberação automática e o caso segue para suporte/mediação. Esta regra depende de PSP compatível e validação jurídica, tributária e contratual.
- **Custo inicial de desenvolvimento:** priorizar ferramentas gratuitas quando possível, **não** considerar que a operação real terá custo zero.

## Unidade econômica de uma transação — decisão aprovada

**SM-DEC-045/046 — 16/11/2026:** a taxa de intermediação é repartida em **10% cobrados do motociclista solicitante + 10% descontados do prestador**, ambas calculadas **somente sobre o valor de serviço com materiais incluídos**. Deslocamento não sofre comissão.

Definições (reais):
- **S:** serviço orçado, com os custos de materiais e peças necessários **já incluídos**.
- **D:** deslocamento, cobrado separadamente.
- **O = S + D:** total do orçamento do prestador.
- **Cₛ = arredondar(S × 0,10):** taxa cobrada do solicitante.
- **Cₚ = arredondar(S × 0,10):** comissão descontada do prestador.
- **F:** eventual tarifa do processador cobrada do solicitante, se juridicamente permitida e claramente informada.
- **Cliente paga = O + Cₛ + F**.
- **Base a repassar ao prestador = O − Cₚ**.
- **Receita bruta teórica da plataforma = Cₛ + Cₚ**.
- **Margem estimada da plataforma = (Cₛ + Cₚ) − custos variáveis − tributos − estornos e ajustes da plataforma**.

A tarifa PSP não entra na base das comissões nem é automaticamente receita da plataforma. A divisão deverá ser reconciliada no provedor financeiro e revisada juridicamente antes de qualquer cobrança real.

### Exemplo didático — NÃO representa preço de mercado

| Serviço, materiais inclusos | Deslocamento | Taxa solicitante (10%) | Comissão prestador (10%) | Cliente paga, sem PSP | Prestador recebe (base) | Receita bruta plataforma |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| R$ 80,00 | R$ 0,00 | R$ 8,00 | R$ 8,00 | R$ 88,00 | R$ 72,00 | R$ 16,00 |
| R$ 100,00 | R$ 20,00 | R$ 10,00 | R$ 10,00 | R$ 130,00 | R$ 110,00 | R$ 20,00 |
| R$ 230,00 | R$ 40,00 | R$ 23,00 | R$ 23,00 | R$ 293,00 | R$ 247,00 | R$ 46,00 |

No terceiro exemplo, uma tarifa PSP **hipotética** de R$ 3,50 elevaria a cobrança ao cliente para **R$ 296,50**, sem alterar a base do orçamento ou as comissões. Não há PSP homologado para cobranças reais.

**Obs.:** o serviço de R$ 230 já inclui materiais. Não cobrar peças novamente. Se houver necessidade de material ou serviço adicional, o prestador precisa enviar novo orçamento de duas categorias, com novo aceite antes da cobrança.

## Variáveis para a planilha de viabilidade

| Variável | Unidade | Situação |
| --- | --- | --- |
| Prestadores homologados | quantidade | Sem base operacional ainda |
| Prestadores online ativos por hora | quantidade | Medir em piloto |
| Pedidos iniciados por dia | quantidade | Hipótese a levantar |
| Pedidos que recebem orçamento | % | Teste real pendente |
| Taxa de aceite | % | Teste real pendente |
| Ticket médio efetivamente pago | R$ | Pesquisa e piloto pendentes |
| Comissão nominal | % | **10% cliente + 10% prestador**, sobre serviço com materiais inclusos; implementação pendente |
| Taxa de processamento | R$/pedido e % | Negociar com provedor |
| Custo variável de atendimento | R$/pedido | Medir |
| Impostos e obrigações | % e R$ | Contador/jurídico definir |
| Chargeback/refund | % e R$ | Medir |
| Custo fixo mensal | R$ | Orçar |
| Capital de giro e reserva | R$ | Definir |

## Fórmulas de planejamento

**Pedidos liquidados mensais = pedidos iniciados × % com orçamento × % de aceite × % liquidados.**

**Receita bruta teórica de intermediação mensal = pedidos liquidados × valor médio dos serviços (materiais incluídos) × (10% + 10%)**, com arredondamento por pedido no sistema real.

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

**As duas comissões de 10%, a composição em serviço com materiais incluídos + deslocamento e a tarifa de processamento cobrada do cliente (sujeita a validação jurídica) estão aprovadas internamente.** Ainda é necessário decidir: preço mínimo de serviço; política de deslocamento por área; eventuais condições promocionais; split automático; calendário de repasses; reserva financeira para contingências; estornos parciais e tratamento de fraudes.

## Cenários propostos para análise futura

Construir planilha com **conservador**, **base** e **expansão**, alimentada por dados de entrevistas e do piloto (não inserir números arbitrários como estimativa real). Registrar por cenário: prestadores ativos, horários, pedidos, ticket, conversão, taxa de pagamento, reembolso, margem e necessidade de caixa.
