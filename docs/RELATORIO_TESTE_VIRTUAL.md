# Salva Motoca! — Relatório do teste virtual

**Data da execução:** 12/11/2026 (horário de Brasília)  
**Repositório autorizado:** `bonecodesign/salvamotoca`
**Projeto Supabase de testes autorizado:** ref `yivkqyjdeouxnwtwfekc`

## Objetivo

Simular motociclista, borracheiro e visitante; comprovar criação de pedido de teste, envio de orçamento, isolamento de sessões e proteção de dados, sem pagamentos reais ou contatos com prestadores.

## Parte A — Supabase real (SQL e RLS)

**Resultado: APROVADO.** Uma transação `BEGIN/ROLLBACK` criou identidades fictícias temporárias e simulou:

1. cadastro de borracheiro com status `pending` e serviço inativo;
2. impossibilidade de o visitante visualizar o prestador pendente;
3. homologação e ativação feitas somente pelo contexto administrativo do teste;
4. visibilidade do prestador aprovado ao visitante;
5. cliente criando pedido de teste com chave de idempotência;
6. prestador atribuído visualizando o pedido e enviando orçamento proposto;
7. cliente consultando orçamento e o próprio endereço;
8. terceiro não vinculado impedido de ler pedido, orçamento ou endereço;
9. prestador sem pagamento impedido de ler endereço exato;
10. chat pré-pagamento bloqueado, categoria de reboque não cobrável e duplicações de pedido/orçamento rejeitadas.

A primeira tentativa de simulação falhou porque a identidade autenticada foi mantida ao trocar temporariamente para o papel `anon`. O teste foi corrigido limpando a reivindicação de usuário, e a repetição passou. Isso foi um erro de isolamento do **teste**, não uma vulnerabilidade comprovada.

**Nenhum registro temporário permaneceu no banco:** a transação terminou com `ROLLBACK`.

## Parte B — Aplicativo com Supabase simulado em memória

A versão `live-app-current.js` foi executada em um ambiente JavaScript isolado, com interfaces e consultas de Supabase substituídas por *mocks*. Não foi um navegador real nem usou a API HTTP do Supabase.

Foram verificadas as telas:

| Cenário | Resultado |
|---|---|
| Visitante visualiza mapa vazio antes da aprovação | PASSOU |
| Cadastro de prestador pendente e serviço inativo | PASSOU |
| Mapa atualizado após homologação simulada | PASSOU |
| Motociclista cria pedido com UUID de idempotência | PASSOU |
| Borracheiro visualiza pedido ao abrir “Pedidos” | PASSOU |
| Borracheiro envia orçamento | PASSOU |
| Motociclista visualiza orçamento ao abrir “Pedidos” | PASSOU |

**Inicialmente 5/7:** a tela “Pedidos” não atualizava os dados de outra sessão. Foi corrigida em `live-app-current.js`: ao abrir “Pedidos”, o cliente consulta novamente o banco, e há botão “Atualizar pedidos”. **Após a correção: 7/7.**

## Pendências antes de produção

- Criar duas contas de teste de fato pelo Supabase Auth e validar verificação por e-mail.
- Testar em navegadores ou aparelhos independentes com rede real, inclusive logout e renovação de sessão.
- Homologar um prestador consentido por um fluxo administrativo protegido; a simulação não constitui homologação operacional.
- Testar concorrência real de pedidos, mensagens e preços, erros de rede e limites de taxa.
- Implementar aceite de orçamento, estados de pedido e pagamentos reais com split, webhook, disputas e reembolsos **após homologação**.
- Revisar a função privilegiada de leitura de localização apontada pelo advisor do Supabase.
- Publicar apenas após revisão da segurança e operação.

**Conclusão:** o fluxo virtual do backend e das telas passou nos cenários descritos. Não significa aplicativo publicado, pagamentos habilitados ou fluxo end-to-end real de dois dispositivos.

## Continuação — presença online e segunda rodada de orçamento

**Banco Supabase real:** cenário com cliente e dois borracheiros temporários: ambos online, profissional A envia orçamento de R$ 120, cliente recusa, pedido passa para profissional B, profissional B envia R$ 139, cliente aceita e pedido fica `awaiting_payment` sem registro financeiro. Outro cenário com segundo prestador offline termina em `no_provider`. O histórico do primeiro prestador fica protegido e somente ele pode consultar seu orçamento. A identidade de terceiro não pode aceitar a proposta. **PASSOU; todos os dados foram revertidos por `ROLLBACK`.**

**Presença:** após 91 segundos sem comunicação simulada, o profissional desaparece da lista online; novo ping restaura a disponibilidade sem alterar aprovação. **PASSOU; com `ROLLBACK`.**

**Interface (`live-app-current.js`) em ambiente JavaScript isolado, com Supabase simulado:** 12 cenários cobrindo lista vazia, ativação de dois prestadores, listagem online, pedido, orçamento, botões de aceite/recusa, encaminhamento ao próximo, nova proposta e aceite, e desativação online. **12/12 PASSARAM.**

**Continua pendente:** teste HTTP/E2E em navegadores independentes com Supabase Auth real e revisão antes de colocar pedidos comerciais em operação.

## Atualização — duas recusas por prestador na mesma rodada

**Regra implementada:** primeira recusa do cliente devolve o profissional à fila da solicitação; após a segunda, fica fora apenas do mesmo pedido. Abrir outra solicitação reinicia a contagem para todos os prestadores.

**Teste SQL real no Supabase com `ROLLBACK`: APROVADO.** Dois profissionais online receberam os mesmos pedidos nesta sequência:

- A (recusa 1) → B (recusa 1) → A novamente (recusa 2) → B novamente (recusa 2) → `no_provider`.
- Contadores finais registrados para a primeira rodada: A = 2 e B = 2, preservando os quatro orçamentos históricos.
- O cliente encerrou a primeira rodada por `bj_finish_request`; uma conta de terceiro foi impedida de encerrá-la.
- Uma segunda solicitação com **outro ID** voltou a permitir A, e sua primeira recusa marcou A = 1/2, sem alterar A = 2/2 da rodada anterior.
- Nenhum registro temporário persistiu no banco, e nenhum pagamento foi criado.

**Teste de interface em JavaScript isolado com backend simulado: 3/3 APROVADOS.** O motociclista viu o botão **Encerrar esta solicitação**, conseguiu encerrá-la por RPC e recebeu o botão **Criar nova solicitação**, que abre a busca de prestadores.

Arquivo reproduzível: `supabase/tests/duas_recusas_por_rodada_rollback.sql`. Ainda faltam testes completos via navegador/HTTP com Supabase Auth real.
