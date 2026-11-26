# G1 — Backup cifrado via GitHub Actions: candidato SEM ATIVAÇÃO

**ATUALIZAÇÃO FACTUAL 22/11/2026 — O backup foi encontrado.** A pesquisa ampla no Dropbox localizou o .age do run #45074685352 em /Aplicativos/Salva Motoca G1 Backup/backup-testes. Ele tem 24.484 bytes e hash Dropbox f0b60e079d460885f614c33e08cfe9f211b756cd04edb0e801e3e8b906db41de. A cópia criptografada foi salva e relida na Biblioteca ChatGPT (App: Salva Motoca! / G1 - Backups criptografados), com SHA-256 idêntico ao original: f7ae94952411e6314c870d987914cec841f84d026f270908409a4d2f96785678. A pasta /Apps/Salva Motoca/backup-testes antes auditada é OUTRA pasta. As notas abaixo sobre ausência de arquivo referem-se somente à pasta errada, não ao destino real. Chave privada intocada; descriptografia e restauração ainda não comprovadas. G1=BLOCKED / RELEASE=NO_GO.

**Estado:** o Supabase existente yivkqyjdeouxnwtwfekc é de TESTES, não produção (SM-DEC-054). O procedimento de exportação REAL já foi tentado, mas a persistência no cofre auditado e a restauração ainda **não foram comprovadas**; G1=BLOCKED e RELEASE=NO_GO. O repositório bonecodesign/salvamotoca é PÚBLICO.

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
| G1_DROPBOX_PATH | Workflow versionado | Valor fixo `/backup-testes` na raiz do token Dropbox App Folder; no Dropbox conectado ele corresponde a `/Aplicativos/Salva Motoca G1 Backup/backup-testes` (NÃO à pasta distinta `/Apps/Salva Motoca/backup-testes`). O script recusa qualquer outro destino e envia somente ciphertext para esse cofre |
| g1-backup-testes | GitHub Settings > Environments | Restringir à branch main; configurar aprovação humana/proteções disponíveis |

A autorização do exportador é um output imutável do job guard **somente após** validar repositório, branch main, disparo manual e a frase de confirmação. O exportador aceita exclusivamente esse output; não lê `G1_BACKUP_ENABLED` nem outra variável mutável durante a fila ou a execução. Isto elimina a corrida observada nos runs anteriores sem conceder qualquer gatilho automático: o workflow continua sendo `workflow_dispatch` exclusivo, exige a frase explícita e só opera no repositório/branch autorizados. E um workflow_dispatch só aparecerá normalmente na interface quando o workflow fizer parte da branch padrão main.

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


## Evidência de tentativa real controlada — 22/11/2026

- Runs 6 e 7: falharam antes de acessar o exportador por causa de uma guarda mutável. A correção foi testada integralmente offline e integrada por PRs separados #110 e #111.
- Run 8 ([GitHub Actions #45073048177](https://github.com/bonecodesign/salvamotoca/actions/runs/45073048177)): a guarda manual passou; a conexão PostgreSQL de testes autenticou; o inventário e a verificação `storage.objects=0` passaram. A etapa de upload cifrado retornou HTTP 401 no Dropbox.
- Não houve upload confirmado, artefato público, dump bruto, chave privada, escrita no Supabase, atendimento ou pagamento. O script remove os arquivos temporários ao falhar; portanto esse run **não constitui backup**.
- Próximo requisito técnico: renovar com segurança o token de API do Dropbox configurado como `G1_DROPBOX_ACCESS_TOKEN` no Environment Secret `g1-backup-testes`, ou executar o mesmo exportador em máquina local com credenciais fornecidas fora desta conversa. Depois, é obrigatória restauração isolada com a chave privada age antes de G1=PASS.

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


## Evidência do run 9 e condição atual — 22/11/2026

- Run 9 ([GitHub Actions #45074685352](https://github.com/bonecodesign/salvamotoca/actions/runs/45074685352)): a guarda manual passou; a conexão PostgreSQL de testes foi autenticada; `storage.objects=0`; a exportação lógica foi cifrada antes do envio e o upload respondeu com tamanho e hash de conteúdo conferidos pelo fluxo.
- Marcadores seguros do job: `G1_DB_CONNECTION_AUTHENTICATED=PASS`, `G1_STORAGE_OBJECTS_EMPTY=PASS` e `G1_ENCRYPTED_BACKUP_UPLOADED_PRIVATE_DROPBOX=CONFIRMED`. O job registrou explicitamente `G1_REMOTE_RESTORE_PROVEN=FALSE`, `G1=BLOCKED` e `RELEASE=NO_GO`.
- A consulta independente ao local privado esperado não localizou o novo arquivo cifrado. Assim, o retorno da API no runner comprova o envio recebido pelo destino autenticado, mas **não comprova que esse destino seja o cofre privado conectado que está sendo auditado agora**. Não houve download, exposição ou alteração de arquivos durante essa conferência.
- Antes de novo backup ou restauração, é obrigatório reconciliar a identidade da conta Dropbox associada ao token de Actions com a conta/cofre auditado e manter a identidade privada age fora do cofre de backups. Essa reconciliação deve ser comprovada por metadados, sem divulgar token, chaves ou conteúdo.
- Resultado desta evidência: criação de backup cifrado no fluxo remoto **parcialmente comprovada**; persistência no cofre auditado e restauração isolada seguem pendentes. G1 continua **BLOCKED** e a liberação continua **NO_GO**.

## Nova proteção proposta para reconciliação do destino — 22/11/2026

**Auditoria independente:** a pasta conectada `/Apps/Salva Motoca/backup-testes` foi lida por metadados e listada integralmente (sem cursor pendente): contém apenas o arquivo da identidade privada age, **nenhum `.age` de backup**. Não foi aberto, baixado, movido nem excluído qualquer arquivo. O Supabase de testes permanece ativo. A persistência do run #45074685352 nesse cofre continua **não demonstrada**.

**Correção em revisão neste PR:** o exportador, **antes de consultar o PostgreSQL**, chama `/2/files/get_metadata` para `/backup-testes` com o token próprio de Actions e compara, em silêncio, o SHA-256 do identificador da pasta com o valor da pasta previamente inspecionada pelo conector. Se a pasta for outra, inacessível ou a API negar `files.metadata.read`, aborta sem exportar, cifrar ou enviar dados. Nenhum token, ID de pasta em logs, dado pessoal ou segredo é publicado pelo guard. A verificação de tamanho e content_hash depois do upload continua obrigatória.

**Condição de implantação:** a chave privada de recuperação deve ser copiada e validada pelo fundador em armazenamento local seguro **antes** de sair da pasta de backup. Não apagar, mover ou sobrescrever o único exemplar enquanto a cópia segura não estiver comprovada. O token de Actions precisa ter `files.metadata.read` e `files.content.write`, com acesso ao App Folder correto. Somente após passar pelo guard em um novo disparo explicitamente autorizado, confirmar o arquivo por listagem independente e demonstrar restauração isolada em PostgreSQL 17, reavaliar G1. **G1=BLOCKED; RELEASE=NO_GO.**

## 25/11/2026 — autorização renovável Dropbox

Os dois disparos manuais #45732685643 e #45733283616 passaram pelo guard, mas encerraram com código 23 na leitura do cofre Dropbox, antes de conectar ao PostgreSQL. A causa exata da recusa não foi exposta (token expirado/revogado, escopo ou acesso); não há backup novo. O conector ChatGPT continua funcionando separadamente.

O exportador aceita um novo Environment Secret **G1_DROPBOX_OAUTH_JSON**, no mesmo ambiente g1-backup-testes. O JSON compacto contém app_key, app_secret e refresh_token do aplicativo Salva Motoca G1 Backup existente. A cada disparo manual autorizado, solicita token novo via HTTPS ao endpoint oficial Dropbox, sem seguir redirecionamentos, sem registrar respostas ou segredos. Valida duração mínima, escopos quando presentes, e mantém o hash do cofre obrigatório antes do acesso ao banco. Configuração renovável inválida nunca recorre ao token legado. O token legado permanece opção temporária somente se o novo secret estiver ausente. Não há agendamento nem alteração de permissões do workflow. Referência: https://developers.dropbox.com/oauth-guide.

**Configuração única (computador privado Windows):** confira files.metadata.read e files.content.write no App Console do aplicativo existente. Revise e execute scripts/g1-dropbox-oauth-configure-local.ps1 no PowerShell privado, sem transcrição, usando a App key e App secret e o código de autorização que o Dropbox fornece. O auxiliar verifica o cofre exato antes de preparar o JSON no clipboard; cole exclusivamente no novo Environment Secret G1_DROPBOX_OAUTH_JSON e limpe clipboard/histórico. Não executar no Actions nem enviar valores ao chat. Não alterar/remover secrets existentes enquanto o novo fluxo não for comprovado. Não requer novo aplicativo ou assinatura.

Testes offline cobrem requisição, respostas inválidas, erro sem vazamento, bloqueio de fallback e acesso remoto em configuração inválida. A autorização real só poderá ser comprovada após configuração privada e novo disparo manual, seguida de conferência independente e restauração. Revogação futura da autorização pode exigir nova intervenção. A chave age permanece intocada. G1=BLOCKED; RELEASE=NO_GO.

## Alternativa local sem Dropbox API — 25/11/2026

Por decisão do fundador, priorizar cópia local sem token OAuth. O script candidato scripts/g1-backup-native-local.py usa PostgreSQL 17 nativo (psql, pg_dump, pg_restore), Python 3.10+ e age no PATH. Não exige Docker, Supabase CLI, novo serviço nem token Dropbox. Não executá-lo em CI ou em máquina compartilhada. No Windows privado, após atualizar o repositório e conferir as ferramentas, executar `python scripts/g1-backup-native-local.py` a partir da raiz. A URL Session Pooler de TESTES é solicitada em prompt oculto, o recipient age é público e deve corresponder à identidade privada já guardada. Não fornecer credenciais ao chat. A pasta local em LOCALAPPDATA deve estar em disco protegido, fora de Git e sincronização; os intermediários brutos são temporários, apagados normalmente (não é apagamento forense). Copiar exclusivamente o .age final para o cofre Dropbox privado existente pela interface normal, sem tocar na chave privada. Não presumir sincronização concluída.

Formato novo native-pg17-custom-v1: pg_dump custom com snapshot consistente dos schemas public e supabase_migrations, catálogo/contagens antes e depois, guarda de Auth/Storage reaproveitada, verificação de entradas TABLE/TABLE DATA e metadados não sensíveis de papéis/membros, manifesto SHA-256 e cifragem age. Não é equivalente ao formato histórico: metadados de papéis não constituem script de recriação, configurações gerenciadas, segredos e objetos físicos não são recuperados; TOC e contagens não demonstram integralidade ou restauração. Não aplicar o verificador histórico a esse formato. Exigir ensaio independente de recuperação isolada, integridade dos hashes, DDL/RLS/ACL e dados antes de aceitar esta rota como G1 atual. A rota Actions/OAuth permanece intacta como alternativa. Não há backup real executado por esta alteração nem acesso ao computador do fundador. G1=BLOCKED; RELEASE=NO_GO.
