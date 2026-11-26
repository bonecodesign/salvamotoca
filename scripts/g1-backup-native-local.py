#!/usr/bin/env python3
"""Native Windows G1 export candidate. No Docker, Dropbox API, or GitHub secrets.
Run only on the founder's private computer. Does not prove restore or release.
"""
import datetime
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import urllib.parse
import uuid

ROOT = Path(__file__).resolve().parent
MANAGED_SQL = """
    select jsonb_build_object(
      'auth_users',(select count(*) from auth.users),
      'auth_identities',(select count(*) from auth.identities),
      'auth_sessions',(select count(*) from auth.sessions),
      'auth_refresh_tokens',(select count(*) from auth.refresh_tokens),
      'auth_mfa_factors',(select count(*) from auth.mfa_factors),
      'auth_flow_state',(select count(*) from auth.flow_state),
      'storage_objects',(select count(*) from storage.objects),
      'storage_policy_count',(select count(*) from pg_policies
         where schemaname='storage' and tablename='objects'),
      'storage_policy_sha256',(select encode(sha256(convert_to(
         coalesce(jsonb_agg(to_jsonb(p) order by p.policyname),'[]'::jsonb)::text,
         'UTF8')),'hex') from pg_policies p
         where p.schemaname='storage' and p.tablename='objects'),
      'storage_buckets',(select coalesce(jsonb_agg(jsonb_build_object(
        'name',b.id,
        'private',not b.public,
        'file_size_limit',b.file_size_limit,
        'allowed_mime_types',b.allowed_mime_types
      ) order by b.id),'[]'::jsonb) from storage.buckets b)
    )::text;"""
CATALOG_SQL = """select coalesce(jsonb_agg(jsonb_build_object(
'schema',n.nspname,'table',c.relname,'rls',c.relrowsecurity,
'kind',c.relkind,'policies',(select count(*) from pg_policies p
 where p.schemaname=n.nspname and p.tablename=c.relname))
 order by n.nspname,c.relname),'[]'::jsonb)::text
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','supabase_migrations') and c.relkind in ('r','p')
 and c.relpersistence<>'t';"""
ROLES_SQL = """select jsonb_build_object(
'roles',(select coalesce(jsonb_agg(to_jsonb(r) order by r.rolname),'[]'::jsonb)
 from (select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
 rolreplication,rolbypassrls from pg_roles) r),
'memberships',(select coalesce(jsonb_agg(jsonb_build_object(
 'role',r.rolname,'member',m.rolname,'admin_option',a.admin_option,
 'inherit_option',a.inherit_option,'set_option',a.set_option)
 order by r.rolname,m.rolname),'[]'::jsonb)
 from pg_auth_members a join pg_roles r on r.oid=a.roleid
 join pg_roles m on m.oid=a.member))::text;"""


class Blocked(Exception):
    pass


def load_guard(name):
    spec = importlib.util.spec_from_file_location("g1_guard", ROOT / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def command(args, env, label, timeout=300):
    try:
        p = subprocess.run(args, env=env, capture_output=True,
                           timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise Blocked(label) from None
    if p.returncode:
        raise Blocked(label)
    # Raw stdout is never printed. May contain private metadata.
    return p.stdout


def pg_env(uri):
    load_guard("g1-validate-db-url.py").check(uri)
    p = urllib.parse.urlsplit(uri)
    env = {k:v for k,v in os.environ.items() if not k.upper().startswith("PG")}
    env.update(PGHOST=p.hostname, PGPORT=str(p.port), PGDATABASE="postgres",
               PGUSER=urllib.parse.unquote(p.username),
               PGPASSWORD=urllib.parse.unquote(p.password),
               PGSSLMODE=dict(urllib.parse.parse_qsl(p.query)).get("sslmode","require"),
               PGCONNECT_TIMEOUT="15", PGOPTIONS="-c default_transaction_read_only=on")
    return env


def tools_ready():
    paths = {}
    for name in ("psql","pg_dump","pg_restore","age"):
        path = shutil.which(name)
        if not path:
            raise Blocked("FERRAMENTA_AUSENTE_" + name)
        paths[name] = path
    clean = {k:v for k,v in os.environ.items() if not k.upper().startswith("PG")}
    for name in ("psql","pg_dump","pg_restore"):
        out = command([paths[name],"--version"], clean, "VERSAO_"+name)
        if not re.search(rb"PostgreSQL\) 17(?:\.|\s|$)",out):
            raise Blocked("REQUER_POSTGRESQL_17_"+name)
    return paths


def validate_catalog(catalog):
    if not isinstance(catalog,list) or not catalog:
        raise Blocked("CATALOGO_INVALIDO")
    names = set()
    for item in catalog:
        if (set(item) != {"schema","table","rls","kind","policies"}
                or item["schema"] not in {"public","supabase_migrations"}
                or not re.fullmatch(r"[a-z_][a-z0-9_]*",item["table"])
                or item["kind"] != "r"
                or type(item["rls"]) is not bool
                or type(item["policies"]) is not int or item["policies"]<0
                or (item["schema"]=="public" and not item["rls"])):
            raise Blocked("CATALOGO_FORA_DO_ESCOPO")
        names.add((item["schema"],item["table"]))
    required = {("public",t) for t in ("prestadores_prospeccao","ofertas_prospeccao",
                                       "configuracao_comercial","service_requests","providers")}
    if len(names)!=len(catalog) or not required.union({("supabase_migrations","schema_migrations")}).issubset(names):
        raise Blocked("TABELAS_ESSENCIAIS_AUSENTES")
    return names


def validate_toc(raw, names):
    toc = raw.decode("utf-8","replace")
    for schema, table in names:
        for kind in ("TABLE","TABLE DATA"):
            if not re.search(r"^\d+; \d+ \d+ "+kind+r" "+schema+r" "+table+r"\s",toc,re.M):
                raise Blocked("COBERTURA_TOC_INCOMPLETA")


def snapshot(paths, env):
    def query(sql):
        return json.loads(command([paths["psql"],"-X","-tA","-w","-v","ON_ERROR_STOP=1","-c",sql],env,"CONSULTA_READONLY").decode("utf-8"))
    managed = query(MANAGED_SQL)
    load_guard("g1-verify-managed-scope.py").validate(managed)
    catalog = query(CATALOG_SQL)
    names = validate_catalog(catalog)
    counts = {}
    for schema,table in sorted(names):
        # identifiers already constrained to [a-z_][a-z0-9_] and fixed schemas
        counts[schema+"."+table] = query('select count(*) from "'+schema+'"."'+table+'";')
    return {"managed":managed,"catalog":catalog,"counts":counts,"roles_metadata":query(ROLES_SQL)}


def backup(root, uri, recipient, paths):
    if not re.fullmatch(r"age1[0-9a-z]{58}",recipient):
        raise Blocked("RECIPIENT_PUBLICO_INVALIDO")
    env = pg_env(uri)
    clean = {k:v for k,v in env.items() if not k.upper().startswith("PG")}
    root.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="g1-stage-",dir=root) as tmp:
        stage = Path(tmp)
        before = snapshot(paths,env)
        dump = stage/"database.dump"
        # Single PostgreSQL custom-format dump: one consistent transaction
        # snapshot for both application schemas. No managed Auth/Storage bytes.
        command([paths["pg_dump"],"-w","--format=custom","--schema=public",
                 "--schema=supabase_migrations","--file",str(dump)],env,"PG_DUMP_FALHOU",1200)
        if not dump.is_file() or dump.stat().st_size<=0:
            raise Blocked("DUMP_VAZIO")
        toc = command([paths["pg_restore"],"--list",str(dump)],clean,"TOC_INVALIDO")
        validate_toc(toc,validate_catalog(before["catalog"]))
        after = snapshot(paths,env)
        if before != after:
            raise Blocked("ORIGEM_MUDOU_DURANTE_EXPORTACAO")
        (stage/"inventory.json").write_text(json.dumps(before,sort_keys=True),encoding="utf-8")
        (stage/"toc.txt").write_bytes(toc)
        files = ["database.dump","inventory.json","toc.txt"]
        manifest = {"project_ref":"yivkqyjdeouxnwtwfekc","environment":"TESTES",
                    "format":"native-pg17-custom-v1","restore_verified":False,
                    "managed_auth_storage_restorable":False,
                    "role_metadata_only":True,
                    "files":{n:hashlib.sha256((stage/n).read_bytes()).hexdigest() for n in files}}
        (stage/"manifest.json").write_text(json.dumps(manifest,sort_keys=True),encoding="utf-8")
        bundle = stage/"bundle.tar.gz"
        with tarfile.open(bundle,"w:gz") as tar:
            for name in files+["manifest.json"]:
                tar.add(stage/name,arcname=name,recursive=False)
        encrypted = stage/"bundle.age"
        command([paths["age"],"-r",recipient,"-o",str(encrypted),str(bundle)],clean,"CIFRAGEM_FALHOU")
        if not encrypted.is_file() or not 0<encrypted.stat().st_size<=100*1024*1024:
            raise Blocked("CIFRA_VAZIA_OU_ACIMA_LIMITE")
        digest = hashlib.sha256(encrypted.read_bytes()).hexdigest()
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        target = root/("SalvaMotoca-TESTES-NATIVE-"+stamp+"-"+uuid.uuid4().hex[:12]+".tar.gz.age")
        encrypted.rename(target)
        return target,digest


def main():
    if os.name!="nt" or os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
        print("G1 INTERROMPIDO: executar apenas no Windows privado, fora de CI.")
        return 23
    try:
        paths = tools_ready()
        root = Path(os.environ["LOCALAPPDATA"])/"SalvaMotoca"/"backups-privados-native"
        if root.resolve().is_relative_to(ROOT.parent.resolve()):
            raise Blocked("DESTINO_DENTRO_DO_REPOSITORIO")
        if input("Digite BACKUP_TESTES_SALVAMOTOCA: ")!="BACKUP_TESTES_SALVAMOTOCA":
            raise Blocked("CONFIRMACAO_AUSENTE")
        uri = getpass.getpass("URL Session Pooler do Supabase TESTES (oculta): ")
        recipient = input("Recipient PUBLICO age existente (age1...): ").strip()
        target,digest = backup(root,uri,recipient,paths)
        print("BACKUP_LOCAL_CIFRADO="+str(target))
        print("SHA256="+digest)
        print("Copie SOMENTE o .age para o cofre privado existente pelo Dropbox normal.")
        print("RESTAURACAO=NAO_COMPROVADA; G1=BLOCKED; RELEASE=NO_GO")
        return 0
    except Blocked as error:
        print("G1 INTERROMPIDO: "+str(error))
    except Exception:
        print("G1 INTERROMPIDO: configuração, escopo ou execução inválida; sem diagnóstico sensível.")
    return 23


if __name__=="__main__":
    raise SystemExit(main())
