# F1 — recuperação: diagnóstico, ensaio local e prova real pendente

**Salva Motoca! · atualização em 15/11/2026**  
**Projeto ÚNICO:** `yivkqyjdeouxnwtwfekc` (Belo Horizonte não representa região técnica; região hospedada `sa-east-1`).  
**Status:** `BACKUP_RESTORE_REAL=BLOCKED` · `F1_RELEASE=NO_GO`. Nenhum dado remoto foi alterado neste trabalho.

## O que foi verificado com o conector, somente leitura

- Projeto Supabase `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.019`.
- Contagens neste instante: `auth.users=0`, `public.service_requests=0`, `storage.objects` no bucket `request-photos=0`; bucket existente = 1.
- Não há Edge Functions implantadas.
- Segurança: **6 avisos** para RPCs `SECURITY DEFINER` executáveis por usuários autenticados: `bj_answer_quote`, `bj_finish_request`, `bj_get_request_location`, `bj_ping_presence`, `bj_set_presence` e `bj_submit_quote`. Não revogar indiscriminadamente porque as RPCs são parte do piloto; revisar autoria/ownership, bloqueios financeiros, grants e testar A/B/C antes de ativar. Quatro tabelas também têm RLS sem política (INFO), exigindo interpretação, não liberação automática.
- Essas contagens **podem mudar**; conferir imediatamente antes de qualquer plano de restauração ou homologação. Banco sem linhas de negócio NÃO prova backup recuperável.

## Constatação importante: Free e Storage

Documentação oficial revisada em 15/11/2026:
- https://supabase.com/docs/guides/platform/backups — no plano Free, a orientação é exportação regular com `supabase db dump` e cópias fora do serviço; backups diários fornecidos pela plataforma são descritos para Pro/Team/Enterprise.
- https://supabase.com/changelog/supabase-cli-v3 — desde 04/11/2026, a CLI v3 usa **local por padrão**; operações remotas exigem `--remote`. Verificar `supabase --version` e `supabase db dump --help` antes de escolher parâmetros. Não copiar comandos v2 mecanicamente para v3.
- https://supabase.com/docs/reference/cli/supabase-db-dump — confirmar opções da versão efetivamente instalada.
- **Dump Postgres não salva bytes dos arquivos no Storage.** Ele pode conter metadados, mas é necessário procedimento separado para arquivos, buckets, políticas, autenticação e parâmetros de provedores. Não publicar senhas nem dumps.

## Ensaio realmente entregue aqui (reproduzível, sem serviços reais)

A workflow `.github/workflows/f1-recovery-drill.yml` cria **duas bases PostgreSQL 17 descartáveis no runner do GitHub**, sem conexão nem credenciais do projeto Supabase:
1. Cria fixture exclusivamente inventada de Auth, tabelas, bucket, metadados de fotos, RLS, política e grants (`tests/f1-recovery-fixture.sql`).
2. Executa `pg_dump` da fixture com cliente PG17 e verifica arquivo via SHA-256.
3. Restaura o dump em **outra base descartável** e verifica esquema, linhas, ACL, RLS e acesso do titular versus terceiro com `tests/f1-recovery-assert.sql`.
4. Simula a cópia de bytes de um arquivo fake separado do dump, testa SHA-256 e `cmp`. **Não é um teste da Storage API nem uma cópia de um objeto remoto.**
5. Exibe explicitamente `HOSTED_SUPABASE_BACKUP=NOT_PERFORMED`, `HOSTED_SUPABASE_RESTORE=NOT_PERFORMED` e `F1_RELEASE=NO_GO`.
6. Nenhum artefato do ensaio contém dados do usuário; **não anexar em GitHub Actions** dumps ou arquivos de bancos reais.

**Critério do ensaio:** provar que o processo técnico de dump/restore funciona *na fixture local*. Isso é `LOCAL_FIXTURE_PASS`, não `REMOTE_BACKUP_PASS`, mesmo com CI verde.

## O que falta para comprovar o backup real, sem gastar ou criar projeto

A próxima execução precisa de um ambiente privado de operação sob controle do responsável, com ferramenta CLI e Postgres/Docker local, espaço para exportação e URL de conexão obtida somente no Dashboard. O conector deste chat permite ler metadados e SQL, **mas não oferece cópia binária, senha de banco ou restauração de dump local**. Não se deve improvisar dump exportando linhas via ChatGPT, mensagens ou GitHub.

1. Abrir o projeto existente em uma sessão privada. Conferir plano, quotas e escopo do backup atual; não habilitar PITR ou upgrade.
2. Descobrir a versão da CLI com `supabase --version`, as opções com `supabase db dump --help`, e a região/alvo escolhido. Na CLI v3, o destino remoto precisa ser **explícito** e deve ser confirmado na versão realmente instalada.
3. Em diretório privado criptografado, exportar **schema, roles e dados** em arquivos separados, na medida suportada pela CLI, e registrar hashes SHA-256, tamanhos e horário UTC. Se necessário, complementar `pg_dump` compatível em modo somente leitura, com mínimo privilégio. Conferir cobertura explícita de `auth`, `storage`, extensões, grants e eventuais exclusões gerenciadas.
4. Backup **independente** dos objetos Storage em bytes via recurso autorizado de Storage (respeitar políticas, sem usar SELECT SQL como se fornecesse os bytes). Neste instante a leitura mostrou zero objetos no bucket do projeto; verificar novamente no momento da cópia e registrar ausência real sem criar JPEG. Documentar também configurações de Auth, URLs/limites do bucket, funções e migrações.
5. Restaurar apenas em banco **local descartável**, offline ou sem acesso externo de escrita, com credenciais fictícias e sem notificações. Conferir contagens, schemas, funções, checks, índices, triggers, RLS e autorização de roles. Não restaurar sobre o Supabase hospedado.
6. Guardar logs e evidências privadas de restauração, hashes, escopo incluído/excluído e revisão humana. Não anexar comprovantes sensíveis nem arquivos ao PR. Relatório público registra apenas `PASS/BLOCKED/FAIL` e uma referência **sem informações privadas**.
7. Só classificar `BACKUP_RESTORE_REAL=PASS` após verificação efetiva da restauração **e da abrangência**. Se Auth/Storage/configurações foram excluídos, declarar explicitamente recuperação parcial e manter gate bloqueado.

## Porta de segurança para o próximo passo

Conservar `f1TestRequestsEnabled=false`. Enquanto G1 não está comprovado:
- não criar contas A/C nem subir JPEG no Supabase hospedado;
- não rodar `scripts/f1-work-storage-e2e.mjs --run`;
- não aplicar SQL candidatos F2–F6 nem habilitar automações;
- não tratar GitHub Actions como teste remoto E2E;
- seguir apenas com testes offline, inspeção somente leitura e documentos para revisão.

**Registro de execução:** Ensaio com PostgreSQL local pode receber PASS após CI. **Backup real e restauração real permanecem BLOCKED** até o operador executar a cópia privada e apresentar evidência segura. Este documento não é um atestado de recuperação do projeto.
