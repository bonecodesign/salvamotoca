import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,symlinkSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {REF,KINDS,COUNT_FIELDS,parseArgs,validateSnapshot,compareSnapshots,plan}
 from '../scripts/g1-catalog-fingerprint-compare.mjs';

const script=fileURLToPath(new URL('../scripts/g1-catalog-fingerprint-compare.mjs',import.meta.url));
const HASH='0123456789abcdef0123456789abcdef';
function sample(time=Date.now(),opts={}){
 return {
  format:'g1_catalog_fingerprint_v1',
  algorithm:'md5_for_drift_only_not_source_attestation',
  project_ref:REF,postgres_major:17,captured_utc:new Date(time).toISOString(),
  overall_catalog_md5:HASH,
  components:Object.fromEntries(KINDS.map((k,i)=>[k,{objects:i+1,digest:HASH}])),
  source_counts:Object.fromEntries(COUNT_FIELDS.map(k=>[k,0])),...opts
 };
}
test('Plano offline nao abre arquivos e nao promove release',()=>{
 assert.deepEqual(parseArgs(['--plan']),{mode:'plan'});
 const p=plan();
 assert.equal(p.mode,'NO_FILES_NO_NETWORK');
 assert.equal(p.decision,'REVIEW_REQUIRED_NO_GO');
 assert.ok(p.separate_proofs.includes('G1-E05 Auth recoverability'));
 assert.ok(p.separate_proofs.includes('G1-E06 Storage original bytes'));
 const out=execFileSync(process.execPath,[script,'--plan'],{encoding:'utf8'});
 assert.match(out,/REVIEW_REQUIRED_NO_GO/);
});
test('Fingerprints identicos nunca autenticam origem ou restauracao',()=>{
 const now=Date.now();
 const same=compareSnapshots(sample(now-2000),sample(now-1000),{now});
 assert.equal(same.structure_match,true);
 assert.equal(same.catalog_components_checked,8);
 assert.equal(same.count_fields_checked,8);
 for(const field of ['source_backup_proven','actual_restore_proven',
  'auth_recovery_proven','storage_bytes_proven','independent_review_proven'])
  assert.equal(same[field],false,field);
 assert.equal(same.decision,'REVIEW_REQUIRED_NO_GO');
});
test('Detecta drift de oito classes de catalogo',()=>{
 const now=Date.now();
 for(const kind of KINDS){
  const a=sample(now-2000),b=sample(now-1000);
  b.components[kind].digest='ffffffffffffffffffffffffffffffff';
  assert.throws(()=>compareSnapshots(a,b,{now}),/STRUCTURAL_DRIFT_CATALOG_COMPONENTS/);
  const c=sample(now-1000);c.components[kind].objects+=1;
  assert.throws(()=>compareSnapshots(a,c,{now}),/STRUCTURAL_DRIFT_CATALOG_COMPONENTS/);
 }
});
test('Detecta drift em oito contagens de dados e metadados',()=>{
 const now=Date.now();
 for(const field of COUNT_FIELDS){
  const a=sample(now-2000),b=sample(now-1000);
  b.source_counts[field]=1;
  if(field==='request_photos')b.source_counts.storage_objects=1;
  assert.throws(()=>compareSnapshots(a,b,{now}),/STRUCTURAL_DRIFT_COUNTS/);
 }
});
test('Recusa mudanca apenas de hash geral',()=>{
 const now=Date.now();
 assert.throws(()=>compareSnapshots(sample(now-2000),
  sample(now-1000,{overall_catalog_md5:'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'}),{now}),
  /STRUCTURAL_DRIFT_OVERALL_HASH/);
});
test('Recusa projeto errado, PG16, hash invalido e componente ausente',()=>{
 const now=Date.now();
 assert.throws(()=>validateSnapshot(sample(now,{project_ref:'fake'}),{now}),/FORMAT_PROJECT_VERSION_OR_HASH/);
 assert.throws(()=>validateSnapshot(sample(now,{postgres_major:16}),{now}),/FORMAT_PROJECT_VERSION_OR_HASH/);
 assert.throws(()=>validateSnapshot(sample(now,{overall_catalog_md5:'bad'}),{now}),/FORMAT_PROJECT_VERSION_OR_HASH/);
 const a=sample(now);delete a.components.policy;
 assert.throws(()=>validateSnapshot(a,{now}),/COMPONENTS_INCOMPLETE/);
 const b=sample(now);b.components.function.objects=0;
 assert.throws(()=>validateSnapshot(b,{now}),/COMPONENT_INVALID_function/);
});
test('Recusa evidencia antiga, futura, ou restore anterior a captura de origem',()=>{
 const now=Date.now();
 assert.throws(()=>validateSnapshot(sample(now-8*86400000),{now}),/TIMESTAMP_INVALID_OR_STALE/);
 assert.throws(()=>validateSnapshot(sample(now+600000),{now}),/TIMESTAMP_INVALID_OR_STALE/);
 assert.throws(()=>compareSnapshots(sample(now-1000),sample(now-2000),{now}),
  /RESTORE_EVIDENCE_NOT_AFTER_SOURCE/);
});
test('Contagens negativas ou Storage sem metadata correspondente falham',()=>{
 const now=Date.now();const a=sample(now);a.source_counts.auth_users=-1;
 assert.throws(()=>validateSnapshot(a,{now}),/INVALID_COUNT_auth_users/);
 const b=sample(now);b.source_counts.request_photos=1;
 assert.throws(()=>validateSnapshot(b,{now}),/STORAGE_COUNT_INCONSISTENT/);
});
test('CLI exige dois caminhos privados e distintos',()=>{
 assert.equal(parseArgs(['--compare','--source','/private/source.json',
  '--restore','/private/restore.json']).mode,'compare');
 for(const args of [
  ['--compare','--source','/private/a.json','--restore','/private/a.json'],
  ['--run'],['--compare','--host','db.supabase.co','--source','x']
 ])assert.throws(()=>parseArgs(args),/ARGS_INVALID/);
});
test('CLI permite ficheiros locais fora do GitHub mas recusa symlink e repo',t=>{
 const now=Date.now(),folder=mkdtempSync(join(tmpdir(),'g1-compare-offline-'));
 t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const a=join(folder,'source.json'),b=join(folder,'restore.json'),link=join(folder,'alias.json');
 writeFileSync(a,JSON.stringify(sample(now-2000)));
 writeFileSync(b,JSON.stringify(sample(now-1000)));
 const out=execFileSync(process.execPath,[script,'--compare','--source',a,'--restore',b],{encoding:'utf8'});
 assert.equal(JSON.parse(out).decision,'REVIEW_REQUIRED_NO_GO');
 symlinkSync(a,link);
 const bad=spawnSync(process.execPath,[script,'--compare','--source',link,'--restore',b],{encoding:'utf8'});
 assert.notEqual(bad.status,0);
 assert.match(bad.stderr,/PRIVATE_EVIDENCE_FILE_INVALID/);
 const repoBad=spawnSync(process.execPath,[script,'--compare','--source',script,'--restore',b],{encoding:'utf8'});
 assert.notEqual(repoBad.status,0);
 assert.match(repoBad.stderr,/EVIDENCE_MUST_STAY_OUTSIDE_REPOSITORY/);
});
test('Consulta de fingerprint so possui SELECT de metadados e contagens',()=>{
 const code=readFileSync(new URL('../docs/G1_CATALOG_FINGERPRINT_READONLY.sql',import.meta.url),'utf8');
 const sql=code.replace(/--[^\n]*/g,'');
 assert.match(sql,/^\s*with\s+catalog_objects as/i);
 for(const kind of KINDS)assert.ok(sql.includes("'"+kind+"'"),kind);
 for(const pattern of [/pg_get_functiondef/,/pg_get_constraintdef/,/relrowsecurity/,/pg_policies/,/storage\.buckets/])
  assert.match(sql,pattern);
 assert.doesNotMatch(sql,/\b(insert|update|delete|alter|drop|truncate|create|call|copy|grant|revoke)\b/i);
});
