#!/usr/bin/env bash
# Salva Motoca! — G1 draft: backup REAL somente após habilitação manual.
# Nunca executar em pull_request, nem gravar dumps no GitHub público.
set -euo pipefail
umask 077
export PGSSLMODE=require

deny() { printf '%s\n' "G1 INTERROMPIDO: $1" >&2; exit 23; }
# Validar tudo ANTES de conexão com o banco de testes.
[[ "${GITHUB_REPOSITORY:-}" == 'bonecodesign/salvamotoca' ]] || deny 'repositório inesperado'
[[ "${GITHUB_REF:-}" == 'refs/heads/main' ]] || deny 'somente main'
[[ "${GITHUB_EVENT_NAME:-}" == 'workflow_dispatch' ]] || deny 'somente disparo manual'
[[ "${G1_BACKUP_ENABLED:-}" == 'true' ]] || deny 'não habilitado pelo fundador'
[[ "${G1_CONFIRM:-}" == 'BACKUP_TESTES_SALVAMOTOCA' ]] || deny 'confirmação incorreta'
[[ -n "${G1_SUPABASE_DB_URL:-}" ]] || deny 'sem secret da conexão'
[[ -n "${G1_DROPBOX_ACCESS_TOKEN:-}" ]] || deny 'sem secret Dropbox'
[[ -n "${G1_AGE_RECIPIENT:-}" ]] || deny 'sem recipient age'
[[ "$G1_AGE_RECIPIENT" =~ ^age1[0-9a-z]{58}$ ]] || deny 'recipient age inválido'
[[ "${G1_DROPBOX_PATH:-}" == '/backup-testes' ]] || deny 'destino Dropbox inesperado'
for executable in python3 supabase docker psql age tar curl sha256sum mktemp; do
  command -v "$executable" >/dev/null 2>&1 || deny "falta ferramenta: $executable"
done

# Validação estritamente LOCAL: formato, tenant, porta e encoding da URL.
# A validação NÃO prova que a senha é correta; apenas a consulta SQL prova.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$script_dir/g1-validate-db-url.py" ||
  deny 'URL do Session Pooler inválida; conferir sem revelar a credencial'

tmp="$(mktemp -d "$RUNNER_TEMP/g1-backup.XXXXXXXX")"
cleanup() { rm -rf -- "$tmp"; }
trap cleanup EXIT
cd "$tmp"
# Nunca mostrar a URL (inclui senha) nem logs brutos de exportação.
dump() {
  local name="$1"
  shift
  if ! supabase db dump --db-url "$G1_SUPABASE_DB_URL" -f "$name" "$@" \
       > "$name.stdout" 2> "$name.stderr"; then
    deny "falha na exportação $name; nada foi publicado"
  fi
  [[ -f "$name" ]] || deny "arquivo $name não criado"
}
# pg_dump não copia bytes físicos de Storage. Abortamos se houver arquivos.
if ! objects="$(psql "$G1_SUPABASE_DB_URL" -X -tA -v ON_ERROR_STOP=1 \
  -c 'select count(*) from storage.objects;' 2> storage-check.stderr)"; then
  # O arquivo de diagnóstico nunca é publicado. Classificamos somente causas
  # operacionais, para distinguir credencial desatualizada de uma regra de
  # acesso/indisponibilidade sem revelar URL, senha ou dados de tabelas.
  if grep -qiE 'password authentication failed|authentication failed' storage-check.stderr; then
    deny 'credencial do banco recusada antes de verificar Storage'
  elif grep -qiE 'permission denied|must be owner' storage-check.stderr; then
    deny 'permissão insuficiente para verificar Storage'
  elif grep -qiE 'could not connect|connection .* failed|timeout' storage-check.stderr; then
    deny 'conexão ao banco indisponível antes de verificar Storage'
  fi
  deny 'não foi possível verificar Storage'
fi
[[ "$objects" =~ ^[0-9]+$ ]] || deny 'contagem inválida de Storage'
[[ "$objects" == '0' ]] || deny 'Storage não está vazio: requer rotina específica de objetos'

# Inventário SEM dados pessoais, cifrado junto com o dump. Se uma tabela
# essencial estiver ausente, aborta; se contagens mudarem durante as cinco
# exportações independentes, aborta (não substitui snapshot atômico).
inventory() {
  local out="$1"
  if ! psql "$G1_SUPABASE_DB_URL" -X -tA -v ON_ERROR_STOP=1 \
    -c "select jsonb_build_object(
      'auth_users',(select count(*) from auth.users),
      'service_requests',(select count(*) from public.service_requests),
      'registered_providers',(select count(*) from public.providers),
      'prospected_providers',(select count(*) from public.prestadores_prospeccao),
      'prospecting_offers',(select count(*) from public.ofertas_prospeccao),
      'commercial_config',(select count(*) from public.configuracao_comercial),
      'migration_versions',(select count(*) from supabase_migrations.schema_migrations),
      'storage_objects',(select count(*) from storage.objects))::text;" \
    > "$out" 2> "$out.stderr"; then
     deny "não foi possível inventariar as tabelas de origem"
  fi
  python3 - "$out" <<'PY' || deny "inventário de origem inválido"
import json,sys
try:
    with open(sys.argv[1],encoding='utf-8') as f: d=json.load(f)
    names=('auth_users','service_requests','registered_providers',
      'prospected_providers','prospecting_offers','commercial_config',
      'migration_versions','storage_objects')
    valid=all(type(d.get(n)) is int and d[n]>=0 for n in names)
except (OSError,ValueError): valid=False
sys.exit(0 if valid else 2)
PY
}
# Descobrir TODAS as tabelas public e políticas RLS no catálogo ao vivo.
# Não armazenar nomes pessoais nem conteúdo de registros no manifesto.
schema_inventory() {
  local out="$1"
  if ! psql "$G1_SUPABASE_DB_URL" -X -tA -v ON_ERROR_STOP=1 -c "
    select jsonb_build_object('tables', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.relname,
        'rls_enabled', c.relrowsecurity,
        'policy_count', (
          select count(*) from pg_policies p
          where p.schemaname='public' and p.tablename=c.relname
        )
      ) order by c.relname),'[]'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p')
        and c.relpersistence<>'t'
    ))::text;" > "$out" 2>"$out.stderr"; then
    deny 'não foi possível ler inventário de tabelas/RLS'
  fi
}
schema_inventory source_schema_inventory_before.json
inventory source_inventory_before.json
dump roles.sql --role-only
dump schema.sql
dump data.sql --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes
dump history_schema.sql --schema supabase_migrations
dump history_data.sql --schema supabase_migrations --data-only --use-copy
inventory source_inventory_after.json
schema_inventory source_schema_inventory_after.json
cmp -s source_schema_inventory_before.json source_schema_inventory_after.json ||
  deny 'estrutura RLS/políticas mudou durante exportação'
python3 "$script_dir/g1-verify-public-dump-coverage.py" \
 --inventory source_schema_inventory_before.json \
 --schema schema.sql --data data.sql > coverage.check.stdout \
 2> coverage.check.stderr || deny 'dump não cobre todas as tabelas public/RLS/políticas'

cmp -s source_inventory_before.json source_inventory_after.json ||
  deny 'contagens mudaram durante exportação; sem snapshot coerente'
# As tabelas com registros de prospecção precisam aparecer no export de
# dados. Um --schema/flag futuro que as omita deve falhar antes do upload.
for essential in prestadores_prospeccao ofertas_prospeccao configuracao_comercial; do
  # O nome pode aparecer em valores de linhas; exigir um comando COPY
  # real e ancorado ao começo da linha, não texto incidental no arquivo.
  grep -Eq "^COPY [\\\"]?public[\\\"]?\\.[\\\"]?$essential[\\\"]?[[:space:]]*\\(" data.sql ||
    deny "dump de dados não inclui tabela essencial: $essential"
done
[[ -s schema.sql && -s data.sql ]] || deny 'arquivo de esquema/dados vazio'
sha256sum roles.sql schema.sql data.sql history_schema.sql history_data.sql source_inventory_before.json source_schema_inventory_before.json > manifest.sha256
printf '%s\n' \
 'project_ref=yivkqyjdeouxnwtwfekc' \
 'environment=TESTES' \
 'backup_kind=logical_sql' \
 'g1_restoration_verified=false' \
 'storage_physical_objects_included=false' > manifest.txt
bundle="$tmp/g1-bundle.tar.gz"
tar -czf "$bundle" roles.sql schema.sql data.sql history_schema.sql \
  history_data.sql source_inventory_before.json source_schema_inventory_before.json \
  manifest.sha256 manifest.txt
encrypted="$tmp/g1-bundle.tar.gz.age"
age -r "$G1_AGE_RECIPIENT" -o "$encrypted" "$bundle"
[[ -s "$encrypted" ]] || deny 'falha ao cifrar o arquivo'
size="$(stat -c '%s' "$encrypted")"
(( size > 0 && size <= 100*1024*1024 )) || deny 'arquivo ultrapassa o limite preventivo de 100 MiB'
stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
filename="SalvaMotoca-Supabase-TESTES-$stamp-run$GITHUB_RUN_ID.tar.gz.age"
export G1_BACKUP_FILE_NAME="$filename"
arg="$(python3 - <<'PY'
import json, os
print(json.dumps({'path':os.environ['G1_DROPBOX_PATH']+'/'+os.environ['G1_BACKUP_FILE_NAME'],
                  'mode':'add','autorename':False,'mute':True},
                 separators=(',',':')))
PY
)"
# Token OAuth Dropbox separado do conector ChatGPT, com escopo mínimo.
# Só bytes AGE cifrados são transmitidos. Nenhum GitHub Artifact ou commit.
curl --fail --silent --show-error --max-time 300 --retry 1 \
  -X POST 'https://content.dropboxapi.com/2/files/upload' \
  -H "Authorization: Bearer $G1_DROPBOX_ACCESS_TOKEN" \
  -H 'Content-Type: application/octet-stream' \
  -H "Dropbox-API-Arg: $arg" \
  --data-binary "@$encrypted" > "$tmp/dropbox-response.json" \
  || deny 'falha no upload cifrado ao Dropbox'

# Verificar hash de blocos Dropbox e tamanho, não confiar só em HTTP 200.
python3 - "$encrypted" "$tmp/dropbox-response.json" <<'PY' \
  || deny 'o Dropbox não comprovou integridade do ciphertext'
import sys,os,json,hashlib
try:
    path,response=sys.argv[1:]
    with open(response,encoding='utf-8') as f: answer=json.load(f)
    with open(path,'rb') as f:
        blocks=[]
        while True:
            chunk=f.read(4*1024*1024)
            if not chunk: break
            blocks.append(hashlib.sha256(chunk).digest())
    content_hash=hashlib.sha256(b''.join(blocks)).hexdigest()
    success=(answer.get('size')==os.path.getsize(path)
             and answer.get('content_hash')==content_hash
             and answer.get('name','').endswith('.age'))
except (OSError,ValueError,KeyError,TypeError): success=False
sys.exit(0 if success else 2)
PY
echo 'G1_ENCRYPTED_BACKUP_UPLOADED_PRIVATE_DROPBOX=CONFIRMED'
echo 'G1_REMOTE_RESTORE_PROVEN=FALSE'
echo 'SUPABASE_TEST_ENV_CHANGED=FALSE'
echo 'G1=BLOCKED'
echo 'RELEASE=NO_GO'
