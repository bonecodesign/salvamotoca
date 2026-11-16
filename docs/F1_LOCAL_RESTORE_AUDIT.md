# F1 — auditoria independente do PostgreSQL restaurado (apenas local)

**Data:** 16/11/2026 · **Projeto único:** Salva Motoca! / Supabase ref \`yivkqyjdeouxnwtwfekc\`.

**Estado:** \`G1=BLOCKED\` · \`BACKUP_REAL=NOT_VERIFIED\` · \`F1_RELEASE=NO_GO\`. Este procedimento **não copia banco nem arquivos**, não acessa o projeto hospedado e não autentica a origem de um dump. É mais uma verificação técnica disponível para quando houver exportação privada e restauração verdadeira em banco local descartável.

## O que foi obtido em leitura remota (16/11/2026)

O projeto existente permaneceu \`ACTIVE_HEALTHY\` em \`sa-east-1\` com PostgreSQL 17.11.0.019. A leitura agregada, **não um backup**, mostrou \`auth.users=0\`, \`public.service_requests=0\` e \`storage.objects\` no bucket privado \`request-photos=0\`, com RLS habilitada nas tabelas de pedidos e objetos. Foram observadas seis RPCs F1. **Essas contagens são apenas um instantâneo de inspeção e NÃO podem ser reaproveitadas como contagens válidas de um backup feito posteriormente.** Repetir quando realmente exportar.

Consultar a documentação atual antes de executar: [Backups Supabase](https://supabase.com/docs/guides/platform/backups), [Backup/Restore CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [CLI v3](https://supabase.com/changelog/supabase-cli-v3). A CLI mudou em novembro de 2026; verificar a versão e \`--help\`. Não é necessário nem autorizado contratar plano novo, criar novo Supabase, fazer migração remota ou redefinir senhas.

## Preparação privada obrigatória (não realizada)

1. Operador com acesso legítimo obtém uma exportação completa do **único** projeto autorizado para arquivo privado, com meios de obtenção e escopo documentados; não entregar strings de conexão, dumps ou tokens a GitHub/ChatGPT.
2. Fotografar os **valores agregados** do banco de origem em modo somente leitura **no mesmo período da exportação** (sem linhas identificáveis) e registrar num arquivo JSON privado. Somente esse arquivo é usado para comparar a restauração. Não usar as contagens antigas acima se a base tiver mudado.
3. Restaurar o material **somente** em PostgreSQL 17 local descartável chamado \`f1_restore_disposable\`, em equipamento/ambiente privado do operador, com backup/autenticação e alcance de rede verificados. Não restaurar no projeto hospedado. As contas reais do Supabase precisam ter escopo de recuperação revisado; simplesmente restaurar auth.users não prova que logins funcionarão.
4. Confirmar também as cópias de **bytes dos objetos** do Storage, suas hashes, a configuração Auth, segredos de serviço, policies, funções e grants por procedimento separado. Banco PostgreSQL sozinho não restaura arquivos armazenados fisicamente.

## Passo de inspeção disponível agora (sem conexão)

\`\`\`bash
node scripts/f1-local-restore-audit.mjs --plan
\`\`\`

## Arquivo privado de contagens de origem

Salvar somente fora do repositório (ex.: \`/secure/f1-source-counts.json\`) com versão \`1\`, \`project_ref\`, horário UTC \`captured_at\` e \`snapshot\`. Exemplo de **estrutura sem valores probatórios**:

\`\`\`json
{
  "version": 1,
  "project_ref": "yivkqyjdeouxnwtwfekc",
  "captured_at": "SUBSTITUIR_PELO_HORARIO_REAL_UTC",
  "snapshot": {
    "auth_users": 0,
    "service_requests": 0,
    "request_photo_metadata": 0,
    "storage_total": 0,
    "request_policy_count": 2,
    "storage_policy_count": 3,
    "f1_rpc_names": 6,
    "request_bucket_private": true,
    "request_rls": true,
    "storage_rls": true,
    "anon_can_select_requests": false,
    "authenticated_can_select_requests": false
  }
}
\`\`\`

**Números demonstrativos:** devem ser obtidos da origem no momento da cópia e são sujeitos a mudança. A estrutura não substitui uma trilha de backup/restore. Os seis nomes RPC são exigidos no banco real F1 para reduzir risco de perda de funções na restauração.

## Auditoria no banco restaurado local (somente após backup real)

A máquina deve ter Node 22+, \`psql\` do PostgreSQL compatível e o banco de **nome descartável** publicado apenas em \`127.0.0.1\`. Confira que **não há SSH tunnel, proxy ou port-forward para o Supabase hospedado nessa porta**; um loopback com túnel remoto não é ambiente de restauração local. Não copie nem salve dados pessoais no repositório.

\`\`\`bash
# Senha apenas do PostgreSQL LOCAL, fornecida via variável privada;
# nunca usar senha de banco Supabase hospedado.
node scripts/f1-local-restore-audit.mjs \
  --local-db f1_restore_disposable \
  --expected /secure/f1-source-counts.json \
  --port 5432
\`\`\`

O script conecta **exclusivamente no host literal \`127.0.0.1\`**, banco com padrão \`f1_*_disposable\`, usuário PostgreSQL local \`postgres\`; não aceita \`--host\`, \`--db-url\`, nem connection string. Ele força \`default_transaction_read_only=on\`, usa \`psql -X -w\`, não loga conteúdo de tabelas e limita saída a resumos não identificáveis. Se o banco local exigir senha, configurá-la em \`F1_LOCAL_PGPASSWORD\` **fora** do repositório e evitar histórico de shell.

Confere PostgreSQL 17, quatro tabelas essenciais, roles \`anon\`/\`authenticated\`, ausência do marcador de fixture, bucket privado, RLS, total de usuários, pedidos, metadados Storage, policies, ACLs de SELECT e seis nomes RPC. Divergências = **FAIL**. Valores iguais = \`local_catalog_match=true\`, \`baseline_counts_match=true\`, mas **sempre \`REVIEW_REQUIRED_NO_GO\`**, pois contagens não demonstram origem do backup, consistência transacional, login Auth, bytes Storage, configuração nem recuperação completa.

## Prova complementar já preparada

O script \`scripts/f1-private-backup-manifest-check.mjs\` do [PR #53](https://github.com/bonecodesign/salvamotoca/pull/53) confere **hash e tamanho dos arquivos privados** e inventário dos bytes de Storage. Esta nova auditoria confere um **banco realmente restaurado em local descartável** quando isso ocorrer. **Ambos são complementares, não equivalentes à prova remota integral.**

Na CI, a auditoria é provocada contra a base **sintética** e deve recusá-la com mensagem \`Fixture CI nao pode passar por restauracao real\`. Os testes unitários usam dados inventados e comprovam negação a DB remoto, falso baseline, contagens divergentes, falta de ACL/RLS e falsa promoção de G1.

## Critério de desbloqueio que NÃO foi alcançado

Somente um operador responsável pode confirmar independentemente: origem e completude dos backups do único projeto, restauração isolada do PostgreSQL, Auth recuperável, bytes Storage restauráveis, configurações e resultado de acesso; tudo em ambiente privado, com evidências auditáveis e sem segredos no GitHub. Depois, o projeto ainda exigirá G2 de Auth/Storage A/B/C, seis RPCs, Android físico, revisão jurídica e aprovação explícita.

**Situação factual:** ainda não há backup binário/restauração real verificados. Nenhum teste desta branch deve acionar conta, pedido, pagamento, serviço ou upload remoto. **F1 continua BLOQUEADA / NO-GO.**
