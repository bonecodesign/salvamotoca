/**
 * Salva Motoca! — G1 source-vs-restored catalog fingerprint comparison.
 * LOCAL ONLY. Does NOT fetch, dump, restore, or certify provenance.
 * Expected input: results of docs/G1_CATALOG_FINGERPRINT_READONLY.sql
 * saved privately during the REAL backup and the independent local restore.
 *
 * --plan = no file access. --compare requires private files OUTSIDE the repo.
 * This tool must never return GO. Identical hashes can be fabricated and
 * MD5 is a drift indicator, not proof of backup/authenticity or storage bytes.
 */
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const REF='yivkqyjdeouxnwtwfekc';
export const KINDS=Object.freeze([
 'relation','column','policy','function',
 'constraint','index','trigger','bucket'
]);
export const COUNT_FIELDS=Object.freeze([
 'auth_users','auth_sessions','requests','quotes','payments',
 'storage_objects','request_photos','migration_count'
]);
const HEX=/^[a-f0-9]{32}$/i;
const REPO=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function err(label){throw new Error('G1_CATALOG_COMPARE_FAIL_'+label)}
function jsonFile(path){
 if(!isAbsolute(path||''))err('PRIVATE_ABSOLUTE_PATH_REQUIRED');
 let st,real;
 try{st=lstatSync(path);real=realpathSync(path)}
 catch{err('EVIDENCE_FILE_NOT_FOUND')}
 if(!st.isFile()||st.isSymbolicLink()||st.size<30||st.size>16384)
  err('PRIVATE_EVIDENCE_FILE_INVALID');
 if(real===REPO||real.startsWith(REPO+sep))
  err('EVIDENCE_MUST_STAY_OUTSIDE_REPOSITORY');
 try{
  return {real,value:JSON.parse(readFileSync(real,'utf8'))};
 }catch{err('EVIDENCE_JSON_INVALID')}
}
export function parseArgs(args){
 if(args.length===1&&args[0]==='--plan')return {mode:'plan'};
 if(args.length===5&&args[0]==='--compare'&&args[1]==='--source'&&
  args[3]==='--restore'&&args[2]!==args[4])
  return{mode:'compare',source:args[2],restore:args[4]};
 err('ARGS_INVALID');
}
export function validateSnapshot(input,{now=Date.now(),kind='source'}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))err('INVALID_INPUT');
 const x=input.g1_catalog_evidence||input;
 if(x.format!=='g1_catalog_fingerprint_v1'||x.project_ref!==REF
  ||x.postgres_major!==17
  ||x.algorithm!=='md5_for_drift_only_not_source_attestation'
  ||!HEX.test(x.overall_catalog_md5||''))err('FORMAT_PROJECT_VERSION_OR_HASH');
 if(!x.components||typeof x.components!=='object'||
   Object.keys(x.components).length!==KINDS.length)err('COMPONENTS_INCOMPLETE');
 for(const k of KINDS){
  const c=x.components[k];
  if(!c||!Number.isSafeInteger(c.objects)||c.objects<1||
    !HEX.test(c.digest||''))err('COMPONENT_INVALID_'+k);
 }
 if(!x.source_counts||typeof x.source_counts!=='object')
  err('MISSING_SOURCE_COUNTS');
 for(const field of COUNT_FIELDS){
  if(!Number.isSafeInteger(x.source_counts[field])||
    x.source_counts[field]<0)err('INVALID_COUNT_'+field);
 }
 if(x.source_counts.request_photos>x.source_counts.storage_objects)
  err('STORAGE_COUNT_INCONSISTENT');
 const captured=Date.parse(x.captured_utc||'');
 if(!Number.isFinite(captured)||captured>now+300000||
   now-captured>7*86400000)err('TIMESTAMP_INVALID_OR_STALE_'+kind);
 return {...x,capturedAt:captured};
}
export function compareSnapshots(source,restored,{now=Date.now()}={}){
 const a=validateSnapshot(source,{now,kind:'source'});
 const b=validateSnapshot(restored,{now,kind:'restore'});
 if(b.capturedAt<a.capturedAt)err('RESTORE_EVIDENCE_BEFORE_SOURCE');
 const differingKinds=KINDS.filter(k=>
  a.components[k].digest.toLowerCase()!==b.components[k].digest.toLowerCase()
  ||a.components[k].objects!==b.components[k].objects);
 const differentCounts=COUNT_FIELDS.filter(k=>
  a.source_counts[k]!==b.source_counts[k]);
 const overallMismatch=a.overall_catalog_md5.toLowerCase()!==
  b.overall_catalog_md5.toLowerCase();
 if(differingKinds.length||differentCounts.length||overallMismatch)
  err('STRUCTURAL_DRIFT_'+[
   ...(differingKinds.length?['CATALOG_COMPONENTS']:[]),
   ...(differentCounts.length?['COUNTS']:[]),
   ...(overallMismatch?['OVERALL_HASH']:[])
  ].join('_'));
 return Object.freeze({
  catalog_components_checked:KINDS.length,
  count_fields_checked:COUNT_FIELDS.length,
  structure_match:true,source_count_match:true,
  source_backup_proven:false,actual_restore_proven:false,
  auth_recovery_proven:false,storage_bytes_proven:false,
  independent_review_proven:false,
  decision:'REVIEW_REQUIRED_NO_GO',
  reason:'Equal drift hashes do not prove backup source, restored database provenance or Auth/Storage recovery.'
 });
}
export function plan(){
 return Object.freeze({
  mode:'NO_FILES_NO_NETWORK',
  source:'Capture SQL at time of authenticated private database export',
  restore:'Run EXACT same SQL only on independently restored local PostgreSQL 17',
  verify:'Compare two PRIVATE JSON files outside repository; never expose credentials',
  separate_proofs:['G1-E01 source export','G1-E02 SHA256 export artifacts',
   'G1-E03 restore transcript','G1-E04 catalog and data counts',
   'G1-E05 Auth recoverability','G1-E06 Storage original bytes',
   'G1-E07 no side effects','G1-E08 human audit'],
  decision:'REVIEW_REQUIRED_NO_GO'
 });
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 try{
  const args=parseArgs(process.argv.slice(2));
  if(args.mode==='plan')console.log(JSON.stringify(plan(),null,2));
  else{
   const a=jsonFile(args.source),b=jsonFile(args.restore);
   if(a.real===b.real)err('SOURCE_AND_RESTORE_SAME_FILE');
   console.log(JSON.stringify(compareSnapshots(a.value,b.value),null,2));
  }
 }catch(e){
  // Never echo paths, evidence data or any SQL connection details.
  const label=String(e.message);
  console.error(/^G1_CATALOG_COMPARE_FAIL_[A-Z0-9_]+$/.test(label)
   ?label:'G1_CATALOG_COMPARE_FAIL_UNEXPECTED');
  process.exitCode=1;
 }
}
