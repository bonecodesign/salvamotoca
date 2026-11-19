# G1 — cobertura de TODAS as tabelas públicas e políticas RLS

**19/11/2026 · Salva Motoca! · Supabase existente = TESTES/HOMOLOGAÇÃO**  
**G1=BLOCKED · RELEASE=NO_GO · Nenhuma gravação hospedada.**

## Risco identificado

O roteiro de backup anterior confirmava o dump de três tabelas com dados comerciais (`prestadores_prospeccao`, `ofertas_prospeccao`, `configuracao_comercial`). Isso não seria suficiente para assegurar a presença das demais tabelas do aplicativo, suas RLS e políticas durante recuperação. Uma nova tabela introduzida posteriormente também poderia passar despercebida.

Uma consulta **somente de leitura executada diretamente no Supabase de testes**, em 19/11/2026, confirmou **13 tabelas no schema público**, todas com RLS ligada, com **17 políticas** no total. As tabelas observadas foram: `app_profiles`, `bj_provider_presence`, `bj_request_attempts`, `configuracao_comercial`, `ofertas_prospeccao`, `payment_records`, `prestadores_prospeccao`, `provider_services`, `providers`, `request_messages`, `service_categories`, `service_quotes`, `service_requests`. **Não foram lidas linhas de usuários, nem feitos inserts, uploads, migrations ou alterações no Supabase.** Os números são um retrato, não um limite fixo.

## Controle acrescentado no pacote

1. `scripts/g1-actions-backup-real.sh` agora consulta o catálogo `pg_class` e `pg_policies` **antes e depois dos dumps** e produz `source_schema_inventory_before.json`. A lista é **dinâmica**: contém somente nome da tabela, estado de RLS e quantidade de políticas; não inclui linhas, identidades, chaves ou secrets. O backup **falha** se houver mudança no catálogo entre consultas.
2. `scripts/g1-verify-public-dump-coverage.py` recebe **inventário, `schema.sql` e `data.sql`** e exige que cada tabela inventariada tenha:
   - uma declaração `CREATE TABLE` no dump de schema;
   - um comando `COPY` no dump de dados (inclusive para tabelas vazias);
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` quando o catálogo informa RLS ativa;
   - o número correspondente de comandos `CREATE POLICY`.
   Rejeita também tabelas inesperadas ou duplicadas, nomes inválidos e arquivos acima de limite preventivo. Não imprime o conteúdo dos arquivos, apenas status.
3. O inventário de schema é incluído no pacote `tar.gz.age`, protegido por SHA-256 **e criptografado** junto dos demais arquivos. `scripts/g1-verify-encrypted-bundle.py` foi atualizado para exigir o novo membro e conferir o conjunto completo de tabelas `public` em comandos `COPY`.
4. Os testes de CI no PostgreSQL 17 descartável agora criam **três tabelas fictícias com RLS e políticas reais**, produzem `pg_dump` verdadeiro, criptografam, conferem integridade e restauram o SQL em outro banco descartável. Testes com API falsa de Supabase/Dropbox incluem também: tabela nova não incluída no dump, regra RLS omitida e alterações no número de políticas durante a exportação.

## O que isto NÃO prova

- A existência de um comando no SQL **não comprova** que todos os seus dados são recuperáveis; a prova verdadeira continua sendo executar restauração segura em Supabase **local compatível** e comparar os resultados.
- Inventários antes/depois **não produzem snapshot atômico**, nem detectam atualizações de valores que não mudam contagem ou schema; manter congelamento de alterações no momento do backup e revisão dos dados recuperados.
- Customizações nos schemas gerenciados **`auth`, `storage` e `realtime`**, grants, funções privilegiadas, secrets, configurações de Auth, bytes físicos de Storage e fornecedores externos **não são integralmente cobertos por este controle de `public`**. Exigem inventário, backups e provas complementares conforme documentos F1/G1.
- O projeto Supabase existente **não sofreu modificações** neste pacote. O workflow real continua **manual, desabilitado e em Draft** no PR #86; não havia autorização para merge nem acesso aos secrets/Dropbox de Actions.

## Critério para passagem de G1

Além da validação de schema: criar **backup real criptografado em destino privado**, provar que pode ser decifrado e restaurado em **ambiente isolado**, conferir registros, RLS, funções, migrations, Auth e Storage físico (se houver), registrar diferenças/pendências e obter aprovação explícita antes de gravar dados na instância hospedada. Nenhum passo aqui libera operação comercial.

**Documento de referência:** [Supabase — Backup and Restore using CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) e [Supabase — Automated backups via GitHub Actions](https://supabase.com/docs/guides/deployment/ci/backups).
