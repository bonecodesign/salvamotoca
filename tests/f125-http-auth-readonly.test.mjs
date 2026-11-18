import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {
 PROJECT_REF,PROJECT_URL,ACK,FIXTURE_ACK,
 plan,validateExecution,runReadOnly
} from '../scripts/f125-http-auth-readonly.mjs';

const A='11111111-1111-4111-8111-111111111111';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C='55555555-5555-4555-8555-555555555555';
const REQ='33333333-3333-4333-8333-333333333333';
const Q='44444444-4444-4444-8444-444444444444';
const PHOTO=A+'/88888888-8888-4888-8888-888888888888.jpg';
const NOW=Date.parse('2026-11-17T20:00:00Z');
const proof={
 project_ref:PROJECT_REF,backup_verified:true,restore_verified:true,
 scope_reviewed:true,checked_at:new Date(NOW-60000).toISOString()
};
const env={
 F125_RUN_ACK:ACK,F125_FIXTURE_ACK:FIXTURE_ACK,
 F125_G1_HUMAN_REVIEW:'approved',
 F125_NO_SIDE_EFFECTS_CONFIRMED:'yes',
 F1_BACKUP_RESTORE_VERIFIED:'yes',
 F1_SUPABASE_URL:PROJECT_URL,F1_PUBLISHABLE_KEY:'sb_publishable_FAKEFOROFFLINETESTONLY',
 F125_FIXTURE_REQUEST_ID:REQ,F125_FIXTURE_QUOTE_ID:Q,
 F125_FIXTURE_PHOTO_PATH:PHOTO,
 F1_TEST_A_EMAIL:'a@example.invalid',F1_TEST_A_PASSWORD:'passA-secret-123',
 F1_TEST_B_EMAIL:'b@example.invalid',F1_TEST_B_PASSWORD:'passB-secret-456',
 F1_TEST_C_EMAIL:'c@example.invalid',F1_TEST_C_PASSWORD:'passC-secret-789'
};
const ok=(value)=>({status:200,ok:true,json:async()=>value});
const deny=(n=403)=>({status:n,ok:false,json:async()=>({})});
function api(overrides={}){
 const calls=[];
 async function fetchStub(url,init={}){
  const u=new URL(url);
  const method=init.method||'GET';
  const jwt=init.headers?.Authorization?.replace(/^Bearer /,'');
  let user=Object.entries({A,B,C}).find(([k])=>jwt==='jwt-'+k)?.[1];
  calls.push({url:u.pathname,params:u.searchParams.toString(),method,subject:user||null});
  if(u.pathname==='/auth/v1/token'){
   const body=JSON.parse(init.body);
   const persona=body.email.slice(0,1).toUpperCase();
   if(!['A','B','C'].includes(persona))return deny(401);
   return ok({access_token:'jwt-'+persona,user:{id:{A,B,C}[persona]}});
  }
  if(u.pathname==='/auth/v1/user')return user?ok({id:user}):deny(401);
  if(u.pathname==='/rest/v1/service_requests'){
   const cols=u.searchParams.get('select');
   if(['latitude','longitude','address_details','request_key'].includes(cols)){
    if(overrides.exposeLocation&&cols==='latitude')return ok([{latitude:0}]);
    return deny(403);
   }
   if(user===C){
    if(overrides.leakC)return ok([{id:REQ}]);
    return ok([]);
   }
   return user===A||user===B?ok([{id:REQ,photo_path:PHOTO}]):deny(403);
  }
  if(u.pathname==='/rest/v1/service_quotes'){
   return user===C?ok([]):(user===A||user===B?ok([{id:Q,request_id:REQ}]):deny(403));
  }
  if(u.pathname.startsWith('/storage/v1/object/')){
   if(u.pathname.includes('/public/')){
    if(overrides.publicJPEG)return ok({});
    return deny(404);
   }
   if(user===C||!user){
    if(overrides.exposeCJPEG&&user===C)return ok({});
    return deny(403);
   }
   return ok({});
  }
  throw Error('MOCK_UNEXPECTED_ENDPOINT_'+u.pathname);
 }
 return{calls,fetchStub};
}

test('default CLI plan runs offline with no credentials or network',()=>{
 const output=execFileSync(process.execPath,['scripts/f125-http-auth-readonly.mjs','--plan'],{encoding:'utf8'});
 assert.match(output,/NO NETWORK OR AUTH/);
 assert.match(output,/Backup|backup/);
 assert.ok(plan().length>=7);
});
test('G1 evidence/approval cannot be skipped before any login',async()=>{
 const mock=api();
 await assert.rejects(()=>runReadOnly({},null,mock.fetchStub,()=>{},NOW),/F125_ACK_REQUIRED/);
 assert.equal(mock.calls.length,0);
 for(const [field,value] of [
  ['F125_G1_HUMAN_REVIEW',''],
  ['F1_BACKUP_RESTORE_VERIFIED','no'],
  ['F125_FIXTURE_ACK',''],
  ['F125_NO_SIDE_EFFECTS_CONFIRMED','no']
 ]){
  await assert.rejects(()=>runReadOnly({...env,[field]:value},proof,mock.fetchStub,()=>{},NOW),/F125_/);
 }
 assert.equal(mock.calls.length,0);
});
test('Reject wrong project, service role/secret key, missing B, stale G1',()=>{
 assert.throws(()=>validateExecution({...env,F1_SUPABASE_URL:'https://evil.invalid'},proof,NOW),/WRONG_PROJECT/);
 assert.throws(()=>validateExecution({...env,F1_PUBLISHABLE_KEY:'sb_secret_FORBIDDEN'},proof,NOW),/PUBLIC_KEY_REQUIRED/);
 assert.throws(()=>validateExecution({...env,F1_TEST_B_PASSWORD:''},proof,NOW),/ACCOUNTS_MISSING/);
 assert.throws(()=>validateExecution({...env,F1_TEST_C_EMAIL:env.F1_TEST_A_EMAIL},proof,NOW),/USERS_MUST_BE_DISTINCT/);
 assert.throws(()=>validateExecution(env,{...proof,restore_verified:false},NOW),/SCOPE_UNVERIFIED/);
 assert.throws(()=>validateExecution(env,{...proof,checked_at:new Date(NOW-8*86400000).toISOString()},NOW),/PROOF_EXPIRED/);
});
test('Synthetic path must be owner-matched to A after real-looking login',async()=>{
 const mock=api();
 const bad={...env,F125_FIXTURE_PHOTO_PATH:B+'/88888888-8888-4888-8888-888888888888.jpg'};
 await assert.rejects(()=>runReadOnly(bad,proof,mock.fetchStub,()=>{},NOW),/JPEG_NOT_OWNED_BY_A/);
 assert.equal(mock.calls.filter(x=>x.method==='POST').length,3);
 assert.equal(mock.calls.filter(x=>x.url.includes('/storage/')).length,0);
});
test('Mock HTTP A/B/C checks read-only RLS, column grants and JPEG',async()=>{
 const mock=api(),logs=[];
 const r=await runReadOnly(env,proof,mock.fetchStub,s=>logs.push(s),NOW);
 assert.equal(r.passed,6);
 assert.equal(r.release,'NO_GO');
 assert.equal(r.locationRPC,'NOT_INVOKED');
 assert.equal(mock.calls.filter(x=>x.method==='POST').length,3);
 assert.equal(mock.calls.filter(x=>x.url.includes('/rpc/')).length,0);
 assert.equal(mock.calls.filter(x=>x.url.includes('/storage/')).length,5);
 assert.ok(mock.calls.every(x=>x.method==='GET'||x.url==='/auth/v1/token'));
 assert.ok(logs.some(s=>s.includes('third_party_request_quote_denied')));
 assert.ok(logs.some(s=>s.includes('jpeg_A_B_allowed_C_anon_public_denied')));
 const visible=JSON.stringify({r,logs});
 for(const secret of ['jwt-A','jwt-B','jwt-C','passA-secret-123',
  'passB-secret-456','passC-secret-789',PHOTO,REQ,Q]){
  assert.ok(!visible.includes(secret),'leaked '+secret);
 }
});
test('Leak of request to C fails closed',async()=>{
 const mock=api({leakC:true});
 await assert.rejects(()=>runReadOnly(env,proof,mock.fetchStub,()=>{},NOW),/THIRD_PARTY_RLS_LEAK/);
});
test('Leak of location via direct column access fails closed',async()=>{
 const mock=api({exposeLocation:true});
 await assert.rejects(()=>runReadOnly(env,proof,mock.fetchStub,()=>{},NOW),/PRIVATE_COLUMN_EXPOSED_latitude/);
});
test('Leak of storage bytes to C or public fails closed',async()=>{
 const mock=api({exposeCJPEG:true});
 await assert.rejects(()=>runReadOnly(env,proof,mock.fetchStub,()=>{},NOW),/JPEG_THIRD_OR_ANON_EXPOSED/);
 const mock2=api({publicJPEG:true});
 await assert.rejects(()=>runReadOnly(env,proof,mock2.fetchStub,()=>{},NOW),/JPEG_PUBLIC_EXPOSED/);
});
test('Input identities and image paths use explicit UUID syntax',()=>{
 assert.throws(()=>validateExecution({...env,F125_FIXTURE_REQUEST_ID:'not-a-uuid'},proof,NOW),/FIXTURE_UUID_INVALID/);
 assert.throws(()=>validateExecution({...env,F125_FIXTURE_PHOTO_PATH:'../../unauthorized.jpg'},proof,NOW),/JPEG_PATH_REQUIRED/);
});
test('No business write methods, RPCs, generated users, payment, or notifications',()=>{
 const content=readFileSync(new URL('../scripts/f125-http-auth-readonly.mjs',import.meta.url),'utf8');
 assert.match(content,/F125_WRITE_METHOD_DENIED/);
 assert.match(content,/F125_ENDPOINT_NOT_ALLOWLISTED/);
 assert.match(content,/auth\/v1\/token/);
 assert.match(content,/F125_G1_HUMAN_REVIEW/);
 assert.doesNotMatch(content,/\/auth\/v1\/signup|\/rest\/v1\/rpc\/|storage\/v1\/object\/sign\/|\/functions\/v1\//);
});
