# Salva Motoca! — F7: matriz de preflight, homologação e decisão GO/NO-GO

**Data-base:** 15/11/2026. **Objetivo:** deixar as verificações de pré-lançamento organizadas até o limite seguro sem ativar serviços reais, publicar app, cadastrar prestadores ou pagar terceiros.

**Estado documentado e não presumido:** `NO-GO` para piloto ou produção. A F1 está integrada à `main`, mas **não homologada remotamente**; PRs F2–F6 seguem em Draft empilhados. O F4 tem outra linha de trabalho nos PRs #46/#47, com conciliação técnica registrada nos respectivos comentários. O único projeto Supabase aprovado permanece o existente; não criar outro projeto ou alterar plano.

## Sequência obrigatória de gates

| Gate | Prova exigida | Estado nesta rodada | Restrições |
|---|---|---|---|
| G0 — Segurança estática | Todas as flags F1–F6 desligadas, testes Node/Chrome/PG locais aprovados | Candidato a PASS somente na CI do preflight; não é licença de operação | Sem rede ou segredos |
| G1 — Backup e restauração | Dump privado e restauração real PostgreSQL; escopo Auth e **bytes** Storage; hash e relatório do que foi/ não foi restaurado | **BLOQUEADO: evidência não comprovada** | Nenhum DDL/conta/upload remoto antes da prova |
| G2 — F1 Auth/Storage/RPC | Usuários fictícios legítimos A/B/C, foto JPEG mínima, isolamento por usuário, URLs assinadas curtas, limpeza Storage API, verificação das 6 RPCs SECURITY DEFINER | **BLOQUEADO** | Sem pedidos reais; somente após G1 |
| G3 — F2/F3 | Integrar PRs revisados; migrations versionadas e confrontadas com o schema real; RLS e concorrência; prestador e equipamento homologados; regras de notificações | **BLOQUEADO** | Sem despachar prestador real |
| G4 — F4 financeira | Política jurídico/financeira, PSP e Connect viáveis no Brasil, taxa exibida e permitida, webhook oficial assinado e reconciliado, estornos, disputa, ledger, disponibilidade e dupla confirmação | **BLOQUEADO** | Stripe não é escrow; não criar contas, cobranças ou transferências |
| G5 — F5 | Chat/privacidade em RLS real; endereço só pós-pagamento validado; GPS consentido e revogável até chegada; notificações e teste Android | **BLOQUEADO** | Códigos mock não autorizam operações reais |
| G6 — F6 | Resumo e foto privada opcional, confirmação de motociclista em 5min após visualização, prestador confirma, disputas humanas, avaliação e auditoria, nenhuma liberação financeira sem condições reais | **BLOQUEADO** | Silêncio não significa aceite |
| G7 — Governança | Termos, privacidade LGPD, impostos/consumo/trabalhista, moderação, suporte, plano de incidentes, limites/cotas e aprovação humana documentada | **BLOQUEADO** | Revisão profissional quando aplicável |
| G8 — Piloto assistido | Aceite expresso do responsável, janela geográfica e usuários participantes controlados, monitoramento, plano reversível e responsáveis de suporte | **BLOQUEADO** | Não lançar sem nova autorização |

Os estados acima são **conservadores**: não foram automaticamente promovidos pelos testes locais. O controle de gate real ficará em procedimento de aprovação humana próprio. O script F7 é **puramente local e somente leitura**.

## Evidências e tratamento de dados

Cada gate só pode ser considerado `PASS` após um registro de **qual prova ocorreu de fato**, horário UTC, ambiente, escopo, resultado, referência a relatório privado quando necessário, responsável e riscos residuais. Nunca anexar ao GitHub tokens, senhas, URLs assinadas, PII, dumps, documentos de prestadores ou fotos pessoais. Os resultados públicos podem citar PR, commit, URL da CI e resumo **sem conteúdo sensível**. A ausência de acesso à sessão real deve ser registrada como `BLOCKED`, não como `PASS`.

**O banco vazio não prova backup**; SQL testado em PostgreSQL descartável não substitui verificação com Auth/Storage hospedados e Android real. Arquivos de documentação não provam aprovação jurídica/financeira.

## Roteiro operacional seguro e ordenado

1. Atualizar um retrato do GitHub: branches, PRs, testes e flags (somente leitura). Não misturar #47 à F4 #45 por merge automático.
2. Executar `node scripts/f7-preflight-offline.mjs` na branch de F7: exigir `PASS_STATIC_GUARDS_ONLY`, mas **sempre `decision=NO_GO`** e lista de provas reais ainda não verificadas.
3. Executar `node --test tests/f7-preflight.test.mjs` e regressões F5/F6. CI precisa permanecer sem chaves e sem ligações a projetos remotos.
4. Cumprir `docs/F1_WORK_EXECUCAO.md` começando por backup/restauração privados. Se falhar, **interromper e registrar BLOCKED**.
5. Após G1, homologar Auth/Storage/RPC F1 em sessão segura, com contas fictícias e garantias de nenhum despacho/notificação, usando aprovações específicas.
6. Revisar e integrar F2→F3→F4→F5→F6 **na ordem**, preferindo PRs pequenos e gates server-side desligados. Criar migrations reais via CLI consultada, não reaproveitar os arquivos `*_mock_candidate.sql`.
7. Homologar meios de pagamento e encargos em sandbox apenas com autorização; nunca fazer cobrança live por impulso.
8. Homologar Android, notificações, avaliações, suporte, retentativas, acessibilidade e contingência.
9. Encaminhar pacote de evidências a revisão humana/jurídica/financeira. Somente após todos os gates considerar uma nova decisão de início do piloto assistido.

## Regras para automatizações e registros

- `scripts/f7-preflight-offline.mjs` não tem acesso à rede, credenciais nem Supabase. Confere presença de arquivos e `false` nas flags publicamente presentes na branch. **Isso é teste de repositório, não validação de infraestrutura.**
- O programa devolve `NO_GO` de forma deliberada, mesmo com todas as verificações estáticas aprovadas, para que CI jamais aprove publicação indevidamente.
- Um arquivo de evidências deve registrar separadamente `LOCAL_PASS`, `REMOTE_PASS`, `BLOCKED`, `FAIL`, `NOT_RUN`. Não usar porcentagem geral como substituto de aprovação por gate.
- Quem habilitar flags, configurar PSP ou executar plano de piloto deverá ter autorização explícita e checagem de ambiente separada deste código.

**Resultado de negócio:** projeto avança até a preparação de lançamento, mas nenhum roteiro ou PR equivale a autorização de publicar. Status geral: **NO-GO**.
