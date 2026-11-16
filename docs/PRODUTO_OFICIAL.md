# Salva Motoca! Oficial — Especificação de referência

**Nome oficial:** Salva Motoca!

**Proposta:** conectar motociclistas a borracharias, borracheiros delivery e fornecedores de reboque de motos, em formato de marketplace.

**Área inicial de operação:** Belo Horizonte (BH) e região metropolitana de Minas Gerais.

## Acesso gratuito

O aplicativo e a consulta ao mapa de borracharias são gratuitos. O usuário pode localizar estabelecimentos, conferir informações disponíveis e obter rota até o local. A ida direta ao estabelecimento não gera comissão para a plataforma.

## Serviços intermediados

A contratação dentro da plataforma cobre **borracharia no local do problema** e **reboque de motos**, ambos com **taxa de intermediação de 15% sobre o valor dos serviços, paga exclusivamente pelo motociclista solicitante e acrescentada ao orçamento**. O prestador não tem essa taxa deduzida do preço que definiu. Um mesmo fornecedor pode atender às duas modalidades.

O cliente pode escolher um profissional ou solicitar busca automática. O profissional informa orçamento discriminado entre serviço e deslocamento, quando aplicável; o cliente vê o total antes de aceitar. Qualquer extra posterior exige novo orçamento e novo aceite. A divisão financeira e os repasses dependem de integração homologada com um provedor de pagamentos. Quando ativada, a tarifa de processamento será um encargo do cliente, mostrada separadamente antes da confirmação; a taxa de intermediação de 15% será adicionada ao pagamento do solicitante, calculada somente sobre o valor dos serviços, sem incidência sobre deslocamento, peças ou tarifa de processamento. O prestador receberá o valor integral de seu orçamento aceito (serviços + deslocamento + peças), antes de obrigações tributárias próprias, ajustes e estornos. Nesta fase, os pagamentos reais estão desativados.

## Comunicação

Telefones e links externos não são exibidos nos perfis. Chamados delivery usam fluxos de orçamento e comunicação interna.

## Profissionais e administração

Os prestadores se cadastram e passam por verificação antes de aparecerem como ativos. O administrador gerencia solicitações e aprovações. Dados de contato administrativo e registros privados não pertencem a este repositório público.

## Disponibilidade online e decisão sobre orçamento

O prestador homologado escolhe **ficar online** ou **ficar offline**. Apenas quem oferece delivery, está habilitado e tem comunicação recente com o servidor entra na fila de novos pedidos.

- **Aceitar:** pedido fica aguardando pagamento; não há cobrança nem despacho enquanto a integração financeira não existir.
- **Recusar:** a primeira recusa mantém o prestador elegível para outra oportunidade mais adiante na mesma rodada; após duas recusas do mesmo solicitante na mesma solicitação, fica de fora daquela rodada. O pedido segue para o próximo profissional online elegível, priorizando os mais próximos e sem retornar imediatamente ao recém-recusado. A área de busca se amplia gradualmente apenas quando necessário, respeitando sempre a área de atendimento declarada pelo prestador. Encerrar e criar novo pedido reinicia as contagens.
- **Conexão perdida:** a presença efetiva expira automaticamente. Desligar a disponibilidade bloqueia novos pedidos e preserva os já recebidos.

## Serviços oficiais e regras comerciais

1. **📍🛞 Mapa de borracharias físicas:** download, consulta e rotas gratuitos, sem comissão pela simples consulta.
2. **🛞 Delivery de borracharia:** atendimento para reparo de pneu no local, com solicitação, comunicação, orçamento e pagamento dentro da plataforma; taxa de intermediação de **15% do valor dos serviços, adicionada ao total do solicitante**. O valor do orçamento do prestador não sofre desconto dessa taxa. Deslocamento, materiais e tarifa do processamento não compõem sua base.
3. **🚚 Reboque de motos:** remoção ou transporte com solicitação, comunicação, orçamento e pagamento dentro da plataforma; **a mesma taxa de intermediação de 15%, paga pelo solicitante e não descontada do prestador**.

O prestador pode oferecer uma ou ambas as modalidades pagas em um único cadastro, com oferta, preço, disponibilidade e cobertura independentes.

## Prospecção inicial — BH + Contagem

Levantamento de 12/11/2026: **36 candidatos únicos**, associados a **40 ofertas**; quatro candidatos têm as duas modalidades de socorro, algumas ainda dependentes de confirmação. A referência pública, sem telefones, está em `data/prestadores_candidatos_BH_2026-11-12.csv`.

No Supabase `Salva Motoca`, os dados internos de prospecção ficam em tabelas privadas com RLS e sem acesso direto de `anon` ou `authenticated`. Contatos não são publicados no repositório nem exibidos no aplicativo.

**Nenhum candidato é parceiro homologado ou habilitado para chamados.** Não exibir ofertas, horários 24h ou disponibilidade operacional como confirmados até validação comercial e técnica. Pagamentos reais permanecem desativados enquanto não houver homologação do processador e do split financeiro.

## Política de desenvolvimento

O projeto está em fase de MVP. Deve usar planos gratuitos quando possível, sem afirmar disponibilidade comercial ou atendimento de emergência antes de testes operacionais, legais e de segurança.

## Próximas etapas

1. Validar contas separadas de motociclista e prestador em ambiente de teste.
2. Homologar manualmente prestadores reais antes de exibi-los no mapa.
3. Testar tempo de resposta, notificações, cobertura e fluxos antifraude.

## Regra de resposta do prestador

- Prestador online tem **5 minutos** para aceitar ou recusar a solicitação.
- Sem resposta no período, o pedido segue para o próximo prestador elegível.
- **10 ausências em 30 dias** levam o perfil à revisão administrativa; não há bloqueio automático.
- A regra depende de notificação entregue e registrada; seu acionamento fica pendente da implementação e homologação dos canais de aviso.

## Tipos de solicitação

O motociclista pode selecionar **uma ou mais opções** na mesma solicitação:

- Pneu furado / reparo;
- Troca de câmara;
- Troca de pneu;
- Calibragem ou válvula;
- Reboque de moto;
- Outro problema, com descrição e foto.

O pedido só é oferecido a prestadores que declararam atender os serviços selecionados.

## Fluxo de reboque

- O reboque usa o mesmo ciclo da borracharia: solicitação, orçamento, pagamento, chat, rastreamento, chegada, comprovação, confirmação e avaliação.
- Antes de ficar elegível, o prestador de reboque declara sua capacidade e equipamento compatíveis com motocicletas.
- Só recebe chamados de reboque compatíveis com o que declarou atender.

## Comissão de reboque

- Sobre o valor do serviço de reboque incide taxa de intermediação de **15%**, acrescentada ao total pago pelo solicitante, sem desconto do valor do serviço orçado pelo prestador.
- Deslocamento, tarifa de processamento e extras não integram essa base de cálculo.
- A regra só será ativada junto com pagamentos reais homologados.

## Controle de preços no piloto

- Não há tabela fixa de preços nesta fase.
- Prestadores definem valores de serviço, deslocamento e peças de forma discriminada; o motociclista escolhe entre os orçamentos.
- Valores potencialmente abusivos ou incoerentes podem ser suspensos para revisão humana.
- A plataforma não altera preços automaticamente; haverá registro e possibilidade de contestação.

## Regra econômica de cobrança — decisão atualizada em 16/11/2026

**Pagador da taxa da plataforma: motociclista solicitante. O prestador NÃO paga a comissão de 15%.**

- Base de cálculo: soma das linhas de **serviço** do orçamento aceito, sem deslocamento, peças ou materiais.
- Taxa da plataforma: **15% × serviços**; é uma linha adicional, identificada como *taxa de intermediação Salva Motoca!*, no checkout do solicitante.
- Valor do prestador: recebe o valor **integral de serviços + deslocamento + peças** que orçou, sem subtração da taxa da plataforma, respeitados eventuais estornos/ajustes e suas obrigações legais.
- Valor do solicitante: **orçamento integral + taxa de intermediação (15% dos serviços) + tarifa de processamento, caso autorizada e divulgada**.
- Exemplo didático: serviço R$ 230, deslocamento R$ 40 e materiais R$ 10 → prestador R$ 280; taxa da plataforma R$ 34,50; solicitante R$ 314,50 **antes** da eventual tarifa de processamento.
- A expressão comercial “comissão de 15%” refere-se à receita de intermediação da plataforma **cobrada do solicitante**, e não a um desconto pago pelo prestador. A classificação fiscal/jurídica dessa tarifa, a tributação e a adequação ao Código de Defesa do Consumidor e ao PSP serão revisadas antes de cobrança real.
- Toda tela de proposta/aceite/checkout deve informar a taxa de forma destacada antes do pagamento, sem preços-surpresa. A consulta ao mapa permanece gratuita.

## Orçamento itemizado

- Todo orçamento informa separadamente cada serviço selecionado, o **deslocamento obrigatório** e cada peça ou material.
- O total final é exibido antes do pagamento.
- Nenhum item adicional pode ser cobrado sem novo orçamento discriminado e novo aceite.

## Ordem do atendimento

1. O motociclista solicita o serviço com foto do problema e dados da motocicleta.
2. Prestadores elegíveis enviam orçamentos.
3. O motociclista aceita um orçamento.
4. O pagamento é confirmado.
5. O chat interno é liberado com as restrições de privacidade já definidas.

## Registro de chegada

- O prestador marca “cheguei” ao alcançar o local do motociclista.
- O motociclista recebe um aviso imediato.
- O rastreamento em tempo real é encerrado nesse evento.
- Divergências sobre a chegada são registradas para suporte; a conclusão do serviço ainda exige confirmação bilateral.

## Acompanhamento do deslocamento

- Após marcar “em deslocamento”, o prestador tem seu deslocamento informado em tempo real ao motociclista até a chegada.
- O compartilhamento funciona somente durante a solicitação ativa e encerra na chegada, cancelamento ou conclusão.
- Não há exposição de histórico de deslocamentos fora desse atendimento.

## Cancelamento após pagamento

- Se o prestador cancelar, o cliente recebe reembolso integral, inclusive da tarifa de processamento.
- Se o cliente cancelar antes de o prestador marcar “em deslocamento”, recebe reembolso integral.
- Depois desse marco, o valor continua retido e o suporte/mediação decide o reembolso com base no registro do atendimento; não há repasse automático.
- A política precisa aparecer de forma transparente antes da confirmação do pagamento e só vale após homologação financeira e jurídica.

## Retenção e repasse após conclusão

- Depois do pagamento, o valor fica retido pelo intermediador de pagamentos.
- Com a confirmação de conclusão pelas duas partes, o repasse ao prestador é liberado.
- A taxa de intermediação de 15% incide somente sobre os serviços e é cobrada do solicitante. Não é abatida do repasse do preço orçado pelo prestador.
- Sem confirmação bilateral, não há liberação automática: o caso vai para suporte e mediação.
- A regra só será ativada com intermediador compatível e validações jurídica, tributária e contratual.


## Dados obrigatórios do pedido

- O motociclista envia uma foto do problema.
- Informa marca, modelo e ano da motocicleta.
- Esses dados apoiam o orçamento; a imagem deve ser enviada apenas quando necessária ao atendimento.

## Chat interno após pagamento

- O chat interno é liberado somente após pagamento confirmado.
- Telefone e WhatsApp não são exibidos entre as partes.
- Permite mensagens, localização e fotos necessárias ao atendimento.
- Fecha depois da conclusão ou do cancelamento, exceto quando uma divergência for encaminhada ao suporte; nesse caso, permanece aberto até a resolução, mantendo o histórico acessível.
- Enquanto os pagamentos reais não estiverem homologados, o chat permanece indisponível.

## Validade do orçamento

- Cada orçamento enviado pelo prestador vale por **5 minutos**.
- Sem aceite nesse período, expira e a solicitação pode seguir para o próximo prestador elegível.
- Qualquer mudança posterior de preço exige novo orçamento discriminado e novo aceite.

## Piloto fechado em Belo Horizonte

- Até 15 prestadores homologados e 50 motociclistas convidados.
- Pelo menos 30 solicitações de teste.
- Critério interno: 80% das solicitações devem receber ao menos um orçamento em até 15 minutos, sem incidente crítico de segurança ou privacidade sem tratamento.
- Uma abertura maior só é considerada após revisar os resultados. Esses critérios não são promessa pública de atendimento.

## Ordem de oferta dos chamados

- Participam somente prestadores homologados, online e dentro da área de atendimento que declararam.
- O sistema prioriza os mais próximos.
- Em empate prático de distância, alterna a prioridade para evitar concentração de chamados.
- Avaliações são informativas para o motociclista, mas não mudam a ordem automática durante o piloto.

## Confirmação e avaliação rápidas

- Após o prestador enviar o resumo do serviço, o motociclista tem **5 minutos** para confirmar no aplicativo.
- Após confirmar, faz a avaliação do prestador.
- Se houver divergência, aciona o chat para suporte; o chat permanece aberto até a resolução.

## Avaliações e reputação

- Após a confirmação bilateral da conclusão, motociclista e prestador podem dar nota de 1 a 5 e comentário opcional.
- A avaliação de uma parte fica oculta da outra até ambas enviarem ou se passarem 7 dias.
- Comentários não são publicados automaticamente: passam por moderação e podem ser contestados.
- A média pública só é exibida depois de 3 serviços concluídos.

## Comprovação simples do serviço

- Antes de declarar o serviço concluído, o prestador registra um resumo curto do que foi feito.
- Pode anexar uma foto do resultado quando isso fizer sentido para o atendimento.
- O motociclista vê essas informações antes de confirmar ou contestar a conclusão.
- Fotos não devem mostrar documentos, pessoas ou dados desnecessários.

## Confirmação de conclusão

- O prestador declara no aplicativo que o serviço foi concluído.
- O motociclista precisa confirmar essa conclusão.
- O atendimento só é marcado como concluído depois das duas confirmações.
- Sem uma das confirmações, ele permanece pendente para acompanhamento e suporte; não há cobrança nesta fase.

## Suporte e incidentes no piloto

- O suporte é acessado pelo app e gera protocolo e histórico para acompanhamento.
- As categorias são: atendimento, prestador, pagamento (quando existir) e segurança.
- Um relato de segurança suspende a solicitação para análise humana. Em emergência, o usuário deve acionar os serviços públicos competentes; o app não os substitui.
- Não há promessa de atendimento 24 horas nesta fase; os casos comuns recebem retorno no próximo período operacional.

## Cancelamento no piloto

- Antes de aceitar um orçamento, o motociclista pode cancelar livremente.
- Após o aceite, pode solicitar cancelamento; o prestador é avisado e a ocorrência fica registrada.
- O prestador pode cancelar informando o motivo; a solicitação volta à busca por prestadores elegíveis.
- Enquanto pagamentos reais estiverem desativados, não há multa, cobrança ou estorno financeiro nesse fluxo.

## Homologação mínima do prestador

Antes de aparecer como elegível, o prestador informa nome completo ou razão social, CPF ou CNPJ, telefone verificado, endereço/base de atendimento e serviços oferecidos, além de aceitar os termos da plataforma. Dados bancários não são solicitados nesta fase e só entram no fluxo quando pagamentos reais forem homologados.

## Área de atendimento do prestador

- Cada prestador declara sua área de atendimento no perfil e pode atualizá-la.
- Chamados só são ofertados dentro dessa área; estar online não obriga o prestador a atender fora dela.
- A busca progressiva prioriza proximidade, mas respeita essa delimitação.

## Notificações de chamados

- Prestador só participa quando estiver online e tiver autorizado notificações.
- O chamado gera alerta no app/PWA com som, vibração e contador de 5 minutos; há lembretes aos 2min e 4min30s.
- A plataforma registra envio, entrega quando tecnicamente disponível, abertura e resposta.
- Se a notificação falhar, não há ausência atribuída ao prestador; o pedido segue ao próximo elegível.
- SMS e WhatsApp não são usados nesta primeira fase.
4. Homologar pagamentos e split automático.
5. Publicar somente após validações operacionais, legais e de segurança.
