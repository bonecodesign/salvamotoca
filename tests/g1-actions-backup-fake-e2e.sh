#!/usr/bin/env bash
# G1: no network, no credentials. Mocks intercept ALL potential endpoints.
set -euo pipefail
umask 077
for c in python3 age age-keygen tar sha256sum bash; do command -v "$c" >/dev/null; done
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/runner"
export RUNNER_TEMP="$tmp/runner"
export GITHUB_REPOSITORY='bonecodesign/salvamotoca'
export GITHUB_REF='refs/heads/main'
export GITHUB_EVENT_NAME='workflow_dispatch'
export GITHUB_RUN_ID='00042'
export G1_BACKUP_ENABLED='true'
export G1_CONFIRM='BACKUP_TESTES_SALVAMOTOCA'
# All credentials and hosts are explicitly FICTIONAL, sent only to mocks.
export G1_SUPABASE_DB_URL='postgresql://postgres.yivkqyjdeouxnwtwfekc:fictional-password@fake-sandbox.pooler.supabase.com:5432/postgres?sslmode=require'
export G1_DROPBOX_ACCESS_TOKEN='fictional-test-token-only'
export G1_FAKE_UPLOAD="$tmp/encrypted-received.age"
export G1_FAKE_INVENTORY_COUNTER="$tmp/inventory-counter"

age-keygen -o "$tmp/fake-identity.txt" 2>/dev/null
export G1_AGE_RECIPIENT="$(age-keygen -y "$tmp/fake-identity.txt")"

cat > "$tmp/bin/psql" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "$G1_SUPABASE_DB_URL" ]]
if [[ "$*" == *'select count(*) from storage.objects;'* ]]; then
 printf '%s\n' "${G1_FAKE_STORAGE_OBJECTS:-0}"
elif [[ "$*" == *'jsonb_build_object('* ]]; then
 num=0
 if [[ -f "$G1_FAKE_INVENTORY_COUNTER" ]]; then
   num="$(cat "$G1_FAKE_INVENTORY_COUNTER")"
 fi
 num=$((num + 1))
 printf '%s' "$num" > "$G1_FAKE_INVENTORY_COUNTER"
 prospected=36
 if [[ "${G1_FAKE_INVENTORY_DRIFT:-}" == "true" && "$num" -ge 2 ]]; then
   prospected=37
 fi
 printf '{"auth_users":0,"service_requests":0,"registered_providers":0,"prospected_providers":%d,"prospecting_offers":40,"commercial_config":1,"migration_versions":11,"storage_objects":0}\n' "$prospected"
else
 echo 'Unknown SQL attempted by mock' >&2; exit 5
fi
MOCK
cat > "$tmp/bin/supabase" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == db && "$2" == dump ]]
[[ " $* " == *"--remote=$G1_SUPABASE_DB_URL"* ]]
out=''
while (($#)); do
 if [[ "$1" == '-f' ]]; then shift; out="$1"; break; fi
 shift
done
case "$out" in
 roles.sql|schema.sql|data.sql|history_schema.sql|history_data.sql) ;;
 *) exit 3;;
esac
printf '%s\n' "-- mock SQL for $out" 'select 1;' > "$out"
if [[ "$out" == 'data.sql' ]]; then
 if [[ "${G1_FAKE_DROP_TABLE:-}" != "true" ]]; then
   printf '%s\n' 'COPY public.prestadores_prospeccao (id) FROM stdin;' >> "$out"
 fi
 printf '%s\n' 'COPY public.ofertas_prospeccao (id) FROM stdin;' \
  'COPY public.configuracao_comercial (id) FROM stdin;' >> "$out"
fi
MOCK
cat > "$tmp/bin/curl" <<'MOCK'
#!/usr/bin/env python3
import os, sys, shutil, json, hashlib
args=sys.argv[1:]
assert 'https://content.dropboxapi.com/2/files/upload' in args
assert '--data-binary' in args
path=args[args.index('--data-binary')+1]
assert path.startswith('@')
path=path[1:]
assert os.environ['G1_DROPBOX_ACCESS_TOKEN'] in ' '.join(args)
with open(path,'rb') as fp: data=fp.read()
assert data.startswith(b'age-encryption.org/v1\n'), 'only ciphertext may be uploaded'
shutil.copyfile(path,os.environ['G1_FAKE_UPLOAD'])
blocks=[hashlib.sha256(data[i:i+4*1024*1024]).digest() for i in range(0,len(data),4*1024*1024)]
digest=hashlib.sha256(b''.join(blocks)).hexdigest()
if os.getenv('G1_FAKE_BAD_HASH')=='true': digest='0'*64
print(json.dumps({'size':len(data),'content_hash':digest,'name':os.environ['G1_BACKUP_FILE_NAME']}))
MOCK
chmod 700 "$tmp/bin/"*
export PATH="$tmp/bin:$PATH"
script='scripts/g1-actions-backup-real.sh'

# Reject another project before touching any database. Still uses only mocks.
bad_url="$(printf '%s' "$G1_SUPABASE_DB_URL" | sed 's/yivkqyjdeouxnwtwfekc/differentref00000000000/')"
if G1_SUPABASE_DB_URL="$bad_url" bash "$script" > "$tmp/invalid.log" 2>&1; then
 echo 'FAIL: unexpected DB URL accepted'; exit 1
fi
grep -q 'conexão não corresponde' "$tmp/invalid.log"

if G1_FAKE_STORAGE_OBJECTS=2 bash "$script" > "$tmp/objects.log" 2>&1; then
 echo 'FAIL: object storage data silently excluded'; exit 1
fi
grep -q 'Storage não está vazio' "$tmp/objects.log"
[[ ! -e "$tmp/encrypted-received.age" ]]

# Real script runs end-to-end, but mock SQL and mock Dropbox only.
bash "$script" > "$tmp/ok.log" 2>&1
grep -q 'G1_ENCRYPTED_BACKUP_UPLOADED_PRIVATE_DROPBOX=CONFIRMED' "$tmp/ok.log"
grep -q 'G1=BLOCKED' "$tmp/ok.log"
test -s "$tmp/encrypted-received.age"
age -d -i "$tmp/fake-identity.txt" -o "$tmp/restored.tar.gz" "$tmp/encrypted-received.age"
mkdir "$tmp/unpacked"
tar -xzf "$tmp/restored.tar.gz" -C "$tmp/unpacked"
(cd "$tmp/unpacked" && sha256sum -c manifest.sha256 >/dev/null)
for f in roles.sql schema.sql data.sql history_schema.sql history_data.sql; do
 test -s "$tmp/unpacked/$f"
done
grep -q 'g1_restoration_verified=false' "$tmp/unpacked/manifest.txt"

# Verificador rigoroso: decrypt sem extrair SQL, allowlist tar, SHA256,
# metadados, inventário e cabeçalhos COPY. Só chaves FICTÍCIAS em CI.
G1_SYNTHETIC_CI_ONLY=true python3 scripts/g1-verify-encrypted-bundle.py \
  --archive "$tmp/encrypted-received.age" \
  --identity "$tmp/fake-identity.txt" > "$tmp/integrity-ok.log"
grep -q 'G1_ENCRYPTED_ARCHIVE_INTEGRITY=PASS' "$tmp/integrity-ok.log"
grep -q 'G1_RESTORATION_VERIFIED=FALSE' "$tmp/integrity-ok.log"

# Arquivo age adulterado: a autenticação criptográfica deve rejeitar.
python3 - "$tmp/encrypted-received.age" "$tmp/corrupt.age" <<'PY'
from pathlib import Path
import sys
raw=bytearray(Path(sys.argv[1]).read_bytes())
raw[-1] ^= 1
Path(sys.argv[2]).write_bytes(raw)
PY
if G1_SYNTHETIC_CI_ONLY=true python3 scripts/g1-verify-encrypted-bundle.py \
  --archive "$tmp/corrupt.age" --identity "$tmp/fake-identity.txt" \
  > "$tmp/corrupt.log" 2>&1; then
 echo 'FAIL: tampered ciphertext accepted'; exit 1
fi
grep -q 'G1_ARCHIVE_REJECTED=' "$tmp/corrupt.log"

# Arquivo TAR com caminho malicioso nunca deve ser extraído.
python3 - "$tmp/restored.tar.gz" "$tmp/path-traversal.tar.gz" <<'PY'
import sys,tarfile,io
with tarfile.open(sys.argv[1], 'r:gz') as source:
 with tarfile.open(sys.argv[2], 'w:gz') as target:
  for m in source.getmembers():
   target.addfile(m,source.extractfile(m))
  payload=b'not-allowed'
  malicious=tarfile.TarInfo('../../unsafe.sql')
  malicious.size=len(payload)
  target.addfile(malicious,io.BytesIO(payload))
PY
age -r "$G1_AGE_RECIPIENT" -o "$tmp/path-traversal.age" "$tmp/path-traversal.tar.gz"
if G1_SYNTHETIC_CI_ONLY=true python3 scripts/g1-verify-encrypted-bundle.py \
 --archive "$tmp/path-traversal.age" --identity "$tmp/fake-identity.txt" \
 > "$tmp/traversal.log" 2>&1; then
 echo 'FAIL: traversal archive accepted'; exit 1
fi
grep -q 'UNEXPECTED_OR_MISSING_ARCHIVE_FILES' "$tmp/traversal.log"

# A cifra pode estar válida, mas o dado alterado sem atualizar o manifesto
# SHA256 continua inválido (testa ataque pós-decriptografia).
python3 - "$tmp/restored.tar.gz" "$tmp/modified.tar.gz" <<'PY'
import sys,tarfile,io
with tarfile.open(sys.argv[1],'r:gz') as source:
 with tarfile.open(sys.argv[2],'w:gz') as target:
  for m in source.getmembers():
   data=source.extractfile(m).read()
   if m.name=='data.sql':
    data+=b'\n-- tampered fictional data\n'
    m.size=len(data)
   target.addfile(m,io.BytesIO(data))
PY
age -r "$G1_AGE_RECIPIENT" -o "$tmp/modified.age" "$tmp/modified.tar.gz"
if G1_SYNTHETIC_CI_ONLY=true python3 scripts/g1-verify-encrypted-bundle.py \
  --archive "$tmp/modified.age" --identity "$tmp/fake-identity.txt" \
  > "$tmp/modified.log" 2>&1; then
 echo 'FAIL: modified SQL accepted despite stale SHA256'; exit 1
fi
grep -q 'MANIFEST_SHA256_MISMATCH' "$tmp/modified.log"

python3 - "$tmp/unpacked/source_inventory_before.json" <<'PY'
import sys,json
with open(sys.argv[1],encoding='utf-8') as f: d=json.load(f)
assert d['prospected_providers']==36 and d['prospecting_offers']==40
PY


# Reject silently incomplete application data before encryption/upload.
rm -f "$tmp/inventory-counter"
if G1_FAKE_DROP_TABLE=true bash "$script" > "$tmp/partial.log" 2>&1; then
 echo 'FAIL: incomplete dump accepted'; exit 1
fi
grep -q 'não inclui tabela essencial' "$tmp/partial.log"
# Do not publish a backup spanning two different source row-count states.
rm -f "$tmp/inventory-counter"
if G1_FAKE_INVENTORY_DRIFT=true bash "$script" > "$tmp/drift.log" 2>&1; then
 echo 'FAIL: changed source inventory accepted'; exit 1
fi
grep -q 'contagens mudaram' "$tmp/drift.log"

# Simulate corrupted remote hash even when uploader returns success.
if G1_FAKE_BAD_HASH=true bash "$script" > "$tmp/badhash.log" 2>&1; then
 echo 'FAIL: corrupt Dropbox response accepted'; exit 1
fi
grep -q 'não comprovou integridade' "$tmp/badhash.log"
if grep -F 'fictional-password' "$tmp/"*.log >/dev/null ||
   grep -F 'fictional-test-token-only' "$tmp/"*.log >/dev/null; then
 echo 'FAIL: secret leaked to logs'; exit 1
fi
echo 'G1_MOCK_FULL_PIPELINE=PASS'
echo 'G1_FOREIGN_PROJECT=REJECTED'
echo 'G1_STORAGE_WITH_OBJECTS=REJECTED'
echo 'G1_CORRUPT_REMOTE_HASH=REJECTED'
echo 'G1_MISSING_ESSENTIAL_TABLE=REJECTED'
echo 'G1_SOURCE_INVENTORY_DRIFT=REJECTED'
echo 'REAL_SUPABASE_AND_DROPBOX_ACCESSED=FALSE'
echo 'G1_PRIVATE_ARCHIVE_VERIFIER=PASS'
echo 'G1_TAMPERED_AGE=REJECTED'
echo 'G1_UNSAFE_TAR_PATH=REJECTED'
echo 'G1_CHANGED_SQL_WITH_OLD_HASH=REJECTED'
echo 'G1=BLOCKED'
