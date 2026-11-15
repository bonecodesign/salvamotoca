"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../f5-offline-flow.js");
const C="11111111-1111-4111-8111-111111111111";
const P="22222222-2222-4222-8222-222222222222";
const R="33333333-3333-4333-8333-333333333333";
const Q="44444444-4444-4444-8444-444444444444";
const X="55555555-5555-4555-8555-555555555555";
const base=()=>F.createOfflineSession({requestId:R,quoteId:Q,customerId:C,providerId:P,createdAt:1000});
const apply=(s,e)=>F.applyOfflineEvent(s,e).state;
const paid=s=>apply(s,{kind:"mock_payment_confirmed",id:"evt_paid_001",
  at:1100,actorId:"offline_fixture",fixtureReceipt:"F5_LOCAL_FIXTURE_NOT_PSP",
  requestId:R,quoteId:Q});
const dispatch=s=>apply(s,{kind:"dispatch",id:"evt_depart_001",at:1200,
  actorId:P,shareLocationConsent:true});
const location=(patch={})=>({kind:"provider_location",id:"evt_gps_0001",at:1400,
  actorId:P,lat:-19.924,lng:-43.938,accuracyMeters:15,sampledAt:1350,...patch});
const arrived=s=>apply(s,{kind:"provider_arrived",id:"evt_arrive_01",at:1500,actorId:P});

test("F5: sempre inicia aguardando pagamento; flags reais falsas",()=>{
 const s=base();assert.equal(s.status,"awaiting_payment");
 assert.deepEqual([s.realChatAuthorized,s.realTrackingAuthorized,
   s.realDispatchAuthorized,s.realPaymentVerified],[false,false,false,false]);
 assert.equal(F.viewFor(s,C).chatMockOpen,false);
});
test("F5: exige IDs corretos e papéis distintos",()=>{
 assert.throws(()=>F.createOfflineSession({requestId:"x",quoteId:Q,
 customerId:C,providerId:P,createdAt:1000}),/Pedido/);
 assert.throws(()=>F.createOfflineSession({requestId:R,quoteId:Q,
 customerId:C,providerId:C,createdAt:1000}),/distintos/);
});
test("F5: pré-pagamento bloqueia mensagem e despacho",()=>{
 const s=base();
 assert.throws(()=>apply(s,{kind:"chat_message",id:"evt_chat_001",at:1200,actorId:C,text:"Olá"}),/Sem confirmação/);
 assert.throws(()=>dispatch(s),/Sem confirmação/);
 assert.equal(s.version,0);
});
test("F5: recibo falso, status de navegador e autor errado não aprovam",()=>{
 const e={kind:"mock_payment_confirmed",id:"evt_paid_002",at:1200,actorId:C,
 fixtureReceipt:"F5_LOCAL_FIXTURE_NOT_PSP",requestId:R,quoteId:Q};
 assert.throws(()=>apply(base(),e),/fixture local/);
 assert.throws(()=>apply(base(),{...e,actorId:"offline_fixture",fixtureReceipt:"psp_paid"}),/fixture local/);
 assert.throws(()=>apply(base(),{...e,actorId:"offline_fixture",quoteId:X}),/fixture local/);
 assert.throws(()=>apply(base(),{...e,actorId:"offline_fixture",paymentStatus:"paid"}),/reservado/);
});
test("F5: pagamento é SIMULADO; nunca marcado como verificado real",()=>{
 const s=paid(base());assert.equal(s.status,"ready_for_dispatch");
 assert.equal(s.mockPaid,true);assert.equal(s.realPaymentVerified,false);
 assert.equal(F.viewFor(s,P).paymentIsReal,false);
 assert.equal(s.realDispatchAuthorized,false);
});
test("F5: mensagem mock só para participante e limitada a 2000 caracteres",()=>{
 const s=paid(base());
 const e={kind:"chat_message",id:"evt_chat_001",at:1200,actorId:C,text:"Preciso de ajuda"};
 const next=apply(s,e);assert.equal(next.messages.length,1);
 assert.equal(s.messages.length,0);
 assert.equal(F.viewFor(next,P).chatMessages[0].text,"Preciso de ajuda");
 assert.throws(()=>apply(s,{...e,actorId:X}),/participantes/);
 assert.throws(()=>apply(s,{...e,text:"".padEnd(2001,"x")}),/Mensagem/);
});
test("F5: despacho por cliente e GPS sem consentimento são bloqueados",()=>{
 const s=paid(base());
 assert.throws(()=>apply(s,{kind:"dispatch",id:"evt_depart_001",at:1200,
 actorId:C,shareLocationConsent:true}),/Deslocamento/);
 assert.throws(()=>apply(s,{kind:"dispatch",id:"evt_depart_001",at:1200,
 actorId:P,shareLocationConsent:false}),/Deslocamento/);
 assert.equal(dispatch(s).status,"en_route");
});
test("F5: não publica localização antes de despacho",()=>{
 const s=paid(base());
 assert.throws(()=>apply(s,location()),/GPS disponível/);
 assert.equal(F.viewFor(s,C).lastLocation,null);
});
test("F5: somente prestador envia coordenada recente e precisa",()=>{
 const s=dispatch(paid(base()));
 assert.throws(()=>apply(s,location({actorId:C})),/GPS disponível/);
 assert.throws(()=>apply(s,location({accuracyMeters:900})),/Precisão/);
 assert.throws(()=>apply(s,location({lat:200})),/Coordenada/);
 assert.throws(()=>apply(s,location({sampledAt:1100})),/antiga/);
 assert.throws(()=>apply(s,location({sampledAt:1500})),/antiga/);
 const next=apply(s,location());
 assert.equal(F.viewFor(next,C).lastLocation.lat,-19.924);
 assert.equal(next.realTrackingAuthorized,false);
});
test("F5: aceita apenas GPS crescente; não armazena percurso de pontos",()=>{
 const s=apply(dispatch(paid(base())),location());
 assert.throws(()=>apply(s,location({id:"evt_gps_0002",at:1450,sampledAt:1350})),/fora de ordem/);
 const next=apply(s,location({id:"evt_gps_0002",at:1600,sampledAt:1550,lat:-19.925}));
 assert.equal(next.lastLocation.lat,-19.925);
 assert.equal(next.version,s.version+1);
});
test("F5: terceiros não veem mensagem ou GPS",()=>{
 const s=apply(dispatch(paid(base())),location());
 const view=F.viewFor(s,X);
 assert.deepEqual(view,{access:"denied",status:"private",mockOnly:true});
});
test("F5: chegada desliga GPS e informa cliente",()=>{
 const s=arrived(apply(dispatch(paid(base())),location()));
 assert.equal(s.status,"arrived");assert.equal(s.lastLocation,null);
 assert.equal(s.providerTrackingConsent,false);
 assert.equal(F.viewFor(s,C).arrivalNotice,true);
 assert.throws(()=>apply(s,location({id:"evt_gps_0002",at:1550,sampledAt:1500})),/GPS disponível/);
});
test("F5: serviço e handoff F6 só depois da chegada",()=>{
 const s=dispatch(paid(base()));
 assert.throws(()=>apply(s,{kind:"service_started",id:"evt_start_001",at:1600,actorId:P}),/chegada/);
 const a=arrived(s);
 const b=apply(a,{kind:"service_started",id:"evt_start_001",at:1600,actorId:P});
 const c=apply(b,{kind:"handoff_f6",id:"evt_handoff_1",at:1700,actorId:P});
 assert.equal(c.status,"handoff_f6");
 assert.equal(F.viewFor(c,C).chatMockOpen,false);
 assert.equal(c.realDispatchAuthorized,false);
});
test("F5: mesmo ID e mesmo payload não duplicam efeito",()=>{
 const s=paid(base());
 const e={kind:"chat_message",id:"evt_chat_001",at:1200,actorId:C,text:"Olá"};
 const first=F.applyOfflineEvent(s,e);
 const again=F.applyOfflineEvent(first.state,e);
 assert.equal(again.duplicate,true);
 assert.equal(again.state.messages.length,1);
 assert.equal(again.state.version,first.state.version);
});
test("F5: mesmo ID com conteúdo divergente é recusado",()=>{
 const s=paid(base());
 const e={kind:"chat_message",id:"evt_chat_001",at:1200,actorId:C,text:"Olá"};
 assert.throws(()=>apply(apply(s,e),{...e,text:"Mudança"}),/Colisão/);
});
test("F5: suporta divergência com suspensão do rastreamento",()=>{
 const s=apply(dispatch(paid(base())),location());
 const t=apply(s,{kind:"request_support",id:"evt_support_1",at:1600,actorId:C});
 assert.equal(t.status,"support_review");
 assert.equal(F.viewFor(t,P).lastLocation,null);
 assert.equal(F.viewFor(t,C).chatMockOpen,false);
 const u=apply(t,{kind:"support_message",id:"evt_support_2",at:1700,actorId:P,text:"Preciso de mediação"});
 assert.equal(F.viewFor(u,C).supportMessages.length,1);
 assert.throws(()=>apply(t,location({id:"evt_gps_0002",at:1650,sampledAt:1600})),/GPS disponível/);
});
test("F5: ator externo não pode acionar suporte",()=>{
 assert.throws(()=>apply(paid(base()),{kind:"request_support",
 id:"evt_support_1",at:1300,actorId:X}),/participante/);
});
test("F5: liberação REAL é sempre negada até backend homologado",()=>{
 for(const flags of [undefined,{f1:true,f2:true,f3:true,f4:true,f5:true}]){
  const g=F.realReleaseGate(flags,{psp:"verified",amountCents:3000});
  assert.equal(g.authorized,false);
  assert.match(g.reason,/backend/);
 }
});
test("F5: evento desconhecido e campo sensível são recusados",()=>{
 const s=paid(base());
 assert.throws(()=>apply(s,{kind:"transfer_money",id:"evt_transfer_1",at:1500,actorId:P}),/desconhecido/);
 assert.throws(()=>apply(s,{kind:"chat_message",id:"evt_chat_001",at:1500,
 actorId:P,text:"oi",signedPhotoUrl:"private"}),/reservado/);
});
test("F5: eventos anteriores ao pedido são recusados",()=>{
 assert.throws(()=>apply(base(),{kind:"mock_payment_confirmed",id:"evt_paid_001",
 at:999,actorId:"offline_fixture",fixtureReceipt:"F5_LOCAL_FIXTURE_NOT_PSP",
 requestId:R,quoteId:Q}),/anterior/);
});
