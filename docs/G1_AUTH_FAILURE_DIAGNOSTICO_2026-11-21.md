# Salva Motoca! — diagnóstico G1 de autenticação PostgreSQL (21/11/2026)

**Projeto:** Supabase de TESTES yivkqyjdeouxnwtwfekc (sa-east-1, PostgreSQL 17.11). **Estado:** G1=BLOCKED; RELEASE=NO_GO.

## O que o Work já concluiu — não repetir

- PR #91: backup manual cifrado consolidado na main; destino Dropbox privado App Folder /backup-testes; nenhuma ativação comercial.
- PRs #100/#101: destino Dropbox corrigido e documentado.
- PR #102: o job guard lê as variáveis do ambiente protegido g1-backup-testes. O precheck já passou na tentativa mais recente.
- PR #103: mensagens seguras para classificar erros no pré-teste Storage, sem mostrar a connection string.
- GitHub Actions #44956983289 (21/11/2026): **FAILED**, mensagem «credencial do banco recusada antes de verificar Storage». Nenhum dump ou upload gerado.
- Conferência read-only pelo conector Supabase em 21/11: banco postgres ativo, role postgres com LOGIN, 11 migrações, 0 objetos no Storage. O conector NÃO usa a credencial do Secret PostgreSQL do GitHub.

## Hipóteses que ainda requerem verificação administrativa

1. Senha PostgreSQL desatualizada, diferente da atual ou placeholder não substituído;
2. Senha com caracteres reservados em URI sem codificação percentual (%XX);
3. Conexão de outro projeto, usuário, modo ou porta do pooler;
4. Senha PostgreSQL redefinida anteriormente sem atualização do Secret.

Não é possível identificar qual hipótese ocorreu sem acesso seguro ao Secret do Environment. A conexão do conector Supabase não é prova de validade do Secret. Não ler, publicar ou enviar a senha ao chat, GitHub Issue, PR ou logs.

## Proteção adicionada neste PR

- scripts/g1-validate-db-url.py: valida SEM REDE a sintaxe URI, usuário exato, host Session Pooler IPv4 aws-*.pooler.supabase.com, porta 5432, database postgres, modo TLS seguro, senhas URL-encoded e placeholders. Nunca imprime credenciais.
- O exportador G1 chama a verificação antes do primeiro acesso ao banco: formato inválido causa falha fechada. URI com sintaxe válida **NÃO prova senha correta**.
- tests/test_g1_db_url_validation.py e CI G1: testes offline com valores completamente fictícios; nenhum Secret acessado. O mock de conexão foi ajustado para o formato do Session Pooler.

## Passos administrativos, sem compartilhar segredos

1. Abrir o projeto de TESTES no Supabase > **Connect > Session Pooler**; conferir nome de usuário postgres.yivkqyjdeouxnwtwfekc, hostname real indicado no painel, banco postgres e porta 5432. Não escolher Transaction Pooler (6543) nem Direct no runner IPv4.
2. Substituir o placeholder pela senha **atual do PostgreSQL**, não pela senha da conta Supabase, por token API ou service_role. Se a senha tiver caracteres especiais reservados, codificar somente a SENHA para a URI. Exemplo inteiramente fictício: senha ab@#? vira ab%40%23%3F.
3. No GitHub: Settings > Environments > g1-backup-testes > Environment secrets > **G1_SUPABASE_DB_URL**. Substituir exclusivamente esse secret por URI correta. Não adicionar aspas exteriores, espaços ou linhas.
4. Se a senha antiga foi perdida, avaliar a redefinição em Supabase > Database Settings. NÃO redefinir automaticamente: poderá desconectar outros clientes. Não alterar FraldaCycle.
5. Enquanto houver credencial incerta, recomenda-se G1_BACKUP_ENABLED=false no ambiente protegido. Reabilitar somente após revisão e autorização. O workflow continua manual e somente na main.
6. Após atualização segura do secret, uma única tentativa manual será suficiente para verificar se autenticação voltou. Se falhar, interromper, sem retries contínuos e sem logs brutos. Mesmo com dump cifrado no Dropbox, G1 segue BLOCKED até restauração REAL isolada de DB/Auth/Storage.

## Documentação oficial

- Supabase Connect/PostgreSQL: https://supabase.com/docs/guides/database/connecting-to-postgres
- Senhas e percent-encoding: https://supabase.com/docs/guides/database/postgres/roles
- Supabase CLI v3: https://supabase.com/changelog/supabase-cli-v3
- GitHub Actions Secrets: https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions

**Sem senha lida ou modificada, sem execução remota, sem custo e sem merge.**
