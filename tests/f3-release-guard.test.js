"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const file=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
test("F3: todas as fases permanecem desativadas",()=>{
 const config=file("config.js");
 for(const flag of ["f1TestRequestsEnabled","f2TestOffersEnabled","f3TowEnabled"])
  assert.match(config,new RegExp(flag+":\\s*false"));
});
test("F3: a interface só funciona após três liberações",()=>{
 const app=file("live-app-current.js");
 assert.match(app,/const f3Active = \(\) => f2Active\(\) && config\.f3TowEnabled === true/);
 assert.match(app,/if \(!f3Active\(\)/);
 assert.match(app,/if \(!f3Active\(\) \|\| !state\.user/);
});
test("F3: motor é carregado na PWA sem ativar serviços",()=>{
 assert.match(file("index.html"),/src="\.\/f3-tow\.js"/);
 assert.match(file("sw.js"),/'\.\/f3-tow\.js'/);
});
test("F3: nenhuma migration F3 foi criada no caminho de implantação",()=>{
 assert.equal(fs.readdirSync(path.join(__dirname,"../supabase/migrations"))
  .some(x=>/f3|reboque/i.test(x)),false);
 assert.match(file("supabase/drafts/f3_tow_backend_candidate.sql"),
  /NÃO aplicar no Supabase hospedado/);
});
test("F3: gate servidor começa false e exige também F2",()=>{
 const ddl=file("supabase/drafts/f3_tow_backend_candidate.sql");
 assert.match(ddl,/enabled boolean not null default false/);
 assert.match(ddl,/from private\.f3_release_gate/);
 assert.match(ddl,/from private\.f2_release_gate/);
});
test("F3: RLS não entrega destino privado a prestador sem pagamento",()=>{
 const ddl=file("supabase/drafts/f3_tow_backend_candidate.sql");
 assert.match(ddl,/create policy f3_tow_owner_read/);
 assert.match(ddl,/r\.customer_id=\(select auth\.uid\(\)\)/);
 assert.match(ddl,/function public\.f3_tow_summary/);
 assert.match(ddl,/jsonb_build_object/);
 assert.doesNotMatch(ddl.slice(ddl.indexOf("return jsonb_build_object("),ddl.indexOf("-- Ofertas F3")),
  /destination_address|pickup_lat|pickup_lng/i);
});
test("F3: capacidade auto declarada não é aprovação",()=>{
 const ddl=file("supabase/drafts/f3_tow_backend_candidate.sql");
 assert.match(ddl,/verified_by_admin boolean not null default false/);
 assert.match(ddl,/verified_by_admin=false,updated_at=now\(\)/);
 assert.match(ddl,/cap\.verified_by_admin/);
});
test("F3: protege aceite e leitura de fotos contra bypass da F2",()=>{
 const ddl=file("supabase/drafts/f3_tow_backend_candidate.sql");
 assert.match(ddl,/create or replace function private\.f2_can_view_request/);
 assert.match(ddl,/private\.f3_enabled\(\)/);
 assert.match(ddl,/create trigger f3_guard_tow_quote_accept/);
 assert.match(ddl,/create trigger f3_guard_tow_offer_transition/);
});
test("F3: rollback restaura função F2 e a proibição original F1",()=>{
 const rollback=file("supabase/rollback/f3_only_if_empty.sql");
 assert.match(rollback,/gate F3 ativo/);
 assert.match(rollback,/dados F3 existentes/);
 assert.match(rollback,/create or replace function private\.f2_can_view_request/);
 assert.match(rollback,/and not\('reboque_moto'=any\(service_types\)\)/);
});
test("F3: pedido completo é criado numa única operação protegida",()=>{
 const ddl=file("supabase/drafts/f3_tow_backend_candidate.sql");
 assert.match(ddl,/function public\.f3_create_tow_request/);
 assert.match(ddl,/insert into public\.service_requests/);
 assert.match(ddl,/insert into public\.f3_tow_requests/);
 assert.match(ddl,/Chave de pedido reutilizada com dados diferentes/);
});
test("F3: nenhuma função F3 efetua pagamento, push ou despacho",()=>{
 const ddl=file("supabase/drafts/f3_tow_backend_candidate.sql");
 assert.doesNotMatch(ddl,/\bstatus\s*=\s*'paid'/i);
 assert.doesNotMatch(ddl,/stripe\.|pix_charge|dispatch_provider\(/i);
 assert.match(file("live-app-current.js"),/Nenhum transporte real foi acionado/);
});
