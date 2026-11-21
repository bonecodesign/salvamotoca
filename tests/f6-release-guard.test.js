"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const source=p=>fs.readFileSync(path.resolve(__dirname,"..",p),"utf8");
test("F6: todas as flags F1 a F6 continuam desligadas",()=>{
 const config=source("config.js");
 for(const flag of ["f1TestRequestsEnabled","f2TestOffersEnabled",
 "f3TowEnabled","f4PaymentsEnabled","f5OperationsEnabled","f6CompletionEnabled"])
   assert.match(config,new RegExp(flag+":\\s*false"));
});
test("F6: nenhum uso de navegador, banco, PSP, pagamentos ou notificacoes",()=>{
 const module=source("f6-offline-completion.js");
 for(const forbidden of [/fetch\s*\(/,/XMLHttpRequest/,/navigator\./,
 /createClient\s*\(/,/stripe/i,/service_role/,/supabase\./,
 /\.from\s*\(/,/new WebSocket\s*\(/,/sendBeacon\s*\(/])
    assert.doesNotMatch(module,forbidden);
});
test("F6: nao altera UI de producao ou simula recebimento real",()=>{
 const ui=source("live-app-current.js");
 assert.doesNotMatch(ui,/SMF6Offline|f6CompletionEnabled/);
 const module=source("f6-offline-completion.js");
 assert.match(module,/realPayoutAuthorized:false/);
 assert.match(module,/paymentVerifiedByPSP:false/);
});
