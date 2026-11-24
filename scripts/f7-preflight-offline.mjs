/* Salva Motoca! F7 — preflight SOMENTE LOCAL/ESTATICO.
 * Nao chama rede, Supabase, Stripe, GPS, GitHub API ou instala servicos.
 * NUNCA declara GO por presenca de arquivos ou flags desligadas.
 */
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';

export const REQUIRED_OFF_FLAGS=Object.freeze([
  'f1TestRequestsEnabled','f2TestOffersEnabled','f3TowEnabled',
  'f4PaymentsEnabled','f5OperationsEnabled','f6CompletionEnabled'
]);
export const REQUIRED_PATHS=Object.freeze([
  'docs/F1_WORK_EXECUCAO.md',
  'docs/F2_WORK_EXECUCAO.md',
  'docs/F3_WORK_EXECUCAO.md',
  'docs/F4_WORK_EXECUCAO.md',
  'docs/F5_WORK_EXECUCAO.md',
  'docs/F6_WORK_EXECUCAO.md',
  'docs/F7_PLANO_DE_GATES.md',
  'supabase/drafts/f5_backend_rls_mock_candidate.sql',
  'supabase/drafts/f6_backend_rls_mock_candidate.sql',
  'f5-offline-flow.js',
  'f6-offline-completion.js',
  'admin-supervision-offline.js',
  'scripts/perf-postgres-isolated.py',
  'scripts/perf-isolated-journeys.js',
  'tests/f1-f6-full-journey.test.js',
  'docs/G1_ACEITE_BACKUP_TESTES_2026-11-23.md',
  'docs/F1_NATIVE_HTTP_EVIDENCIA_2026-11-24.md',
  'docs/F1_HOSTED_READONLY_EVIDENCIA_2026-11-24.md',
  'docs/F7_HOMOLOGACAO_CAPACIDADE_OFFLINE.md'
]);
const REQUIRED_GATES=Object.freeze([
 {id:'F1_BACKUP_RESTORE',label:'Backup restauravel Postgres/Auth/Storage do unico Supabase'},
 {id:'F1_AUTH_STORAGE',label:'E2E real Auth/Storage, fotos privadas e RPCs adversariais'},
 {id:'F2_F3_OPERACAO',label:'RLS real, prestadores, ofertas, reboque e migracoes revisadas'},
 {id:'F4_PSP_COMPLIANCE',label:'Contrato PSP Brasil, sandbox, webhooks, conciliacao, tributos e reembolsos'},
 {id:'F5_CHAT_TRACKING',label:'Chat, deslocamento, notificacoes, privacidade e Android fisico'},
 {id:'F6_COMPLETION',label:'Dupla confirmacao real, suporte humano, provas e avaliacoes'},
 {id:'F7_ADMIN_AUTH',label:'Autenticacao administrativa, controle de acesso e auditoria real'},
 {id:'F7_HOSTED_CAPACITY',label:'Capacidade e recuperacao no ambiente hospedado autorizado'},
 {id:'F7_LEGAL_HUMAN',label:'Termos, LGPD, seguranca operacional, financeiro e aprovacao humana'},
 {id:'F7_CONTROLLED_PILOT',label:'Autorizacao especifica para piloto assistido e monitoramento'}
]);
// Interpret a deliberately small configuration grammar without executing JS.
// Only one literal window.BJ_CONFIG assignment is allowed. Comments and
// string literals are tokenized separately, never treated as flag definitions.
function parseConfig(source){
  if(source.length>32768)return null;
  const token=/(?:\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)|([A-Za-z_$][A-Za-z0-9_$]*|'[^'\\\r\n]*'|[.=:{},;])/gy;
  const tokens=[];let offset=0;
  for(const m of source.matchAll(token)){
    if(m.index!==offset)return null;
    offset+=m[0].length;if(m[1])tokens.push(m[1]);
  }
  if(offset!==source.length)return null;
  let i=0;
  for(const expected of ['window','.','BJ_CONFIG','=','{'])
    if(tokens[i++]!==expected)return null;
  const values=new Map();
  const allowed=new Set([...REQUIRED_OFF_FLAGS,'supabaseUrl','supabasePublishableKey']);
  while(tokens[i]!=='}'){
    const key=tokens[i++];if(!allowed.has(key)||values.has(key)||tokens[i++]!==':')return null;
    const value=tokens[i++];
    if(REQUIRED_OFF_FLAGS.includes(key)){
      if(value!=='true'&&value!=='false')return null;
    }else if(typeof value!=='string'||!value.startsWith("'"))return null;
    values.set(key,value);
    if(tokens[i]===',')i++;
    else if(tokens[i]!=='}')return null;
  }
  i++;if(tokens[i]===';')i++;
  if(i!==tokens.length||values.size!==allowed.size)return null;
  if(!/^'https:\/\/[a-z0-9-]+\.supabase\.co'$/.test(values.get('supabaseUrl'))||
     !/^'sb_publishable_[A-Za-z0-9_-]+'$/.test(values.get('supabasePublishableKey')))return null;
  return values;
}
function statusForFlag(values,name){
  if(!values)return 'MISSING_OR_DUPLICATED';
  return values.get(name)==='false'?'DISABLED':'UNSAFE_ENABLED';
}
export function evaluateReadiness({configText,isPresent}){
  if(typeof configText!=='string'||typeof isPresent!=='function')
    throw new TypeError('Arquivo config e localizador obrigatorios.');
  const parsed=parseConfig(configText);
  const flags=REQUIRED_OFF_FLAGS.map(name=>({name,status:statusForFlag(parsed,name)}));
  const files=REQUIRED_PATHS.map(path=>({path,present:isPresent(path)===true}));
  const invalidFlags=flags.filter(x=>x.status!=='DISABLED');
  const missing=files.filter(x=>!x.present);
  return {
    project:'Salva Motoca!',
    scope:'offline static preflight only',
    configurationGrammar:parsed?'PASS_LITERAL_ONLY':'FAIL_CLOSED',
    checkedFlagCount:flags.length,
    checkedFileCount:files.length,
    flags,files,
    gates:REQUIRED_GATES.map(x=>({...x,status:'UNVERIFIED_REQUIRES_REAL_EVIDENCE'})),
    staticPreflight:invalidFlags.length===0&&missing.length===0?
      'PASS_STATIC_GUARDS_ONLY':'FAIL_CLOSED',
    decision:'NO_GO',
    realReadinessVerified:false,
    paymentOrDispatchAuthorized:false,
    reasons:[
      ...(!parsed?['Configuracao fora da gramatica literal permitida.']:[]),
      ...invalidFlags.map(x=>x.name+': '+x.status),
      ...missing.map(x=>x.path+': missing'),
      'Nenhum arquivo ou CI isolado comprova backup/restauracao, Auth/Storage, PSP, Android, operacao humana ou aprovacao juridica.'
    ]
  };
}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const source=readFileSync(resolve(root,'config.js'),'utf8');
  const r=evaluateReadiness({configText:source,
    isPresent:path=>existsSync(resolve(root,path))});
  process.stdout.write(JSON.stringify(r,null,2)+'\n');
  if(r.staticPreflight!=='PASS_STATIC_GUARDS_ONLY')process.exitCode=1;
}
