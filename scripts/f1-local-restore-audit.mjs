// F1 — inspecao SOMENTE LOCAL de PostgreSQL restaurado.
// Confere catalogo e contagens; nao prova autenticidade do backup nem os bytes do Storage.
// Nunca recebe host remoto, URL de conexao nem envia logs ou dados pessoais.
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,isAbsolute,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PROJECT_REF='yivkqyjdeouxnwtwfekc';
const REPO=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const NUMBERS=['auth_users','service_requests','request_photo_metadata',
 'storage_total','request_policy_count','storage_policy_count','f1_rpc_names'];
export const BOOLEANS=['request_bucket_private','request_rls','storage_rls',
 'anon_can_select_requests','authenticated_can_select_requests'];
const SQL_CATALOG=[
 "SELECT json_build_object(",
 " 'postgres_version',current_setting('server_version_num')::integer,",
 " 'missing',coalesce((SELECT json_agg(t.name)",
 "   FROM (VALUES('auth.users'),('storage.buckets'),('storage.objects'),",
 "     ('public.service_requests')) t(name)",
 "   WHERE to_regclass(t.name) IS NULL),'[]'::json),",
 " 'roles',(SELECT count(*)::integer FROM pg_roles WHERE rolname IN ('anon','authenticated')),",
 " 'synthetic_fixture',to_regclass('private.backup_rehearsal_marker') IS NOT NULL",
 ")::text;"
].join('\n');
const SQL_COUNTS=[
 "SELECT json_build_object(",
 " 'auth_users',(SELECT count(*)::integer FROM auth.users),",
 " 'service_requests',(SELECT count(*)::integer FROM public.service_requests),",
 " 'request_photo_metadata',(SELECT count(*)::integer FROM storage.objects WHERE bucket_id='request-photos'),",
 " 'storage_total',(SELECT count(*)::integer FROM storage.objects),",
 " 'request_policy_count',(SELECT count(*)::integer FROM pg_policies WHERE schemaname='public' AND tablename='service_requests'),",
 " 'storage_policy_count',(SELECT count(*)::integer FROM pg_policies WHERE schemaname='storage' AND tablename='objects'),",
 " 'f1_rpc_names',(SELECT count(DISTINCT p.proname)::integer FROM pg_proc p",
 "   JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname IN",
 "   ('bj_answer_quote','bj_finish_request','bj_get_request_location',",
 "    'bj_ping_presence','bj_set_presence','bj_submit_quote')),",
 " 'request_bucket_private',(SELECT b.public IS FALSE FROM storage.buckets b WHERE b.id='request-photos'),",
 " 'request_rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.service_requests'::regclass),",
 " 'storage_rls',(SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass),",
 " 'anon_can_select_requests',has_table_privilege('anon','public.service_requests','SELECT'),",
 " 'authenticated_can_select_requests',has_table_privilege('authenticated','public.service_requests','SELECT')",
 ")::text;"
].join('\n');
const fail=message=>{throw new Error('F1_LOCAL_RESTORE_AUDIT_FAIL: '+message)};
function parseJson(raw) {
 try{return JSON.parse(String(raw).trim())}
 catch{fail('JSON invalido; conteudo nao sera exibido.')}
}
export function parseArgs(argv){
 if(argv.length===1&&argv[0]==='--plan')return {mode:'plan'};
 const p={};
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i],v=argv[i+1];
  if(!['--local-db','--expected','--port'].includes(k)||v===undefined||k in p)
    fail('Parametros invalidos. Consulte --plan.');
  p[k]=v;
 }
 if(!/^f1_[a-z0-9_]{1,45}_disposable$/.test(p['--local-db']||''))
   fail('Somente banco local descartavel f1_*_disposable.');
 const port=Number(p['--port']||5432);
 if(!Number.isSafeInteger(port)||port<1024||port>65535)fail('Porta local invalida.');
 if(!isAbsolute(p['--expected']||''))fail('Arquivo de contagens privado absoluto obrigatorio.');
 let st,real;
 try{st=lstatSync(p['--expected']);real=realpathSync(p['--expected'])}
 catch{fail('Arquivo de contagens nao encontrado.')}
 if(!st.isFile()||st.isSymbolicLink()||st.size>4096||st.size===0)
   fail('Arquivo de contagens invalido ou symlink.');
 if(real===REPO||real.startsWith(REPO+sep))fail('Nao manter contagens privadas no repositorio.');
 return {mode:'audit',database:p['--local-db'],port,expectedPath:real};
}
export function validateBaseline(data){
 if(!data||data.version!==1||data.project_ref!==PROJECT_REF||
   typeof data.snapshot!=='object'||data.snapshot===null)
   fail('Manifesto privado de contagens incorreto.');
 const ts=Date.parse(data.captured_at);
 if(!Number.isFinite(ts)||ts>Date.now()+300000||
    Date.now()-ts>7*24*60*60*1000)fail('Contagens nao sao recentes.');
 for(const f of NUMBERS)
  if(!Number.isSafeInteger(data.snapshot[f])||data.snapshot[f]<0)
    fail('Contagem invalida: '+f);
 for(const f of BOOLEANS)
  if(typeof data.snapshot[f]!=='boolean')fail('Booleano invalido: '+f);
 if(data.snapshot.f1_rpc_names!==6||!data.snapshot.request_bucket_private||
    !data.snapshot.request_rls||!data.snapshot.storage_rls)
   fail('Faltam seis RPCs ou protecoes basicas na origem.');
 if(data.snapshot.request_photo_metadata>data.snapshot.storage_total)
   fail('Inventario metadata incoerente.');
 return data.snapshot;
}
export function validateCatalog(value){
 if(!value||value.postgres_version<170000||value.postgres_version>=180000)
   fail('PostgreSQL 17 obrigatorio.');
 if(!Array.isArray(value.missing)||value.missing.length>0)
   fail('Tabelas Auth, Storage ou pedidos ausentes na restauracao.');
 if(value.roles!==2)fail('Roles Auth anon e authenticated ausentes.');
 if(value.synthetic_fixture)fail('Fixture CI nao pode passar por restauracao real.');
 return true;
}
export function compareBaseline(expected,actual){
 return [...NUMBERS,...BOOLEANS].filter(f=>expected[f]!==actual?.[f]);
}
function psqlLocal(database,port,sql){
 const args=['-X','-w','-q','-t','-A','-v','ON_ERROR_STOP=1',
  '-h','127.0.0.1','-p',String(port),'-U','postgres','-d',database,'-c',sql];
 const env={PATH:process.env.PATH||'/usr/bin:/bin',
  PGPASSWORD:process.env.F1_LOCAL_PGPASSWORD||'',
  PGCONNECT_TIMEOUT:'3',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=5000',
  PGAPPNAME:'f1_restore_local_audit'};
 const out=spawnSync('psql',args,{encoding:'utf8',env,timeout:12000,maxBuffer:16384});
 if(out.error||out.status!==0)fail('Falha na consulta local; confira psql, Postgres17 e credenciais privadas.');
 return parseJson(out.stdout);
}
export function plan(){
 return Object.freeze({
  mode:'PLAN_ONLY_NO_DB_CONNECTION',
  target:'127.0.0.1 f1_*_disposable PostgreSQL 17',
  sensitive_data_logged:false,storage_bytes_verified:false,
  backup_source_authenticated:false,restore_process_proven:false,
  decision:'REVIEW_REQUIRED_NO_GO'
 });
}
export function audit(options,reader=psqlLocal){
 if(options.mode!=='audit')fail('Modo invalido.');
 const baseline=validateBaseline(parseJson(readFileSync(options.expectedPath,'utf8')));
 const catalog=reader(options.database,options.port,SQL_CATALOG);
 validateCatalog(catalog);
 const actual=reader(options.database,options.port,SQL_COUNTS);
 const mismatches=compareBaseline(baseline,actual);
 if(mismatches.length)fail('Divergencia local no restore: '+mismatches.join(', '));
 return Object.freeze({
  project_ref:PROJECT_REF,local_catalog_match:true,
  baseline_counts_match:true,checked_fields:NUMBERS.length+BOOLEANS.length,
  source_backup_authenticated:false,storage_bytes_verified:false,
  restore_process_proven:false,decision:'REVIEW_REQUIRED_NO_GO'
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const p=parseArgs(process.argv.slice(2));
  process.stdout.write(JSON.stringify(p.mode==='plan'?plan():audit(p),null,2)+'\n');
 }catch(e){process.stderr.write(String(e.message).slice(0,320)+'\n');process.exitCode=1}
}
