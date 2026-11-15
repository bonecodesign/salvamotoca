# Salva Motoca! — F6, backend candidato com RLS (somente MOCK)

**Data-base:** 15/11/2026. **Estado:** PR em Draft, não implantável. **NO-GO** para pagamentos/atendimentos reais.

A F6 estende a cadeia F1 integrada mas não homologada → F2 #42 → F3 #44 → F4 #45 → F5 #48/#49 → F6 #50 (motor offline) → este candidato SQL. Os PRs #46/#47 da F4 têm divergências documentadas, não resolvidas por merge automático.

## Entrega de código

- `supabase/drafts/f6_backend_rls_mock_candidate.sql` — somente **PostgreSQL 17 descartável**, sem migration, sem interação com Supabase hospedado.
- `public.f6_mock_completions`: handoff fictício da F5, resumo obrigatório se informado, prazo **exato de 5 minutos** contado do resumo, dupla confirmação explícita para o estado `completed`, nota 1–5 opcional somente após conclusão no modelo. Estados `awaiting_summary`, `awaiting_both`, `completed` e `support_review`.
- `public.f6_mock_support_messages`: histórico privado de divergências simuladas, restrito à sessão que esteja sob revisão, com mensagem de até 2.000 caracteres.
- `private.f6_mock_release_gate` sempre inicializa `false`. Exige contexto especial `app.f6_test_only=local_fixture` E flag ligada manualmente no container descartável. **A GUC não é controle de segurança de produção:** os clients podem influenciar configurações de sessão em alguns contextos, portanto jamais usá-la como prova de identidade ou pagamento real.
- RLS em todas as tabelas expostas, acesso só a cliente titular ou prestador escolhido e homologado, sem SELECT para `anon`. Não há INSERT/UPDATE/DELETE concedido ao `authenticated`.
- A RLS da F6 consulta a sessão fictícia F5, exige estado `handoff_f6` e herda o isolamento da F5. Suspensão do prestador revoga acesso dele sem ocultar do cliente seu caso de suporte.
- `tests/f6-backend-rls-mock.sql` com fixtures de **dois clientes diferentes, prestador escolhido e terceiro**, testes de gate `false`, sem contexto, revogação do handoff, confirmação incompleta, confirmação fora da janela, tentativa de reatribuição de cliente, mensagens em etapas indevidas, suspensão e rollback.
- `.github/workflows/f6-backend-rls-mock.yml` com `postgres:17`, `ON_ERROR_STOP=1` e regressões dos módulos Node da F5/F6.

## Limites da demonstração

**O banco fictício não é servidor financeiro.** O `mock_paid` da F5 não é confirmação de PSP; `completed` é somente fixture. Nenhum dinheiro, atendimento, nota pública, push, SMS, GPS, pagamento, chat ou comprovante verdadeiro foi criado. **Não há interface real conectada nem migração aplicada.** O sistema real não deverá fazer updates diretamente do navegador.

A implementação futura exigirá:
1. Prova de backup e restauração PostgreSQL/Auth/Storage do único Supabase; revisão adversarial das funções `SECURITY DEFINER` legadas, sem mudanças remotas prematuras.
2. F2/F3/F4 integradas e homologadas, com PSP real assinado e reconciliado e modelo de estados financeiro revisto; não confiar em browser ou mocks.
3. Migration F6 real criada pela CLI na versão instalada, após conciliação do schema atual; funções transacionais para `submit_summary`, `confirm_customer`, `confirm_provider`, `open_dispute`, `rate_provider` e auditoria, sempre com `auth.uid()` e verificação integral de autorização no servidor.
4. Testar clock de servidor e corrida de duas confirmações simultâneas, entrega/visualização de resumo, bloqueio por cancelamento/reversão/chargeback, prestador suspenso, orçamento substituído, prazo expirado, avaliação duplicada, idempotência e tratamento humano.
5. Política real de suporte, moderação de avaliação e fotos com Storage privado, URLs de validade mínima, LGPD e retenção, acessibilidade e notificações comprovadas.
6. Testes E2E no Supabase autenticado e Android real, com autorização específica de homologação; não simular PASS por sucesso de CI local.

**Aviso:** a modelagem atual permite estados fictícios por fixtures administrativas para provar RLS, e não dispõe de API transacional segura que permita operação real. Nunca habilitar por flag, nem usar SQL candidato como migration.

## Instrução de continuidade

Executar CI em branch. Se falhar, manter PR Draft, corrigir e repetir até PASS. Registrar o commit/URL de run. Preparar depois a matriz F7 de preflight real, sem contratar serviço e sem publicar. Não executar ativação, pagamento ou webhook de produção.
