/* F1: a liberação requer homologação humana; CI não deve destravar o piloto por engano. */
"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const source=name=>fs.readFileSync(path.join(root,name),"utf8");

test("F1: configuração pública bloqueia envio enquanto falta homologação real",()=>{
  const sandbox={window:{}};
  vm.runInNewContext(source("config.js"),sandbox,{timeout:1000});
  const config=sandbox.window.BJ_CONFIG;
  assert.equal(config.f1TestRequestsEnabled,false);
  assert.match(config.supabaseUrl,/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/);
  assert.match(config.supabasePublishableKey,/^sb_publishable_/);
  for(const [key,value] of Object.entries(config)){
    assert.doesNotMatch(key,/secret|service_role|password|adminKey/i);
    if(typeof value==="string")assert.doesNotMatch(value,/^(sb_secret_|eyJ[a-zA-Z0-9_-]{50,})/);
  }
});

test("F1: envio forçado é interrompido pela mesma flag antes de autenticação/upload",()=>{
  const code=source("live-app-current.js");
  const begin=code.indexOf('if (form.id === "request-form") submitForm(');
  const gate=code.indexOf("if (config.f1TestRequestsEnabled !== true)",begin);
  const upload=code.indexOf('.storage.from("request-photos").upload(',begin);
  assert.ok(begin>0 && gate>begin && upload>gate,
    "O envio precisa falhar quando a flag estiver desligada");
});

test("F1: retry filtra por campos autorizados, sem consultar request_key via REST",()=>{
  const code=source("live-app-current.js");
  assert.match(code,/\.eq\("customer_id", requestUserId\)\.eq\("photo_path", path\)\.maybeSingle\(\)/);
  assert.doesNotMatch(code,/\.eq\("request_key",/);
});
