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
for executable in python3 supabase docker psql age tar curl sha256sum mktemp; do
  command -v "$executable" >/dev/null 2>&1 || deny "falta ferramenta: $executable"
done

# Python não imprime a URL; valida host pooler IPv4 + usuário de projeto.
python3 - <<'PY' || deny 'conexão não corresponde ao Supabase de testes'
import os, sys, urllib.parse
try:
    u=urllib.parse.urlsplit(os.environ['G1_SUPABASE_DB_URL'])
    host=(u.hostname or '').lower()
    user=urllib.parse.unquote(u.username or '')
    tls=urllib.parse.parse_qs(u.query).get('sslmode',['require'])[0]
    valid=(u.scheme in ('postgres','postgresql')
       and user=='postgres.yivkqyjdeouxnwtwfekc'
       and host.endswith('.pooler.supabase.com')
       and host!='.pooler.supabase.com'
       and u.port==5432 and u.path=='/postgres'
       and bool(u.password) and not u.fragment
       and tls in ('require','verify-ca','verify-full'))
except (ValueError, KeyError): valid=False
sys.exit(0 if valid else 2)
PY

tmp="$(mktemp -d "$RUNNER_TEMP/g1-backup.XXXXXXXX")"
cleanup() { rm -rf -- "$tmp"; }
trap cleanup EXIT
cd "$tmp"
# Nunca mostrar a URL (inclui senha) nem logs brutos de exportação.
dump() {
  local name="$1"
  shift
  if ! supabase db dump "--remote=$G1_SUPABASE_DB_URL" -f "$name" "$@" \
       > "$name.stdout" 2> "$name.stderr"; then
    deny "falha na exportação $name; nada foi publicado"
  fi
  [[ -f "$name" ]] || deny "arquivo $name não criado"
}
# pg_dump não copia bytes físicos de Storage. Abortamos se houver arquivos.
if ! objects="$(psql "$G1_SUPABASE_DB_URL" -X -tA -v ON_ERROR_STOP=1 \
  -c 'select count(*) from storage.objects;' 2> storage-check.stderr)"; then
  deny 'não foi possível verificar Storage'
fi
[[ "$objects" =~ ^[0-9]+$ ]] || deny 'contagem inválida de Storage'
[[ "$objects" == '0' ]] || deny 'Storage não está vazio: requer rotina específica de objetos'

dump roles.sql --role-only
dump schema.sql
dump data.sql --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes
dump history_schema.sql --schema supabase_migrations
dump history_data.sql --schema supabase_migrations --data-only --use-copy
[[ -s schema.sql && -s data.sql ]] || deny 'arquivo de esquema/dados vazio'
sha256sum roles.sql schema.sql data.sql history_schema.sql history_data.sql > manifest.sha256
printf '%s\n' \
 'project_ref=yivkqyjdeouxnwtwfekc' \
 'environment=TESTES' \
 'backup_kind=logical_sql' \
 'g1_restoration_verified=false' \
 'storage_physical_objects_included=false' > manifest.txt
bundle="$tmp/g1-bundle.tar.gz"
tar -czf "$bundle" roles.sql schema.sql data.sql history_schema.sql \
  history_data.sql manifest.sha256 manifest.txt
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
print(json.dumps({'path':'/'+os.environ['G1_BACKUP_FILE_NAME'],
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
