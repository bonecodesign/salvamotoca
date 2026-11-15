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
 const duplicated=config+'\n// duplicacao proposital\n f1TestRequestsEnabled: false,\n';
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
