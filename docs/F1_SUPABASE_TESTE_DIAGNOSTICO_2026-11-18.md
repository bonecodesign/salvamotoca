# SM-AUD-001 — diagnóstico real de leitura do Supabase de TESTES

**Execução:** 18/11/2026, America/Sao_Paulo (alguns avisos têm marcação UTC de 19/11)  
**Projeto exclusivo:** Salva Motoca!, `yivkqyjdeouxnwtwfekc`  
**Classificação:** ambiente remoto de **TESTES/HOMOLOGAÇÃO**, não produção comercial, por SM-DEC-054.  
**Método:** conexão autorizada Supabase, exclusivamente ferramentas de **leitura** (informações de projeto, tabelas, migrações, lints e consultas SQL de metadados/contagens).  
**Autorização de mudança de estado:** NENHUMA. Nenhuma migration, insert, delete, update, trigger, chamado, conta, pagamento, push, deploy ou configuração alterada neste diagnóstico.  
**Situação de release:** `G1=BLOCKED; RELEASE=NO_GO`.

## 1. Inventário confirmado por ferramenta

| Item observado | Resultado | Interpretação |
| --- | --- | --- |
| Status e região | `ACTIVE_HEALTHY`; `sa-east-1` | Ambiente de testes acessível no Brasil |
| Organização / plano | `Salva Motoca!`; `free` | Sem nova assinatura ou upgrade |
| Banco | PostgreSQL `17.11.0.019` / SQL reporta `17.11` | Compatibilizar ferramentas de dump/restauração |
| Migrações registradas | 11; última `20261114020317_f1_solicitacao_dados_foto_privada` | F1 já tem schema hospedado; **não reaplicar migration** |
| `auth.users` | 0 | Nenhum usuário de Auth neste instante |
| `public.service_requests`, `public.providers`, `public.service_quotes` | 0 cada | Sem pedidos/prestadores/orçamentos cadastrados de operação |
| `public.payment_records`, `public.request_messages` | 0 cada | Sem pagamentos/mensagens de pedido |
| `public.prestadores_prospeccao` | 36 | **Dados pré-existentes, preservar** |
| `public.ofertas_prospeccao` | 40 | **Dados pré-existentes, preservar** |
| `public.configuracao_comercial` | 1 | **Dados pré-existentes, preservar** |
| `storage.objects` | 0 | Nenhum arquivo registrado no Storage neste momento |
| Bucket `request-photos` | privado, máximo 5.242.880 bytes (5 MiB), só `image/jpeg` | Restrição de bucket confirmada no catálogo, **não é E2E de upload** |
| Edge Functions | nenhuma implantada | Não há endpoints Edge deste projeto observados |
| Tabelas de aplicação no schema `public` | 13 com RLS habilitada | **Não prova ausência de IDOR** ou boa política sem testes autenticados |
| Políticas de RLS `public` | 17 | Inventário de política, sem testes adversariais reais |
| Políticas de `storage.objects` | 3 | Não prova acesso seguro ao arquivo físico sem JWT real |

Dados são contagens pontuais; resultados podem variar depois. Não há fotos, números de telefone, credenciais, tokens, dumps ou detalhes pessoais neste relatório.

## 2. Advisories oficiais inspecionados

### Segurança — 6 WARN, 4 INFO

- **Seis RPCs `SECURITY DEFINER` acessíveis ao papel `authenticated`**, sinalizadas por Supabase: `bj_answer_quote`, `bj_finish_request`, `bj_get_request_location`, `bj_ping_presence`, `bj_set_presence`, `bj_submit_quote`.
- Na inspeção das definições SQL, **todas** referenciam `auth.uid()`, estabelecem `search_path = ''`, concedem execução a `authenticated` e **não** concedem execução a `anon`. As verificações explícitas de titularidade, estado e pagamento variam por função. São **controles positivos estáticos**, não certificado de proteção contra burla; uma RPC de elevadas permissões exige avaliação e teste de propriedade com dois tokens reais antes de homologar F1.
- **Quatro tabelas com RLS ligado e nenhuma política**: `bj_request_attempts`, `configuracao_comercial`, `ofertas_prospeccao`, `prestadores_prospeccao`. O advisor classifica como INFO; podem representar acesso intencionalmente fechado aos usuários, sujeito à inspeção de `GRANT` e dos fluxos administrativos antes de qualquer mudança.
- Remediação de referência: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable e https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy .

### Desempenho — 2 WARN, 7 INFO

- Duas situações de políticas permissivas múltiplas para leitura por `authenticated` em `bj_provider_presence` e `provider_services`. É **alerta de desempenho**, revisar se a composição é necessária sem enfraquecer os controles de dados.
- Uma chave estrangeira sem índice de apoio: `bj_request_attempts_provider_id_fkey` em `public.bj_request_attempts`. Avaliar um índice após G1 e análise de volume/custo, **não criar agora**.
- Seis índices não utilizados foram listados. Com praticamente nenhum atendimento real, **não remover por estatística de baixo uso**. Eles provavelmente serão necessários para a carga de operação.
- Avisos oficiais: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies e https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys .

### Saúde

- O advisor de saúde retornou **nenhuma ocorrência** nesta consulta. O status `ACTIVE_HEALTHY` é observado na API de projetos; nenhum teste de carga ou disponibilidade contínua foi executado.

## 3. Backup/restauração G1 — ainda não comprovados

O plano da organização é **Free**. A documentação atual da Supabase informa que backups diários automáticos de plataforma são feitos para **Pro/Team/Enterprise** e recomenda que projetos Free exportem seus dados periodicamente com `supabase db dump`. **Não foi feito backup, nem restauração, nem obtido arquivo de exportação nesta etapa.**

Antes de **qualquer gravação hospedada** (incluindo cadastro de usuários sintéticos, alteração de RLS, Edge Functions, storage/upload, tabela mock e migrations), o roteiro F1 já aprovado exige **exportação PRIVADA e restauração em ambiente descartável** com prova fiel dos limites de DB, Auth e Storage. Não basta conferir tabelas ou instalar PostgreSQL portátil. **Nunca guardar backup, senha ou credenciais no repositório.**

Pontos de conferência do G1:
1. Confirmar versão instalada e opções de `supabase --help`, `supabase db --help`, `supabase db dump --help` (**CLI v3 sofreu mudança incompatível em 04/11/2026**; não confiar em flags de comandos antigos sem validar). Usar conexão segura do **mesmo projeto**, sem colar secrets em arquivos versionados.
2. Exportar roles, esquema e dados com ferramentas Supabase adequadas à versão, preservando informação de migrações, RLS, funções, `auth.users` e metadados `storage.*` quando aplicável. Verificar o que o dump **não** inclui. Dados existentes de prospecção e configuração não podem ser perdidos.
3. Separar **dados/objetos físicos do Storage** dos metadados da base — backups de Postgres **não incluem bytes dos objetos**. No momento a consulta mostra 0 objetos, mas conferir novamente na hora de exportar.
4. Restaurar **fora da plataforma hospedada**, num banco temporário com versão compatível. Comparar schemas, contagens, funções, grants/RLS, migrações, Auth e Storage; registrar precisamente quais componentes não foram restaurados ou não se aplicam.
5. Somente após prova suficiente revisar quais testes hospedados (Auth A/B/C, RLS entre contas, fotos, ingressos de incidentes) podem ser executados de modo restrito, sem cobranças ou notificações. Autorizar mudanças de forma explícita antes de executar.
6. Marcar `G1=PASS` **somente quando a restauração executada, conferida e evidenciada acontecer**. Não alterar gates de lançamento ou `f1TestRequestsEnabled` sem decisão posterior do fundador.

Fontes oficiais consultadas em 18/11/2026:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/self-hosting/restore-from-platform
- https://supabase.com/changelog/supabase-cli-v3

## 4. Próximo pacote técnico recomendado

**Prioridade P0: capacidade de recuperação G1.** Preparar/exportar backup privado e comprovar a restauração. Enquanto o dispositivo não estiver disponível, continuar com segurança estática e documentação sem alegar que G1 passou.

**P1: autorização real** das seis `SECURITY DEFINER` existentes, verificando dono e não dono de solicitação, prestador homologado/sem homologação, pedido sem pagamento e pedido com pagamento somente **fictício e isolado** (backup primeiro), incluindo logs, revogação e comportamento em duas sessões de verdade. Não aceitar somente `SET request.jwt.claim.sub` de PostgreSQL da CI como prova de Auth real do gateway.

**P2: integração eventual** dos PRs Draft de incidente F23, somente após revisão de RLS/PSP e acesso histórico A→B→A. Não aplicar SQL de `supabase/drafts/` automaticamente: hoje são candidatos de simulação.

**Execução deste diagnóstico:** nenhuma alteração remota. Está documentado como **verificação de leitura efetivamente realizada**, e não homologação final.

## 5. Artefato para revalidar sem custo

O script `scripts/f1-staging-readonly-audit.sql` contém **somente `SELECT`**, não exibe linhas de pessoas ou dados de negócios: retorna contagens de tabelas, bucket, RLS e RPCs por metadados. **Foi executado e aprovado por consulta real no Supabase de testes nesta data**, sem atualizar registros. O script **não** testa backup/restauração, acesso com JWT real, funcionamento Android ou transações.
