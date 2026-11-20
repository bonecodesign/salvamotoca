# Salva Motoca! — Presença online e rodadas de orçamento

**Regra oficial do produto**, definida em 12/11/2026.  
**Ambiente de testes:** Supabase `yivkqyjdeouxnwtwfekc` e repositório `bonecodesign/salvamotoca`.

## 1. Disponibilidade controlada pelo borracheiro

O prestador precisa estar **homologado e com o serviço delivery habilitado** para receber pedidos.

A tela **Minha conta** tem os comandos:

- **Ficar online — receber chamados**
- **Ficar offline — parar novos chamados**

O prestador só fica apto a novos pedidos quando:
1. O cadastro está aprovado pela administração;
2. O serviço de borracharia delivery está habilitado;
3. O próprio prestador ativou **online**;
4. O servidor recebeu sinal de conexão há menos de **90 segundos**.

O app envia um sinal de conexão aproximadamente a cada **30 segundos**, enquanto estiver aberto, visível e conectado. Fechar o app, perder a internet ou colocar o navegador em segundo plano interrompe os sinais; após 90 segundos o sistema deixa de considerar o prestador online. Reabrir o app conectado restaura os sinais, enquanto a opção online permanecer ligada. **Online não significa garantia de atendimento** e tampouco confirma que o profissional chegará em um tempo específico.

O status administrativo `providers.is_active` não pode ser alterado pelo borracheiro. O status online fica em `bj_provider_presence`.

## 2. Orçamento determinado pelo profissional

- O motociclista escolhe um borracheiro online ou utiliza a busca por profissionais online.
- O profissional que recebe o pedido pode inserir o preço e uma descrição do serviço.
- O valor é salvo em centavos no banco e vinculado ao pedido.
- O cliente visualiza os botões **Aceitar orçamento** e **Recusar e buscar próximo online**.
- O prestador não consegue enviar orçamentos para pedidos de outros profissionais ou alterar diretamente os estados financeiros.

## 3. Quando o motociclista aceita

O pedido passa para **`awaiting_payment` — aguardando pagamento**. O orçamento fica `accepted`.

**Não existe cobrança nesta etapa do MVP:** nenhum registro de pagamento é criado pelo aceite, o endereço exato permanece protegido para o prestador e nenhum atendimento real é despachado. Cobrança, split, webhook e confirmação de serviço dependem de integração futura.

## 4. Quando o motociclista recusa

A recusa marca a proposta atual como `declined` e o servidor busca o **próximo prestador elegível**, seguindo estas regras:

- Precisa estar homologado, ativo, com entrega de borracharia habilitada, online e com sinal recente.
- O prestador que acabou de ser recusado **não recebe imediatamente a mesma proposta**; após uma recusa ele pode voltar mais adiante na mesma fila. Com duas recusas desse cliente **na mesma solicitação**, deixa de ser elegível até a rodada terminar.
- Nesta versão piloto, a busca fica na **mesma cidade** do prestador anterior (Belo Horizonte). Quando há coordenadas, os candidatos são priorizados por proximidade aproximada; sem coordenadas, seguem a ordem de cadastro.
- O cliente mantém o mesmo pedido. Profissionais sem recusas naquela rodada têm preferência sobre os já recusados uma vez; o escolhido pode apresentar um novo orçamento.
- Se não houver **outro** prestador elegível agora, o pedido muda para `no_provider`; mesmo quem teve só uma recusa não é chamado novamente de forma imediata.

**Importante:** distância de trajeto, raio de cobertura, limite de propostas, tempo máximo para resposta e disparo de notificações em tempo real ainda precisam ser homologados antes de atendimento comercial.

## 5. Segurança e rastreabilidade

- O encaminhamento acontece em uma função SQL transacional, com autenticação e conferência de titularidade do cliente.
- `bj_request_attempts` mantém `rejection_count` por par **pedido/prestador**. Primeira recusa: continua elegível mais adiante; segunda: fora somente dessa solicitação.
- Orçamentos anteriores são mantidos para auditoria; cada prestador conserva acesso somente aos orçamentos enviados por ele.
- A inserção direta de orçamentos foi bloqueada: o valor é registrado pelo procedimento protegido `bj_submit_quote`.
- O cliente aceita ou recusa pela função protegida `bj_answer_quote` e pode encerrar a solicitação pela função `bj_finish_request`. O encerramento do piloto registra `cancelled` e não confirma serviço prestado.
- As funções de presença `bj_set_presence`, `bj_ping_presence` e `bj_online_providers` não fornecem credenciais privadas.
- O banco continua com RLS em todas as tabelas públicas novas.

## 6. Status de desenvolvimento

**Implementado e simulado:** botão online/offline, presença com expiração, exibição de prestadores online, orçamento do prestador, aceite, recusa e encaminhamento ao seguinte, caso sem novo prestador, bloqueio de acesso indevido.

**Pendente para uso real:** testes em dois navegadores com Supabase Auth e internet, homologação do prestador, georreferenciamento/raio de atendimento, notificações e tempo de resposta, finalização do serviço e pagamentos reais. Nenhuma operação comercial deve ser iniciada somente com essa simulação.

## 7. Encerramento da rodada e início de uma nova

A **rodada** é identificada por `service_requests.id`. Ao encerrar a solicitação, ela fica com status `cancelled` (encerramento do teste, não serviço concluído), preservando a auditoria de orçamentos e recusas.

Se o solicitante abrir **um novo pedido**, ele receberá outro `request_id` e, por isso, **todos os prestadores homologados e online começarão novamente com zero recusas**, inclusive aqueles recusados duas vezes na solicitação anterior. Não existe bloqueio permanente do borracheiro por cliente.

Não há atualização automática de antigas solicitações marcadas `no_provider`: o solicitante pode encerrá-las e criar outra quando desejar.
