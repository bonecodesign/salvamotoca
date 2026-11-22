# G1 — Backup cifrado via GitHub Actions: candidato SEM ATIVAÇÃO

**Estado:** o Supabase existente yivkqyjdeouxnwtwfekc é de TESTES, não produção (SM-DEC-054). O procedimento de exportação REAL foi escrito, mas **não foi executado**; G1=BLOCKED e RELEASE=NO_GO. O repositório bonecodesign/salvamotoca é PÚBLICO.

## Implementação preparada

- Workflow: .github/workflows/g1-supabase-backup-manual.yml — disparo exclusivamente manual (workflow_dispatch), somente na main, exige confirmação explícita capturada no disparo manual, usa ambiente GitHub g1-backup-testes com secrets. Somente contents: read, sem upload-artifact, commits, pull_request, push ou agendamento.
- Runner: scripts/g1-actions-backup-real.sh — valida URL do Session Pooler com projeto exato, verifica se o Storage tem zero objetos, exporta roles, schema, data e migrações por Supabase CLI v3, cria manifesto SHA-256, cifra com age/X25519 ANTES do envio e envia apenas arquivo cifrado para uma pasta privada via Dropbox API. Confere tamanho e Dropbox content_hash, limite preventivo de 100 MiB. Segredos não são impressos.
- CI independente de secrets: o workflow existente g1-backup-restore-offline.yml testa sintaxe, trava de segurança, criptografia com dados fictícios e o experimento PG17 de dump/restauração anteriormente aprovado.

## Configurações humanas necessárias (não feitas pelo ChatGPT)

| Item | Onde configurar | Proteção |
| --- | --- | --- |
| G1_AGE_RECIPIENT | GitHub Actions **Variables** | Chave PÚBLICA age1...; chave PRIVADA permanece exclusivamente com o fundador, fora do GitHub e desta conversa |
| G1_SUPABASE_DB_URL | GitHub **Environment Secret** do ambiente g1-backup-testes | URL PostgreSQL do **Session Pooler** do projeto de testes, usuário postgres.yivkqyjdeouxnwtwfekc; NÃO é a URL HTTP |
| G1_DROPBOX_ACCESS_TOKEN | Mesmo Environment Secret | Token Dropbox API de curta duração com escopo mínimo files.content.write e acesso ao App Folder privado, **não é o acesso ao Dropbox do ChatGPT** |
| G1_DROPBOX_PATH | Workflow versionado | Valor fixo `/backup-testes` na raiz do token Dropbox App Folder; no Dropbox conectado ele corresponde a `/Apps/Salva Motoca/backup-testes`. O script recusa qualquer outro destino e envia somente ciphertext para esse cofre |
| g1-backup-testes | GitHub Settings > Environments | Restringir à branch main; configurar aprovação humana/proteções disponíveis |

A autorização do exportador é um output do job guard **somente após** validar repositório, branch main, disparo manual, frase de confirmação **e `G1_BACKUP_ENABLED=true` no ambiente protegido no instante da verificação**. Depois de aprovada, a autorização fica congelada no output do guard: o exportador não relê a variável, evitando uma corrida entre os jobs. A variável pode voltar a `false` após a aprovação do guard sem cancelar automaticamente o run já autorizado; para impedir sua execução, o operador deve cancelar o run. Não é permitido tratar `G1_BACKUP_ENABLED=false` no momento do guard como autorização válida. E um workflow_dispatch só aparecerá normalmente na interface quando o workflow fizer parte da branch padrão main. Este candidato permanece **Draft e sem merge automático**.

## Teste adversarial completo com ferramentas simuladas — 19/11/2026

A suíte `tests/g1-actions-backup-fake-e2e.sh` executa o **próprio script de backup candidato** com `psql`, `supabase db dump` e `curl` substituídos por comandos artificiais locais. Não estabelece conexão com banco nem Dropbox. A criptografia `age` é **real** e uma chave temporária de fixture é apagada ao fim do job.

A CI comprova: (a) rejeição de URL de outro projeto; (b) bloqueio quando há objetos do Storage; (c) geração do pacote e dos hashes com dados fictícios, cifragem, envio **simulado**, decifragem e verificação dos arquivos; (d) rejeição de resposta Dropbox com `content_hash` errado; (e) não imprimir senha ou token de fixture nos logs. O teste antigo de `pg_dump` e `pg_restore` em PostgreSQL 17 descartável permanece. Evidência: [GitHub Actions #44586867591](https://github.com/bonecodesign/salvamotoca/actions/runs/44586867591) — **SUCCESS** (1 job).

Esses ensaios **não provam** autenticação no Supabase real, execução real da Supabase CLI com conexão remota, disponibilidade do OAuth Dropbox, backup físico de Storage, restauração do ambiente completo nem franquias do destino privado. A fonte para G1 real continua sendo a exportação efetiva e a restauração isolada, sob autorização do fundador.

## SM-G1-ROBUSTEZ — pré-checagens reais e novos testes, 19/11/2026

**Supabase CLI v3.2.0:** instalado no runner GitHub Actions, não apenas consultado na documentação. A sintaxe de exportação foi conferida contra a documentação atual: ao receber URL explícita de conexão, o CLI usa `--db-url` (não `--remote`); as opções `--role-only`, `--data-only`, `--schema`, `--use-copy`, `--exclude` e `--file` também são exigidas pelo fluxo. Evidência: [CI #44589540823](https://github.com/bonecodesign/salvamotoca/actions/runs/44589540823) — SUCCESS. A verificação do CLI **não se conectou ao Supabase hospedado**.

**Inventário de origem:** o script de backup real candidato agora lê contagens de 8 conjuntos essenciais **antes e depois das cinco exportações**, cifra o inventário inicial e seu SHA-256 junto com o pacote e **interrompe o backup se alguma contagem mudar**. Além disso, só aceita `data.sql` contendo comandos **`COPY public.<tabela>` genuínos** para as três tabelas essenciais de prospecção/configuração (não basta o nome aparecer em texto ou comentários). Isso diminui o risco de backup incompleto ou inconsistente, mas **não detecta atualização de conteúdo sem alteração de contagens**, nem equivale a snapshot transacional único.

Foi repetida consulta **somente SELECT**, diretamente no Supabase de testes, em 19/11/2026, e confirmado: `auth.users=0`, `service_requests=0`, `providers=0`, `prestadores_prospeccao=36`, `ofertas_prospeccao=40`, `configuracao_comercial=1`, `supabase_migrations.schema_migrations=11`, `storage.objects=0`. Os números são pontuais, sem copiar linhas com informações pessoais e sem gravação no projeto.

**Testes adversariais de CI:** o mock local em `tests/g1-actions-backup-fake-e2e.sh` agora precisa provar, adicionalmente, a inclusão do inventário cifrado, rejeitar uma tabela essencial ausente do dump e rejeitar uma variação de contagens antes/depois. Os testes anteriores de criptografia, hash remoto adulterado, projeto inesperado e Storage não vazio foram mantidos, e a verificação continua **sem credenciais reais nem chamadas ao Supabase/Dropbox**. Evidência: [CI #44589991913](https://github.com/bonecodesign/salvamotoca/actions/runs/44589991913) — SUCCESS.

Essas validações reduzem o risco antes da configuração humana. **Não significam que o `pg_dump` hospedado, a transmissão ao Dropbox ou a restauração real tenham ocorrido**.

## Por que NÃO é G1 aprovado

1. A exportação real ainda precisa completar e ser comprovada por restauração isolada; o disparo manual continua exigindo a frase de confirmação e os secrets do ambiente.
2. O backup criptografado, mesmo quando enviado, precisa ser **decifrado e restaurado em ambiente ISOLADO** com a chave privada; esse teste não ocorrerá no GitHub público.
3. O CLI pode excluir partes de esquemas Supabase gerenciados da exportação de estrutura: auditar a reconstrução completa de Auth, políticas, RLS, dados, grants e história das migrações durante a restauração.
4. O backup SQL não inclui bytes físicos de Storage. O script aborta se houver objetos no Storage, pois não tenta cobri-los.
5. Os dumps de roles/schema/data não são um único snapshot atômico sob gravações concorrentes. Congelar alterações de dados no projeto de homologação durante a exportação e comprovar a consistência na restauração.
6. Dropbox upload simples suporta até 150 MB; este fluxo limita a 100 MiB cifrados para margem. Bases maiores exigirão outro método.
7. Um token OAuth do Dropbox conectado ao ChatGPT **não** é reutilizável automaticamente em Actions. Requer configuração própria e revisão de segurança; verificar franquias de armazenamento e nenhum novo custo.
8. Ações de setup via tags versionadas devem ter revisão/pinning por SHA na homologação de cadeia de fornecimento. O Supabase CLI proposto usa 3.2.0.

## Aprovação futura (sem ativar F1 comercial)

O fundador precisará configurar os secrets diretamente nos painéis GitHub/Supabase/Dropbox sem colar senhas neste chat, preservar a chave privada num local seguro, avaliar o Draft, autorizar o merge independente e então acionar manualmente pelo GitHub Actions escrevendo BACKUP_TESTES_SALVAMOTOCA. Somente depois de um backup real persistente e uma restauração real comprovada em ambiente isolado poderemos marcar G1=PASS. Nunca fazer upload de dumps brutos ou chaves privadas em GitHub Artifact, commit, Issue, logs ou PR público.

Fontes oficiais:
- https://supabase.com/docs/guides/deployment/ci/backups
- https://supabase.com/docs/reference/cli/supabase-db-remote
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments
- https://www.dropbox.com/developers/documentation/http/documentation#files-upload

**Conclusão: pacote preparado para revisão, sem escrita no Supabase de testes, zero novas contratações e sem autorização comercial.**
