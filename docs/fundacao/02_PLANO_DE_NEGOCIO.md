# FND-02 — Plano de negócio e modelo de operação

**Versão 0.2 • Planejamento interno • Piloto proposto: Belo Horizonte, MG**

## 1. Resumo executivo

O Salva Motoca! é um marketplace em construção para o segmento de reparos de pneus de motocicletas. O produto combina um mapa gratuito de borracharias verificadas com um fluxo de solicitação delivery no local do problema. O prestador recebe chamado quando está homologado, habilitado e online; define seu próprio orçamento; o cliente aceita ou recusa. A plataforma mantém o histórico de ofertas e tenta o próximo elegível quando há recusa.

**Modelo econômico aprovado internamente:** 10% pagos pelo motociclista e 10% descontados do prestador, ambos sobre o valor dos serviços delivery de borracharia e reboque efetivamente pagos pelo aplicativo. Sua execução depende de validação jurídica, tributária, contratual e de meios de pagamento. Consulta ao mapa e visita direta ao estabelecimento não geram comissão. O reboque já integra o produto, mas seu pagamento real e sua política comercial permanecem desativados até homologação.

## 2. Problema e oportunidade

**Do motociclista:** descoberta difícil de prestadores em momentos de imobilização, incerteza de disponibilidade e de preço, risco de receber contato inadequado, tempo perdido em sucessivas buscas.

**Do borracheiro:** captação irregular de demanda, dificuldade em receber pedidos qualificados e custo de divulgação. O app propõe trazer pedidos sem impor disponibilidade integral nem tabela única de preços.

**Hipótese a validar:** participantes preferirão orçamento transparente e operação intermediada mesmo com comissão, desde que o tempo de resposta e a qualidade sejam competitivos. Não tratar essa hipótese como demanda comprovada.

## 3. Segmentos e proposta de valor

| Segmento | Dor principal | Benefício a validar |
| --- | --- | --- |
| Motociclista ocasional | Pneu danificado, falta de referências | Mapa confiável e pedido orientado |
| Motoboy/entregador | Veículo parado afeta renda | Facilidade de localizar atendimento |
| Borracharia física | Baixa presença digital | Descoberta gratuita no mapa |
| Borracheiro delivery | Demanda descontínua | Chamados apenas enquanto escolhe estar online |

## 4. Produto inicial

**MVP planejado:** cadastro e autenticação; mapa gratuito; cadastro e homologação de prestadores; status online/offline e confirmação de presença; escolha manual ou sugestão por proximidade; solicitação com foto do problema, marca, modelo, ano e uma ou mais opções de serviço; reboque segue o mesmo fluxo, com compatibilidade de equipamento declarada; recebimento de orçamentos com validade de 5 minutos; aceite ou recusa; pagamento confirmado; acompanhamento do deslocamento do prestador até a chegada; registro de chegada; comprovação simples do serviço; chat interno somente após pagamento; fila com no máximo duas recusas por prestador na mesma solicitação; cancelamento sem cobrança no piloto; confirmação do motociclista em até 5 minutos e avaliação do prestador; avaliações bilaterais moderadas; encerramento; trilha de auditoria; suporte com protocolo, triagem de segurança e mediação básicos.

**Fora da operação comercial atual:** pagamentos reais e split, atendimento de emergência garantido, cobertura nacional, serviço com SLA garantido e retirada de dados do cliente para contato externo. O fluxo de reboque existe no produto, mas não pode ser cobrado nem despachado sem homologação.

## 5. Jornada comercial pretendida

1. Usuário descobre o app por busca, indicação, QR code no estabelecimento ou comunicação local.
2. Consulta mapa sem pagar; pode optar por pedir reparo delivery.
3. Cadastro/login e consentimentos adequados; fornece descrição do problema e informações estritamente necessárias.
4. Prestador previamente homologado (identificação, telefone, base de atendimento, termos e serviços declarados) e online recebe chamado e responde dentro de janela a definir.
5. Prestador apresenta orçamento discriminado: valor do serviço e deslocamento, quando aplicável; o cliente vê o total antes do aceite.
6. Cliente aceita ou recusa; qualquer extra posterior exige novo orçamento discriminado e novo aceite. Após recusa ou ausência, a busca começa pelos prestadores homologados, online e dentro de sua área de atendimento, priorizando os mais próximos e amplia a área progressivamente quando necessário.
7. Ao aceitar, há etapa de pagamento protegida **ainda não implementada**; confirmar e executar serviço só depois do processamento financeiro seguro.
8. Após o serviço, o sistema permite confirmação, eventual disputa e avaliação.
9. Suporte revisa conflitos e fraude; dados pessoais são tratados com regras de retenção e acesso.

## 6. Canais e aquisição

**Primeiro piloto:** BH e área de cobertura validada por bairros, não expansão automática para toda região metropolitana.

**Hipóteses de aquisição de baixo custo:** visitas institucionais a oficinas, parceria com grupos locais de motociclistas, conteúdo informativo de prevenção e segurança, sinalização voluntária nas oficinas e indicação orgânica. Publicidade e parceria remunerada exigem autorização e orçamento próprio.

## 7. Recursos e parceiros críticos

- Plataforma web/PWA, banco e autenticação.
- Meios de pagamento com recursos de marketplace, retenção/repasse e conciliação, ainda não selecionados.
- Prestadores homologados voluntariamente e com documentação adequada.
- Função administrativa de verificação, suporte, incidentes e revisão humana.
- Serviços de mapa/roteamento e notificações compatíveis com orçamento.
- Contabilidade, assessoria jurídica, proteção de dados e condições contratuais.

## 8. Fontes de receita e custos

**Receita comercial aprovada internamente:** 10% cobrados do motociclista e 10% descontados do prestador sobre o serviço delivery efetivamente pago e liquidado pelo aplicativo, sujeitos a reversões em estornos e cancelamentos. **A tarifa de processamento de Pix/cartão será suportada pelo cliente, exibida separadamente e antes da confirmação.** A divisão de 10% + 10% incide somente sobre o valor do serviço, não sobre essa tarifa ou deslocamento. Antes da operação real, formalizar base de cálculo, condições de devolução, transparência comercial, tributos, liquidação e split com apoio jurídico e contábil.

**Custos a apurar:** processamento de pagamentos, infraestrutura, mapas e mensagens, suporte, chargebacks/fraudes, marketing, formalização jurídica, tributos, contabilidade, seguro e eventuais responsabilidades de atendimento.

Não há prova de margem positiva, faturamento ou cobertura de custos. Não comunicar investimento inicial zero como custo operacional garantido para sempre.

## 9. Validação de mercado e piloto

**Fase A — pesquisa:** pelo menos entrevistas com motociclistas e prestadores, levantando preço de reparos, raio e disponibilidade. Definir amostra antes de afirmar resultados.

**Fase B — usabilidade:** duas contas reais de teste em navegadores independentes, cenários de pedido e recusa, queda de rede, reenvio, notificação, auditoria de entrega, limite de duas recusas e novo pedido.

**Fase C — operação assistida:** seleção voluntária e documentada de profissionais, observação de atendimentos não emergenciais com suporte ativo e pagamentos homologados.

**Fase D — expansão:** somente se houver segurança, atendimento efetivo, demanda e economia unitária compatíveis.

## 10. Indicadores de validação

Piloto fechado em Belo Horizonte: até 15 prestadores homologados, 50 motociclistas convidados e ao menos 30 solicitações de teste. Critérios internos: 80% das solicitações com ao menos um orçamento em até 15 minutos e nenhum incidente crítico de segurança ou privacidade sem tratamento. Não são promessas públicas de serviço.

Profissionais homologados e efetivamente disponíveis; solicitações por área e horário; porcentagem que recebe ao menos um orçamento; tempo até primeira resposta; taxa de aceite; chamadas sem prestador; cancelamentos; avaliações; incidentes; custo de suporte por pedido; comissões líquidas após devoluções.

## 11. Riscos centrais

Liquidez insuficiente de prestadores; falsa indicação de online; perda de sinal; promessa de atendimento não cumprida; fraudes/identidade; compartilhamento de dados; intermediação financeira sem contrato adequado; responsabilidades consumeristas; cobrança/tributação incorreta; lançamento antes da homologação.

## 12. Decisões ainda abertas

CNPJ/razão social, responsável contratual, termos e tributos; processador de pagamentos, custo por transação e split; critérios complementares de aprovação profissional; monitoramento humano de valores potencialmente abusivos, sem tabela fixa no piloto; homologação técnica das notificações e auditoria de entrega; validação operacional da área de atendimento declarada pelo prestador; implementação e homologação das regras aprovadas de cancelamento, estorno e mediação após pagamentos reais; implementação da alternância justa em empates de proximidade, dados do pedido, tipos múltiplos de serviço, acompanhamento de deslocamento ativo, registro de chegada, comprovação do serviço, confirmação rápida, chat para divergências e mediação; implementação e teste do suporte com protocolo e triagem de segurança; indenização; canais de aquisição pagos; orçamento do piloto. As metas do piloto fechado foram definidas. A composição, deslocamento obrigatório e revisão do orçamento foram definidos.
