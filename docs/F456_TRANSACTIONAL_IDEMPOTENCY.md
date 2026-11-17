# Salva Motoca! — idempotência e concorrência F4–F6 (PostgreSQL 17 descartável)

**17/11/2026.** Prova técnica em duas sessões **apenas no PostgreSQL criado pela CI**, não no Supabase hospedado. Este documento **NÃO é migration, autorização de pagamentos, guarda de produção ou relatório de E2E real**.

## Progresso e objetivo

Até o PR #61 as simulações Node/Chrome e alguns testes F4 PostgreSQL cobriam eventos duplicados e segurança financeira. Identificamos a lacuna: duas sessões que leem o mesmo snapshot podem decidir independentemente pelo mesmo despacho ou conclusão. A integração F5/F6 real só será liberável se o **servidor** serializar a decisão e deixar trilha de evento único.

O candidato de teste nesta branch contém:

- `tests/f456-transactional-fixture.sql`: modelo isolado com `SELECT ... FOR UPDATE` da sessão, `event_id` global único, evento com payload ligado ao pedido/proposta/participantes, livro financeiro fictício de **uma entrada por solicitação**, versão, status e restrições que nunca permitem `real_payment_verified`, `real_dispatch_authorized` nem `real_transfer_authorized`.
- `tests/f456-transactional-adversarial.sql`: testa IDs reaproveitados com payload divergente, valores de 15% legados, titularidade, evento financeiro em despacho, falta de pagamento, silêncio acima da janela de **5 minutos**, suporte via hold e chargeback após conclusão. Toda a prova ocorre em `BEGIN ... ROLLBACK`, com conferência posterior de ausência de eventos e de gate ligado.
- `tests/f456-transactional-race.sh`: abre **duas sessões psql concorrentes sobre o mesmo banco descartável** e força sobreposição de locks: o mesmo pagamento fictício deve gerar **um evento aplicado e uma repetição idempotente**; dois despachos com IDs diferentes devem gerar **um único despacho**; as duas confirmações em ordem concorrente devem concluir sem permitir repasse; chargeback posterior produz hold.
- `tests/f456-transactional-guards.test.mjs` e `.github/workflows/f456-transactional-races.yml`: verificam flags, grants, isolamento, matemática e gatilhos da CI.

**Matemática de referência:** R$ 230,00 serviço (materiais inclusos) + R$ 40,00 deslocamento, taxa do solicitante R$ 23,00, subtotal cliente R$ 293,00 antes do PSP, desconto do prestador R$ 23,00, previsão de repasse-base R$ 247,00 e receita bruta teórica R$ 46,00. Nenhuma comissão incide sobre deslocamento; nenhum valor é cobrado de verdade.

## Resultados esperados e riscos

| Ensaio | Comportamento requerido | O que NÃO comprova |
|---|---|---|
| Duas tentativas do mesmo `event_id` financeiro | Primeiro commit aplica; segundo retorna `duplicate`, lançamento único | Identidade real de PSP ou liquidação |
| Dois despachos diferentes do mesmo pedido | Um commit aplica; segundo é recusado sem efeitos | GPS, notificações ou prestador real |
| Duas confirmações simultâneas F6 | Estado final completo só com as duas identidades fictícias corretas | Autenticação real, veracidade de entrega, avaliação |
| Chargeback fictício após confirmação | Estado `mock_hold` e sem qualquer autorização de dinheiro | Estorno real, reserva ou liquidação PSP |
| Evento alterado com ID reutilizado | Exceção `REPLAY_EVENT_ID_PAYLOAD_MISMATCH` | Proteção contra redes maliciosas/autenticidade de webhook |
| Preço antigo +15%, peça extra, cobrança em deslocamento | Rejeição via CHECK/contrato financeiro | Conformidade tributária ou jurídica |

## Segurança e limites obrigatórios

- **O banco é artificial**. Identidades no SQL são UUIDs de teste. O status `mock_paid` nunca deve ser interpretado como confirmação PSP.
- **Nenhum endpoint autenticado**: a função em schema `private` é `SECURITY INVOKER`, sem `EXECUTE` para `anon` ou `authenticated`. A GUC `app.f456_test_only` é guard apenas do ensaio e **não é controle de segurança para produção**.
- Contas, requests, chamadas de API, fotos, Storage e dinheiro reais **não foram utilizados**.
- Cada API real futura exigirá verificar usuário atual (Auth), autorização sobre proposta/pedido/prestador, assinatura e conciliação oficial PSP, dispositivo, limites de retry, RLS, controles transacionais e notificações com outbox idempotente.
- `SELECT FOR UPDATE` serializa linhas existentes **neste mock**, mas não cobre automaticamente pedido inexistente, filas distribuídas, timeouts, PSP com retries tardios, expirados, múltiplas regiões, falha de rede ou pagamento pós-cancelamento.
- Não criar migration ou ativar F4/F5/F6 a partir desse protótipo. O sistema deve manter interfaces desligadas e exigir a prova G1 de backup/restauração real, depois Auth A/B/C, PSP sandbox autorizado, segurança do backend, Android e revisão humana.
- O novo modelo não transforma Stripe em escrow, não autoriza cobrança do cliente sem contrato jurídico e não comprova execução física de atendimento.

**Estado técnico:** ensaio de concorrência **offline**, sujeito a CI. **G1=BLOCKED; F1–F7 reais não liberados; RELEASE=NO_GO.**

**Integração:** documentação do [PR #61](https://github.com/bonecodesign/salvamotoca/pull/61), [matriz G0–G8](./F1_F7_UNIFIED_ACCEPTANCE_MATRIX.md) e [cadeia financeira F2–F7](./F456_RECONCILIACAO_CONTRATO_10X10.md). Revisar este ramo **após** o #61; não fazer merges automáticos.
