import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs,validateBaseline,validateCatalog,compareBaseline,
 audit,plan,PROJECT_REF} from '../scripts/f1-local-restore-audit.mjs';

const counts=()=>({
 auth_users:0,service_requests:0,request_photo_metadata:0,storage_total:0,
 request_policy_count:2,storage_policy_count:3,f1_rpc_names:6,
 request_bucket_private:true,request_rls:true,storage_rls:true,
 anon_can_select_requests:false,authenticated_can_select_requests:false
});
function fixture(t) {
 const folder=mkdtempSync(join(tmpdir(),'f1-local-audit-test-'));
 t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const file=join(folder,'counts-private.json');
 const data={version:1,project_ref:PROJECT_REF,captured_at:new Date().toISOString(),
  snapshot:counts()};
 const write=()=>writeFileSync(file,JSON.stringify(data));
 write();
 const args=()=>parseArgs(['--local-db','f1_restore_disposable','--port','5432','--expected',file]);
 return {folder,file,data,write,args};
}
test('F1 plano nao abre psql e jamais certifica restauracao',()=>{
 assert.equal(parseArgs(['--plan']).mode,'plan');
 const result=plan();
 assert.equal(result.decision,'REVIEW_REQUIRED_NO_GO');
 assert.equal(result.backup_source_authenticated,false);
 assert.equal(result.storage_bytes_verified,false);
});
test('F1 bloqueia host externo, URL, banco de producao ou porta invalida',t=>{
 const f=fixture(t);
 assert.throws(()=>parseArgs(['--host','db.yivkqyjdeouxnwtwfekc.supabase.co',
  '--local-db','f1_restore_disposable','--expected',f.file]),/Parametros invalidos/);
 assert.throws(()=>parseArgs(['--local-db','postgres','--expected',f.file]),/descartavel/);
 assert.throws(()=>parseArgs(['--local-db','f1_restore_disposable',
  '--expected',f.file,'--port','99999']),/Porta local invalida/);
 assert.throws(()=>parseArgs(['--local-db','f1_restore_disposable',
  '--expected','counts.json']),/privado absoluto/);
});
test('F1 verifica SQL read-only mock e nunca marca G1 como PASS',t=>{
 const f=fixture(t),calls=[];
 const reader=(db,port,sql)=>{
  calls.push({db,port,sql});
  return calls.length===1?
   {postgres_version:170012,missing:[],roles:2,synthetic_fixture:false}:counts();
 };
 const result=audit(f.args(),reader);
 assert.equal(calls.length,2);
 assert.equal(calls[0].db,'f1_restore_disposable');
 assert.equal(calls[0].port,5432);
 assert.match(calls[0].sql,/pg_roles/);
 assert.match(calls[1].sql,/count\(\*\)/);
 assert.doesNotMatch(calls[1].sql,/auth\.users.*email/);
 assert.equal(result.baseline_counts_match,true);
 assert.equal(result.source_backup_authenticated,false);
 assert.equal(result.storage_bytes_verified,false);
 assert.equal(result.restore_process_proven,false);
 assert.equal(result.decision,'REVIEW_REQUIRED_NO_GO');
});
test('F1 detecta contagem divergente e não declara sucesso',t=>{
 const f=fixture(t),snapshot=counts();
 snapshot.auth_users=1;
 let i=0;
 assert.throws(()=>audit(f.args(),()=>++i===1?
  {postgres_version:170000,missing:[],roles:2,synthetic_fixture:false}:snapshot),
  /Divergencia.*auth_users/);
});
test('F1 recusa fixture de CI mesmo com contagens aparentemente perfeitas',t=>{
 const f=fixture(t);
 assert.throws(()=>audit(f.args(),()=>({
  postgres_version:170000,missing:[],roles:2,synthetic_fixture:true
 })),/Fixture CI/);
});
test('F1 exige versao PG17, todas as tabelas e os dois papeis',()=>{
 assert.throws(()=>validateCatalog({
  postgres_version:160000,missing:[],roles:2,synthetic_fixture:false
 }),/PostgreSQL 17/);
 assert.throws(()=>validateCatalog({
  postgres_version:170000,missing:['auth.users'],roles:2,synthetic_fixture:false
 }),/Tabelas/);
 assert.throws(()=>validateCatalog({
  postgres_version:170000,missing:[],roles:1,synthetic_fixture:false
 }),/Roles Auth/);
});
test('F1 baseline deve ser do projeto atual, recente e conter seis RPCs',t=>{
 const f=fixture(t);
 f.data.project_ref='outro';f.write();
 assert.throws(()=>validateBaseline(f.data),/Manifesto/);
 f.data.project_ref=PROJECT_REF;
 f.data.captured_at='2020-01-01T00:00:00Z';
 assert.throws(()=>validateBaseline(f.data),/recentes/);
 f.data.captured_at=new Date().toISOString();
 f.data.snapshot.f1_rpc_names=5;
 assert.throws(()=>validateBaseline(f.data),/seis RPCs/);
});
test('F1 RLS ou bucket aberto impedem auditoria de baseline',()=>{
 const b=counts();b.request_rls=false;
 assert.throws(()=>validateBaseline({
  version:1,project_ref:PROJECT_REF,captured_at:new Date().toISOString(),snapshot:b
 }),/protecoes basicas/);
});
test('F1 comparação abrange grants, policies, bucket e contagens',()=>{
 const expected=counts(),actual=counts();
 actual.authenticated_can_select_requests=true;actual.request_policy_count=3;
 assert.deepEqual(compareBaseline(expected,actual).sort(),
  ['authenticated_can_select_requests','request_policy_count']);
});
test('F1 arquivo privado não admite symlink',t=>{
 const f=fixture(t),link=join(f.folder,'alias.json');
 symlinkSync(f.file,link);
 assert.throws(()=>parseArgs(['--local-db','f1_restore_disposable',
  '--expected',link]),/symlink/);
});
