// F1: verificador LOCAL de arquivos de backup, SEM ACESSO A REDE.
 // Confere integridade de arquivos privados; NUNCA atesta backup do Supabase real.
import {createHash} from 'node:crypto';
import {createReadStream,readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const REF='yivkqyjdeouxnwtwfekc';
const REPO=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const REQUIRED=['schema','roles','data','storage_inventory','restore_report'];
const HASH=/^[a-f0-9]{64}$/i;
function fail(msg){throw new Error('F1_PRIVATE_PROOF_INVALID: '+msg);}
function outsideRepo(abs){
  const real=realpathSync(abs);
  if(real===REPO||real.startsWith(REPO+sep))
    fail('Arquivos de backup e provas nao podem estar dentro do repositorio.');
  return real;
}
function validFile(path,label){
  if(typeof path!=='string'||!isAbsolute(path))fail(label+': caminho privado absoluto obrigatorio.');
  let s;
  try{s=lstatSync(path);}catch{fail(label+': arquivo nao encontrado.');}
  if(s.isSymbolicLink()||!s.isFile()||s.size<=0)fail(label+': arquivo invalido ou vazio.');
  outsideRepo(path);
  return s.size;
}
async function digest(path){
 const hash=createHash('sha256');
 for await (const chunk of createReadStream(path)) hash.update(chunk);
 return hash.digest('hex');
}
async function verifyArtifact(item,label,seen){
 if(!item||typeof item!=='object'||!HASH.test(item.sha256||''))
   fail(label+': hash SHA-256 esperado.');
 const bytes=validFile(item.file,label);
 const actual=outsideRepo(item.file);
 if(seen.has(actual))fail(label+': arquivo duplicado no manifesto.');
 seen.add(actual);
 if(item.bytes!==bytes)fail(label+': tamanho diverge do arquivo.');
 if((await digest(item.file))!==item.sha256.toLowerCase())fail(label+': hash divergente.');
 return {bytes};
}
export async function inspectPrivateManifest(manifestPath){
 validFile(manifestPath,'manifest');
 let manifest;
 try{manifest=JSON.parse(readFileSync(manifestPath,'utf8'));}
 catch{fail('JSON do manifesto invalido.');}
 if(manifest?.version!==1||manifest?.project_ref!==REF)
   fail('Versao ou Supabase alvo nao autorizados.');
 if(manifest?.backup_source!=='existing_supabase_project')
   fail('Origem nao declarada como unico projeto existente.');
 const timestamp=Date.parse(manifest.checked_at);
 if(!Number.isFinite(timestamp)||timestamp>Date.now()+300000||
   Date.now()-timestamp>7*24*3600*1000)fail('Data de verificacao ausente ou antiga.');
 if(!manifest.artifacts||typeof manifest.artifacts!=='object')
   fail('Artefatos nao informados.');
 const seen=new Set([outsideRepo(manifestPath)]);
 const checks=[];
 for(const key of REQUIRED){
  await verifyArtifact(manifest.artifacts[key],key,seen);
  checks.push(key);
 }
 let inventory,restore;
 try{
   inventory=JSON.parse(readFileSync(manifest.artifacts.storage_inventory.file,'utf8'));
   restore=JSON.parse(readFileSync(manifest.artifacts.restore_report.file,'utf8'));
 }catch{fail('Inventario ou relatorio de restore nao sao JSON validos.');}
 if(!Array.isArray(inventory.objects))fail('Inventario de bytes Storage invalido.');
 if(!Number.isSafeInteger(manifest.storage_object_count)||
    manifest.storage_object_count<0||
    inventory.objects.length!==manifest.storage_object_count)
   fail('Numero de arquivos Storage divergente.');
 for(let i=0;i<inventory.objects.length;i++){
  const obj=inventory.objects[i];
  if(typeof obj.bucket_id!=='string'||!obj.bucket_id||
     typeof obj.object_name!=='string'||!obj.object_name||
     obj.object_name.includes('..')||obj.object_name.startsWith('/'))
    fail('Objeto Storage sem identificacao valida.');
  await verifyArtifact(obj,'storage_object_'+i,seen);
 }
 if(restore?.target!=='disposable_local_postgres'||
   restore?.completed!==true||
   restore?.rls_verified!==true||
   restore?.auth_scope_reviewed!==true||
   restore?.storage_metadata_reviewed!==true||
   restore?.external_effects_disabled!==true||
   restore?.storage_object_count!==manifest.storage_object_count)
   fail('Escopo do relatorio de restauracao nao esta completo.');
 return Object.freeze({
   project_ref:REF,
   artifact_integrity:'LOCAL_FILES_MATCH_HASHES',
   artifacts_checked:checks.length+inventory.objects.length,
   storage_objects_locally_copied:inventory.objects.length,
   restore_report_present:true,
   independent_restore_verified:false,
   source_backup_authenticated:false,
   decision:'REVIEW_REQUIRED_NO_GO',
   reason:'Hashes e relatorio local nao atestam origem remota nem prova independente de restauracao DB/Auth/Storage.'
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 inspectPrivateManifest(process.argv[2]||'').then(result=>{
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }).catch(error=>{
  process.stderr.write('F1_PRIVATE_PROOF_INVALID: '+String(error.message).slice(0,260)+'\n');
  process.exitCode=1;
 });
}
