// Read-only hosted preflight. Never log response bodies, keys, or user data.
// No POST, PATCH, PUT, DELETE, RPC, login, or signup.
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
const host="https://yivkqyjdeouxnwtwfekc.supabase.co";
const config=readFileSync(new URL("../config.js",import.meta.url),"utf8");
const configured=config.match(/supabaseUrl\s*:\s*["']([^"']+)["']/)?.[1];
const key=config.match(/supabasePublishableKey\s*:\s*["'](sb_publishable_[A-Za-z0-9_-]+)["']/)?.[1];
assert.equal(configured,host);
assert.ok(key,"Expected public application key");
for(const flag of ["f1TestRequestsEnabled","f2TestOffersEnabled","f3TowEnabled","f4PaymentsEnabled","f5OperationsEnabled","f6CompletionEnabled"]){
 assert.match(config,new RegExp("\\b"+flag+"\\s*:\\s*false\\b"));
}
const checks=[
 ["AUTH_SETTINGS_REACHABLE","/auth/v1/settings",[200]],
 ["PUBLIC_CATALOG_REACHABLE","/rest/v1/service_categories?select=id&limit=0",[200]],
 ["ANON_REQUESTS_DENIED","/rest/v1/service_requests?select=id&limit=0",[401,403]],
 ["ANON_EXACT_ADDRESS_DENIED","/rest/v1/service_requests?select=address_details&limit=0",[401,403]],
];
let passed=0;
for(const [label,path,expected] of checks){
 try{
  const r=await fetch(host+path,{method:"GET",headers:{apikey:key,Accept:"application/json"},redirect:"manual",signal:AbortSignal.timeout(15000)});
  const valid=expected.includes(r.status);
  if(r.body)await r.body.cancel();
  console.log(label+"="+(valid?"PASS":"FAIL")+" HTTP="+r.status);
  if(valid)passed++;
 }catch{console.log(label+"=BLOCKED NETWORK");}
}
console.log("F1_HOSTED_READONLY_CHECKS="+passed+"/"+checks.length);
console.log("AUTH_USER_SESSION=NOT_EXECUTED");
console.log("STORAGE_AUTHENTICATED=NOT_EXECUTED");
console.log("HOSTED_WRITES=NONE");
console.log("RELEASE=NO_GO");
if(passed!==checks.length)process.exitCode=1;
