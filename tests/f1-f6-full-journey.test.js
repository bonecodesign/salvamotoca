"use strict";
// Integrated in-memory journey. No hosted database, external traffic, or PSP.
// Only synthetic fixtures, no real identities or locations.
const test=require("node:test"),assert=require("node:assert/strict");
const F1=require("../request-f1.js"),F2=require("../f2-flow.js"),F3=require("../f3-tow.js");
const Routing=require("../f23-routing-bridge-offline.js"),F4=require("../f4-finance.js");
const Bridge=require("../f456-financial-bridge-offline.js");
const Support=require("../f23-support-hybrid-offline.js");
const Desk=require("../f23-founder-incident-desk-offline.js");
const C="11111111-1111-4111-8111-111111111111",P="22222222-2222-4222-8222-222222222222";
const R="33333333-3333-4333-8333-333333333333",Q="44444444-4444-4444-8444-444444444444";
const X="55555555-5555-4555-8555-555555555555",N="66666666-6666-4666-8666-666666666666";
const T=Date.parse("2026-11-22T05:30:00Z"),LOC={lat:-19.924,lng:-43.938};
const photo={size:12345,type:"image/jpeg"};
function fixture(tow=false){
 const common={brand:"Honda",model:"CG 160",year:2024,problem:"Problema ficticio para teste",address:"Endereco sintetico, 100",photo};
 const services=tow?["reboque_moto","troca_camara"]:["pneu_furado","troca_camara"];
 const tireData=F1.validateRequest({...common,services:tow?["troca_camara"]:services},2026);
 F1.validatePhoto(photo);
 const request={requestId:R,categoryCode:tow?"reboque_moto":"borracharia_delivery",serviceTypes:services,
  status:"requested",mode:"automatic",city:"Betim",stateCode:"MG",location:LOC,
  motorcycleBrand:tireData.brand,motorcycleModel:tireData.model,motorcycleYear:tireData.year,
  motorcycleWeightKg:140,pickupCity:"Betim",pickupStateCode:"MG",
  pickupLocation:LOC,destinationCity:"Nova Lima",destinationStateCode:"MG",
  destinationAddress:"DESTINO SINTETICO PRIVADO",estimatedRouteKm:25};
 const provider={id:P,name:"Fixture A",label:"Fixture A",approved:true,active:true,
  deliveryEnabled:true,serviceActive:true,towServiceActive:true,onlineRequested:true,
  lastSeenAt:T-1000,city:"Contagem",stateCode:"MG",location:{lat:-19.925,lng:-43.938},
  coverageKm:60,serviceTypes:["pneu_furado","troca_camara"],otherServiceTypes:["troca_camara"],
  rejectionCount:0,refusals:0,capacity:{equipment:"plataforma",maxMotoKg:220,
  coverageKm:60,tieDownPoints:4,hasRamp:true,hasWheelChock:true,verifiedByAdmin:true}};
 return {request,provider,tow,common};
}
function prepare(tow=false){
 const {request,provider}=fixture(tow);
 const plan=Routing.planNextInvitation({request,providers:[{...provider,id:N,location:{lat:-20.01,lng:-43.938}},provider],now:T});
 assert.equal(plan.status,"invite_mock");assert.equal(plan.providerId,P);assert.equal(plan.radiusKm,5);
 assert.equal(plan.notificationSent,false);assert.equal(plan.exactLocationShared,false);
 assert.ok(!JSON.stringify(plan).includes("DESTINO SINTETICO PRIVADO"));
 const prices=tow?{reboque_moto:20000,troca_camara:3000}:{pneu_furado:8000,troca_camara:15000};
 const preview=Routing.quoteDryRun({request,quoteId:Q,serviceCents:prices,travelCents:4000});
 const lines=tow?F3.quoteTow({serviceTypes:request.serviceTypes,serviceCents:prices,travelCents:4000}).rows:
  F2.quoteBreakdown({serviceTypes:request.serviceTypes,services:Object.entries(prices).map(([code,amountCents])=>({code,amountCents})),travelCents:4000}).rows.map(x=>({kind:x.type,code:x.code,amountCents:x.amountCents}));
 const snapshot=F4.quoteSnapshot({requestId:request.requestId,quoteId:Q,items:lines});
 // Acceptance is a synthetic fixture, not a hosted authorization.
 const s=Bridge.make({quote:snapshot,customerId:C,providerId:plan.providerId,createdAt:T+1000});
 assert.equal(preview.customerSubtotalBeforeProcessingCents,s.amounts.customerSubtotalBeforeProcessingCents);
 assert.equal(s.amounts.customerSubtotalBeforeProcessingCents,29300);
 assert.equal(s.amounts.providerReceivableCents,24700);
 assert.equal(s.amounts.platformGrossCommissionCents,4600);
 assert.equal(preview.customerTotalCents,null);
 return s;
}
function receipt(s,patch={}){
 return {id:"journey_payment_001",kind:"mock_payment_confirmed",actorId:"offline_fixture",
 fixtureReceipt:Bridge.MOCK_RECEIPT,requestId:s.requestId,quoteId:s.quoteId,currency:"BRL",
 amountCents:s.amounts.customerSubtotalBeforeProcessingCents,
 providerReceivableCents:s.amounts.providerReceivableCents,at:T+2000,...patch};
}
function operation(s,kind,id,dt,patch={}){
 return Bridge.operational(s,{kind,id,actorId:P,at:T+dt,...patch}).state;
}
function finish(s,kind,id,dt,patch={}){
 return Bridge.completion(s,{kind,id,actorId:P,at:T+dt,...patch}).state;
}
function arriveAtSummary(s){
 s=Bridge.mockPayment(s,receipt(s));
 s=operation(s,"chat_message","journey_chat_001",2100,{actorId:C,text:"Mensagem sintetica"});
 s=operation(s,"dispatch","journey_depart_001",2200,{shareLocationConsent:true});
 s=operation(s,"provider_location","journey_gps_001",2300,{lat:-19.9,lng:-43.9,accuracyMeters:15,sampledAt:T+2290});
 assert.equal(Bridge.viewFor(s,C).f5MockLocation.lat,-19.9);
 assert.equal(Bridge.viewFor(s,X).access,"denied");
 s=operation(s,"provider_arrived","journey_arrival_001",2400);
 assert.equal(Bridge.viewFor(s,C).f5MockLocation,null);
 s=operation(s,"service_started","journey_service_001",2500);
 s=operation(s,"handoff_f6","journey_handoff_001",2600);
 return finish(s,"submit_summary","journey_summary_001",2700,{text:"Servico sintetico concluido e verificado."});
}
function noReal(s){
 for(const k of Object.keys(Bridge.REAL_DENIAL))assert.equal(s[k],false,k);
 assert.equal(Bridge.settlementReview(s).transferAuthorized,false);
}
for(const tow of [false,true]){
 const label=tow?"reboque com servico adicional e destino externo":"borracharia";
 test("Jornada completa: "+label,()=>{
  let s=prepare(tow);noReal(s);
  assert.equal(Bridge.viewFor(s,C).f5MockChatOpen,false);
  assert.throws(()=>operation(s,"dispatch","journey_early_001",1500,{shareLocationConsent:true}),/bloqueado/);
  s=arriveAtSummary(s);noReal(s);
  s=finish(s,"provider_confirm","journey_provider_001",2800);
  assert.equal(Bridge.settlementReview(s).mockHumanReviewCandidate,false);
  s=finish(s,"customer_confirm","journey_customer_001",2900,{actorId:C,summaryRead:true});
  assert.equal(Bridge.settlementReview(s).mockHumanReviewCandidate,true);
  s=finish(s,"rate_provider","journey_rating_001",3000,{actorId:C,stars:5});
  noReal(s);
  s=Bridge.risk(s,{id:"journey_dispute_001",kind:"mock_dispute",actorId:"offline_fixture",
   fixtureReceipt:Bridge.MOCK_RECEIPT,requestId:R,quoteId:Q,currency:"BRL",at:T+3100,amountCents:29300});
  assert.equal(Bridge.settlementReview(s).mockHumanReviewCandidate,false);noReal(s);
 });
 test("Jornada interrompida por falta de confirmacao: "+label,()=>{
  let s=arriveAtSummary(prepare(tow));
  s=finish(s,"provider_confirm","journey_provider_001",2800);
  s=finish(s,"expire_customer_window","journey_timeout_001",302701,{actorId:"offline_clock"});
  assert.equal(s.f6.status,"support_review");noReal(s);
  const triage=Support.previewSupportCase({kind:"service_issue",eventAt:new Date(T+302701).toISOString(),linkedToActiveRequest:true});
  assert.equal(triage.humanReviewRequired,true);
  const incident=Desk.createIncidentFixture({caseId:"journey-case-001",kind:"service_issue",openedAt:T+302701,linkedToRequestMock:true});
  const queue=Desk.founderDeskPreview([incident]);
  assert.equal(queue.pendingCount,1);assert.equal(queue.productionAuthorized,false);
  assert.equal(Bridge.settlementReview(s).mockHumanReviewCandidate,false);
 });
}
test("Jornada: dados invalidos e prestador incompativel interrompem antes do aceite",()=>{
 const {common,request,provider}=fixture();
 assert.throws(()=>F1.validateRequest({...common,services:["pneu_furado"],photo:null},2026),/foto/i);
 assert.throws(()=>F1.validateRequest({...common,services:["pneu_furado"],year:2200},2026),/ano/i);
 assert.equal(Routing.planNextInvitation({request,providers:[{...provider,onlineRequested:false}],now:T}).status,"no_provider");
 assert.equal(Routing.planNextInvitation({request:{...request,city:"Sabara"},providers:[provider],now:T}).status,"no_provider");
 const s=prepare();
 for(const patch of [{requestId:X},{quoteId:X},{amountCents:29301},{actorId:C}])
  assert.throws(()=>Bridge.mockPayment(s,receipt(s,patch)),/inválido/);
 noReal(s);
});
