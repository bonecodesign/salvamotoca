"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const repo=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
test("F5: gate público permanece false",()=>{
  assert.match(repo("config.js"),/f5OperationsEnabled:\s*false/);
  assert.match(repo("config.js"),/f4PaymentsEnabled:\s*false/);
  assert.match(repo("config.js"),/f3TowEnabled:\s*false/);
  assert.match(repo("config.js"),/f2TestOffersEnabled:\s*false/);
  assert.match(repo("config.js"),/f1TestRequestsEnabled:\s*false/);
});
test("F5: mock não usa API financeira, geolocalização real ou Supabase",()=>{
  const src=repo("f5-offline-flow.js");
  for (const forbidden of [
    /fetch\s*\(/, /navigator\.geolocation/, /createClient\s*\(/,
    /service_role/, /sb_secret_/, /PaymentIntent/, /\.from\s*\(/,
    /WebSocket\s*\(/, /sendBeacon\s*\(/
  ]) assert.doesNotMatch(src,forbidden);
});
test("F5: nenhuma integração com a interface real foi ativada",()=>{
  const ui=repo("live-app-current.js");
  assert.doesNotMatch(ui,/SMF5Offline|f5OperationsEnabled/);
});
test("F5: a prévia não inclui integrações ou bibliotecas externas",()=>{
  const src=repo("docs/F5_PREVIEW.html");
  for(const forbidden of [/https?:\/\//i, /supabase\.co/i, /stripe/i,
    /navigator\.geolocation/i, /localStorage\s*\(/i])
    assert.doesNotMatch(src,forbidden);
});
