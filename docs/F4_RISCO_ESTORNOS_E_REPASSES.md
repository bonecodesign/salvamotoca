# F4 — Estornos, disputas e repasses: proteção pré-operacional

**Salva Motoca!** · Branch `feat/f4-pagamentos-protegidos-simulador-seguro` · PR #45 (dependente de F3 PR #44 e F2 PR #42).

**Natureza:** documentação de implementação **MOCK e offline**. Não há integração Stripe, Pix, cartão, webhook real, estorno, saldo ou transferência. **Proibido aplicar o SQL desta etapa no Supabase hospedado.**

## O que foi preparado

A nova extensão SQL candidata `supabase/drafts/f4_risk_settlement_mock_candidate.sql`, aplicada **somente** ao PostgreSQL 17 descartável no CI, acrescenta:

| Componente | Responsabilidade | Não faz |
| --- | --- | --- |
| `private.f4_mock_risk_cases` | Registra pedidos fictícios de estorno parcial/integral e casos de disputa/chargeback; ID idempotente por caso | Não devolve dinheiro nem muda o PSP |
| `private.f4_mock_settlement_intents` | Mantém apenas UMA intenção fictícia de **revisão humana** por tentativa, sem execução | Não transfere nem marca como liberado |
| `private.f4_open_mock_risk_case` | Verifica orçamento original, pagamento e journal mock; soma estornos pendentes sob bloqueio transacional | Não aceita valores acima do orçamento |
| `private.f4_close_mock_risk_case` | Encerra caso mock **sem ação financeira** | Não marca como refund concluído |
| `private.f4_queue_mock_settlement_review` | Exige duas confirmações fictícias, journal e nenhum caso aberto; sempre `transferAuthorized=false` | Não confirma F6 real e nunca chama PSP |
| `private.f4_hold_mock_settlement` | Suspende imediatamente uma revisão já cadastrada quando surge risco posterior | Não reativa automaticamente o repasse quando o caso fecha |

### Exemplos de teste, não de política financeira definitiva

No orçamento fictício de **R$ 280,00** (serviço R$ 230, deslocamento R$ 40, material R$ 10):

- Solicitar R$ 70,00 de estorno parcial cria **um caso pendente de revisão**. O saldo ainda não foi devolvido.
- Solicitar outros R$ 250,00 sem cancelar a primeira solicitação é recusado: **R$ 320,00 excede R$ 280,00**.
- Dois processos pedindo o mesmo estorno de R$ 80,00 geram **um caso**, não dois.
- Com R$ 80,00 já reservado, duas novas solicitações simultâneas de R$ 110,00 só podem aprovar **uma**; a segunda ultrapassaria R$ 280,00.
- Um caso de disputa ou chargeback suspende a revisão de repasse, mesmo se o prestador e o motociclista já tiverem confirmado sua conclusão *fictícia*. A intenção permanece suspensa mesmo depois de encerrar o caso sem ação.

**A retenção de verba é apenas uma simulação de controle de solicitações.** O código não verifica fundos do PSP, nem reserva dinheiro real.

## Segurança de acesso e reversibilidade

- Tabelas em `private`, RLS habilitada, privilégios revogados de `anon` e `authenticated`; funções não são expostas no Data API.
- Escritas de teste exigem o gate privado F4 habilitado e a variável `app.f4_test_only='local_fixture'` **somente** no container de CI. A flag `config.js: f4PaymentsEnabled=false` permanece.
- Bloqueio `FOR UPDATE` no registro da tentativa impede ultrapassar orçamento mesmo com concorrência entre transações.
- `supabase/rollback/f4_risk_only_if_empty.sql`: recusa exclusão com gate ligado ou qualquer caso/intenção registrada. Preserva F4 base, journal de partidas dobradas, F1, F2 e F3.
- Testes: `tests/f4-risk-settlement.sql` (RLS, valores, disputa, idempotência, bloqueio de repasse) e `tests/f4-risk-race.sh` (duas conexões, rollback positivo/negativo).

## O que ainda NÃO está implementado

1. PSP de marketplace escolhido e homologado para o Brasil; contrato que suporte estrutura de fundos, taxas e repasses, sem chamar isso de escrow.
2. Cobrança, Pix/cartão, webhooks oficiais verificados e conciliação com extratos PSP e banco.
3. **Estorno parcial efetivo**, incluindo split de responsabilidade por deslocamento, materiais, comissão, tarifa de processamento e impostos. O simulador **não** contabiliza um reembolso parcial nem calcula automaticamente a divisão dessa perda entre as partes.
4. Contestação bancária real: chargeback, reversão, defesa documental, taxas, prazos e saldo negativo.
5. Identidade e permissões humanas dos operadores de suporte, política de auditoria e meios formais de contestação.
6. F6: registros reais e imutáveis das **duas confirmações** de conclusão. Os parâmetros booleanos de teste não são comprovação real.
7. Trilha jurídica/contábil, backup com restauração demonstrada de PostgreSQL/Auth/Storage e homologação E2E. Sem esses itens, nenhum SQL candidato pode ser aplicado ao Supabase real.

## Checklist de continuidade para o Work

Ler `docs/F4_WORK_EXECUCAO.md` e `docs/F4_CONTRATO_FINANCEIRO_E_LEDGER.md`; verificar que PRs #42 e #44 continuam sendo dependências de #45. Executar no CI **sem credenciais reais** os scripts `f4_risk_settlement_mock_candidate.sql`, `f4-risk-settlement.sql` e `f4-risk-race.sh`. Registrar execução, testes e bloqueios com commit SHA em `docs/F4_RESULTADOS_MODELO.md`.

Qualquer integração real depende de aprovação explícita. **Estado permitido:** F4 candidata, com regras locais testáveis e ativação comercial bloqueada.
