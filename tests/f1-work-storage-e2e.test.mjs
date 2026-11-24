/* Testes offline do roteiro de Work. Nunca fazem conexões ou gravam no Supabase. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PROJECT_REF, PROJECT_URL, WRITE_ACK, plan, validateExecution, storagePath, signedDownloadUrl, exerciseStorage } from "../scripts/f1-work-storage-e2e.mjs";

const now = () => new Date().toISOString();
const goodEnv = () => ({
  F1_WORK_ACK: WRITE_ACK, F1_BACKUP_RESTORE_VERIFIED: "yes",
  F1_SUPABASE_URL: PROJECT_URL, F1_PUBLISHABLE_KEY: "sb_publishable_TESTKEY0123",
  F1_TEST_A_EMAIL: "author@example.invalid", F1_TEST_A_PASSWORD: "NOT_A_REAL_PASSWORD",
  F1_TEST_C_EMAIL: "outsider@example.invalid", F1_TEST_C_PASSWORD: "NOT_A_REAL_PASSWORD"
});
const goodProof = () => ({
  project_ref: PROJECT_REF, backup_verified: true, restore_verified: true,
  scope_reviewed: true, checked_at: now()
});

test("default plan lista backup anterior a qualquer upload", () => {
  const steps=plan();
  assert.ok(steps[0].includes("Backup"));
  assert.ok(steps.some(s=>s.includes("UM JPEG")));
  assert.ok(steps.some(s=>s.includes("Storage API")));
  assert.ok(steps.some(s=>s.includes("sem service_role")));
});

test("bloqueia execução sem ACK específico do projeto", () => {
  const env=goodEnv(); delete env.F1_WORK_ACK;
  assert.throws(()=>validateExecution(env,goodProof()),/autorização específica/);
});

test("bloqueia escrita sem declaração de backup e restauração", () => {
  const env=goodEnv();env.F1_BACKUP_RESTORE_VERIFIED="no";
  assert.throws(()=>validateExecution(env,goodProof()),/Backup\/restauração/);
});

test("bloqueia relatório de backup que não comprova restauração local", () => {
  const proof=goodProof();proof.restore_verified=false;
  assert.throws(()=>validateExecution(goodEnv(),proof),/não comprova/);
});

test("bloqueia relatório de outro projeto ou antigo", () => {
  const proof=goodProof();proof.project_ref="projeto-errado";
  assert.throws(()=>validateExecution(goodEnv(),proof),/não comprova/);
  const old=goodProof();old.checked_at=new Date(Date.now()-9*24*3600*1000).toISOString();
  assert.throws(()=>validateExecution(goodEnv(),old),/mais de 7 dias/);
});

test("bloqueia URL de outro projeto e credenciais administrativas", () => {
  const env=goodEnv();env.F1_SUPABASE_URL="https://another.supabase.co";
  assert.throws(()=>validateExecution(env,goodProof()),/único projeto/);
  const secret=goodEnv();secret.F1_PUBLISHABLE_KEY="sb_secret_DONT_USE";
  assert.throws(()=>validateExecution(secret,goodProof()),/chave pública/);
});

test("bloqueia login de teste com apenas uma conta", () => {
  const env=goodEnv();env.F1_TEST_C_EMAIL=env.F1_TEST_A_EMAIL;
  assert.throws(()=>validateExecution(env,goodProof()),/duas contas diferentes/);
});

test("percorre portões apenas quando prova e ambiente são explícitos", () => {
  assert.equal(validateExecution(goodEnv(),goodProof()),true);
});

test("caminho da foto sempre tem namespace UUID do autor", () => {
  const owner=randomUUID(),object=randomUUID();
  assert.equal(storagePath(owner,object),owner+"/"+object+".jpg");
  assert.throws(()=>storagePath("../admin",object),/UUID inválido/);
  assert.throws(()=>storagePath(owner,"../../foo"),/UUID inválido/);
});

test("roteiro importa sem disparar fetch, upload ou login", async () => {
  const current=globalThis.fetch;
  try {
    globalThis.fetch=()=>{throw new Error("não deve acessar rede ao importar módulo");};
    assert.equal(typeof plan,"function");
    assert.ok(plan().length >= 6);
  } finally {globalThis.fetch=current;}
});

test("URL assinada deve corresponder ao mesmo objeto, domínio e token único",()=>{
 const path=storagePath(randomUUID(),randomUUID());
 const relative="/object/sign/request-photos/"+path+"?token=fixture";
 assert.equal(signedDownloadUrl({signedURL:relative},path),PROJECT_URL+"/storage/v1"+relative);
 for(const raw of ["https://example.invalid"+relative,PROJECT_URL+"/storage/v1"+relative+"&token=other",
  PROJECT_URL+"/storage/v1"+relative.replace(path,"wrong"),relative.replace("?token=fixture",""),
  relative+"&extra=1",relative+"#fragment"]){
  assert.throws(()=>signedDownloadUrl({signedURL:raw},path),/fora do objeto|inválida/);
 }
});
function transportFixture(mode="ok"){
 const a=randomUUID(),c=randomUUID();
 let bytes=null,objectPath=null,expired=false,deleted=0,waited=0,anonymousSignedReads=0;
 const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
 const missing=()=>response(400,{error:"not_found",message:"Object not found"});
 const request=async(raw,options={})=>{
  const url=new URL(raw),method=options.method||"GET",jwt=options.headers?.Authorization;
  assert.equal(url.origin,PROJECT_URL);
  if(url.pathname==="/auth/v1/token"){
   const data=JSON.parse(options.body);
   return response(200,{access_token:data.email.startsWith("author")?"fixture-a":"fixture-c",user:{id:data.email.startsWith("author")?a:c}});
  }
  if(method==="DELETE"){
   assert.equal(jwt,"Bearer fixture-a");assert.deepEqual(JSON.parse(options.body).prefixes,[objectPath]);deleted++;
   bytes=null;return response(200,[]);
  }
  if(method==="POST"&&url.pathname.includes("/object/request-photos/")){
   assert.equal(jwt,"Bearer fixture-a");assert.equal(options.headers["x-upsert"],"false");
   objectPath=url.pathname.split("/request-photos/")[1];bytes=Buffer.from(options.body);
   if(mode==="upload_timeout")throw new Error("Transport failure fixture");
   return response(200,{});
  }
  if(method==="POST"&&url.pathname.includes("/object/sign/")){
   assert.equal(JSON.parse(options.body).expiresIn,20);
   if(jwt!=="Bearer fixture-a")return response(403,{});
   return response(200,{signedURL:mode==="foreign_url"?"https://example.invalid/asset?token=fixture":"/object/sign/request-photos/"+objectPath+"?token=fixture"});
  }
  if(url.pathname.includes("/object/sign/")){
   assert.equal(jwt,undefined);assert.equal(options.headers.apikey,undefined);anonymousSignedReads++;
   if(expired&&mode!=="still_live")return response(mode==="rate_limit"?429:400,{error:"InvalidJWT",message:"JWT expired"});
   return new Response(mode==="wrong_bytes"?Buffer.from("wrong"):bytes);
  }
  if(url.pathname.includes("/object/authenticated/")&&jwt==="Bearer fixture-a"){
   if(bytes)return new Response(bytes);
   return mode==="cleanup_denied"?response(403,{}):missing();
  }
  return response(mode==="bad_denial"?429:403,{});
 };
 return {request,wait:async ms=>{assert.ok(ms>=23000);waited++;expired=true;},
  state:()=>({deleted,waited,anonymousSignedReads})};
}
test("ensaio completo verifica bytes assinados, expiração e ausência após limpeza",async()=>{
 const f=transportFixture();
 await exerciseStorage(goodEnv(),goodProof(),f);
 assert.deepEqual(f.state(),{deleted:1,waited:1,anonymousSignedReads:2});
});
test("nega URL externa, bytes alterados, cache persistente e falsas negativas; limpa mesmo em falha",async()=>{
 for(const mode of ["foreign_url","wrong_bytes","still_live","rate_limit","cleanup_denied","bad_denial","upload_timeout"]){
  const f=transportFixture(mode);
  await assert.rejects(()=>exerciseStorage(goodEnv(),goodProof(),f),undefined,mode);
  assert.equal(f.state().deleted,1,mode);
 }
});
test("sem prova válida nenhum transporte é chamado",async()=>{
 const proof=goodProof();proof.scope_reviewed=false;let called=0;
 await assert.rejects(()=>exerciseStorage(goodEnv(),proof,{request:()=>{called++},wait:()=>{}}));
 assert.equal(called,0);
});
