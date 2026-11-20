# FND-08 — Registro mestre de decisões

**Versão 0.2 • Fonte de verdade para decisões de produto e negócio**  
Aprovado significa **definido pelo responsável do produto**, não necessariamente implementado, homologado juridicamente ou publicado.

## Decisões expressas consolidadas

| ID | Decisão | Estado |
| --- | --- | --- |
| SM-DEC-001 | Nome público atual: **Salva Motoca!**; identidade anterior BorrachaJá! é legado técnico | Aprovada; migração de marca parcial |
| SM-DEC-002 | Repositório de trabalho autorizado: **bonecodesign/salvamotoca**, sem tocar outros projetos | Aprovada |
| SM-DEC-003 | Praça piloto inicial: **Belo Horizonte, MG** | Aprovada |
| SM-DEC-004 | Consulta ao mapa de borracharias: **gratuita**, sem comissão por visita direta | Aprovada |
| SM-DEC-005 | Prestador delivery informa o valor do orçamento; cliente pode aceitar ou recusar | Aprovada |
| SM-DEC-006 | O prestador escolhe **online/offline** no aplicativo; sem internet e sinal recente não recebe novos pedidos | Aprovada |
| SM-DEC-007 | O prestador recusado **volta à fila após a primeira recusa** do mesmo solicitante na mesma solicitação | Aprovada |
| SM-DEC-008 | Após a **segunda recusa** do mesmo solicitante na mesma solicitação, o prestador fica fora somente daquela rodada | Aprovada |
| SM-DEC-009 | Encerrar a solicitação e criar outra **zera a contagem** para todos os prestadores elegíveis, sem bloqueio permanente | Aprovada |
| SM-DEC-010 | Profissionais precisam ser aprovados antes de aparecer como habilitados | Aprovada |
| SM-DEC-011 | Contatos telefônicos/WhatsApp de terceiros não ficam publicados para evitar desintermediação | Aprovada |
| SM-DEC-012 | Pagamentos reais não serão ativados antes de integração, testes e homologação | Aprovada |
| SM-DEC-013 | Desenvolvimento inicial deve evitar serviços pagos sem autorização, priorizando custo R$ 0 | Aprovada como restrição de projeto |
| SM-DEC-014 | Comissão de **15% sobre o valor de serviços de borracharia delivery efetivamente pagos pelo aplicativo** | **Aprovada expressamente em 12/11/2026**. Implementação condicionada a contrato, tributação, PSP, split e regras de estorno; sem ativação de cobranças nesta decisão |
| SM-DEC-015 | Reboque de motos já integra o produto; seu pagamento real e despacho comercial permanecem desativados até homologação | Atualizada em 13/11/2026; sem autorização para cobrança real |
| SM-DEC-016 | Foco no mesmo projeto e nas alterações versionadas; migrações só após análise do banco ativo | Aprovada |
| SM-DEC-017 | Tarifa de processamento de Pix/cartão é encargo do **cliente**, exibida separadamente antes da confirmação; comissão de 15% incide somente sobre o serviço | **Aprovada expressamente em 13/11/2026**; implementação depende de PSP, contrato, impostos, regras de estorno e transparência |
| SM-DEC-018 | Orçamento deve discriminar serviço e deslocamento quando aplicável; qualquer extra posterior exige novo orçamento e novo aceite; não há acréscimo automático após aceite | **Aprovada expressamente em 13/11/2026**; pagamentos reais continuam desativados |
| SM-DEC-019 | Prestador online tem 5 minutos para aceitar ou recusar; sem resposta, a solicitação segue ao próximo elegível; 10 ausências em 30 dias entram em revisão administrativa, sem bloqueio automático | **Aprovada expressamente em 13/11/2026**; depende de entrega e registro confiáveis de notificações antes de ativar |
| SM-DEC-020 | Notificação inicial no app/PWA com som/vibração e contagem; lembretes aos 2min e 4min30s; registrar envio, entrega quando possível, abertura e resposta; falha não conta como ausência; sem SMS/WhatsApp nesta fase | **Aprovada expressamente em 13/11/2026**; depende de consentimento, implementação e homologação em dispositivos reais |
| SM-DEC-021 | Distribuição de chamados prioriza prestadores online mais próximos e amplia progressivamente a área de busca apenas quando necessário | **Aprovada expressamente em 13/11/2026**; parâmetros de distância, etapas e limite operacional serão testados no piloto |
| SM-DEC-022 | Cada prestador declara e pode atualizar sua própria área de atendimento; chamados só são ofertados dentro dessa área | **Aprovada expressamente em 13/11/2026**; exige interface clara e validação operacional no piloto |
| SM-DEC-023 | Homologação mínima: nome/razão social, CPF/CNPJ, telefone verificado, endereço/base de atendimento, aceite dos termos e serviços declarados; dados bancários somente com pagamentos reais homologados | **Aprovada expressamente em 13/11/2026**; sujeita a adequação jurídica, privacidade e segurança antes da operação comercial |
| SM-DEC-024 | No piloto sem pagamentos reais: cliente cancela livremente antes do aceite; após aceite, solicita cancelamento registrado e o prestador é avisado; prestador pode cancelar com motivo e o pedido retorna à busca; sem multas ou cobranças | **Aprovada expressamente em 13/11/2026**; estorno, taxas e regras pós-pagamento continuam pendentes |
| SM-DEC-025 | Suporte no app com protocolo e histórico; categorias de atendimento, prestador, pagamento futuro e segurança; relatos de segurança suspendem a solicitação para análise humana; sem promessa de suporte 24h no piloto | **Aprovada expressamente em 13/11/2026**; app não substitui serviços de emergência |
| SM-DEC-026 | Serviço só é concluído após confirmação das duas partes: prestador declara conclusão e motociclista confirma; sem ambas, permanece pendente para acompanhamento/suporte | **Aprovada expressamente em 13/11/2026**; pagamentos e avaliações dependem de implementação posterior |
| SM-DEC-027 | Após conclusão bilateral, ambas as partes podem avaliar de 1 a 5 com comentário opcional; avaliações ficam ocultas até ambas enviarem ou 7 dias; comentários passam por moderação/contestação; média pública após 3 serviços concluídos | **Aprovada expressamente em 13/11/2026**; exige implementação de moderação e privacidade |
| SM-DEC-028 | Ordem automática: prestadores homologados, online e dentro da área declarada; depois proximidade; em empate prático, alternância para evitar concentração; avaliações não mudam a ordem no piloto | **Aprovada expressamente em 13/11/2026**; exige critério técnico auditável para empate e alternância |
| SM-DEC-029 | Piloto fechado em Belo Horizonte: até 15 prestadores homologados, 50 motociclistas convidados e 30 solicitações de teste; meta interna de 80% com ao menos um orçamento em até 15min e nenhum incidente crítico sem tratamento; expansão só após revisão | **Aprovada expressamente em 13/11/2026**; metas não são promessa pública de atendimento |
| SM-DEC-030 | Orçamento enviado pelo prestador vale por 5 minutos; sem aceite, expira e o pedido pode avançar para o próximo elegível; qualquer alteração exige novo orçamento e novo aceite | **Aprovada expressamente em 13/11/2026**; exige implementação de cronômetro e trilha de auditoria |
| SM-DEC-031 | Chat interno é liberado somente após pagamento confirmado; não expõe telefone/WhatsApp; permite mensagens, localização e fotos necessárias; fecha após conclusão ou cancelamento, exceto quando houver divergência encaminhada ao suporte, preservando histórico para suporte e incidentes | **Atualizada expressamente em 13/11/2026**; permanece indisponível enquanto pagamentos reais não forem homologados |
| SM-DEC-032 | Pedido exige foto do problema e marca, modelo e ano da motocicleta | **Aprovada expressamente em 13/11/2026**; exige orientação de privacidade e validação de campos antes do envio |
| SM-DEC-033 | Ordem obrigatória do fluxo: solicitação com foto e dados da moto; recebimento de orçamentos; aceite de um orçamento; pagamento confirmado; abertura do chat interno sob as restrições já aprovadas | **Aprovada expressamente em 13/11/2026**; retenção e repasse condicionados à decisão SM-DEC-034 |
| SM-DEC-034 | Após pagamento, valor fica retido pelo intermediador até confirmação bilateral da conclusão; então ocorre repasse ao prestador, descontando 15% somente do serviço; sem confirmação, não há liberação automática e o caso segue para suporte/mediação | **Aprovada expressamente em 13/11/2026**; depende de PSP compatível, validação jurídica, tributária e contratual |
| SM-DEC-035 | Pós-pagamento: cancelamento pelo prestador gera reembolso integral inclusive tarifa; cancelamento do cliente antes de “em deslocamento” gera reembolso integral; após esse marco, valor fica retido para suporte/mediação, sem repasse automático | **Aprovada expressamente em 13/11/2026**; depende de PSP, transparência prévia no checkout e validação jurídica/tributária |
| SM-DEC-036 | Após o prestador marcar “em deslocamento”, o app informa seu deslocamento em tempo real ao motociclista até a chegada; compartilhamento limitado à solicitação ativa, sem histórico exposto fora dela | **Aprovada expressamente em 13/11/2026**; exige consentimento, controles de geolocalização, segurança e validação em dispositivos reais |
| SM-DEC-037 | Prestador marca “cheguei”; motociclista é avisado e rastreamento em tempo real é encerrado; divergências sobre a chegada seguem para suporte, sem alterar a confirmação bilateral de conclusão | **Aprovada expressamente em 13/11/2026**; exige registro auditável de data/hora e teste em dispositivos reais |
| SM-DEC-038 | Antes de declarar o serviço concluído, prestador registra resumo curto obrigatório e pode anexar foto do resultado quando fizer sentido; motociclista vê antes de confirmar/contestar; imagem não deve conter dados desnecessários | **Aprovada expressamente em 13/11/2026**; exige controles de privacidade, segurança e retenção |
| SM-DEC-039 | Após o resumo do prestador, motociclista tem 5 minutos para confirmar no app e então avalia o prestador; em caso de divergência, aciona o chat para suporte, que permanece aberto até a resolução | **Aprovada expressamente em 13/11/2026**; exige cronômetro, notificações e fluxo de suporte auditável |
| SM-DEC-040 | Pedido permite selecionar uma ou mais opções: pneu furado/reparo, troca de câmara, troca de pneu, calibragem/válvula, reboque de moto e outro problema com descrição/foto; prestador só recebe solicitações compatíveis com os serviços que declarou atender | **Aprovada expressamente em 13/11/2026**; requer taxonomia e compatibilidade de serviços na implementação |
| SM-DEC-041 | Todo orçamento discrimina cada serviço selecionado, deslocamento obrigatório e cada peça/material; total final é exibido antes do pagamento; nenhum item adicional é cobrado sem novo orçamento e aceite | **Aprovada expressamente em 13/11/2026**; exige validação de itens e transparência no checkout |
| SM-DEC-042 | No piloto não há tabela fixa: prestador define serviço, deslocamento e peças de forma separada; motociclista escolhe; valores potencialmente abusivos/incoerentes podem ser suspensos para revisão humana, sem ajuste automático | **Aprovada expressamente em 13/11/2026**; exige critérios publicados, registro e direito de contestação |
| SM-DEC-043 | Comissão de 15% também incide sobre o valor do serviço de reboque; deslocamento, tarifa de processamento e extras não integram a base | **Aprovada expressamente em 13/11/2026**; ativação depende de PSP, contratos, impostos e homologação |
| SM-DEC-044 | Reboque segue o mesmo fluxo operacional da borracharia: solicitação, orçamento, pagamento, chat, rastreamento, chegada, comprovação, confirmação e avaliação; prestador declara previamente capacidade/equipamento compatível com motos | **Aprovada expressamente em 13/11/2026**; exige homologação específica de prestadores de reboque |

## Definições técnicas adotadas, ajustáveis após testes

- Heartbeat de prestador aproximadamente a cada 30 segundos; presença considerada efetiva com sinal recente, dentro de janela de cerca de 90 segundos.
- Busca piloto no mesmo município: priorizar prestadores online mais próximos e ampliar progressivamente a área quando não houver atendimento; usar proximidade aproximada quando houver coordenadas.
- Em cada rodada, preferir quem tem zero recusas, depois quem tem uma; nunca devolver imediatamente a proposta ao profissional recém-recusado.
- Encerrar solicitação de **teste** usa estado cancelado. A conclusão de serviço real exige outra lógica.
- Cada solicitação tem ID independente e histórico de tentativas próprio.

## Pendências de aprovação do responsável pelo produto

| ID | Tema pendente | Por que importa |
| --- | --- | --- |
| SM-OPEN-001 | Pessoa jurídica, razão social, CNPJ e contatos oficiais | Contratos, notas e canal de atendimento |
| SM-OPEN-002 | Escolha/homologação de PSP, Pix/cartões, custo efetivo, split e liquidação compatíveis com a retenção/repasses aprovados | Implementar sem taxas-surpresa e com transparência |
| SM-OPEN-003 | Critérios complementares, checagem, catálogo de serviços e guarda segura dos dados de homologação | Segurança, privacidade e legalidade |
| SM-OPEN-004 | Parâmetros de distância, etapas de expansão, limite operacional e validação da área declarada | Chamados viáveis sem impor deslocamento inviável |
| SM-OPEN-005 | Implementação, consentimento e homologação em dispositivos reais das notificações | Garantir que o prazo de resposta seja justo e auditável |
| SM-OPEN-006 | Critérios publicados de revisão de valores potencialmente abusivos/incoerentes | Transparência sem tabela fixa ou ajuste automático |
| SM-OPEN-007 | Implementação/homologação de cancelamento, estorno, taxas e mediação pós-pagamento | Direitos e incidentes |
| SM-OPEN-008 | Regime de tributação, notas e tratamento contábil | Sustentabilidade legal |
| SM-OPEN-009 | Implementação, horários operacionais, chat de divergência e escalonamento humano do suporte | Operação real sem promessa indevida |
| SM-OPEN-010 | Instrumentação e revisão dos resultados do piloto antes de ampliar | Gate de decisão |
| SM-OPEN-011 | Implementação de idade/elegibilidade, geolocalização ativa, chegada, imagens, chat e retenção de dados | Direitos e proteção de dados |
| SM-OPEN-012 | Implementação de reputação, moderação, alternância em empates e prevenção de direcionamento injusto | Transparência |
| SM-OPEN-013 | Marca/slogan finais, domínio e registro de marca | Identidade e propriedade intelectual |

## Histórico de validação

- **12/11/2026 — SM-DEC-014:** responsável pelo produto aprovou expressamente a comissão de **15% sobre o valor dos serviços delivery efetivamente pagos no Salva Motoca!**. Não há autorização para iniciar cobranças reais.
- **13/11/2026 — SM-DEC-017:** responsável pelo produto aprovou a **tarifa de processamento como encargo do cliente**, destacada antes da confirmação e separada da comissão. PSP, custo real, split, estorno e tributos continuam pendentes de homologação.
- **13/11/2026 — SM-DEC-015 atualizada:** reboque já está implementado no produto; pagamento e despacho comercial continuam desativados.
- **13/11/2026 — SM-DEC-018:** orçamento discriminado entre serviço e deslocamento; extras exigem novo aceite. Não há cobrança automática posterior.
- **13/11/2026 — SM-DEC-019:** prazo de 5 minutos para aceitar/recusar; encaminhamento automático sem resposta; revisão administrativa após 10 ausências em 30 dias, sem bloqueio automático. A regra não será ativada antes da validação das notificações.
- **13/11/2026 — SM-DEC-020:** alertas no app/PWA com som/vibração, lembretes aos 2min e 4min30s e trilha de auditoria. Falhas não contam como ausência. SMS e WhatsApp ficam fora da primeira fase.
- **13/11/2026 — SM-DEC-021:** chamados priorizam os prestadores online mais próximos; a área é ampliada gradualmente apenas quando necessário. Distâncias e etapas serão homologadas no piloto.
- **13/11/2026 — SM-DEC-022:** cada prestador declara e atualiza sua área de atendimento; só recebe chamados dentro dela.
- **13/11/2026 — SM-DEC-023:** homologação mínima definida com identificação, telefone verificado, base, aceite dos termos e serviços declarados. Dados bancários ficam para a homologação de pagamentos reais.
- **13/11/2026 — SM-DEC-024:** cancelamento sem cobrança no piloto: livre antes do aceite; após aceite, pedido de cancelamento registrado; prestador pode cancelar com motivo e a busca é retomada.
- **13/11/2026 — SM-DEC-025:** suporte no app com protocolo e histórico; relatos de segurança suspendem a solicitação para análise humana. Não há promessa de atendimento 24h e o app não substitui emergência.
- **13/11/2026 — SM-DEC-026:** conclusão exige confirmação das duas partes: prestador declara e motociclista confirma. Sem ambas, o serviço fica pendente para acompanhamento.
- **13/11/2026 — SM-DEC-027:** avaliações bilaterais após conclusão; ocultas até ambas enviarem ou 7 dias; comentários moderados e contestáveis; média pública após 3 serviços concluídos.
- **13/11/2026 — SM-DEC-028:** ordem de oferta por elegibilidade, proximidade e alternância em empate prático; avaliações não mudam a ordem automática no piloto.
- **13/11/2026 — SM-DEC-029:** piloto fechado em Belo Horizonte com até 15 prestadores, 50 motociclistas e 30 solicitações; meta interna de 80% de orçamento em até 15min e nenhum incidente crítico sem tratamento.
- **20/11/2026 — SM-DEC-030 atualizada:** convite ao prestador vale 5 minutos após entrega confirmada; o orçamento fica disponível por 15 minutos para escolha do motociclista. Sem aceite, expira e o pedido pode avançar. Alteração de preço exige novo orçamento e novo aceite.
- **13/11/2026 — SM-DEC-031 atualizada:** chat interno só após pagamento confirmado; sem exposição de telefone/WhatsApp; permanece indisponível até homologação dos pagamentos reais.
- **13/11/2026 — SM-DEC-032:** pedido exige foto do problema e identificação da moto por marca, modelo e ano.
- **13/11/2026 — SM-DEC-033:** fluxo obrigatório: solicitação com foto/dados → orçamentos → aceite → pagamento confirmado → chat interno.
- **20/11/2026 — SM-DEC-034 atualizada:** após confirmação bilateral, a intermediação aplica 10% pagos pelo motociclista e 10% descontados do prestador, ambos somente sobre o serviço (materiais inclusos). Deslocamento fica fora da base; a taxa de processamento é separada e paga pelo cliente. Pendências seguem para suporte/mediação, sem liberação automática.
- **13/11/2026 — SM-DEC-035:** prestador que cancela gera reembolso integral inclusive tarifa; cliente que cancela antes de “em deslocamento” também. Depois desse marco, o valor fica retido para mediação.
- **13/11/2026 — SM-DEC-036:** depois de marcar “em deslocamento”, o prestador tem o deslocamento informado em tempo real ao motociclista até a chegada, limitado à solicitação ativa.
- **13/11/2026 — SM-DEC-037:** prestador marca “cheguei”; motociclista é avisado e o rastreamento é encerrado. Divergências vão para suporte.
- **13/11/2026 — SM-DEC-038:** antes de concluir, prestador registra resumo obrigatório e pode anexar foto do resultado quando necessária; motociclista vê antes de confirmar/contestar.
- **13/11/2026 — SM-DEC-039:** motociclista confirma em até 5 minutos e avalia o prestador em seguida. Divergência abre chat para suporte até a resolução.
- **13/11/2026 — SM-DEC-040:** motociclista seleciona uma ou mais opções de serviço; o prestador só recebe pedidos compatíveis com o que declarou atender.
- **13/11/2026 — SM-DEC-041:** orçamento itemiza serviços, deslocamento obrigatório e peças/materiais, com total antes do pagamento. Alterações exigem novo orçamento e aceite.
- **13/11/2026 — SM-DEC-042:** sem tabela fixa no piloto; prestador define valores discriminados e motociclista escolhe. Possíveis abusos/incoerências vão para revisão humana, sem ajuste automático.
- **20/11/2026 — SM-DEC-043 atualizada:** reboque segue a comissão de 10% do motociclista + 10% do prestador somente sobre o serviço; deslocamento fica fora da base e a taxa de processamento é paga separadamente pelo cliente.
- **13/11/2026 — SM-DEC-044:** reboque segue o mesmo fluxo da borracharia, com requisito adicional de capacidade/equipamento compatível declarado pelo prestador.

## Controle de alteração

Uma alteração deve receber: ID, enunciado anterior, enunciado novo, razão, data, responsável que aprovou, impacto técnico/financeiro/jurídico, PR e teste de regressão. Caso uma decisão posterior conflite com uma antiga, sinalizar o conflito expressamente antes de alterar o código.

## Itens que NÃO estão decididos

Não presumir: valor ou modalidade da tarifa sem PSP homologado, tempo de chegada garantido, atendimento 24 horas, cobertura de todo município, vínculo trabalhista ou ausência de vínculo, exclusão contratual ampla de responsabilidade, retenção indefinida de dados, habilitação de pagamentos ou autorização automática de candidatos prospectados.
