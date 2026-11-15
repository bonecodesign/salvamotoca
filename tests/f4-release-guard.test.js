"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const file=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
test("F4: flags F1-F4 permanecem desligadas",()=>{
 const config=file("config.js");
 for(const name of ["f1TestRequestsEnabled","f2TestOffersEnabled","f3TowEnabled","f4PaymentsEnabled"])
  assert.match(config,new RegExp("\\b"+name+":\\s*false"));
});
test("F4: motor offline não contém operações externas",()=>{
 const js=file("f4-finance.js");
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|\.rpc\s*\(|\.upload\s*\(|createClient\s*\(|\bStripe\s*\(|https?:\/\/|stripe\.com|sb_secret|sk_(live|test)_/);
});
test("F4: pagamentos externos ainda não estão no frontend operacional",()=>{
 const app=file("live-app-current.js");
 assert.doesNotMatch(app,/stripe\.confirmPayment|redirectToCheckout|createPaymentMethod|checkout\.sessions/);
 assert.doesNotMatch(app,/rpc\s*\(\s*["']f4_(confirm|capture|transfer|refund)/);
});
test("F4: somente documentação e motor puro (nenhuma migration F4 remota)",()=>{
 const migrations=fs.readdirSync(path.join(__dirname,"../supabase/migrations"));
 assert.equal(migrations.some(x=>/f4|pagamento|stripe|financial/i.test(x)),false);
 assert.match(file("docs/F4_DEPENDENCIAS_E_PLANO.md"),/Nenhum checkout/);
});
test("F4: prévia offline não importa Stripe ou Supabase",()=>{
 const html=file("docs/F4_PREVIEW.html");
 assert.match(html,/src="\.\.\/f4-finance\.js"/);
 assert.doesNotMatch(html,/https?:\/\/|supabase|stripe\.js|js\.stripe\.com|<form[^>]+action=/i);
});
test("F4: checkout/repasse nunca pode ser liberado pelo módulo de simulação",()=>{
 const js=file("f4-finance.js");
 assert.match(js,/paymentAllowed:false,chatAllowed:false,dispatchAllowed:false/);
 assert.match(js,/payoutAllowed:false/);
 assert.match(js,/transferAllowedInThisModule:false/);
 assert.match(js,/accepted:false,reason:"O navegador nunca confirma pagamento/);
});
