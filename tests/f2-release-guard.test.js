"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
test("F2 não ativa pedidos ou ofertas em config.js",()=>{
  const config=read("config.js");
  assert.match(config,/f1TestRequestsEnabled:\s*false/);
  assert.match(config,/f2TestOffersEnabled:\s*false/);
});
test("F2 exige simultaneamente liberação explícita F1 + F2 na UI",()=>{
  const app=read("live-app-current.js");
  assert.match(app,/const f2Active = \(\) => config\.f1TestRequestsEnabled === true &&/);
  assert.match(app,/config\.f2TestOffersEnabled === true/);
  assert.match(app,/if \(!f2Active\(\)\) return;/);
});
test("Backend SQL nasce desligado mesmo se futuro operador aplicá-lo",()=>{
  const ddl=read("supabase/drafts/f2_backend_candidate.sql");
  assert.match(ddl,/enabled boolean not null default false/);
  assert.match(ddl,/values \(true,false\)/);
  assert.match(ddl,/if not exists\(select 1 from private\.f2_release_gate where enabled\)/);
  assert.match(ddl,/from public\.f2_request_offers/);
});
test("Somente draft do SQL F2; nenhuma migração remota é incluída",()=>{
  assert.equal(fs.existsSync(path.join(__dirname,"../supabase/migrations/20261114_f2.sql")),false);
  assert.match(read("docs/F2_DEPENDENCIAS_E_PLANO.md"),/não implantado|NÃO APLICAR|não foi aplicada/i);
});
test("Interface F2 fica protegida no mesmo serviço web e cache PWA",()=>{
  assert.match(read("index.html"),/src="\.\/f2-flow\.js"/);
  assert.match(read("sw.js"),/'\.\/f2-flow\.js'/);
});
test("F2 não autoriza pagamento, chat ou despacho",()=>{
  const ddl=read("supabase/drafts/f2_backend_candidate.sql");
  assert.doesNotMatch(ddl,/\b(?:status|paid_status)\s*=\s*'paid'/i);
  assert.doesNotMatch(ddl,/\b(?:charge|capture|transfer_payment)\s*\(/i);
  const app=read("live-app-current.js");
  assert.match(app,/Pagamento e chat continuam bloqueados/);
});


test("F2: recusa só passa por RPC autenticada e rollback a desfaz",()=>{
  const ddl=read("supabase/drafts/f2_backend_candidate.sql");
  const rollback=read("supabase/rollback/f2_only_if_empty.sql");
  const app=read("live-app-current.js");
  assert.match(ddl,/function public\.f2_decline_offer\(p_offer_id uuid\)/);
  assert.match(ddl,/f2_decline_offer\(uuid\) from public,anon,authenticated/);
  assert.match(ddl,/f2_decline_offer\(uuid\).*f2_submit_quote/s);
  assert.match(rollback,/drop function public\.f2_decline_offer\(uuid\)/);
  assert.match(app,/rpc = "f2_decline_offer"/);
  assert.match(app,/\["f2-distribute","f2-ack","f2-decline"/);
});
