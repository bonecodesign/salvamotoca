/**
 * Salva Motoca! — gated READ-ONLY HTTP contract for already-existing
 * synthetic Auth users A/B/C, request, quote and JPEG in the ONE Supabase.
 *
 * Default: --plan OFFLINE. GitHub CI runs with an injected fake HTTP client.
 * --run requires independently-reviewed PRIVATE G1 backup/restore evidence,
 * explicit single-purpose ACK, known synthetic fixtures and three accounts.
 *
 * NO signUp, INSERT, UPDATE, DELETE, RPC calls, payment, chat, dispatch or push.
 * Auth password login itself may update session/last-sign-in metadata, so
 * --run is forbidden until G1 and the operator specifically authorizes it.
 * This tests RLS/column grants and storage access; it does NOT prove F4/F5,
 * true PSP, on-device compatibility, signed URL revocation, or G1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const PROJECT_REF='yivkqyjdeouxnwtwfekc';
export const PROJECT_URL='https://'+PROJECT_REF+'.supabase.co';
export const ACK='F125_HTTP_READONLY_'+PROJECT_REF;
export const FIXTURE_ACK='F125_SYNTHETIC_FIXTURES_REVIEWED';
export const MAX_PROOF_AGE_MS=7*24*60*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_PATH=/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.jpg$/i;
function requireValue(ok,code){if(!ok)throw Error(code);}
function isString(x){return typeof x==='string'&&x.trim().length>0;}
function noSecrets(obj){
 return Object.fromEntries(Object.entries(obj).filter(([k])=>!/(token|password|email|jwt|photo_path|path|key)/i.test(k)));
}
export function validateExecution(env,proof,now=Date.now()){
 requireValue(env.F125_RUN_ACK===ACK,'F125_ACK_REQUIRED');
 requireValue(env.F125_FIXTURE_ACK===FIXTURE_ACK,'F125_FIXTURES_NOT_ATTESTED');
 requireValue(env.F125_G1_HUMAN_REVIEW==='approved','F125_PRIVATE_G1_REVIEW_REQUIRED');
 requireValue(env.F1_BACKUP_RESTORE_VERIFIED==='yes','F125_G1_NOT_PROVEN');
 requireValue(env.F1_SUPABASE_URL===PROJECT_URL,'F125_WRONG_PROJECT');
 requireValue(/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.F1_PUBLISHABLE_KEY||''),'F125_PUBLIC_KEY_REQUIRED');
 requireValue(proof?.project_ref===PROJECT_REF&&proof?.backup_verified===true&&
  proof?.restore_verified===true&&proof?.scope_reviewed===true,
  'F125_PRIVATE_G1_SCOPE_UNVERIFIED');
 const at=Date.parse(proof?.checked_at||'');
 requireValue(Number.isFinite(at)&&at<=now+300000&&now-at>=0&&now-at<=MAX_PROOF_AGE_MS,
  'F125_PRIVATE_G1_PROOF_EXPIRED');
 for(const person of ['A','B','C']){
  requireValue(isString(env['F1_TEST_'+person+'_EMAIL'])&&
   isString(env['F1_TEST_'+person+'_PASSWORD']),
   'F125_TEST_ACCOUNTS_MISSING');
 }
 const emails=['A','B','C'].map(p=>env['F1_TEST_'+p+'_EMAIL'].trim().toLowerCase());
 requireValue(new Set(emails).size===3,'F125_USERS_MUST_BE_DISTINCT');
 requireValue(UUID.test(env.F125_FIXTURE_REQUEST_ID||'')&&
  UUID.test(env.F125_FIXTURE_QUOTE_ID||''),'F125_FIXTURE_UUID_INVALID');
 requireValue(PHOTO_PATH.test(env.F125_FIXTURE_PHOTO_PATH||''),
  'F125_PRIVATE_SYNTHETIC_JPEG_PATH_REQUIRED');
 requireValue(env.F125_NO_SIDE_EFFECTS_CONFIRMED==='yes','F125_AUTOMATION_ISOLATION_UNVERIFIED');
 return Object.freeze({
  requestId:env.F125_FIXTURE_REQUEST_ID.toLowerCase(),
  quoteId:env.F125_FIXTURE_QUOTE_ID.toLowerCase(),
  photoPath:env.F125_FIXTURE_PHOTO_PATH.toLowerCase()
 });
}
const headers=(key,token=null,contentType=null)=>{
 const h={apikey:key,'Cache-Control':'no-store'};
 if(token)h.Authorization='Bearer '+token;
 if(contentType)h['Content-Type']=contentType;
 return h;
};
const safePath=p=>p.split('/').map(encodeURIComponent).join('/');
const statusOK=r=>r?.status>=200&&r.status<300;
const statusDenied=r=>r?.status>=400&&r.status<500;
async function request(fetchImpl,url,init={}){
 // Reject all origins and methods other than supported routes.
 const u=new URL(url);
 requireValue(u.origin===PROJECT_URL,'F125_NETWORK_ORIGIN_DENIED');
 requireValue((init.method||'GET')==='GET' ||
  ((init.method||'GET')==='POST'&&u.pathname==='/auth/v1/token'),
  'F125_WRITE_METHOD_DENIED');
 requireValue(/^\/(auth\/v1\/(token|user)|rest\/v1\/(service_requests|service_quotes)|storage\/v1\/object\/(authenticated|public)\/request-photos\/)/.test(u.pathname),
  'F125_ENDPOINT_NOT_ALLOWLISTED');
 return fetchImpl(url,{...init,redirect:'manual',signal:AbortSignal.timeout(15000)});
}
async function responseJSON(response,code){
 requireValue(statusOK(response),code+'_HTTP_'+(response?.status??'NETWORK'));
 try{return await response.json()}catch{throw Error(code+'_INVALID_JSON')}
}
async function getRows(fetchImpl,token,key,table,id,columns){
 const endpoint=PROJECT_URL+'/rest/v1/'+table+'?id=eq.'+encodeURIComponent(id)+
  '&select='+encodeURIComponent(columns);
 const data=await responseJSON(await request(fetchImpl,endpoint,{
  headers:headers(key,token)
 }),'F125_'+table+'_READ');
 requireValue(Array.isArray(data),'F125_ROWS_NOT_ARRAY');
 return data;
}
async function testHiddenColumn(fetchImpl,key,token,requestId,col){
 const endpoint=PROJECT_URL+'/rest/v1/service_requests?id=eq.'+
  encodeURIComponent(requestId)+'&select='+encodeURIComponent(col);
 const res=await request(fetchImpl,endpoint,{headers:headers(key,token)});
 requireValue(statusDenied(res),'F125_PRIVATE_COLUMN_EXPOSED_'+col);
}
async function storageProbe(fetchImpl,key,token,path,route){
 return request(fetchImpl,PROJECT_URL+'/storage/v1/object/'+route+
  '/request-photos/'+safePath(path),{headers:headers(key,token)});
}
export function plan(){
 return [
  '1. Confirmar G1 REAL: backup, restore privado DB/Auth/Storage e revisão humana independente.',
  '2. Revisar automações/side effects; provisionar A cliente, B prestador escolhido, C terceiro legítimos e dados JPEG sintéticos, sob autorização separada.',
  '3. Configurar somente no ambiente privado três logins A/B/C, ID do pedido A+B, ID do orçamento de B e caminho do JPEG sintético criado por A.',
  '4. Exigir ACK específico, proof G1 recente e sinalização de que estes IDs são 100% sintéticos.',
  '5. Ler Auth /user, pedidos, propostas, colunas restritas e Storage via HTTP GET; autenticador POST password somente, nenhum RPC/POST de negócio.',
  '6. Não registrar tokens/PII/endereço/fotos; logs apenas PASS e códigos de resultado.',
  '7. Registrar G2 como TESTED apenas se fixtures reais foram verificadas; G1/G4/G5/G8 e deploy permanecem NO_GO.'
 ];
}
export async function runReadOnly(env,proof,fetchImpl=globalThis.fetch,logger=console.log,now=Date.now()){
 const fixture=validateExecution(env,proof,now); // MUST happen BEFORE ANY fetch.
 requireValue(typeof fetchImpl==='function','F125_FETCHER_UNAVAILABLE');
 let count=0;
 const pass=code=>{count++;logger('PASS '+code)};
 const identities={};
 for(const person of ['A','B','C']){
  const tokenResp=await request(fetchImpl,PROJECT_URL+'/auth/v1/token?grant_type=password',{
   method:'POST',
   headers:headers(env.F1_PUBLISHABLE_KEY,null,'application/json'),
   body:JSON.stringify({email:env['F1_TEST_'+person+'_EMAIL'],
    password:env['F1_TEST_'+person+'_PASSWORD']})
  });
  const tokenData=await responseJSON(tokenResp,'F125_AUTH_'+person);
  requireValue(isString(tokenData.access_token)&&UUID.test(tokenData.user?.id||''),
   'F125_AUTH_INVALID_'+person);
  const user=await responseJSON(await request(fetchImpl,PROJECT_URL+'/auth/v1/user',{
   headers:headers(env.F1_PUBLISHABLE_KEY,tokenData.access_token)
  }),'F125_AUTH_USER_'+person);
  requireValue(user.id===tokenData.user.id,'F125_AUTH_USER_MISMATCH_'+person);
  identities[person]={id:user.id.toLowerCase(),token:tokenData.access_token};
 }
 requireValue(new Set(Object.values(identities).map(x=>x.id)).size===3,'F125_AUTH_IDENTITIES_COLLIDE');
 requireValue(fixture.photoPath.startsWith(identities.A.id+'/'),
  'F125_JPEG_NOT_OWNED_BY_A');
 pass('auth_A_B_C_user_verified'); // tokens never logged

 for(const person of ['A','B']){
  const actor=identities[person].token;
  const req=await getRows(fetchImpl,actor,env.F1_PUBLISHABLE_KEY,
   'service_requests',fixture.requestId,'id,photo_path');
  requireValue(req.length===1&&req[0].id===fixture.requestId&&
   req[0].photo_path===fixture.photoPath,'F125_REQUEST_PARTICIPANT_MISSING_'+person);
  const quotes=await getRows(fetchImpl,actor,env.F1_PUBLISHABLE_KEY,
   'service_quotes',fixture.quoteId,'id,request_id');
  requireValue(quotes.length===1&&quotes[0].id===fixture.quoteId&&
    quotes[0].request_id===fixture.requestId,
   'F125_QUOTE_PARTICIPANT_MISSING_'+person);
 }
 pass('request_and_quote_visible_only_to_A_B');
 const third=identities.C.token;
 for(const [table,id,cols] of [
  ['service_requests',fixture.requestId,'id'],
  ['service_quotes',fixture.quoteId,'id']
 ]){
  const rows=await getRows(fetchImpl,third,env.F1_PUBLISHABLE_KEY,table,id,cols);
  requireValue(rows.length===0,'F125_THIRD_PARTY_RLS_LEAK_'+table);
 }
 pass('third_party_request_quote_denied');
 for(const col of ['latitude','longitude','address_details','request_key']){
  for(const person of ['A','B','C']){
   await testHiddenColumn(fetchImpl,env.F1_PUBLISHABLE_KEY,
    identities[person].token,fixture.requestId,col);
  }
 }
 pass('raw_location_address_request_key_columns_denied');
 for(const person of ['A','B']){
  const r=await storageProbe(fetchImpl,env.F1_PUBLISHABLE_KEY,
   identities[person].token,fixture.photoPath,'authenticated');
  requireValue(statusOK(r),'F125_JPEG_AUTHORIZED_READER_BLOCKED_'+person);
  // Never write the response to disk, console, or persisted evidence.
 }
 for(const token of [third,null]){
  const r=await storageProbe(fetchImpl,env.F1_PUBLISHABLE_KEY,
   token,fixture.photoPath,'authenticated');
  requireValue(statusDenied(r),'F125_JPEG_THIRD_OR_ANON_EXPOSED');
 }
 const pub=await storageProbe(fetchImpl,env.F1_PUBLISHABLE_KEY,
  null,fixture.photoPath,'public');
 requireValue(statusDenied(pub),'F125_JPEG_PUBLIC_EXPOSED');
 pass('jpeg_A_B_allowed_C_anon_public_denied');
 pass('business_mutations_zero_rpcs_zero_psp_zero_dispatch_zero');
 logger('RESULT F125=READ_ONLY_A_B_C_PASS; LIVE_BACKUP_PROOF_HUMAN_REVIEW_REQUIRED; F4_F5=NOT_TESTED; RELEASE=NO_GO');
 return noSecrets({passed:count,mode:'readonly_http',projectRef:PROJECT_REF,
  release:'NO_GO',locationRPC:'NOT_INVOKED',psp:'NOT_INVOKED',
  authTokens:'NOT_STORED',photoPath:fixture.photoPath});
}

const directlyInvoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(directlyInvoked){
 if(process.argv.length!==3||process.argv[2]!=='--run-readonly'){
  console.log('F125 PLAN ONLY: NO NETWORK OR AUTH. Explicit --run-readonly only after private G1 verification.');
  for(const step of plan())console.log(step);
 }else{
  try{
   requireValue(isString(process.env.F125_G1_PRIVATE_REPORT_PATH),
    'F125_PRIVATE_G1_REPORT_MISSING');
   const report=JSON.parse(readFileSync(process.env.F125_G1_PRIVATE_REPORT_PATH,'utf8'));
   await runReadOnly(process.env,report);
  }catch(error){
   // Never echo HTTP response body, JWT, signed URL or private fixture identifiers.
   const message=String(error?.message||'F125_UNEXPECTED_ERROR');
   const safe=/^F125_[A-Z0-9_]+$/.test(message)?message:'F125_READONLY_CHECK_FAILED';
   console.error('BLOCKED_OR_FAIL '+safe);
   process.exitCode=1;
  }
 }
}
