"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const F4=require("../f4-finance.js"),B=require("../f456-financial-bridge-offline.js");
const R="33333333-3333-4333-8333-333333333333";
const Q="44444444-4444-4444-8444-444444444444";
const C="11111111-1111-4111-8111-111111111111";
const P="22222222-2222-4222-8222-222222222222";
const X="55555555-5555-4555-8555-555555555555";
const quote=()=>F4.quoteSnapshot({requestId:R,quoteId:Q,items:[
 {kind:"service",code:"reboque_moto",amountCents:23000},
 {kind:"travel",code:"deslocamento",amountCents:4000}
]});
const fresh=()=>B.make({quote:quote(),customerId:C,providerId:P,createdAt:1000});
const paid=(override={})=>({
 id:"evt_mock_paid_001",kind:"mock_payment_confirmed",
 actorId:"offline_fixture",fixtureReceipt:B.MOCK_RECEIPT,requestId:R,quoteId:Q,
 customerId:C,providerId:P,currency:"BRL",amountCents:29300,
 providerReceivableCents:24700,at:2000,...override
});
const risk=(override={})=>({
 id:"evt_risk_hold_001",kind:"mock_dispute",actorId:"offline_fixture",
 fixtureReceipt:B.MOCK_RECEIPT,requestId:R,quoteId:Q,customerId:C,providerId:P,
 amountCents:29300,...override
});
const dispatch={kind:"dispatch",id:"evt_dispatch_001",actorId:P,at:2100,shareLocationConsent:true};

test("Rider, provider, request e quote sao necessarios no recibo mock",()=>{
 for(const mutation of [
  {customerId:X},{providerId:X},{requestId:X},{quoteId:X},
  {customerId:null},{providerId:null},{amountCents:30450},
  {providerReceivableCents:24550}
 ])assert.throws(()=>B.mockPayment(fresh(),paid(mutation)),/Pagamento de fixture inválido/);
 assert.equal(B.mockPayment(fresh(),paid()).mockPaymentRecorded,true);
});
test("Tentativas de risco de pedido alheio nao bloqueiam uma sessao correta",()=>{
 const s=B.mockPayment(fresh(),paid());
 for(const mutation of [
  {customerId:X},{providerId:X},{requestId:X},{quoteId:X},
  {fixtureReceipt:"PSP_PAYMENT"},{actorId:X},{amountCents:30450}
 ])assert.throws(()=>B.risk(s,risk(mutation)),/Risco financeiro fictício inválido/);
 assert.equal(s.risk,"clear");
 assert.equal(B.risk(s,risk()).risk,"mock_hold");
});
test("Replay de recibo e risco nao gera segundo efeito",()=>{
 const s=B.mockPayment(fresh(),paid());
 assert.throws(()=>B.mockPayment(s,paid()),/não permite reconfirmação/);
 const held=B.risk(s,risk());
 assert.throws(()=>B.risk(held,risk()),/uma única vez/);
 assert.equal(B.settlementReview(held).transferAuthorized,false);
});
test("Duas mensagens operacionais com o mesmo ID e conteudo diferem e sao recusadas",()=>{
 const s=B.mockPayment(fresh(),paid());
 const a=B.operational(s,dispatch);
 assert.equal(a.state.f5.version,2);
 const repeat=B.operational(a.state,dispatch);
 assert.equal(repeat.duplicate,true);
 assert.strictEqual(repeat.state,a.state);
 assert.throws(()=>B.operational(a.state,{...dispatch,at:2101}),/Colisão/);
});
test("Risco simultaneo ao deslocamento: estado de hold nega GPS, chat e repasse",()=>{
 const s=B.operational(B.mockPayment(fresh(),paid()),dispatch).state;
 const hold=B.risk(s,risk());
 assert.throws(()=>B.operational(hold,{
  kind:"provider_location",id:"evt_location_001",actorId:P,at:2200,
  lat:-19.9,lng:-43.9,sampledAt:2190,accuracyMeters:20
 }),/bloqueado/);
 assert.equal(B.viewFor(hold,C).f5MockLocation,null);
 assert.equal(B.viewFor(hold,C).f5MockChatOpen,false);
 assert.equal(B.settlementReview(hold).transferAuthorized,false);
 assert.equal(hold.realPaymentVerified,false);
});
test("Corrida entre dois snapshots locais nao prova serializacao de banco",()=>{
 // Um simulador imutavel produz duas propostas a partir do mesmo estado.
 // O servidor real precisara version/CAS, idempotency key unica e locks.
 const original=B.mockPayment(fresh(),paid());
 const a=B.operational(original,dispatch).state;
 const b=B.operational(original,dispatch).state;
 assert.notStrictEqual(a,b);
 assert.equal(a.f5.version,b.f5.version);
 assert.equal(a.realDispatchAuthorized,false);
 assert.equal(b.realDispatchAuthorized,false);
 assert.equal(B.settlementReview(a).transferAuthorized,false);
});
