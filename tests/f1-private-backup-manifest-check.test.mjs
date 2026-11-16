import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectPrivateManifest} from '../scripts/f1-private-backup-manifest-check.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
function fixture(t,opts={}){
 const dir=mkdtempSync(join(tmpdir(),'salva-f1-private-test-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const put=(name,content)=>{
  const file=join(dir,name);writeFileSync(file,content);
  return {file,sha256:sha(content),bytes:Buffer.byteLength(content)};
 };
 const restore={
  target:'disposable_local_postgres',completed:true,rls_verified:true,
  auth_scope_reviewed:true,storage_metadata_reviewed:true,
  external_effects_disabled:true,storage_object_count:opts.objects?.length||0
 };
 const objects=(opts.objects||[]).map((text,i)=>({
  bucket_id:'request-photos',object_name:'fixture/'+i+'.jpg',
  ...put('storage-'+i+'.mock',text)
 }));
 const artifacts={
  schema:put('schema.dump','FAKE_SCHEMA_NOT_REAL'),
  roles:put('roles.dump','FAKE_ROLES_NOT_REAL'),
  data:put('data.dump','FAKE_DATA_NOT_REAL'),
  storage_inventory:put('inventory.json',JSON.stringify({objects})),
  restore_report:put('restore-report.json',JSON.stringify(restore))
 };
 const manifest={
  version:1,project_ref:'yivkqyjdeouxnwtwfekc',
  backup_source:'existing_supabase_project',
  checked_at:new Date().toISOString(),
  storage_object_count:objects.length,artifacts
 };
 const path=join(dir,'private-manifest.json');
 writeFileSync(path,JSON.stringify(manifest));
 return {path,manifest,objects,dir,write:()=>writeFileSync(path,JSON.stringify(manifest))};
}
test('F1: hashes de artefatos locais e relatorio nao provam backup real',async t=>{
 const f=fixture(t);
 const result=await inspectPrivateManifest(f.path);
 assert.equal(result.artifact_integrity,'LOCAL_FILES_MATCH_HASHES');
 assert.equal(result.artifacts_checked,5);
 assert.equal(result.source_backup_authenticated,false);
 assert.equal(result.independent_restore_verified,false);
 assert.equal(result.decision,'REVIEW_REQUIRED_NO_GO');
});
test('F1: autenticar todos os arquivos Storage exige hashes verificaveis',async t=>{
 const f=fixture(t,{objects:['TEST_BYTES_A','TEST_BYTES_B']});
 const result=await inspectPrivateManifest(f.path);
 assert.equal(result.storage_objects_locally_copied,2);
 assert.equal(result.artifacts_checked,7);
 assert.equal(result.decision,'REVIEW_REQUIRED_NO_GO');
});
test('F1: rejeita hash divergente e arquivo alterado',async t=>{
 const f=fixture(t);
 f.manifest.artifacts.schema.sha256='0'.repeat(64);f.write();
 await assert.rejects(inspectPrivateManifest(f.path),/hash divergente/);
});
test('F1: rejeita manifesto de outro projeto ou data vencida',async t=>{
 const f=fixture(t);
 f.manifest.project_ref='outro-projeto';f.write();
 await assert.rejects(inspectPrivateManifest(f.path),/Supabase alvo/);
 f.manifest.project_ref='yivkqyjdeouxnwtwfekc';
 f.manifest.checked_at='2020-01-01T00:00:00.000Z';f.write();
 await assert.rejects(inspectPrivateManifest(f.path),/Data de verificacao/);
});
test('F1: relatorio sem restauracao nao passa pela pre-verificacao',async t=>{
 const f=fixture(t);
 f.manifest.artifacts.restore_report.file=f.manifest.artifacts.roles.file;
 f.manifest.artifacts.restore_report.sha256=f.manifest.artifacts.roles.sha256;
 f.manifest.artifacts.restore_report.bytes=f.manifest.artifacts.roles.bytes;f.write();
 await assert.rejects(inspectPrivateManifest(f.path),/duplicado/);
});
test('F1: inventario nao pode dizer 0 se conteudo indica objetos',async t=>{
 const f=fixture(t,{objects:['TEST_BYTES_A']});
 f.manifest.storage_object_count=0;f.write();
 await assert.rejects(inspectPrivateManifest(f.path),/Numero de arquivos/);
});
test('F1: nunca atesta backup remoto apenas por autodeclaracao JSON',async t=>{
 const f=fixture(t);
 f.manifest.backup_verified=true;f.manifest.restore_verified=true;
 f.manifest.real_readiness_verified=true;f.write();
 const r=await inspectPrivateManifest(f.path);
 assert.equal(r.independent_restore_verified,false);
 assert.equal(r.source_backup_authenticated,false);
 assert.equal(r.decision,'REVIEW_REQUIRED_NO_GO');
});
