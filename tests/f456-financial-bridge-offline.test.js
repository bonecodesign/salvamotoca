"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const F4=require("../f4-finance.js");
const B=require("../f456-financial-bridge-offline.js");
const R="33333333-3333-4333-8333-333333333333";
const Q="44444444-4444-4444-8444-444444444444";
const C="11111111-1111-4111-8111-111111111111";
const P="22222222-2222-4222-8222-222222222222";
const X="55555555-5555-4555-8555-555555555555";
const accepted=()=>F4.quoteSnapshot({
 requestId:R,quoteId:Q,items:[
  {kind:"service",code:"reboque_moto",amountCents:23000},
  {kind:"travel",code:"deslocamento",amountCents:4000}
 ]});
const make=()=>B.make({quote:accepted(),customerId:C,providerId:P,createdAt:1000});
const receipt=(more={})=>({
 id:"evt_mock_paid_001",kind:"mock_payment_confirmed",
 actorId:"offline_fixture",fixtureReceipt:B.MOCK_RECEIPT,
 requestId:R,quoteId:Q,customerId:C,providerId:P,currency:"BRL",amountCents:29300,
 providerReceivableCents:24700,at:2000,...more
});
const pay=()=>B.mockPayment(make(),receipt());
const act=(s,kind,id,at,more={})=>B.operational(s,{kind,id,at,actorId:P,...more}).state;
const handoff=()=>{
 let s=pay();
 s=act(s,"dispatch","evt_dispatch_001",2100,{shareLocationConsent:true});
 s=act(s,"provider_arrived","evt_arrive_001",2300);
 s=act(s,"service_started","evt_start_001",2400);
 s=act(s,"handoff_f6","evt_handoff_001",2500);
 return s;
};
const complete=()=>{
 let s=handoff();
 s=B.completion(s,{kind:"submit_summary",id:"evt_summary_001",
  actorId:P,at:2600,text:"Servico com materiais inclusos concluido e verificado."}).state;
 s=B.completion(s,{kind:"provider_confirm",id:"evt_pconfirm_001",
  actorId:P,at:2700}).state;
 s=B.completion(s,{kind:"customer_confirm",id:"evt_cconfirm_001",
  actorId:C,at:2800,summaryRead:true}).state;
 return s;
};
test("F4→F5: o contrato 10+10 ancora valores e não autoriza dinheiro real",()=>{
 const s=make(),a=s.amounts;
 assert.deepEqual([a.serviceCents,a.travelCents,a.quoteSubtotalCents],[23000,4000,27000]);
 assert.equal(a.materialsIncludedInService,true);
 assert.deepEqual([a.riderFeeCents,a.providerFeeCents],[2300,2300]);
 assert.equal(a.customerSubtotalBeforeProcessingCents,29300);
 assert.equal(a.providerReceivableCents,24700);
 assert.equal(a.platformGrossCommissionCents,4600);
 assert.equal(s.stage,"awaiting_mock_payment");
 assert.equal(s.realPaymentVerified,false);
 assert.equal(B.settlementReview(s).transferAuthorized,false);
 assert.equal(B.viewFor(s,X).access,"denied");
});
test("F4→F5: não aceita recibo de 15%, alteração de preço ou identidade",()=>{
 for(const bad of [
  {amountCents:30450},{amountCents:27000},
  {providerReceivableCents:24550},{currency:"USD"},
  {quoteId:X},{requestId:X},{customerId:X},{providerId:X},
  {actorId:C},{fixtureReceipt:"PSP_PAID"},
  {kind:"mock_refund_confirmed"}
 ])assert.throws(()=>B.mockPayment(make(),receipt(bad)),/Pagamento de fixture inválido/);
 const s=pay();
 assert.equal(s.mockPaymentRecorded,true);
 assert.equal(s.realChatAuthorized,false);
 assert.equal(s.realPaymentVerified,false);
 assert.throws(()=>B.mockPayment(s,receipt()),/não permite reconfirmação/);
});
test("F5: sem fixture financeira não libera chat, GPS nem despacho",()=>{
 const s=make();
 assert.throws(()=>B.operational(s,{kind:"dispatch",id:"evt_dispatch_001",
  actorId:P,at:2100,shareLocationConsent:true}),/bloqueado/);
 assert.equal(B.viewFor(s,C).f5MockChatOpen,false);
 assert.equal(B.viewFor(s,C).f5MockLocation,null);
 assert.equal(s.realDispatchAuthorized,false);
});
test("F5: chat só em sessão fictícia e GPS somente em deslocamento consentido",()=>{
 let s=pay();
 assert.equal(s.f5.status,"ready_for_dispatch");
 assert.throws(()=>act(s,"provider_location","evt_location_001",2200,{
  lat:-19.9,lng:-43.9,accuracyMeters:15,sampledAt:2190
 }),/GPS disponível/);
 s=act(s,"dispatch","evt_dispatch_001",2100,{shareLocationConsent:true});
 s=act(s,"provider_location","evt_location_001",2200,{
  lat:-19.9,lng:-43.9,accuracyMeters:15,sampledAt:2190
 });
 assert.equal(B.viewFor(s,C).f5MockLocation.lat,-19.9);
 assert.equal(B.viewFor(s,X).access,"denied");
 s=act(s,"provider_arrived","evt_arrive_001",2300);
 assert.equal(B.viewFor(s,C).f5MockLocation,null);
 assert.equal(s.realTrackingAuthorized,false);
});
test("F5→F6: passagem exige atendimento iniciado e não libera repasse",()=>{
 const s=pay();
 assert.throws(()=>act(s,"handoff_f6","evt_handoff_001",2500),/Encaminhamento F6/);
 const done=handoff();
 assert.equal(done.stage,"f6");
 assert.equal(done.f6.status,"awaiting_summary");
 assert.equal(done.realSettlementAuthorized,false);
 assert.equal(B.settlementReview(done).mockHumanReviewCandidate,false);
 assert.throws(()=>B.operational(done,{kind:"dispatch",id:"evt_other",at:2600,
  actorId:P,shareLocationConsent:true}),/bloqueado/);
});
test("F6: conclusão bilateral só cria elegibilidade de revisão humana mock",()=>{
 const s=complete();
 assert.equal(s.f6.status,"completed");
 assert.equal(s.f6.providerConfirmed,true);
 assert.equal(s.f6.customerConfirmed,true);
 const review=B.settlementReview(s);
 assert.equal(review.mockHumanReviewCandidate,true);
 assert.equal(review.transferAuthorized,false);
 assert.equal(review.pspFundsConfirmed,false);
 assert.equal(review.realTransferExecuted,false);
 assert.equal(review.providerReceivableMockCents,24700);
 assert.equal(review.platformGrossCommissionMockCents,4600);
 assert.equal(B.viewFor(s,C).f5MockChatOpen,false);
 assert.equal(B.viewFor(s,C).f5MockLocation,null);
 assert.equal(B.viewFor(s,X).access,"denied");
});
test("F6: silêncio do cliente após 5 min não conclui nem permite repasse",()=>{
 let s=handoff();
 s=B.completion(s,{kind:"submit_summary",id:"evt_summary_001",
  actorId:P,at:2600,text:"Conserto de teste documentado com resumo completo."}).state;
 s=B.completion(s,{kind:"provider_confirm",id:"evt_pconfirm_001",
  actorId:P,at:2700}).state;
 s=B.completion(s,{kind:"expire_customer_window",id:"evt_clock_001",
  actorId:"offline_clock",at:302601}).state;
 assert.equal(s.f6.status,"support_review");
 assert.equal(B.settlementReview(s).mockHumanReviewCandidate,false);
 assert.equal(B.settlementReview(s).transferAuthorized,false);
});
test("F4+F5: disputa revoga acesso mock, localização e revisão",()=>{
 let s=pay();
 s=act(s,"dispatch","evt_dispatch_001",2100,{shareLocationConsent:true});
 s=act(s,"provider_location","evt_location_001",2200,{
  lat:-19.9,lng:-43.9,accuracyMeters:12,sampledAt:2150
 });
 assert.notEqual(B.viewFor(s,C).f5MockLocation,null);
 s=B.risk(s,{id:"evt_dispute_001",kind:"mock_dispute",actorId:"offline_fixture",
  fixtureReceipt:B.MOCK_RECEIPT,requestId:R,quoteId:Q,customerId:C,providerId:P,amountCents:29300});
 const view=B.viewFor(s,C);
 assert.equal(view.status,"mock_hold");
 assert.equal(view.f5MockLocation,null);
 assert.equal(view.f5MockChatOpen,false);
 assert.equal(B.settlementReview(s).mockHumanReviewCandidate,false);
 assert.throws(()=>act(s,"provider_location","evt_location_002",2400,{
  lat:-20,lng:-44,accuracyMeters:10,sampledAt:2390
 }),/bloqueado/);
 assert.equal(s.realTrackingAuthorized,false);
});
test("F4+F6: chargeback após duas confirmações impede até revisão mock",()=>{
 let s=complete();
 assert.equal(B.settlementReview(s).mockHumanReviewCandidate,true);
 s=B.risk(s,{id:"evt_chargeback_001",kind:"mock_chargeback",
  actorId:"offline_fixture",fixtureReceipt:B.MOCK_RECEIPT,requestId:R,quoteId:Q,customerId:C,providerId:P,amountCents:29300});
 assert.equal(B.settlementReview(s).mockHumanReviewCandidate,false);
 assert.equal(B.settlementReview(s).transferAuthorized,false);
 assert.throws(()=>B.completion(s,{kind:"rate_provider",id:"evt_rate_001",
  actorId:C,at:3000,stars:5}),/bloqueada/);
});
test("F5/F6: repetição de evento é idempotente; evento divergente é rejeitado",()=>{
 const s=pay();
 const event={kind:"dispatch",id:"evt_dispatch_001",at:2100,actorId:P,
  shareLocationConsent:true};
 const first=B.operational(s,event);
 const again=B.operational(first.state,event);
 assert.equal(again.duplicate,true);
 assert.strictEqual(again.state,first.state);
 assert.throws(()=>B.operational(first.state,{...event,at:2150}),/Colisão/);
});
test("F4: material avulso e status de orçamento sem aceite são rejeitados",()=>{
 assert.throws(()=>F4.quoteSnapshot({requestId:R,quoteId:Q,items:[
  {kind:"service",code:"reboque_moto",amountCents:23000},
  {kind:"travel",code:"deslocamento",amountCents:4000},
  {kind:"part",code:"peca",amountCents:1000}
 ]}),/Tipo de item/);
 assert.throws(()=>B.make({quote:{...accepted(),partsCents:1000},
  customerId:C,providerId:P,createdAt:1000}),/Materiais devem estar incluídos/);
});
test("F456: risco não pode ser declarado antes de fixture ou acima do valor cobrado",()=>{
 assert.throws(()=>B.risk(make(),{id:"evt_risk_pre",kind:"mock_dispute",
  actorId:"offline_fixture",fixtureReceipt:B.MOCK_RECEIPT,requestId:R,quoteId:Q,customerId:C,providerId:P,amountCents:200}),/após fixture/);
 assert.throws(()=>B.risk(pay(),{id:"evt_risk_bad",kind:"mock_refund_requested",
  actorId:"offline_fixture",fixtureReceipt:B.MOCK_RECEIPT,requestId:R,quoteId:Q,customerId:C,providerId:P,amountCents:30450}),/inválido/);
});
