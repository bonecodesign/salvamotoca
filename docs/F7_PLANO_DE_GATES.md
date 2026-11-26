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


## Consolidação de evidências — PRs #160–165 (25/11/2026 BRT)

| PR integrado | Prova local | Limitação |
|---|---|---|
| [#160](https://github.com/bonecodesign/salvamotoca/pull/160) | Ensaio atômico dos 15 candidatos, duas falhas injetadas e retorno ao catálogo de referência | Não demonstra recuperação após commit hospedado |
| [#161](https://github.com/bonecodesign/salvamotoca/pull/161) | Resposta perdida após gravação, reenvio do mesmo evento, uma mensagem, reconexão e viewport 320px | Não é teste de aparelho físico |
| [#162](https://github.com/bonecodesign/salvamotoca/pull/162) | Recibo mínimo após recarga, isolamento do autor e nenhum conteúdo armazenado | Não recupera identificador perdido |
| [#163](https://github.com/bonecodesign/salvamotoca/pull/163) | Logout nativo local, revogação da sessão, cookie/JWT antigos negados, novo login e CSRF negado ([CI](https://github.com/bonecodesign/salvamotoca/actions/runs/45725831431)) | Não homologa Auth hospedado |
| [#164](https://github.com/bonecodesign/salvamotoca/pull/164) | Recibo por ID conhecido após novo login, isolamento do autor e nenhuma repetição automática ([CI](https://github.com/bonecodesign/salvamotoca/actions/runs/45726075779)) | Não implementa descoberta de IDs ou fila durável |
| [#165](https://github.com/bonecodesign/salvamotoca/pull/165) | Aviso antes da saída, cancelamento preservando recibo, confirmação explícita e revogação; [Native](https://github.com/bonecodesign/salvamotoca/actions/runs/45726334299) e [replay](https://github.com/bonecodesign/salvamotoca/actions/runs/45726334239) aprovados | Não é interface de produção ou autorização de lançamento |

O último Native registrou 89 verificações HTTP, Auth/Storage/REST locais aprovados, nenhuma escrita hospedada e nenhum pagamento real. Não somar verificações repetidas entre runs como se fossem testes distintos. G2, G3, G5 e G6 ganharam provas locais; nenhum gate remoto foi promovido. 

### Próximo caminho crítico (sem repetir o histórico G1)

- Reutilizar o aceite real histórico G1 (#123): arquivo cifrado em dois destinos privados e restauração independente comprovada. Para a próxima intervenção hospedada, verificar primeiro o snapshot recente, escopo e cobertura atuais; não copiar dados ou chaves para CI pública. Se houver diferença ou novo dado, exigir procedimento de backup adequado e prova de recuperação correspondente. A confirmação manual e os controles de ambiente existentes permanecem obrigatórios.
- G2: aproveitar o roteiro de homologação privada F1 já reforçado no #142. Somente após G1 atual e autorização específica, validar usuários fictícios, bytes, expiração e limpeza com as garantias do roteiro. Não criar outro projeto.
- Em paralelo, revisar as evidências e critérios pendentes de G4 (sandbox financeiro dedicado, sem live), Android físico e governança G7. Não confundir mais testes de fixture com conclusão desses bloqueios.
- A proteção de rotas antigas (#158) e o ensaio atômico (#160) permanecem candidatos/ensaios; não implantar nem habilitar gates automaticamente.

**Decisão:** RELEASE=NO_GO. Esta atualização documental registra provas já realizadas e prioriza o caminho crítico; não executa backup novo, não grava no Supabase hospedado nem cria serviços.


## G1 — conferência atual de cobertura (25/11/2026 BRT)

Leitura direta autorizada no Supabase de TESTES em 26/11/2026 00:14:29 UTC (25/11, BRT): projeto ACTIVE_HEALTHY, PostgreSQL 17; 11 migrations, 13 tabelas públicas e zero sem RLS; zero usuários Auth, sessões e objetos Storage; três policies Storage, zero buckets públicos. Contagens operacionais: zero solicitações, prestadores aprovados, orçamentos e pagamentos; 36 registros de prospecção, 40 ofertas de prospecção e uma configuração comercial. As contagens coincidem com as referências conhecidas, mas não provam igualdade do conteúdo nem snapshot consistente.

Listagem completa do cofre Dropbox privado correto confirma a presença do ciphertext histórico de 22/11 (run #45074685352); nenhum ciphertext mais recente foi encontrado nessa pasta. A identidade privada de recuperação continua no mesmo cofre: separar custódia somente após assegurar cópia independente e validar a recuperação, sem apagar o único exemplar. Nesta conferência não houve leitura da chave, download, upload, movimentação ou exclusão de arquivos.

**Estado:** G1 histórico permanece comprovado (#123). G1 atual = PENDENTE de novo snapshot cifrado, verificação independente e recuperação correspondente. As verificações de hoje são somente leitura. Não reutilizar contagens como prova de integridade; não repetir o restore histórico apenas por falta de registro. O workflow existente continua manual e protegido por confirmação explícita; não criar gatilho alternativo nem burlar o Environment. Sem alteração do Supabase hospedado. RELEASE=NO_GO.


## Android e G7 — atualização de preparação (25/11/2026 BRT)

- #168–170 integrados: cache público restrito, startup sem fallback fictício e prova em Chrome real com viewport móvel, origem loopback interrompida e resposta privada não armazenada ([CI #170](https://github.com/bonecodesign/salvamotoca/actions/runs/45730958452)). Android físico, notificações, câmera e GPS no aparelho continuam pendentes.
- Minutas JUR-01, JUR-02 e JUR-03 v0.2 alinhadas com as decisões internas vigentes (10% + 10% somente sobre serviço com materiais inclusos, deslocamento separado, processamento cliente, reboque, praça inicial, chat pós-pagamento, confirmação bilateral, privacidade e suporte). Não houve revisão jurídica externa nem entrada em vigor.
- Para G7, continuam obrigatórios: identificação do operador/CNPJ, enquadramento fiscal e contratual, regras de cancelamento/estorno revisadas, bases legais e retenção por categoria, direitos dos titulares, identificação de fornecedores/transferências, canal oficial e plantão comprovado. Não presumir cadastro empresarial, contrato com PSP ou conformidade LGPD pela existência das minutas. RELEASE=NO_GO.

## Referência executiva de implantação

O [roadmap FND-07](fundacao/07_PLANO_DE_IMPLANTACAO.md) v0.2 consolida as dependências humanas e os critérios de aceite em seis passos. README, FND-04 e FND-05 foram reconciliados com SM-DEC-045–054. O modelo econômico usa serviço com materiais inclusos, taxa individual de 10%, deslocamento fora da base e processamento separado; não estabelece receita realizada ou disponibilidade financeira. A área aprovada não autoriza ampliar automaticamente um piloto. Nenhuma promoção de gate ou mudança de flags. RELEASE=NO_GO.

## Fonte de produto e política de cancelamento

A especificação PRODUTO_OFICIAL, o plano FND-02 e a minuta JUR-04 foram reconciliados com as decisões registradas SM-DEC-035 e 045–050: política 10% + 10%, materiais inclusos, área e raios aprovados, destino externo condicionado de reboque, cancelamento e mediação. Os limites históricos do piloto SM-DEC-029 não são ampliados automaticamente. A correção documental não homologa PSP, contrato, segurança hospedada nem autoriza operação. RELEASE=NO_GO.


## Encerramento da rodada técnica local — 26/11/2026 BRT

- #176–178 integrados: proteção de callbacks de GPS, presença durante perda de conexão e confirmação de pedidos mesmo se a leitura posterior falhar. CI F1–F3 aprovada.
- #179 integrado: recibo local mínimo para recuperação de criação incerta no mesmo dispositivo; sem reenvio automático. Limites: perda do armazenamento local, troca de aparelho, concorrência de abas e resultado inconclusivo.
- #180 integrado: consulta de pedidos próprios em aberto antes de iniciar outro em dispositivo diferente; confirmação explícita, sem proibir pedidos distintos. Não é exclusão transacional.
- #181 integrado: duas conexões PostgreSQL 17 concorrentes para a mesma chave de reboque retornam o mesmo ID, com um pedido e um destino preservados; dados divergentes rejeitados. [F3](https://github.com/bonecodesign/salvamotoca/actions/runs/45884391770), [suporte](https://github.com/bonecodesign/salvamotoca/actions/runs/45884391778), [replay](https://github.com/bonecodesign/salvamotoca/actions/runs/45884391694) e [Native Auth/Storage/REST](https://github.com/bonecodesign/salvamotoca/actions/runs/45884391935) aprovados. Nenhum candidato novo foi implantado remotamente.
- G1: [última tentativa manual](https://github.com/bonecodesign/salvamotoca/actions/runs/45733283616) falhou na conferência do cofre Dropbox antes de conectar ao PostgreSQL; autenticação do banco não verificada nessa execução. #174 e #175 prepararam renovação OAuth e opção local de backup. Listagem privada em 26/11 confirma somente o ciphertext histórico de 22/11. A conexão Dropbox do ChatGPT não renova o segredo do runner.
- **Próxima ação humana indispensável:** configurar autorização renovável no ambiente protegido `g1-backup-testes` com [script local](../scripts/g1-dropbox-oauth-configure-local.ps1), sem transmitir credenciais ao chat; depois executar [workflow manual](https://github.com/bonecodesign/salvamotoca/actions/workflows/g1-supabase-backup-manual.yml) da main com confirmação prevista, verificar o novo ciphertext e comprovar a restauração correspondente. Não repetir tentativa antiga nem burlar o Environment.
- SM-DEC-029 conferida: limites históricos de até 15 prestadores, 50 motociclistas convidados e 30 solicitações, meta interna de 80% em até 15 minutos e ausência de incidente crítico sem tratamento. Não ampliar a área do piloto automaticamente pela decisão posterior da praça. Nenhuma nova aprovação foi presumida.

**Decisão: RELEASE=NO_GO.** As seis flags públicas permanecem false. Priorizar os seis passos de FND-07; interromper ciclos de melhorias locais sem requisito crítico novo. G1 atual, G2 hospedado, Android físico, PSP sandbox exclusivo e aprovações humanas seguem pendentes.


## Auditoria de continuidade após PR #182 — 26/11/2026 BRT

Leitura remota e sem gravações no único Supabase de TESTES yivkqyjdeouxnwtwfekc: projeto ACTIVE_HEALTHY, região São Paulo, PostgreSQL 17.11, 11 migrations. O retrato agregado confirmou auth.users=0, sessões=0, objetos Storage=0, solicitações=0, prestadores aprovados=0, orçamentos=0, pagamentos=0, 36 registros de prospecção e 40 ofertas de prospecção. As 13 tabelas públicas estão com RLS habilitado.

O advisor de segurança continua a registrar quatro tabelas com RLS sem policy (INFO, acesso fechado por padrão) e seis RPCs legadas SECURITY DEFINER executáveis por authenticated (WARN). O ensaio reversível #158 permanece apenas local; não foi aplicado no Supabase hospedado. Esses achados exigem revisão no gate G2, mas não justificam mudança remota sem o backup G1 atual.

A autorização renovável preparada no #174 ainda não está comprovada no Environment protegido g1-backup-testes; a última execução manual falhou no cofre Dropbox antes de qualquer conexão ao PostgreSQL. Não houve novo snapshot, upload, restauração ou alteração do Supabase nesta auditoria. A configuração requer o secret G1_DROPBOX_OAUTH_JSON criado privadamente a partir do aplicativo Dropbox existente, seguido do workflow manual protegido e de verificação independente do ciphertext.

A conta Stripe conectada é não-live, mas a auditoria não criou sandbox, conta, chave, cobrança, transferência ou webhook. O sandbox dedicado continua necessário para G4; o test mode compartilhado não deve ser reaproveitado. Os PRs antigos F4 #45 e #47 permanecem históricos/draft e usam regras econômicas supersedidas; não devem ser mesclados. A referência financeira vigente é a cadeia posterior já integrada, com F4 desativada.

**Resultado:** G1 atual, G2 hospedado e G4 sandbox dedicado permanecem BLOCKED; nenhuma evidência local foi promovida a gate remoto. RELEASE=NO_GO.
