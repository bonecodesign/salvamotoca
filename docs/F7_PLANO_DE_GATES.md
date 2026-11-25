# Salva Motoca! — F7: matriz de preflight, homologação e decisão GO/NO-GO

**Data-base:** 24/11/2026. Atualização após PRs #123–140. **Objetivo:** deixar as verificações de pré-lançamento organizadas até o limite seguro sem ativar serviços reais, publicar app, cadastrar prestadores ou pagar terceiros.

**Estado documentado e não presumido:** `NO-GO` para piloto ou produção. As F1–F7 estão integradas à `main` em PRs independentes e continuam desativadas. A homologação remota permanece pendente. Linhas históricas que usam comissão de 15% não são referência e não devem ser integradas. O único projeto Supabase aprovado permanece o existente; não criar outro projeto ou alterar plano.

## Sequência obrigatória de gates

| Gate | Prova exigida | Estado nesta rodada | Restrições |
|---|---|---|---|
| G0 — Segurança estática | Todas as flags F1–F6 desligadas, testes Node/Chrome/PG locais aprovados | PASS estático em CI; não é licença de operação | Sem rede ou segredos |
| G1 — Backup e restauração | Dump privado e restauração real PostgreSQL; escopo Auth e **bytes** Storage; hash e relatório do que foi/ não foi restaurado | **PASS HISTÓRICO TESTES (#123); escopo futuro pendente** | Exigir backup recente e escopo conferido antes de gravações remotas |
| G2 — F1 Auth/Storage/RPC | Usuários fictícios legítimos A/B/C, foto JPEG mínima, isolamento por usuário, URLs assinadas curtas, limpeza Storage API, verificação das 6 RPCs SECURITY DEFINER | **PARCIAL: Native local 29/29 (#124), HTTP hospedado somente leitura 4/4 (#126)** | Sessões Auth/Storage hospedadas e dispositivo físico pendentes; autorização específica |
| G3 — F2/F3 | Códigos offline integrados e testados; ainda faltam migrations reais confrontadas com schema, RLS remoto, concorrência, homologação de equipamento e notificações | **BLOQUEADO** | Sem despachar prestador real |
| G4 — F4 financeira | Modelo offline 10% + 10% integrado; ainda faltam política jurídico/financeira, PSP/Connect viáveis no Brasil, webhook oficial, reconciliação, estornos e dupla confirmação real | **BLOQUEADO** | Stripe não é escrow; não criar contas, cobranças ou transferências |
| G5 — F5 | Simulação offline integrada; ainda faltam chat/privacidade em RLS real, pagamento validado em servidor, GPS consentido, notificações e teste Android | **BLOQUEADO** | Códigos mock não autorizam operações reais |
| G6 — F6 | Simulação offline integrada; ainda faltam confirmação real em 5min, disputas humanas, avaliação, auditoria e nenhuma liberação financeira sem condições reais | **BLOQUEADO** | Silêncio não significa aceite |
| G7 — Governança | Termos, privacidade LGPD, impostos/consumo/trabalhista, moderação, suporte, plano de incidentes, limites/cotas e aprovação humana documentada | **BLOQUEADO** | Revisão profissional quando aplicável |
| G8 — Piloto assistido | Aceite expresso do responsável, janela geográfica e usuários participantes controlados, monitoramento, plano reversível e responsáveis de suporte | **BLOQUEADO** | Não lançar sem nova autorização |

Os estados acima são **conservadores**: não foram automaticamente promovidos pelos testes locais. A prova histórica G1 não substitui backup atual ou escopo de produção. O controle de gate real ficará em procedimento de aprovação humana próprio. O script F7 é **puramente local e somente leitura**.

## Evidências consolidadas (não são autorização de lançamento)

| Área | Evidência | Escopo ainda não comprovado |
|---|---|---|
| G1 | [Aceite histórico](G1_ACEITE_BACKUP_TESTES_2026-11-23.md), #123 integrado | Novo snapshot, bytes de objetos quando existirem, configurações gerenciadas e segredos |
| G2 | [Native HTTP](F1_NATIVE_HTTP_EVIDENCIA_2026-11-24.md) e [HTTP hospedado somente leitura](F1_HOSTED_READONLY_EVIDENCIA_2026-11-24.md) | Sessões legítimas A/B/C no ambiente hospedado, limpeza e Android |
| G3–G6 | #127–137: regras, SQL candidatos descartáveis e cinco jornadas integradas | Migrations reais, servidor autenticado, PSP sandbox, notificações e GPS físico |
| G7 | #138: painel sintético somente leitura; 54 testes | Autenticação e auditoria administrativa reais, escala humana e revisão legal |
| Capacidade | [Resultados #139–140](F7_HOMOLOGACAO_CAPACIDADE_OFFLINE.md): 400 HTTP locais e 400 pedidos PG17, 24 conexões, recuperação 4/4 | Capacidade hospedada, reserva de prestadores entre pedidos, rede móvel |

Status global: RELEASE=NO_GO. O preflight não revalida provas históricas apenas pela existência dos documentos.

## Evidências e tratamento de dados

Cada gate só pode ser considerado `PASS` após um registro de **qual prova ocorreu de fato**, horário UTC, ambiente, escopo, resultado, referência a relatório privado quando necessário, responsável e riscos residuais. Nunca anexar ao GitHub tokens, senhas, URLs assinadas, PII, dumps, documentos de prestadores ou fotos pessoais. Os resultados públicos podem citar PR, commit, URL da CI e resumo **sem conteúdo sensível**. A ausência de acesso à sessão real deve ser registrada como `BLOCKED`, não como `PASS`.

**O banco vazio não prova backup**; SQL testado em PostgreSQL descartável não substitui verificação com Auth/Storage hospedados e Android real. Arquivos de documentação não provam aprovação jurídica/financeira.

## Roteiro operacional seguro e ordenado

1. Atualizar um retrato do GitHub: branches, PRs, testes e flags (somente leitura). Não misturar #47 à F4 #45 por merge automático.
2. Executar `node scripts/f7-preflight-offline.mjs` na branch de F7: exigir `PASS_STATIC_GUARDS_ONLY`, mas **sempre `decision=NO_GO`** e lista de provas reais ainda não verificadas.
3. Executar `node --test tests/f7-preflight.test.mjs` e regressões F5/F6. CI precisa permanecer sem chaves e sem ligações a projetos remotos.
4. Reutilizar o aceite histórico G1 já integrado (#123), sem repetir por ausência de registro. Para futura escrita hospedada, exigir escopo de recuperação atual e backup recente em ambiente privado. Se faltar, **interromper e registrar BLOCKED**.
5. Após G1, homologar Auth/Storage/RPC F1 em sessão segura, com contas fictícias e garantias de nenhum despacho/notificação, usando aprovações específicas.
6. F2→F6 já estão integradas como módulos offline. Antes de operação, criar migrations reais via CLI consultada, sem reaproveitar arquivos `*_mock_candidate.sql`, e manter gates server-side desligados.
7. Homologar meios de pagamento e encargos em sandbox apenas com autorização; nunca fazer cobrança live por impulso.
8. Homologar Android, notificações, avaliações, suporte, retentativas, acessibilidade e contingência.
9. Encaminhar pacote de evidências a revisão humana/jurídica/financeira. Somente após todos os gates considerar uma nova decisão de início do piloto assistido.

## Regras para automatizações e registros

- `scripts/f7-preflight-offline.mjs` não tem acesso à rede, credenciais nem Supabase. Confere presença de arquivos e uma configuração literal estrita com seis flags false, sem interpretar comentários como código nem executar JavaScript. **Isso é teste de repositório, não validação de infraestrutura.**
- O programa devolve `NO_GO` de forma deliberada, mesmo com todas as verificações estáticas aprovadas, para que CI jamais aprove publicação indevidamente.
- Um arquivo de evidências deve registrar separadamente `LOCAL_PASS`, `REMOTE_PASS`, `BLOCKED`, `FAIL`, `NOT_RUN`. Não usar porcentagem geral como substituto de aprovação por gate.
- Quem habilitar flags, configurar PSP ou executar plano de piloto deverá ter autorização explícita e checagem de ambiente separada deste código.

**Resultado de negócio:** projeto avança até a preparação de lançamento, mas nenhum roteiro ou PR equivale a autorização de publicar. Status geral: **NO-GO**.

## Retrato de compatibilidade — 25/11/2026

#151 e #152 validaram integração F1–F7 e navegador com Auth/Storage nativos em ambiente descartável; #156 acrescentou indicadores de risco Stripe e 89 verificações HTTP, sem PSP externo. #157 validou 52 testes de contrato/preflight financeiro offline. #158 validou congelamento reversível de seis RPCs antigas com 15 políticas restritivas, apenas em PostgreSQL descartável. Nenhuma delas autoriza implantação.

Consulta SQL hospedada somente leitura: 11 migrations, 0 usuários Auth, 0 objetos Storage, 0 solicitações/prestadores/orçamentos/pagamentos, 0 tabelas públicas sem RLS, bucket de fotos privado. O advisor indicou seis RPCs legadas executáveis por authenticated (WARN, não prova de exploração) e quatro tabelas RLS sem políticas (INFO, acesso direto fechado). Não aplicar #158 remotamente sem backup recente, revisão e autorização.

O novo ensaio compara a impressão digital de catálogo de nove tabelas operacionais e sete RPCs com o replay histórico: 70 colunas, 51 constraints, 24 índices, 14 políticas, 7 RPCs. O arquivo de referência contém exclusivamente contagens e hashes MD5 de definições DDL, não dados nem segredos. MD5 serve aqui para detectar diferenças acidentais, não autenticar backup. Diferenças de versão PostgreSQL, formatação de funções ou dependências podem gerar divergência; investigar antes de prosseguir, não alterar a referência para forçar aprovação. Cobertura limitada: não inclui todos os grants, triggers, Auth/Storage, dados, extensões, configurações ou segredos. Retrato pontual, não auditoria remota contínua. Backup atual, Auth/Storage hospedados, sandbox Stripe dedicado, validação jurídica e testes físicos seguem pendentes. RELEASE=NO_GO.
