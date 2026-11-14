"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const F2 = require("../f2-flow.js");

const NOW = Date.parse("2026-11-14T12:00:00Z");
const REQ = {
  city:"Belo Horizonte",stateCode:"MG",serviceTypes:["pneu_furado","troca_camara"],
  location:{lat:-19.924,lng:-43.938},justDeclinedProviderId:null
};
function provider(id, patch = {}) {
  return {id,name:id,approved:true,active:true,deliveryEnabled:true,serviceActive:true,
    onlineRequested:true,lastSeenAt:NOW-20000,city:"Belo Horizonte",stateCode:"MG",
    serviceTypes:["pneu_furado","troca_camara","outro"],
    location:{lat:-19.925,lng:-43.939},coverageKm:10,rejectionCount:0,...patch};
}
function distribute(ps,r=REQ,radii=[1,3,10],seed="test"){
  return F2.distribute({providers:ps,request:r,radiiKm:radii,now:NOW,rotationSeed:seed});
}
const quote = createdAt => ({status:"proposed",createdAt});
const qInput = () => ({serviceTypes:["pneu_furado","troca_camara"],
  services:[{code:"pneu_furado",amountCents:8000},{code:"troca_camara",amountCents:3500}],
  travelCents:1500, parts:[{name:"Câmara 17",amountCents:4500}]});

test("F2: tipos múltiplos válidos e reboque bloqueado até F3",()=>{
  assert.deepEqual(F2.serviceTypes(["pneu_furado","outro"]),["pneu_furado","outro"]);
  assert.throws(()=>F2.serviceTypes(["reboque_moto"]),/reboque/);
  assert.throws(()=>F2.serviceTypes(["pneu_furado","pneu_furado"]),/repita/);
  assert.throws(()=>F2.serviceTypes([]),/Selecione/);
});
test("F2: cidade e estado são comparados sem caixa/acentos",()=>{
  const p=provider("a",{city:"BELO HORIZONTE",stateCode:"mg"});
  assert.equal(distribute([p]).candidates.length,1);
  assert.equal(distribute([provider("b",{city:"Contagem"})]).status,"no_provider");
});
test("F2: somente prestador homologado, ativo, delivery ativo",()=>{
  for(const patch of [{approved:false},{active:false},{deliveryEnabled:false},{serviceActive:false}]){
    assert.equal(distribute([provider("a",patch)]).candidates.length,0);
  }
});
test("F2: heartbeat deve ser recente e voluntário, 90s inclusive",()=>{
  assert.equal(distribute([provider("a",{lastSeenAt:NOW-90000})]).candidates.length,1);
  assert.equal(distribute([provider("a",{lastSeenAt:NOW-90001})]).candidates.length,0);
  assert.equal(distribute([provider("a",{onlineRequested:false})]).candidates.length,0);
  assert.equal(distribute([provider("a",{lastSeenAt:NOW+10000})]).candidates.length,0);
});
test("F2: exige compatibilidade com TODOS serviços selecionados",()=>{
  const r=distribute([provider("a",{serviceTypes:["pneu_furado"]})]);
  assert.equal(r.status,"no_provider");
  assert.match(r.excluded[0].reason,/todos os serviços/);
});
test("F2: não permite usar categoria reboque para contornar F3",()=>{
  assert.throws(()=>distribute([provider("a")],{...REQ,serviceTypes:["reboque_moto"]}),/reboque/);
});
test("F2: nenhuma área declarada significa sem roteamento automático",()=>{
  for(const patch of [{coverageKm:null},{coverageKm:0},{location:null},{location:{lat:100,lng:0}}]){
    assert.equal(distribute([provider("a",patch)]).status,"no_provider");
  }
  assert.equal(distribute([provider("a")],{...REQ,location:null}).status,"no_provider");
});
test("F2: prestador fora da própria área não recebe pedido",()=>{
  assert.equal(distribute([provider("a",{coverageKm:0.01})]).status,"no_provider");
});
test("F2: ampliação progressiva escolhe primeiro anel com candidatos",()=>{
  const p=provider("segundo",{location:{lat:-19.940,lng:-43.938},coverageKm:20});
  const out=distribute([p],REQ,[1,2,3]);
  assert.equal(out.stage,2);
  assert.equal(out.radiusKm,2);
  assert.equal(out.windows[0].candidates,0);
  assert.equal(out.candidates[0].id,"segundo");
});
test("F2: respeita limite total, não encontra candidatos fora de todos anéis",()=>{
  const p=provider("longe",{location:{lat:-20.02,lng:-43.938},coverageKm:20});
  assert.equal(distribute([p],REQ,[1,3,8]).status,"no_provider");
});
test("F2: primeira recusa mantém elegibilidade, segunda exclui daquela rodada",()=>{
  assert.equal(distribute([provider("a",{rejectionCount:1})]).candidates.length,1);
  assert.equal(distribute([provider("a",{rejectionCount:2})]).status,"no_provider");
  assert.equal(distribute([provider("a")],{...REQ,justDeclinedProviderId:"a"}).status,"no_provider");
  assert.equal(distribute([provider("a")],{...REQ,justDeclinedProviderId:null}).candidates.length,1);
});
test("F2: ordena sem recusas antes de prestadores recusados uma vez",()=>{
  const a=provider("a",{rejectionCount:1});
  const b=provider("b",{rejectionCount:0,location:{lat:-19.929,lng:-43.938}});
  const v=distribute([a,b]); assert.equal(v.candidates[0].id,"b");
});
test("F2: ordena por proximidade sem divulgar endereços",()=>{
  const near=provider("near",{name:"Perto"});
  const far=provider("far",{location:{lat:-19.933,lng:-43.938}});
  const x=distribute([far,near],REQ,[2,3,10]);assert.deepEqual(x.candidates.map(z=>z.id),["near","far"]);
  assert.equal(x.candidates[0].location,undefined);
});
test("F2: empate usa ordenação determinística e não avaliações",()=>{
  const a=provider("aaaa",{rating:1}), b=provider("bbbb",{rating:5});
  const x=distribute([a,b]), y=distribute([b,a]);
  assert.deepEqual(x.candidates.map(z=>z.id),y.candidates.map(z=>z.id));
});
test("F2: anéis inválidos são rejeitados antes da seleção",()=>{
  for(const rings of [[],[0],[1,1],[5,2],[1,200]]){
    assert.throws(()=>distribute([provider("a")],REQ,rings),/Etapas|Defina/);
  }
});
test("F2: distância funciona e rejeita GPS indefinido ou inválido",()=>{
  assert.equal(F2.distanceKm(REQ.location,REQ.location),0);
  assert.equal(F2.distanceKm(REQ.location,null),Infinity);
  assert.equal(F2.distanceKm(REQ.location,{lat:200,lng:-40}),Infinity);
});
test("F2: oferta só vira ausência após 5min E notificação entregue",()=>{
  const offeredAt=NOW;
  assert.equal(F2.notificationDecision({offeredAt,now:NOW+301000}).status,"delivery_unverified");
  const out=F2.notificationDecision({offeredAt,deliveredAt:NOW+1000,now:NOW+301000});
  assert.equal(out.status,"timeout");assert.equal(out.canCountAbsence,true);
});
test("F2: antes da entrega confirmada não contam ausência ou timeout",()=>{
  const out=F2.notificationDecision({offeredAt:NOW,deliveredAt:null,now:NOW+720000});
  assert.equal(out.canCountAbsence,false);
});
test("F2: resposta pontual é aceita e resposta tardia é diferenciada",()=>{
  const args={offeredAt:NOW,deliveredAt:NOW+100,now:NOW+700000};
  assert.equal(F2.notificationDecision({...args,responseAt:NOW+299999}).status,"responded");
  assert.equal(F2.notificationDecision({...args,responseAt:NOW+300002}).status,"late_response");
});
test("F2: lembretes após 2 min e 4min30s, sem SMS ou WhatsApp",()=>{
  const args={offeredAt:NOW,deliveredAt:NOW+1};
  assert.equal(F2.notificationDecision({...args,now:NOW+110000}).remindersDue.length,0);
  assert.equal(F2.notificationDecision({...args,now:NOW+120001}).remindersDue.length,1);
  assert.equal(F2.notificationDecision({...args,now:NOW+270001}).remindersDue.length,2);
});
test("F2: 10 ausências em 30 dias requer revisão HUMANA, nunca suspensão automática",()=>{
  const events=Array.from({length:10},(_,i)=>({at:NOW-1000*i,kind:"no_response",deliveryVerified:true}));
  const r=F2.absenceReview(events,NOW);
  assert.equal(r.count,10);assert.equal(r.reviewRequired,true);assert.equal(r.automaticSuspension,false);
});
test("F2: notificações sem confirmação de entrega e eventos antigos não contam",()=>{
  const events=[
    {at:NOW-1000,kind:"no_response",deliveryVerified:true},
    {at:NOW-1000,kind:"no_response",deliveryVerified:false},
    {at:NOW-31*86400000,kind:"no_response",deliveryVerified:true},
    {at:NOW+1000,kind:"no_response",deliveryVerified:true},
    {at:NOW-2000,kind:"rejected",deliveryVerified:true}
  ];
  assert.equal(F2.absenceReview(events,NOW).count,1);
});
test("F2: orçamento itemizado inclui todos serviços, deslocamento e peças",()=>{
  const b=F2.quoteBreakdown(qInput());
  assert.equal(b.totalCents,17500);
  assert.deepEqual(b.rows.map(x=>x.type),["service","service","travel","part"]);
  assert.equal(b.paymentAllowed,false);
});
test("F2: deslocamento é obrigatório mesmo quando gratuito",()=>{
  const x=qInput(); delete x.travelCents;
  assert.throws(()=>F2.quoteBreakdown(x),/Deslocamento/);
  const y=qInput();y.travelCents=0;
  assert.equal(F2.quoteBreakdown(y).rows.find(x=>x.type==="travel").amountCents,0);
});
test("F2: rejeita serviços a mais, ausentes ou duplicados no orçamento",()=>{
  const x=qInput();x.services=[x.services[0],x.services[0]];
  assert.throws(()=>F2.quoteBreakdown(x),/duplicado/);
  const y=qInput();y.services=[y.services[0]];
  assert.throws(()=>F2.quoteBreakdown(y),/Discrimine/);
  const z=qInput();z.services[1].code="outro";
  assert.throws(()=>F2.quoteBreakdown(z),/diferente/);
});
test("F2: bloqueia centavos negativos, texto de contato e valores incoerentes",()=>{
  const a=qInput();a.services[0].amountCents=0;
  assert.throws(()=>F2.quoteBreakdown(a),/centavos/);
  const b=qInput();b.parts[0].name="WhatsApp 99999";
  assert.throws(()=>F2.quoteBreakdown(b),/contato externo/);
  const c=qInput();c.parts[0].amountCents=500000;
  assert.throws(()=>F2.quoteBreakdown(c),/Total/);
});
test("F2: cliente só aceita orçamento válido ainda dentro de 5 minutos",()=>{
  const out=F2.quoteDecision({quote:quote(NOW),now:NOW+299999,
    actingUserId:"cliente",customerId:"cliente",accept:true});
  assert.equal(out.next,"awaiting_payment");
  assert.equal(out.paymentAllowed,false);assert.equal(out.chatAllowed,false);
});
test("F2: orçamento expira exatamente após 5 minutos",()=>{
  const out=F2.quoteDecision({quote:quote(NOW),now:NOW+300000,
    actingUserId:"cliente",customerId:"cliente",accept:true});
  assert.equal(out.status,"expired");
});
test("F2: cliente pode recusar, preservando ausência de pagamento e chat",()=>{
  const out=F2.quoteDecision({quote:quote(NOW),now:NOW+60000,
    actingUserId:"cliente",customerId:"cliente",accept:false});
  assert.equal(out.next,"redistribute");
  assert.equal(out.paymentAllowed,false);assert.equal(out.chatAllowed,false);
});
test("F2: terceiro e prestador não podem aceitar proposta no domínio",()=>{
  assert.throws(()=>F2.quoteDecision({quote:quote(NOW),now:NOW+100,
    actingUserId:"terceiro",customerId:"cliente",accept:true}),/titular/);
});
test("F2: valor não é alterado depois do aceite; exige novo orçamento",()=>{
  assert.throws(()=>F2.quoteDecision({quote:{status:"accepted",createdAt:NOW},now:NOW+100,
    actingUserId:"cliente",customerId:"cliente",accept:true}),/indisponível/);
});


test("F2: oferta entregue aos 4min ainda concede 5min completos após entrega",()=>{
  const out=F2.notificationDecision({offeredAt:NOW,deliveredAt:NOW+240000,now:NOW+300000});
  assert.equal(out.status,"waiting");
  assert.equal(out.canCountAbsence,false);
  const expired=F2.notificationDecision({offeredAt:NOW,deliveredAt:NOW+240000,now:NOW+540000});
  assert.equal(expired.status,"timeout");
});
