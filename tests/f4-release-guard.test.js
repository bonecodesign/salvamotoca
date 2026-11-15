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
test("F4: backend mock permanece apenas draft (nenhuma migration F4 remota)",()=>{
 const migrations=fs.readdirSync(path.join(__dirname,"../supabase/migrations"));
 assert.equal(migrations.some(x=>/f4|pagamento|stripe|financial/i.test(x)),false);
 assert.match(file("docs/F4_DEPENDENCIAS_E_PLANO.md"),/Nenhum checkout/);
});
test("F4: prévia offline não importa Stripe ou Supabase",()=>{
 const html=file("docs/F4_PREVIEW.html");
 assert.match(html,/src="\.\.\/f4-finance\.js"/);
 assert.doesNotMatch(html,/<script[^>]+src=["']https?:|supabase\.createClient|Stripe\s*\(|js\.stripe\.com|<form[^>]+action=/i);
});
test("F4: checkout/repasse nunca pode ser liberado pelo módulo de simulação",()=>{
 const js=file("f4-finance.js");
 assert.match(js,/paymentAllowed:false,chatAllowed:false,dispatchAllowed:false/);
 assert.match(js,/payoutAllowed:false/);
 assert.match(js,/transferAllowedInThisModule:false/);
 assert.match(js,/accepted:false,reason:"O navegador nunca confirma pagamento/);
});


test("F4: SQL nasce desligado e não marca pedido como pago",()=>{
 const ddl=file("supabase/drafts/f4_financial_backend_candidate.sql");
 assert.match(ddl,/enabled boolean not null default false/);
 assert.match(ddl,/create table private\.f4_mock_payment_attempts/);
 assert.match(ddl,/create table private\.f4_mock_webhook_receipts/);
 assert.match(ddl,/create table private\.f4_mock_ledger_entries/);
 assert.match(ddl,/current_setting\('app\.f4_test_only',true\) is distinct from 'local_fixture'/);
 assert.doesNotMatch(ddl,/set\s+status\s*=\s*'paid'/i);
 assert.doesNotMatch(ddl,/\bstripe\.[a-z]+\s*\(|\bcreate_transfer\s*\(|\bcreate_payment_intent\s*\(/i);
});
test("F4: ninguém autenticado escreve no ledger ou invoca evento financeiro mock",()=>{
 const ddl=file("supabase/drafts/f4_financial_backend_candidate.sql");
 assert.match(ddl,/revoke all on private\.f4_mock_payment_attempts/);
 assert.match(ddl,/private\.f4_ingest_mock_event\(uuid,text,text,integer,text\)\s+from public,anon,authenticated/);
 assert.match(ddl,/create trigger f4_ledger_no_update_delete/);
 assert.match(ddl,/raise exception 'Ledger F4 imutável/);
});
test("F4: mock HMAC não é integrado ao aplicativo como verificador PSP real",()=>{
 const js=file("f4-mock-webhook.js");
 assert.match(js,/NÃO STRIPE/);
 assert.match(js,/const VERSION="mock-v1"/);
 assert.match(js,/crypto\.timingSafeEqual/);
 assert.match(js,/canMarkPaid:false/);
 assert.doesNotMatch(file("index.html"),/f4-mock-webhook\.js/);
 assert.doesNotMatch(file("live-app-current.js"),/f4_ingest_mock_event|f4_prepare_mock_attempt/);
});
test("F4: reversão é bloqueada com dados e restaura sem tocar F1/F2",()=>{
 const rollback=file("supabase/rollback/f4_only_if_empty.sql");
 assert.match(rollback,/gate ativo/);
 assert.match(rollback,/existem registros financeiros/);
 assert.doesNotMatch(rollback,/drop table public\.service_requests|drop table public\.f2_request_offers/);
 assert.match(file(".github/workflows/f4-tests.yml"),/f4-rollback-guard\.sh/);
});


test("F4: diário de partidas dobradas é privado e não existe no esquema remoto",()=>{
 const ddl=file("supabase/drafts/f4_double_entry_mock_candidate.sql");
 const migrations=fs.readdirSync(path.join(__dirname,"../supabase/migrations"));
 assert.equal(migrations.some(x=>/f4|double_entry|ledger|stripe/i.test(x)),false);
 assert.match(ddl,/create table private\.f4_mock_journals/);
 assert.match(ddl,/create table private\.f4_mock_journal_lines/);
 assert.match(ddl,/enable row level security/g);
 assert.match(ddl,/revoke all on private\.f4_mock_journals/);
 assert.match(ddl,/create constraint trigger f4_journal_balance_on_header/);
 assert.match(ddl,/deferrable initially deferred/);
 assert.match(ddl,/create constraint trigger f4_journal_balance_on_line/);
});
test("F4: decisão de repasse é exclusivamente informativa",()=>{
 const ddl=file("supabase/drafts/f4_double_entry_mock_candidate.sql");
 assert.match(ddl,/function private\.f4_mock_settlement_review/);
 assert.match(ddl,/'transferAuthorized',false/);
 assert.match(ddl,/'requiresPSPReconciliation',true/);
 assert.match(ddl,/'requiresF6RealConfirmations',true/);
 assert.match(ddl,/current_setting\('app\.f4_test_only',true\) is distinct from 'local_fixture'/);
 assert.doesNotMatch(ddl,/create\s+function\s+public\.f4_transfer/);
});
test("F4: rollback da extensão só atua vazia, sem tocar esquema F2",()=>{
 const rollback=file("supabase/rollback/f4_double_entry_only_if_empty.sql");
 assert.match(rollback,/gate ativo/);
 assert.match(rollback,/existem partidas/);
 assert.doesNotMatch(rollback,/drop table public\./);
 assert.match(file(".github/workflows/f4-tests.yml"),/tests\/f4-double-entry\.sql/);
 assert.match(file(".github/workflows/f4-tests.yml"),/f4-double-entry-rollback-guard\.sh/);
});
