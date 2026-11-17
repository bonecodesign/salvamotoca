// Salva Motoca! F7 coordination only; no network, database, PSP or auth.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const fail=m=>{throw Error('RELEASE_MANIFEST_INVALID: '+m)};
const policy={rider_fee_bps:1000,provider_fee_bps:1000,travel_commission_bps:0};
const allowedGates=new Set(['OFFLINE_TESTED','BLOCKED','NOT_RUN','FAIL']);
function checkDAG(sets) {
 const entries=sets.flat();
 const idMap=new Map(entries.map(p=>[p.pr,p]));
 if(idMap.size!==entries.length)fail('PR duplicado no grafo.');
 const visited=new Set(),visiting=new Set();
 function dfs(id){
  if(visited.has(id))return;
  if(visiting.has(id))fail('Ciclo de dependencia nos PRs.');
  const node=idMap.get(id);
  if(!node)fail('Dependencia PR desconhecida: '+id);
  visiting.add(id);
  for(const prior of node.required_prior||[])dfs(prior);
  visiting.delete(id);visited.add(id);
 }
 for(const p of entries)dfs(p.pr);
 return entries.length;
}
export function validateManifest(m) {
 if(m?.schema_version!==1||m.repository!=='bonecodesign/salvamotoca'||
  m.project_supabase_ref!=='yivkqyjdeouxnwtwfekc')
  fail('Repositorio ou projeto Supabase divergente.');
 if(m.decision!=='NO_GO'||m.irreversible_actions_allowed!==false)
  fail('A CI nao pode promover ambiente real.');
 for(const [k,v] of Object.entries(policy))
  if(m.commercial_policy?.[k]!==v)fail('Contrato 10+10 alterado: '+k);
 if(m.commercial_policy.basis!=='service_including_materials'||
  m.commercial_policy.psp_fee_requires_external_validation!==true)
  fail('Contrato de servico/material ou tarifa PSP invalido.');
 const groups=[m.review?.chain,m.review?.f1_recovery,m.review?.f1_security];
 if(groups.some(x=>!Array.isArray(x)))fail('Faltam cadeias de PR.');
 const count=checkDAG(groups);
 if(!m.review.no_automatic_merge||
  !m.review.incompatible_do_not_merge?.includes(47)||
  !m.review.redundant_do_not_merge_independently?.includes(56))
  fail('As protecoes de PRs legados nao podem ser removidas.');
 const chain=m.review.chain.map(p=>p.pr);
 if(chain.indexOf(57)<0||!chain.includes(55)||
  ![42,44,45,48,49,50,51,52].every(x=>chain.includes(x)))
  fail('Cadeia F2-F7 incompleta.');
 if(!Array.isArray(m.gates)||m.gates.length!==9)
  fail('Devem existir exatamente nove gates G0..G8.');
 const ids=m.gates.map(g=>g.id);
 if(ids.join(',')!==[...Array(9)].map((_,i)=>'G'+i).join(','))
  fail('Gates faltando ou fora de ordem.');
 for(const g of m.gates){
  if(!allowedGates.has(g.status)||g.real_verified!==false||
   typeof g.proof_required!=='string'||g.proof_required.length<25)
   fail('Prova real nao preenchida ou status indevido: '+g.id);
  if(g.id!=='G0'&&g.status!=='BLOCKED')fail('Gate real jamais aprovado apenas em CI.');
  if(!Array.isArray(g.blocks)||g.blocks.some(id=>!ids.includes(id)))
   fail('Grafo de bloqueios invalido.');
 }
 if(m.gates[1].status!=='BLOCKED')fail('G1 precisa bloquear todos os testes remotos.');
 return Object.freeze({prCount:count,gateCount:m.gates.length,decision:'NO_GO',
  g1:'BLOCKED',realProven:0,automaticMerge:false});
}
export function checkRepository(m,config,finance,bridge){
 const result=validateManifest(m);
 const flags=[
 'f1TestRequestsEnabled','f2TestOffersEnabled','f3TowEnabled',
 'f4PaymentsEnabled','f5OperationsEnabled','f6CompletionEnabled'
 ];
 for(const name of flags){
  if(!new RegExp('\\b'+name+':\\s*false\\b').test(config))
   fail('Flag nao esta comprovadamente desligada: '+name);
 }
 if(!/RIDER_FEE_BPS=1000/.test(finance)||
   !/PROVIDER_FEE_BPS=1000/.test(finance)||
   !/VALID_KINDS=Object\.freeze\(\["service","travel"\]\)/.test(finance))
  fail('Modulo F4 em desacordo com split ou materiais inclusos.');
 for(const key of ['realPaymentVerified:false','realDispatchAuthorized:false','realTransferExecuted:false'])
  if(!bridge.includes(key))fail('Ponte F4-F6 nao bloqueia operacao: '+key);
 return Object.freeze({...result,flagsVerified:flags.length,financialPolicy:'10_RIDER_PLUS_10_PROVIDER',
  source:'STATIC_REVIEW_ONLY',hostedSupabaseRead:false,remoteRestorePerformed:false});
}
export const plan=()=>checkRepository(JSON.parse(read('docs/release-gates-manifest.json')),
 read('config.js'),read('f4-finance.js'),read('f456-financial-bridge-offline.js'));
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try {
  if(process.argv.length!==2){throw Error('Somente execucao offline sem argumentos.')}
  process.stdout.write(JSON.stringify(plan(),null,2)+'\n');
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1}
}
