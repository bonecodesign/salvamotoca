# F4 — roteiro de trabalho e homologação financeira

**Projeto:** Salva Motoca! · **Dependências:** F1, PR #42 (F2) e PR #44 (F3). Este PR deve ficar empilhado sobre F3 até a revisão das fases anteriores.

**Estado:** regras matemáticas, assinatura fictícia de eventos e SQL candidato em PostgreSQL descartável. **Nenhuma integração financeira remota implantada, nenhuma conta ou cobrança criada.**

## Restrições inegociáveis

Não criar novo Supabase, contratar serviços, cadastrar dados bancários reais, usar modo live, criar PaymentIntent ou Checkout Session, solicitar transferência, estorno, notificações ou teste de valor real. Nunca publicar chaves secretas, tokens, fotos, comprovantes ou dados pessoais no GitHub.

## Gate 0 — Decisões de negócio

- Comissão de 15% apenas sobre o serviço; deslocamento, peças e tarifa PSP fora da base.
- Cliente absorve tarifa PSP somente se viável juridicamente e informada separadamente antes de pagar. Não inventar valor da tarifa.
- Sem orçamento imutável e aceite específico, não há cobrança.
- Confirmar pagamento exclusivamente no backend com PSP autenticado, verificação de webhook e reconciliação; navegador ou retorno de checkout nunca marcam como pago.
- Cancelamento do prestador e do cliente antes do deslocamento: reembolso integral incluindo tarifa quando devido. Após início do deslocamento, casos do cliente vão para mediação humana.
- Repasse apenas após pagamento verificado, duas confirmações de conclusão, ausência de disputa e condições contratuais do PSP. Mesmo elegível, o app não inicia transferência.

## Gate 1 — Simulador isolado

Executar testes Node de cálculo, flags e regressões F1–F3. Testar a prévia em Chrome bloqueando rede externa, desktop e celular. Provar ausência de SDK Stripe, chamadas financeiras, segredos e status paid no navegador.

Arquivos: `f4-finance.js`, `f4-mock-webhook.js`, `tests/f4-finance.test.js`, `tests/f4-mock-webhook.test.js`, `tests/f4-release-guard.test.js`, `tests/f4-browser.test.js`, `docs/F4_PREVIEW.html` e `.github/workflows/f4-tests.yml`.

## Gate 2 — Viabilidade real do PSP, apenas documental

Investigar Stripe Connect e alternativas compatíveis no Brasil: CNPJ, onboarding, Pix/cartão, conta conectada, responsabilidades por tarifas e chargeback, repasse, retenção, split, estorno de tarifa e revisão contratual. Não conectar conta sem autorização.

- https://docs.stripe.com/connect/marketplace
- https://docs.stripe.com/connect/separate-charges-and-transfers
- https://docs.stripe.com/connect/manual-payouts

IMPORTANTE: Stripe não fornece escrow. Não prometer retenção indefinida nem caracterizar retenção de saldo como custódia legal.

## Gate 3 — Backend futuro, SEM executar no Supabase remoto

Já existe um **SQL candidato demonstrativo**, `supabase/drafts/f4_financial_backend_candidate.sql`, com `private.f4_release_gate.enabled=false`, mock de tentativa, recibos e ledger privado. NÃO executar no projeto remoto. Execute exclusivamente em PostgreSQL 17 descartável, precedido de `tests/f2-stage-setup.sql` e `supabase/drafts/f2_backend_candidate.sql`, seguido de `tests/f4-stage-rls.sql`. O CI também testa `tests/f4-rollback-guard.sh` e `supabase/rollback/f4_only_if_empty.sql`.

**Extensão contábil mock concluída localmente:** `supabase/drafts/f4_double_entry_mock_candidate.sql`, executada **após** a etapa de concorrência fictícia do CI (que recria a camada F4 base). Executar em PostgreSQL17 descartável e testar com `tests/f4-double-entry.sql`. A camada registra três linhas contábeis com débitos e créditos rigorosamente balanceados no commit (ou duas quando a comissão é 0 centavo), estorno compensatório, defesa contra disputa e elegibilidade apenas para revisão. Reverter apenas vazia via `supabase/rollback/f4_double_entry_only_if_empty.sql` com teste `tests/f4-double-entry-rollback-guard.sh`. Não há dinheiro real nem PSP e nenhuma função concede transferência.

**Contrato futuro sem implementação live:** `docs/F4_CONTRATO_FINANCEIRO_E_LEDGER.md` especifica endpoints do servidor, autoria de estados, conciliação real, repasses e análise jurídica/contábil. Não criar os endpoints nem credenciais até revisão e autorização.

**O SQL atual não é schema financeiro pronto para produção.** Ele usa eventos `mock_*` e GUC `app.f4_test_only=local_fixture`, nunca consulta PSP nem altera status operacional. Não habilitar RPCs financeiras aos usuários.

Depois de backup/restauração verificável de DB/Auth/Storage, revisão das F1–F3, definição do PSP e aprovação jurídica/financeira, gerar **PR separado de migration real** a partir de desenho próprio: payment_attempt, ledger contábil, webhook_inbox persistente, settlement_intent, refund_case, auditoria, RLS e controle de acesso. Não reaproveitar o verificador HMAC `mock-v1` como Stripe webhook.

Modelar: assinatura inválida, replay, evento fora de ordem, alteração de valor, cobrança duplicada, corrida de webhooks, settlement concorrente, indisponibilidade PSP, chargeback, reversão e reembolso parcial. Primeiro mocks locais, depois sandbox controlado apenas se autorizado. Nenhuma cobrança real.

**Concorrência já demonstrada localmente:** `tests/f4-concurrency-setup.sql` + `tests/f4-concurrency.sh` criam uma tentativa de pagamento fictícia em PostgreSQL descartável, processam o **mesmo evento em duas conexões simultâneas** e exigem uma única linha de recibo e de ledger. O teste só é executado **depois do rollback positivo em banco vazio**, recriando o SQL F4 no container descartável. Não é um teste de concorrência com Stripe real.

**Etapa adicional de risco e repasses (apenas mock):** após recriar `supabase/drafts/f4_double_entry_mock_candidate.sql` no banco descartável, executar `supabase/drafts/f4_risk_settlement_mock_candidate.sql`. Depois rodar `tests/f4-risk-settlement.sql`, conferir rollback da transação e rodar `tests/f4-risk-race.sh`. A corrida usa duas conexões PostgreSQL, bloqueia o total de estornos acima do orçamento e comprova rollback protegido. O script elimina somente fixtures do CI e preserva a estrutura base da F4. Leia `docs/F4_RISCO_ESTORNOS_E_REPASSES.md`.

**Não interpretar `review_only`, `eligibleForHumanReview` ou `closed_no_action` como repasse, aprovação financeira, estorno ou caso resolvido comercialmente.** Esses estados existem apenas na simulação e não demonstram fundos disponíveis, PSP, F6, direito do consumidor ou confirmação de pagamento.

Registrar resultados no arquivo `docs/F4_RESULTADOS_MODELO.md`, separando testes locais de gates financeiros nunca executados.

## Gate 4 — Integração com F5, F6 e F7

F5 só libera chat, endereço exato e deslocamento após pagamento verificado no servidor. F6 oferece confirmação bilateral, mediação, contestação e avaliações com efeito sobre saldo elegível. F7 é homologação geral com especialistas e piloto assistido de Belo Horizonte.

## Bloqueadores explícitos

Sem contrato/PSP homologado, prova de backup restaurável, revisão tributária/jurídica, política de reembolso, testes reais de webhook, reconciliação e revisão humana não existe pagamento liberado. Flag f4PaymentsEnabled permanece false até autorização posterior.

### Prompt de continuidade no Work

> Continue F4 de Salva Motoca! na branch feat/f4-pagamentos-protegidos-simulador-seguro. Leia primeiro docs/F4_WORK_EXECUCAO.md. Mantenha todas as flags desligadas e o Supabase existente intocado. Prepare backend e testes em branch isolada, sem criar pagamento, conta ou operação financeira real. Não habilite F4 ou faça merge como ativação. Documente evidências e bloqueadores, sobretudo backup, suporte PSP Brasil e homologação financeira, jurídica e técnica.
