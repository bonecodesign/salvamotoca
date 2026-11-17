# Salva Motoca! — aceite de orçamento → pagamento → despacho, sem PSP real

**17/11/2026 · F2/F3/F4/F5 em PostgreSQL 17 descartável · PR Draft**  
Repositório: `bonecodesign/salvamotoca`. Projeto Supabase hospedado existente: `yivkqyjdeouxnwtwfekc` (**NÃO modificado**). **Estado geral: G1=BLOCKED e RELEASE=NO_GO**.

## Lacuna que resolvemos no ensaio

Os PRs anteriores comprovaram separadamente (a) roteamento de borracharia F2 e reboque F3 com seleção geográfica fictícia, (b) exclusividade de eventos e estado financeiro **fictício** F4–F6, e (c) uma outbox F5 que não manda mensagens. A transição entre essas etapas precisava impedir que um evento aparentemente pago, embora fictício, se vinculasse a uma proposta **não selecionada** ou a outro prestador. No sistema real a fonte da verdade tem de ser transacional, não apenas o estado exibido no app.

Este PR acrescenta uma **ponte SQL de teste privada** para exercitar a passagem do orçamento aceito para a sessão F4/F5. **Ela não usa identidade Auth, webhook Stripe, usuário real, migration Supabase ou alguma RPC pública**.

## Arquitetura de homologação preparada

1. **Convites e propostas (fictícios)**: a fixture traz dois orçamentos de borracharia para um pedido, dois orçamentos de reboque para outro e um pedido cancelável. O reboque misto (`reboque_moto` e `troca_camara`) exige prestador com serviço completo, equipamento homologado, capacidade/peso, presença e cobertura ficticiamente válidas.
2. **Aceite serializado**: `private.f234_mock_accept_quote` exige titularidade do cliente **como parâmetro de teste, NÃO Auth**, proposta vigente e prestador elegível. Trava o registro do pedido com `FOR UPDATE`, registra um único vencedor, declina outras propostas e só então cria **uma** sessão `private.f456_mock_sessions`. `accept_event_id` e índice de proposta vencedora única impedem duas aprovações. A repetição exata retorna `duplicate`.
3. **Congelamento do preço**: após aceitar, a proposta não pode ser alterada ou apagada no mock; a futura conciliação verifica `requestId`, `quoteId`, `customerId`, `providerId`, serviço, deslocamento e valores do snapshot. Qualquer divergência bloqueia.
4. **Cálculo**: exemplo fictício R$ 230,00 de serviço (materiais inclusos) + R$ 40,00 de deslocamento. Taxa do motociclista: R$ 23,00. Subtotal do cliente: R$ 293,00 **antes da tarifa PSP**. Comissão do prestador: R$ 23,00. Repasse-base previsto: R$ 247,00. Comissão bruta teórica da plataforma: R$ 46,00. O deslocamento não gera comissão.
5. **Pagamento mock separado de autorização real**: a seleção cria sessão com `awaiting_mock_payment`, **sem** criar evento financeiro, saldo, repasse ou aviso. Somente `mock_payment_verified` (marcador explícito de fixture, nunca PSP) avança o estado dentro do PG isolado. A função F456 mantém `real_payment_verified=false`.
6. **Despacho mock só após conciliação**: o gatilho `private.f234_mock_guard_f456_event` verifica o orçamento congelado, prestador ainda válido, evento e journal fictício F456 antes de permitir `mock_dispatch`. Isso insere exatamente **um** aviso de outbox F5 na mesma transação, sem enviar SMS/push, sem GPS e sem trabalho real.
7. **Risco e cancelamento**: suspeita/estorno fictício gera `mock_hold` e cancela aviso pendente. Cancelamento **antes** de qualquer aceite é permitido para o titular fictício; depois do aceite exige fluxo de suporte financeiro, sem cancelamento automático. Prestador descredenciado no meio bloqueia pagamento/dispatch fictícios.

### Arquivos

- `tests/f234-handoff-fixture.sql` — três solicitações inventadas, prestadores, propostas, função de aceite, cancelamento protegido e gatilho de conferência.
- `tests/f234-handoff-adversarial.sql` — testes negativos (titularidade, proposta vencida, prestador/reeboque inválido, preço adulterado, pagamento duplo, despacho antecipado, disputa, rollback total).
- `tests/f234-handoff-race.sh` — **duas conexões PostgreSQL simultâneas** para provar: somente uma proposta vencedora; recibo financeiro fictício único e replay; somente um despacho e aviso fictícios; cancelamento concorrente impede aceite tardio.
- `tests/f234-handoff-contract.test.mjs` — verificações estáticas de gates, privilégios, preço 10% + 10%, ausência de PSP real e vínculos.
- `.github/workflows/f234-handoff-offline.yml` — PostgreSQL 17 efêmero, Node 22, sem deploy, credenciais remotas ou serviços pagos.

## Provas exigidas e limitações incontornáveis

| Invariante a testar | Situação de teste | Situação hospedada |
|---|---|---|
| Apenas o cliente correto aprova a proposta | Simulação de proprietário por UUID artificial | **Auth/JWT/RLS NÃO TESTADOS** |
| Preço aceito não muda e é usado no ledger | CHECK e gatilho de congelamento em PG descartável | **Migração definitiva NÃO CRIADA** |
| Duas aprovações concorrentes não elegem dois vencedores | Transações PG17 `FOR UPDATE` | **Backend real NÃO TESTADO** |
| PSP bloqueia envio até confirmar | Somente `mock_payment_verified` falsificado **pela fixture**, jamais como recibo real | **PSP REAL NÃO CONECTADO** |
| Prestador suspenso não pode iniciar atendimento | Verificação de perfil sintético antes do mock | **Credenciamento real NÃO HOMOLOGADO** |
| F5 cria aviso único e cancela após risco | Outbox `acked_mock`/pendente fictícia | **SMS/PUSH REAL NÃO ENVIADO** |
| Backups recuperam serviço | Os testes retornam à base artificial ou banco é destruído | **G1 (DB/Auth/Storage) BLOQUEADO** |

**Cuidado técnico:** a função de aceite recebe `p_actor_id` de teste — isso **não autentica ninguém**. É proposital porque a fixture nunca sai do contêiner e o papel `authenticated` não recebe permissões de execução. Em uma implementação autorizada, identidade precisa vir de Auth validado no servidor, com revisão de RLS e claims, não de UUID transmitido pelo cliente. O mesmo vale para provedor PSP: a string de fixture nunca é um recibo confiável.

Nenhum `SECURITY DEFINER` novo foi publicado. Não instalar as tabelas `private.f234_mock_*` em qualquer projeto real. A política comercial e a janela de 5 minutos permanecem como aprovadas; raios de 1, 3, 10 km seguem **apenas ilustrativos** para a seleção F2/F3.

## Dependências antes de liberar

1. Completar **G1 privado real** (backup, restauração independente e provas de Auth, DB e bytes Storage), respeitando o procedimento preparado nos PRs #53/#58/#61.
2. Reconciliação e revisão de PRs empilhados #42→#65 e deste candidato, sem merges automáticos.
3. Gerar migrations definitivas **só após autorização e avaliação no schema real**, com Auth/RLS, concorrência, quota, auditoria e PSP sandbox assinado.
4. Homologar F5/F6, serviços mistos, disputa, notificações, LGPD, dispositivo físico, suporte e recuperação de falhas.
5. **Testes no dispositivo do responsável** serão feitos **somente na pasta temporária indicada por ele**, após autorização, com limpeza; não foram necessários nesta rodada.

**Nenhum atendimento, solicitação, foto, localização exata, usuário, notificação, pagamento ou transferência real foi gerado. `RELEASE=NO_GO`.**
