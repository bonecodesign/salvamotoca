# Salva Motoca! — fila transacional de notificações F5 (somente simulação)

**17/11/2026 · Draft de segurança · NENHUM disparo real, nenhum dispositivo local.** Baseado nos [PRs #61](https://github.com/bonecodesign/salvamotoca/pull/61) e [#62](https://github.com/bonecodesign/salvamotoca/pull/62). Repositório `bonecodesign/salvamotoca`; único Supabase existente permanece **inalterado**.

## Objetivo

O atendimento F5 não pode mandar a mesma notificação repetidas vezes em decorrência de duas transações, nem comunicar deslocamento obsoleto depois da chegada ou de uma disputa. Precisamos também recuperar uma tarefa após a queda de um trabalhador, sem assumir que o envio foi concluído só porque a tarefa foi lida.

A implementação presente é deliberadamente uma **fixture PostgreSQL 17 totalmente isolada**, não um webhook, fila hospedada, Edge Function ou migration.

## Contrato simulado implementado

- **Outbox transacional**: um `mock_dispatch` válido insere o registro de notificação `mock_dispatch_notice` na *mesma transação* do evento F4/F5. Transação revertida, aviso revertido. O pagamento mock sozinho **não** cria aviso.
- **Evento exclusivo**: `source_event_id` único por job, associado ao pedido e ao prestador da sessão. Não há telefone, endereço, GPS, token de usuário, foto ou conteúdo de mensagem.
- **Dois trabalhadores concorrentes**: `SELECT ... FOR UPDATE SKIP LOCKED` impede que dois processos obtenham simultaneamente o mesmo job, sem bloquear outras tarefas.
- **Leasing e renovação**: reserva por 30 segundos, token de tentativa diferente a cada aquisição e apenas três tentativas. Após falha, aguarda 1s ou 2s conforme a tentativa; no limite, vai para `dead`. Reaquisição após vencimento invalida token antigo.
- **Confirmação apenas simulada**: `ack` marca `acked_mock`, nunca enviado. A repetição da mesma confirmação com o mesmo token retorna `duplicate_mock_ack`; trabalhador alheio e token vencido falham.
- **Revogação**: evento `mock_arrival`, `mock_dispute`, `mock_chargeback` ou `mock_refund_requested` cancela trabalhos ainda pendentes/alugados; uma tarefa previamente confirmada em mock não pode ser “desenviada”.
- **Operação fechada**: funções `SECURITY INVOKER` em `private`, sem `EXECUTE` para `anon` ou `authenticated`, com flag de teste privada e identidade de trabalhador inventada; não existe integração de rede ou PSP.

Arquivos versionados: `tests/f5-outbox-fixture.sql`, `tests/f5-outbox-adversarial.sql`, `tests/f5-outbox-race.sh`, `tests/f5-outbox-contract.test.mjs` e `.github/workflows/f5-outbox-concurrency.yml`.

## O que este ensaio demonstra

| Cenário no contêiner descartável | Resultado exigido |
|---|---|
| Apenas evento financeiro mock | Zero notificações na fila |
| Despacho fictício válido | Uma tarefa atômica, para prestador vinculado |
| Duas conexões tentando reservar o mesmo job | Uma recebe lease; a outra recebe vazio |
| Trabalhador cai e lease expira | Outra tentativa recebe novo token; token antigo não pode confirmar |
| Trabalhador errado tenta confirmar | Falha sem alteração |
| Disputa antes da entrega | Aviso pendente cancelado |
| Chegada durante o lease | Lease cancelado e ack tardio rejeitado |
| Três falhas consecutivas | Tarefa morta; não insistir indefinidamente |
| Transação adversarial revertida | Tabela de outbox e eventos voltam vazias |

**Importante:** um token de lease e uma fila durável não garantem **entrega única externa** quando o envio real ocorre antes do ACK e a rede falha após o aceite do provedor. A implementação definitiva deverá usar IDs idempotentes no fornecedor, reconciliação do resultado, expiração de mensagens e política explícita de repetição. O protótipo não executa nenhuma chamada externa; “`acked_mock`” é apenas uma transição no banco de teste.

## Pontos que continuarão pendentes

1. Vincular ao **fluxo de orçamentos F2** a regra aprovada de avisar primeiro prestadores próximos e expandir o raio gradualmente, com deduplicação, limite de tentativas e cancelamento de propostas superadas. **Este ensaio F5 só cobre aviso de despacho para prestador já escolhido**, após pagamento mock.
2. Implementar autorização de backend real: Auth/RLS, elegibilidade atual do prestador, consentimento de GPS, concorrência entre atendimento/cancelamento e recibo PSP autenticado — nunca confiar na flag da fixture ou em estado enviado pelo navegador.
3. Definir emissor de push/SMS sob aprovação de custos e consentimentos; fazer E2E com canais e dispositivos controlados. Nenhum provedor foi contratado ou conectado.
4. Testar perdas de rede, retries após crash, quotas, spam, revogação de URLs e canal de suporte. O fluxo do app não está conectado a esta fixture.
5. **G1 continua bloqueado** até comprovar backup e restauração reais de DB/Auth/Storage do único Supabase. Nenhum SQL de teste deve ser promovido a migration antes de G1, revisão técnica e autorização explícita.
6. Caso testes locais no computador do responsável sejam necessários, utilizar **exclusivamente a pasta temporária que ele indicar previamente**, sem copiar dados reais para a pasta; registrar artefatos criados e removê-los ao final. **Nenhum teste neste dispositivo foi feito nesta rodada.**

## Base documental

Contrato financeiro preservado: **10% adicional para motociclista + 10% de comissão do prestador**, ambos apenas sobre serviço com materiais incluídos; deslocamento isento. Nenhum pagamento PSP, transferência, atendimento, localização ou notificação real é realizado.

**Estado: somente CI offline. G1=BLOCKED; release NO-GO; nenhuma mudança no Supabase hospedado; PR Draft sem merge.**
