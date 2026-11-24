# Atualização de estado — recuperação real comprovada (23/11/2026 BRT)

**G1_REAL_BACKUP_RESTORE=PASS, pacote histórico de TESTES; RELEASE=NO_GO.** O backup cifrado foi criado, validado e restaurado em Supabase Native independente, com comparação exata de 47 blocos de dados, 9 categorias de catálogo e 34 verificações funcionais locais. Consulte [evidência real](G1_RESTAURACAO_REAL_SUPABASE_NATIVE_2026-11-23.md) e [handoff atualizado](G1_WORK_HANDOFF_2026-11-22.md). O documento abaixo preserva o procedimento e o estado histórico da data original; afirmações de ausência de backup ou restauração não representam o estado atual. Não autoriza gravações no Supabase hospedado nem lançamento comercial.

---

# Salva Motoca! — G1: exportação privada do Supabase de testes (plano Free)

**Status em 18/11/2026:** `PROCEDIMENTO PREPARADO, DUMP AINDA NÃO EXECUTADO`.  
**Projeto único:** `yivkqyjdeouxnwtwfekc`, Supabase `Salva Motoca!`, `sa-east-1`, plano `Free`.  
**Natureza:** ambiente de **testes/homologação**, não produção comercial (SM-DEC-054).  
**Repositório:** `bonecodesign/salvamotoca` está **PÚBLICO**. Nunca colocar SQL com dados, credenciais, cópias Auth ou arquivos privados em commits, PRs, Actions públicos ou Issues.

## O que já está salvo no GitHub e o que NÃO está

- Há código, migrations do aplicativo, scripts, documentação, testes e evidências de CI versionados em `main` **e em vários PRs Draft empilhados**. O trabalho Draft ainda **não foi mesclado a main**.
- GitHub não é backup automático dos registros atuais do banco Supabase, de Auth, de ficheiros físicos de Storage, das chaves secretas da plataforma, dos parâmetros do dashboard ou de configurações externas. Não assumir que restaurar apenas o repositório recria tudo.
- Diagnóstico de leitura do Supabase em 18/11/2026: 11 migrações registradas, `auth.users=0`, `service_requests=0`, `providers=0`, `storage.objects=0`; **dados que devem ser preservados**: 36 `prestadores_prospeccao`, 40 `ofertas_prospeccao` e 1 `configuracao_comercial`. Confirmar novamente imediatamente antes da exportação, porque são valores pontuais.
- O plano Free não oferece o mesmo sistema de download/retorno de backups automáticos dos planos pagos. A Supabase recomenda `supabase db dump` e cópia fora do sistema. Isso **não** requer contratação nova, mas exige ambiente CLI com Docker e acesso administrativo seguro ao banco.

## Execução local, privada, quando houver um Windows com ferramentas disponíveis

Arquivo pronto no repositório (apenas código, sem secrets):
`scripts/g1-export-supabase-testes-privado.ps1`

1. Em uma máquina Windows de sua confiança, fora do computador compartilhado, instalar/verificar **Supabase CLI v3**, **Docker Desktop** e **7-Zip** (gratuitos, conforme disponibilidade/licenciamento). Não iniciar instalação de fornecedores pagos.
2. Abrir PowerShell interativo: `supabase --version`; `supabase db dump --help`; `docker info`; `supabase login` se ainda não estiver autenticado. **Nunca colar tokens, senhas nem a string completa do banco nesta conversa ou no GitHub**.
3. Baixar somente o script validado do PR para a máquina e rodar a partir do PowerShell: `& ".\g1-export-supabase-testes-privado.ps1"` (no diretório em que o arquivo foi salvo). **Não** executar scripts de fonte não verificada; inspecionar antes.
4. O script sempre seleciona `yivkqyjdeouxnwtwfekc` via `--remote=<project_ref>`, faz dump **somente de leitura** de `roles.sql`, `schema.sql`, `data.sql`, `migration_history_schema.sql` e `migration_history_data.sql`; confirma arquivos com tamanhos positivos; gera `manifest.json` com hashes SHA-256, sem credenciais.
5. Cria um arquivo `.7z` **criptografado AES-256**, com cabeçalhos criptografados, usando **senha informada apenas no prompt do 7-Zip**. Testa o arquivo exigindo a senha novamente. Não registra a senha na CLI ou em `manifest.json`. Se validar, apaga arquivos brutos temporários com remoção comum (que não é sobrescrita segura de SSD). O arquivo criptografado fica em `%LOCALAPPDATA%\SalvaMotoca\backups-privados\`.
6. Conservar a senha exclusivamente em gerenciador de senhas ou outro meio privado e uma **segunda cópia do `.7z` criptografado em local independente**. Perder a senha impede restauração; publicar `.7z` sem senha forte também representa risco.
7. **Não subir** nem o `.7z` nem `roles.sql`, `schema.sql`, `data.sql`, arquivos Auth, históricos, hashes sensíveis ou senhas ao GitHub público. Não salvar dumps em Dropbox ou compartilhamentos sem autorização explícita e proteção adequada.

**Observação:** o script foi revisado estaticamente, mas **ainda não foi executado no Windows real**. A integração atual com Supabase consegue consultas SQL, esquema e advisors, mas **não disponibiliza a conexão CLI/pg_dump nem um comando de exportação privada de banco**; o ambiente desta conversa também não contém `supabase`, `pg_dump`, `psql` nem `Docker` autenticados. Por isso não é correto declarar que o backup foi concluído.

## Limites da exportação

- O dump lógico inclui estrutura/dados gerenciáveis pelo mecanismo de backup Supabase; algumas schemas internas, chaves mestras, segredos de sessão, configurações de Auth/Edge Functions e fornecedores externos **não** são reproduzidos integralmente pelo dump. O conjunto de 5 arquivos preserva a história de migrations separadamente, para facilitar reconstrução.
- **Storage físico:** objetos não são incluídos pelo dump PostgreSQL; é preciso exportar objetos separadamente quando houver arquivos. Em 18/11 a consulta trouxe 0 objetos, mas isso requer verificação imediata antes da exportação. O bucket `request-photos` é privado, `image/jpeg` até 5 MiB.
- **Supabase Vault:** o dump não transporta automaticamente a chave mestra de criptografia. Em eventual migração a outro projeto, a recuperação de Vault exige procedimento segregado aprovado, sem colocar chaves no GitHub.
- A exportação **não** faz backup das próprias credenciais/segredos, nem garante que uma futura restauração será bem-sucedida.

## Prova independente de RESTAURAÇÃO (G1)

Mesmo após gerar um `.7z` e validar o SHA-256, **G1 continua `BLOCKED`** até:
1. Abrir o arquivo criptografado e conferir `manifest.json`, todos os arquivos e seus hashes em diretório local seguro.
2. Subir **uma instância local Supabase/PostgreSQL 17 descartável** (isolada do projeto hospedado, sem pagar por outro projeto), validar versões e extensões compatíveis.
3. Restaurar `roles.sql`, `schema.sql`, `data.sql` **somente no banco DESCARTÁVEL**, com `psql --single-transaction --set=ON_ERROR_STOP=1` e tratamento consciente de `session_replication_role`, conforme documentação oficial e sem apontar `psql` para o Supabase remoto. A compatibilidade das schemas `auth`/`storage` deve ser avaliada na instância completa, não apenas PostgreSQL vazio.
4. Conferir contagens, esquema, RLS, funções, políticas, migrations, existência de `auth.users`, metadados do Storage, objetos físicos separadamente, grants e consistência de links; registrar resultados e diferenças **sem enviar dados pessoais** ao repositório.
5. Verificar que os dados no Supabase de testes **não sofreram alterações** durante todo o processo.
6. Somente então registrar G1 como `PASS` com provas reais. O `f1TestRequestsEnabled` e o lançamento comercial seguem desativados até autorizações próprias.

## Bloqueio e próximos passos

- **Agora:** diagnóstico somente leitura confirmado e runner de backup preparado, sem backup remoto criado.
- **Bloqueia etapa seguinte:** exportação com credenciais no ambiente local confiável e validação de restauração isolada; se não for possível instalar/iniciar ferramentas, registrar `G1=BLOCKED`.
- **Proibido:** migrações em Supabase hospedado, criar outro projeto, pagar por backup/PITR, ativar serviços, inserir dados fictícios em produção, publicar dados em GitHub e alterar a F1 real.

Fontes oficiais consultadas:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/reference/cli/supabase-db-remote
- https://supabase.com/docs/guides/deployment/ci/backups
- https://supabase.com/changelog/supabase-cli-v3

**Conclusão:** não confundir "runner pronto" com "dump exportado e restauro provado". Reutilizar o Supabase existente, sem custos adicionais e sem divulgar dados, continua sendo o objetivo.
