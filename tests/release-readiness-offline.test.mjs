import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateManifest,checkRepository,plan} from '../scripts/release-readiness-offline.mjs';
const m=JSON.parse(readFileSync(new URL('../docs/release-gates-manifest.json',import.meta.url),'utf8'));
const clone=()=>structuredClone(m);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const config=read('config.js'),f4=read('f4-finance.js'),bridge=read('f456-financial-bridge-offline.js');

test('Matriz G0-G8 e DAG das dependencias: sempre NO_GO',()=>{
 const r=plan();
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.g1,'BLOCKED');
 assert.equal(r.gateCount,9);
 assert.equal(r.realProven,0);
 assert.equal(r.automaticMerge,false);
 assert.equal(r.flagsVerified,6);
 assert.equal(r.hostedSupabaseRead,false);
 assert.equal(r.prCount,15);
});
test('Nao permitir marcar GO sem provas remotas',()=>{
 const x=clone();x.decision='GO';
 assert.throws(()=>validateManifest(x),/CI nao pode promover/);
 const y=clone();y.gates[1].real_verified=true;
 assert.throws(()=>validateManifest(y),/Prova real nao preenchida/);
 const z=clone();z.gates[4].status='OFFLINE_TESTED';
 assert.throws(()=>validateManifest(z),/Gate real jamais aprovado/);
});
test('G1 continua bloqueando fases reais; G8 nao pode ser aprovado',()=>{
 const x=clone();x.gates[1].status='OFFLINE_TESTED';
 assert.throws(()=>validateManifest(x));
 const y=clone();y.gates[8].status='PASS';
 assert.throws(()=>validateManifest(y));
});
test('DAG nao aceita dependencia ausente, duplicada ou ciclica',()=>{
 const a=clone();a.review.chain[2].required_prior=[999];
 assert.throws(()=>validateManifest(a),/Dependencia PR desconhecida/);
 const b=clone();b.review.chain[1].required_prior=[57];
 assert.throws(()=>validateManifest(b),/Ciclo/);
 const c=clone();c.review.f1_recovery.push({pr:53,required_prior:[]});
 assert.throws(()=>validateManifest(c),/duplicado/);
});
test('Nao pode reintroduzir 15%, part ou merge perigoso',()=>{
 const a=clone();a.commercial_policy.provider_fee_bps=1500;
 assert.throws(()=>validateManifest(a),/Contrato 10\+10/);
 const b=clone();b.review.incompatible_do_not_merge=[];
 assert.throws(()=>validateManifest(b),/protec[oõ]es de PRs/);
 const c=clone();c.review.redundant_do_not_merge_independently=[];
 assert.throws(()=>validateManifest(c),/protec[oõ]es de PRs/);
});
test('Flags F1-F6 devem permanecer OFF e a ponte sem autorizacoes',()=>{
 assert.equal(checkRepository(m,config,f4,bridge).decision,'NO_GO');
 assert.throws(()=>checkRepository(m,config.replace('f1TestRequestsEnabled:false','f1TestRequestsEnabled:true')
    .replace(/f1TestRequestsEnabled:\s*false/,'f1TestRequestsEnabled:true'),f4,bridge),
    /Flag nao esta/);
 assert.throws(()=>checkRepository(m,config,f4.replace('RIDER_FEE_BPS=1000','RIDER_FEE_BPS=1500'),bridge),
    /Modulo F4/);
 assert.throws(()=>checkRepository(m,config,f4,bridge.replace('realPaymentVerified:false','realPaymentVerified:true')),
    /Ponte F4-F6/);
});
test('A declaracao do G1 exige recuperacao de Auth e bytes Storage, nao so tabelas',()=>{
 const p=m.gates[1].proof_required.toLowerCase();
 assert.match(p,/auth/);assert.match(p,/storage/);
 assert.match(p,/restor/);assert.match(p,/hash/);
 assert.equal(m.review.no_automatic_merge,true);
});
