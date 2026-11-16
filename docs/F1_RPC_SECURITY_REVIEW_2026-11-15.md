# F1 — revisão inicial das seis RPCs privilegiadas (somente leitura)

**Data:** 15/11/2026 · **Projeto:** Salva Motoca! · **Escopo:** metadados e definições SQL atualmente instaladas em `yivkqyjdeouxnwtwfekc`. **Nenhum usuário autenticado fictício, pedido ou pagamento foi criado.**

## Constatações comprovadas por leitura

O Security Advisor reporta **6 avisos de funções `SECURITY DEFINER` executáveis por `authenticated`**: `bj_answer_quote`, `bj_finish_request`, `bj_get_request_location`, `bj_ping_presence`, `bj_set_presence` e `bj_submit_quote`. São avisos de superfície privilegiada, **não prova de exploração**. Quatro tabelas de RLS sem policy são avisos informativos; não adicionar políticas indiscriminadamente.

As definições SQL atuais mostram:
- `bj_answer_quote`: lê `auth.uid()`, adquire locks em proposta/pedido e exige que a decisão de uma proposta pendente pertença ao cliente. Aceite move o pedido para `awaiting_payment`, não confirma dinheiro.
- `bj_finish_request`: exige o dono do pedido, faz lock e bloqueia encerramento simples quando encontra `payment_records` nos estados `authorized` ou `paid`. Não substitui o modelo de estorno e disputa F4 futuro.
- `bj_get_request_location`: o cliente acessa sua localização; o dono do prestador atribuído exige vínculo e existência de `payment_records.status='paid'`. **Ponto de revisão:** a função não testa explicitamente habilitação da fase F4, homologação/atividade atual do prestador, estado de disputa/estorno ou status do atendimento. A validade comercial do `paid` depende do backend que o produziu. É risco de desenho a analisar em testes A/B/C, **não vazamento demonstrado**.
- `bj_submit_quote`: valida `auth.uid()` como dono do prestador, homologação e estado `requested`; atualiza para `quoted`. Conferir em teste autenticado concorrência, validade de propostas e dados adulterados.
- `bj_set_presence`: exige prestador próprio, homologado/ativo para ficar online e categoria habilitada.
- `bj_ping_presence`: atualiza heartbeat somente de prestador próprio homologado, ativo e que pediu online.
- As seis declarações usam `SECURITY DEFINER` com `search_path=''`, o que reduz riscos de resolução ambígua de objetos, mas **não substitui** revisão de privilégio e de ownership.

Confirmei ainda que `public.payment_records` tem **RLS habilitada** e que os roles `anon` e `authenticated` **não possuem INSERT nem UPDATE direto** nessa tabela. Essa proteção reduz a possibilidade de criar pagamento falso pelo Data API comum; não comprova todos os caminhos privilegiados ou webhooks. `public.service_requests` também está sob RLS, com UPDATE direto negado a `authenticated`.

## Testes obrigatórios APÓS backup/restauração real, sem operação comercial

1. `anon` deve receber negação nas seis RPCs; e garantir que nenhum JWT fictício consiga passar por identidade de terceiro.
2. Cliente A: solicitar localização de pedido fictício próprio conforme regras; cliente C não pode consultar pedido de A.
3. Prestador B não selecionado, suspenso ou desativado: tentar consultar localização de A mesmo conhecendo o UUID; negar. Não depender apenas de flag no navegador.
4. Prestador selecionado sem pagamento confirmado: negar localização exata. Evento `paid` fabricado, objeto alterado e estado `awaiting_payment` devem ser recusados.
5. Com provedor PSP futuramente homologado: confirmar que estorno, disputa, reatribuição ou cancelamento revogam nova autorização para localização e chat. URLs assinadas já geradas podem continuar válidas até expirar.
6. `bj_answer_quote`: aceitar/recusar apenas do próprio cliente, com proposta correta, atomicidade e idempotência; não permitir trocar o prestador vencedor por UUID de outro.
7. `bj_finish_request`: não deve permitir cancelar/encerrar com pagamento real sem conciliação de reembolso; não confirmar conclusão bilateral.
8. `bj_submit_quote`, `bj_set_presence`, `bj_ping_presence`: IDs não pertencentes ao ator, contas descredenciadas, ausência de serviço ativo, tempo expirado, concorrência e requisições abusivas devem falhar.
9. Revisar em código a autoridade de quem cria `payment_records` e a correspondência PSP/valor/moeda/orçamento em F4 antes de ligar qualquer gate.
10. Separar mensagem de erro para cliente de telemetria de incidente com mínima coleta de dados pessoais; nenhum dump/token em GitHub.

## Decisão

**SECURITY_REVIEW=PARTIAL_READ_ONLY**. Não foi executada exploração, prova de ausência de exploração ou teste HTTP autenticado. Sem backup restaurado, não criar contas, fazer uploads ou invocar RPCs que alteram estados. **F1 segue `f1TestRequestsEnabled=false`; pilotagem `NO-GO`.**

Consulta reproduzível sem mutações: `docs/F1_RPC_PRECHECK_READONLY.sql`. A revisão jurídica/privacidade/financeira e a integração real de F4/F5/F6 permanecem necessárias.
