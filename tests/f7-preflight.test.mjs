import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateReadiness,REQUIRED_OFF_FLAGS,REQUIRED_PATHS} from '../scripts/f7-preflight-offline.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=readFileSync(resolve(root,'config.js'),'utf8');
const real=()=>evaluateReadiness({configText:config,isPresent:p=>existsSync(resolve(root,p))});
test('F7: todas as seis flags e documentos locais presentes, mas sempre NO_GO',()=>{
 const r=real();
 assert.equal(r.staticPreflight,'PASS_STATIC_GUARDS_ONLY');
 assert.equal(r.checkedFlagCount,6);
 assert.equal(r.checkedFileCount,REQUIRED_PATHS.length);
 assert.ok(r.gates.length>=8);
 assert.ok(r.gates.every(x=>x.status==='UNVERIFIED_REQUIRES_REAL_EVIDENCE'));
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.realReadinessVerified,false);
 assert.equal(r.paymentOrDispatchAuthorized,false);
});
test('F7: ligar uma flag falha de maneira fechada',()=>{
 for(const name of REQUIRED_OFF_FLAGS){
  const unsafe=config.replace(new RegExp('\\b'+name+'\\s*:\\s*false\\b'),
    name+': true');
  const r=evaluateReadiness({configText:unsafe,isPresent:()=>true});
  assert.equal(r.staticPreflight,'FAIL_CLOSED');
  assert.equal(r.decision,'NO_GO');
  assert.ok(r.flags.some(x=>x.name===name&&x.status==='UNSAFE_ENABLED'));
 }
});
test('F7: documentos faltantes nao podem parecer prontos',()=>{
 const r=evaluateReadiness({configText:config,
   isPresent:p=>p!=='docs/F1_WORK_EXECUCAO.md'});
 assert.equal(r.staticPreflight,'FAIL_CLOSED');
 assert.equal(r.decision,'NO_GO');
 assert.ok(r.reasons.some(x=>x.includes('F1_WORK_EXECUCAO')));
});
test('F7: flags duplicadas ou removidas nao passam por acidente',()=>{
 const duplicated=config.replace('window.BJ_CONFIG = {','window.BJ_CONFIG = {f1TestRequestsEnabled: false,');
 const missing=config.replace(/f1TestRequestsEnabled\s*:\s*false/,
     'f1TestRequestsEnabled: unknown');
 for(const input of [duplicated,missing]){
   const r=evaluateReadiness({configText:input,isPresent:()=>true});
   assert.equal(r.staticPreflight,'FAIL_CLOSED');
   assert.equal(r.decision,'NO_GO');
 }
});
test('F7: todos os arquivos presentes nao equivalem a backup restaurado',()=>{
 const r=evaluateReadiness({configText:config,isPresent:()=>true});
 assert.equal(r.staticPreflight,'PASS_STATIC_GUARDS_ONLY');
 assert.ok(r.gates.some(g=>g.id==='F1_BACKUP_RESTORE'&&g.status.startsWith('UNVERIFIED')));
 assert.equal(r.decision,'NO_GO');
});
test('F7: resultado de preflight nunca afirma pagamento ou despacho real',()=>{
 const r=real();
 assert.equal(r.paymentOrDispatchAuthorized,false);
 assert.equal(r.realReadinessVerified,false);
 assert.ok(!JSON.stringify(r).includes('REAL_APPROVED'));
});
test('F7: script nao faz chamadas de rede ou operacoes externas',()=>{
 const src=readFileSync(resolve(root,'scripts/f7-preflight-offline.mjs'),'utf8');
 for(const pattern of [
   /fetch\s*\(/,/axios\./,/https\.request\s*\(/,
   /createClient\s*\(/,/spawn\s*\(/,/exec\s*\(/,/service_role/,
   /PaymentIntent/,/navigator\.geolocation/,/process\.env\./
 ])assert.doesNotMatch(src,pattern);
});

test('F7: comentarios nao substituem flags reais, nem bloqueiam configuracao literal valida',()=>{
 const fake=config.replace(/f1TestRequestsEnabled\s*:\s*false,/,'// f1TestRequestsEnabled: false,');
 assert.equal(evaluateReadiness({configText:fake,isPresent:()=>true}).staticPreflight,'FAIL_CLOSED');
 const comment=config+'\n// f1TestRequestsEnabled: true\n';
 assert.equal(evaluateReadiness({configText:comment,isPresent:()=>true}).staticPreflight,'PASS_STATIC_GUARDS_ONLY');
});
test('F7: sobrescritas e codigo executavel nao passam pela guarda literal',()=>{
 for(const input of [
  config+'\nwindow.BJ_CONFIG.f4PaymentsEnabled = true;',
  config.replace('window.BJ_CONFIG = {','window.BJ_CONFIG = {...other,'),
  config.replace('f1TestRequestsEnabled: false','f1TestRequestsEnabled: false || true'),
  config.replace('window.BJ_CONFIG = {','window.BJ_CONFIG = {unexpected: false,'),
  config.replace('f1TestRequestsEnabled: false','get f1TestRequestsEnabled(){return false}'),
  config.replace(/f1TestRequestsEnabled\s*:\s*false/,"'f1TestRequestsEnabled': false")
 ]){
  const r=evaluateReadiness({configText:input,isPresent:()=>true});
  assert.equal(r.staticPreflight,'FAIL_CLOSED');
  assert.equal(r.configurationGrammar,'FAIL_CLOSED');
  assert.equal(r.decision,'NO_GO');
 }
});
test('F7: chave nao publicavel ou destino diferente de Supabase falha sem expor valor',()=>{
 for(const input of [
  config.replace(/sb_publishable_[A-Za-z0-9_-]+/,'invalid_demo_value'),
  config.replace(/https:\/\/[a-z0-9-]+\.supabase\.co/,'https://example.invalid')
 ]){
  const r=evaluateReadiness({configText:input,isPresent:()=>true});
  assert.equal(r.staticPreflight,'FAIL_CLOSED');
  assert.ok(!JSON.stringify(r).includes('invalid_demo_value'));
 }
});


// Execute the actual worker in an isolated harness, with no browser or network.
async function workerHarness({failInstall=false,privateInstall=false}={}){
 const {runInNewContext}=await import('node:vm');
 const handlers={},stores=new Map(),calls=[];
 const scope='https://example.invalid/salvamotoca/';
 const cacheName='salva-motoca-static-f7-v1';
 stores.set('salva-motoca-static-f3-draft-v3',new Map([['private-response','legacy']]));
 stores.set('unrelated-cache',new Map());
 let offline=false;
 const caches={
  open:async name=>{
   if(!stores.has(name))stores.set(name,new Map());
   const store=stores.get(name);
   return {put:async(url,r)=>store.set(url,r),match:async url=>store.get(url)};
  },
  keys:async()=>[...stores.keys()],
  delete:async name=>stores.delete(name)
 };
 const fetch=async (input,options)=>{
  const url=typeof input==='string'?input:input.url;
  calls.push({url,options});
  if(offline||failInstall&&url.endsWith('styles.css'))throw Error('offline');
  return new Response('static fixture',{headers:privateInstall&&url.endsWith('index.html')?{'Cache-Control':'private, no-store'}:{}});
 };
 const self={registration:{scope},addEventListener:(name,fn)=>handlers[name]=fn,
  skipWaiting:async()=>{},clients:{claim:async()=>{}}};
 runInNewContext(readFileSync(resolve(root,'sw.js'),'utf8'),{self,caches,fetch,URL,Response});
 const lifecycle=name=>{let pending;handlers[name]({waitUntil:p=>pending=p});return pending;};
 const request=(url,options={})=>{
  let response;
  handlers.fetch({request:new Request(url,options),respondWith:p=>response=p});
  return response;
 };
 return {lifecycle,request,calls,stores,cacheName,scope,setOffline:()=>offline=true};
}
test('PWA: public shell only, credential-free install and cleanup of legacy cache',async()=>{
 const h=await workerHarness();
 await h.lifecycle('install');
 assert.equal(h.calls.length,14);
 assert.ok(h.calls.every(x=>x.options.credentials==='omit'&&x.options.redirect==='error'));
 assert.equal(h.stores.get(h.cacheName).size,14);
 await h.lifecycle('activate');
 assert.equal(h.stores.has('salva-motoca-static-f3-draft-v3'),false);
 assert.equal(h.stores.has('unrelated-cache'),true);
});
test('PWA: private API paths, dynamic queries, authorization and writes never enter worker cache',async()=>{
 const h=await workerHarness();await h.lifecycle('install');
 for(const [path,options] of [
  ['api/private',{}],['index.html?session=fixture',{}],['index.html',{headers:{Authorization:'fixture'}}],
  ['index.html',{headers:{Range:'bytes=0-8'}}],['index.html',{cache:'no-store'}],
  ['index.html',{method:'POST'}],['https://outside.invalid/index.html',{}]
 ]){
  assert.equal(h.request(new URL(path,h.scope).href,options),undefined);
 }
 assert.equal(h.calls.length,14);
 assert.equal(h.stores.get(h.cacheName).size,14);
});
test('PWA: network responses never replace the public cache; offline fallback is static only',async()=>{
 const h=await workerHarness();await h.lifecycle('install');
 const url=h.scope+'index.html',original=h.stores.get(h.cacheName).get(url);
 assert.equal((await h.request(url)).status,200);
 assert.equal(h.stores.get(h.cacheName).get(url),original);
 h.setOffline();
 assert.equal(await h.request(url),original);
 assert.equal(h.request(h.scope+'api/private'),undefined);
 h.stores.get(h.cacheName).delete(url);
 const missing=await h.request(url);
 assert.equal(missing.status,503);
 assert.equal(missing.headers.get('Cache-Control'),'no-store');
});
test('PWA: failed or private shell install is rejected without leaving a partial cache',async()=>{
 for(const options of [{failInstall:true},{privateInstall:true}]){
  const h=await workerHarness(options);
  await assert.rejects(h.lifecycle('install'));
  assert.equal(h.stores.has(h.cacheName),false);
  assert.equal(h.stores.has('unrelated-cache'),true);
 }
});
