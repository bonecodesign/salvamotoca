"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const BR=require("../f23-routing-bridge-offline.js");
const F2=require("../f2-flow.js");
const F3=require("../f3-tow.js");
const SUPPORT=require("../f23-support-hybrid-offline.js");

const NOW=Date.parse("2026-11-17T19:00:00Z");
const RID="11111111-aaaa-4111-8111-111111111111";
const QID="44444444-4444-4444-8444-444444444444";
const COORD={lat:-19.924,lng:-43.938};
const tire=()=>({
 requestId:RID,categoryCode:"borracharia_delivery",
 serviceTypes:["pneu_furado"],status:"requested",mode:"automatic",
 city:"Belo Horizonte",stateCode:"MG",location:{...COORD}
});
const tow=()=>({
 requestId:RID,categoryCode:"reboque_moto",
 serviceTypes:["reboque_moto"],status:"requested",mode:"automatic",
 motorcycleBrand:"Honda",motorcycleModel:"CG 160",
 motorcycleYear:2024,motorcycleWeightKg:140,
 pickupCity:"Belo Horizonte",pickupStateCode:"MG",
 destinationCity:"Contagem",destinationStateCode:"MG",
 destinationAddress:"ENDERECO PRIVADO DE TESTE, 123",
 estimatedRouteKm:20,pickupLocation:{...COORD}
});
const capacity=()=>({
 equipment:"plataforma",maxMotoKg:220,coverageKm:20,
 tieDownPoints:4,hasRamp:true,hasWheelChock:true,verifiedByAdmin:true
});
const nearTire=(id="tire-a",patch={})=>({
 id,name:id,approved:true,active:true,deliveryEnabled:true,serviceActive:true,
 onlineRequested:true,lastSeenAt:NOW-15000,
 city:"Belo Horizonte",stateCode:"MG",location:{lat:-19.925,lng:-43.938},
 coverageKm:15,serviceTypes:["pneu_furado","troca_camara"],rejectionCount:0,...patch
});
const nearTow=(id="tow-a",patch={})=>({
 id,label:id,approved:true,active:true,towServiceActive:true,
 onlineRequested:true,lastSeenAt:NOW-15000,city:"Belo Horizonte",stateCode:"MG",
 location:{lat:-19.925,lng:-43.938},capacity:capacity(),
 otherServiceTypes:["pneu_furado","troca_camara"],refusals:0,...patch
});
const run=(request,providers,history=[],other={})=>
 BR.planNextInvitation({request,providers,history,now:NOW,...other});
const history=(p,status="pending",patch={})=>({
 requestId:RID,offerId:"offer-"+p,providerId:p,
 status,offeredAt:NOW-60000,...patch
});
function proveNoAuthority(result){
 for(const field of ["mockOnly","notificationSent","deliveryVerified",
  "absenceCounted","paymentAllowed","chatAllowed","dispatchAllowed",
  "exactLocationShared","realAuthorizationVerified"]){
  assert.equal(result[field],field==="mockOnly",field);
 }
}

test("F2 categoria de borracharia escolhe o prestador próximo",()=>{
 const out=run(tire(),[
  nearTire("far",{location:{lat:-19.940,lng:-43.938}}),
  nearTire("close")
 ]);
 assert.equal(out.phase,"F2");assert.equal(out.providerId,"close");
 assert.equal(out.stage,1);assert.equal(out.radiusKm,5);
 assert.equal(out.status,"invite_mock");proveNoAuthority(out);
});
test("F3 com reboque escolhe apenas prestador com equipamento adequado",()=>{
 const out=run(tow(),[
  nearTire("tire-only"),
  nearTow("far",{location:{lat:-19.940,lng:-43.938}}),
  nearTow("near")
 ]);
 assert.equal(out.phase,"F3");assert.equal(out.providerId,"near");
 assert.equal(out.stage,1);proveNoAuthority(out);
});
test("F3: serviço misto continua na F3; jamais encaminha a borracharia simples",()=>{
 const req=tow();req.serviceTypes=["reboque_moto","troca_camara"];
 const out=run(req,[
  nearTire("tire-1"),
  nearTow("wrong",{otherServiceTypes:[]}),
  nearTow("right",{location:{lat:-19.926,lng:-43.938}})
 ]);
 assert.equal(out.providerId,"right");
 assert.equal(out.phase,"F3");
});
test("F2: dois serviços de borracharia exigem competência de ambos",()=>{
 const req=tire();req.serviceTypes=["pneu_furado","troca_camara"];
 const out=run(req,[
  nearTire("wrong",{serviceTypes:["pneu_furado"]}),
  nearTire("correct",{location:{lat:-19.926,lng:-43.938}})
 ]);
 assert.equal(out.providerId,"correct");
});
test("A proximidade tem prioridade sobre uma recusa, sem liberar duas recusas",()=>{
 const out=run(tire(),[
  nearTire("nearest",{rejectionCount:1}),
  nearTire("farther",{location:{lat:-19.927,lng:-43.938},rejectionCount:0})
 ]);
 assert.equal(out.providerId,"nearest");
 assert.equal(run(tire(),[nearTire("rejected",{rejectionCount:2})]).status,"no_provider");
});
test("F2 abre anel seguinte somente quando não há elegíveis no atual",()=>{
 const out=run(tire(),[
  nearTire("second-ring",{location:{lat:-20.008,lng:-43.938}})
 ]);
 assert.equal(out.stage,2);assert.equal(out.radiusKm,15);
});
test("F3 abre anel seguinte respeitando cobertura e homologação",()=>{
 const out=run(tow(),[
  nearTow("suspended",{approved:false}),
  nearTow("second-ring",{location:{lat:-20.008,lng:-43.938}})
 ]);
 assert.equal(out.stage,2);assert.equal(out.providerId,"second-ring");
});
test("Convite pendente mantém espera até o final dos cinco minutos",()=>{
 const h=history("tire-a","pending",{offeredAt:NOW-299999});
 assert.equal(run(tire(),[nearTire(),nearTire("next")],[h]).status,"waiting");
});
test("Convite não aberto expira sem contar ausência e tenta outro próximo",()=>{
 const h=history("tire-a","pending",{offeredAt:NOW-300000});
 const result=run(tire(),[nearTire(),nearTire("next")],[h]);
 assert.equal(result.status,"invite_mock");assert.equal(result.providerId,"next");
 assert.equal(result.historyClosed,1);assert.equal(result.absenceCounted,false);
});
test("Janela de resposta conta da abertura fictícia, não da criação",()=>{
 const h=history("tire-a","opened_mock",
  {offeredAt:NOW-500000,openedAt:NOW-299999});
 assert.equal(run(tire(),[nearTire(),nearTire("next")],[h]).status,"waiting");
 const next=run(tire(),[nearTire(),nearTire("next")],
  [{...h,openedAt:NOW-300000}]);
 assert.equal(next.providerId,"next");assert.equal(next.absenceCounted,false);
});
test("Proposta em avaliação bloqueia novos convites",()=>{
 const h=history("tire-a","quoted",{offeredAt:NOW-500000,openedAt:NOW-400000});
 assert.equal(run(tire(),[nearTire(),nearTire("next")],[h]).status,"waiting");
});
test("Proposta aceita ou selecionada não reabre F2 nem F3",()=>{
 for(const status of ["selected","accepted"]){
  assert.equal(run(tire(),[nearTire()],[history("tire-a",status)]).status,"blocked");
  assert.equal(run(tow(),[nearTow()],[history("tow-a",status)]).status,"blocked");
 }
});
test("Pedido não solicitado ou modo manual nunca inicia despacho automático",()=>{
 for(const status of ["awaiting_payment","in_progress","cancelled","completed"]){
  const req=tire();req.status=status;
  assert.equal(run(req,[nearTire()]).status,"blocked");
 }
 const req=tow();req.mode="manual";
 assert.equal(run(req,[nearTow()]).status,"manual_review");
});
test("Recusa voluntária tenta próximo elegível sem contar falta",()=>{
 const h=history("tow-a","declined");
 const out=run(tow(),[nearTow("tow-a"),nearTow("tow-b")],[h]);
 assert.equal(out.providerId,"tow-b");assert.equal(out.absenceCounted,false);
});
test("Mesmo prestador nunca recebe segundo convite pela mesma execução",()=>{
 const h=history("tow-a","expired_after_mock_open",
  {offeredAt:NOW-500000,openedAt:NOW-400000});
 assert.equal(run(tow(),[nearTow("tow-a")],[h]).status,"no_provider");
});
test("Prestador suspenso, offline ou presença vencida nunca entra",()=>{
 for(const patch of [
  {approved:false},{active:false},{onlineRequested:false},
  {lastSeenAt:NOW-90001},{lastSeenAt:NOW+1000}
 ]){
  assert.equal(run(tow(),[nearTow("tow-a",patch)]).status,"no_provider");
  assert.equal(run(tire(),[nearTire("tire-a",patch)]).status,"no_provider");
 }
});
test("Equipamento de reboque não homologado, leve ou sem rampa não entra",()=>{
 for(const cap of [
  {...capacity(),verifiedByAdmin:false},
  {...capacity(),maxMotoKg:120},
  {...capacity(),hasRamp:false},
  {...capacity(),tieDownPoints:1}
 ]){
  assert.equal(run(tow(),[nearTow("tow-a",{capacity:cap})]).status,"no_provider");
 }
});
test("Não converter reboque em categoria borracharia nem vice-versa",()=>{
 const req=tow();req.categoryCode="borracharia_delivery";
 assert.throws(()=>run(req,[nearTire()]),/rota F3/);
 const other=tire();other.categoryCode="reboque_moto";
 assert.throws(()=>run(other,[nearTow()]),/F2/);
});
test("Serviços desconhecidos ou repetidos são recusados nas duas fases",()=>{
 const r1=tire();r1.serviceTypes=["pneu_furado","pneu_furado"];
 assert.throws(()=>run(r1,[nearTire()]),/repita/);
 const r2=tow();r2.serviceTypes=["reboque_moto","reboque_moto"];
 assert.throws(()=>run(r2,[nearTow()]),/repetidos/);
 const r3=tow();r3.serviceTypes=["reboque_moto","moto_taxi"];
 assert.throws(()=>run(r3,[nearTow()]),/não reconhecidos/);
});
test("Destino privado de reboque e GPS exato nunca aparecem na resposta",()=>{
 const req=tow();const out=run(req,[nearTow()]);
 const serialized=JSON.stringify(out);
 assert.equal(out.destinationAddress,undefined);
 assert.equal(out.pickupLocation,undefined);
 assert.equal(out.location,undefined);
 assert.ok(!serialized.includes("ENDERECO PRIVADO"));
 assert.ok(!serialized.includes("-19.924"));
});
test("Não modificar a solicitação original ou os provedores",()=>{
 const req=tire();const ps=[nearTire()];
 const a=JSON.stringify([req,ps]);
 run(req,ps);
 assert.equal(JSON.stringify([req,ps]),a);
});
test("Convites de outros pedidos ou duplicados não podem alterar a escolha",()=>{
 const h=history("tire-a","pending");
 assert.throws(()=>run(tire(),[nearTire()],[{...h,requestId:QID}]),/outra solicitação/);
 assert.throws(()=>run(tire(),[nearTire()],[h,h]),/duplicado/);
 assert.throws(()=>run(tire(),[nearTire()],[h,{...h,offerId:"other"}]),/duplicado/);
});
test("Status, relógios futuros e histórico corrompido falham fechados",()=>{
 assert.throws(()=>run(tire(),[nearTire()],[history("tire-a","wrong")]),/Histórico/);
 assert.throws(()=>run(tire(),[nearTire()],[history("tire-a","pending",{offeredAt:NOW+5})]),/Histórico/);
 assert.throws(()=>run(tire(),[nearTire()],[history("tire-a","opened_mock")]),/abertura/);
 assert.throws(()=>run(tire(),[nearTire()],[history("tire-a","opened_mock",{openedAt:NOW+5})]),/Abertura/);
});
test("Raios inválidos, endereço ou peso inválido não ativam roteamento",()=>{
 assert.throws(()=>run(tire(),[nearTire()],[],{radiiKm:[3,1]}),/Etapas/);
 const r=tow();r.destinationAddress="";
 assert.throws(()=>run(r,[nearTow()]),/Endereço/);
 const w=tow();w.motorcycleWeightKg=999;
 assert.throws(()=>run(w,[nearTow()]),/Peso/);
});
test("Não existe prestador elegível se localização faltar",()=>{
 const r=tire();r.location=null;
 assert.equal(run(r,[nearTire()]).status,"no_provider");
 const t=tow();t.pickupLocation=null;
 assert.throws(()=>run(t,[nearTow()]),/Localização/);
});
test("Orçamento F2 respeita contrato 10%+10% sem tarifa PSP inventada",()=>{
 const result=BR.quoteDryRun({request:tire(),quoteId:QID,
  serviceCents:{pneu_furado:23000},travelCents:4000});
 assert.equal(result.phase,"F2");
 assert.equal(result.serviceCents,23000);
 assert.equal(result.travelCents,4000);
 assert.equal(result.riderFeeCents,2300);
 assert.equal(result.providerFeeCents,2300);
 assert.equal(result.customerSubtotalBeforeProcessingCents,29300);
 assert.equal(result.providerReceivableCents,24700);
 assert.equal(result.platformGrossCommissionCents,4600);
 assert.equal(result.customerTotalCents,null);
 proveNoAuthority(result);
});
test("Orçamento F3 misto preserva o preço de reboque e materiais embutidos",()=>{
 const req=tow();req.serviceTypes=["reboque_moto","troca_camara"];
 const result=BR.quoteDryRun({request:req,quoteId:QID,
  serviceCents:{reboque_moto:20000,troca_camara:3500},travelCents:1500});
 const old=F3.quoteTow({serviceTypes:req.serviceTypes,
  serviceCents:{reboque_moto:20000,troca_camara:3500},travelCents:1500});
 assert.equal(result.phase,"F3");
 assert.equal(result.serviceCents,23500);
 assert.equal(result.travelCents,1500);
 assert.equal(result.riderFeeCents,2350);
 assert.equal(result.providerFeeCents,2350);
 assert.equal(result.customerSubtotalBeforeProcessingCents,27350);
 assert.equal(result.providerReceivableCents,22650);
 assert.equal(result.platformGrossCommissionCents,4700);
 assert.equal(result.customerSubtotalBeforeProcessingCents,old.customerSubtotalBeforeProcessingCents);
 proveNoAuthority(result);
});
test("Orçamento com item extra, valor negativo ou total exagerado é recusado",()=>{
 assert.throws(()=>BR.quoteDryRun({request:tire(),quoteId:QID,
  serviceCents:{pneu_furado:1000,material_extra:100},travelCents:4000}),/Discrimine/);
 assert.throws(()=>BR.quoteDryRun({request:tow(),quoteId:QID,
  serviceCents:{reboque_moto:-100},travelCents:4000}),/Serviço/);
 assert.throws(()=>BR.quoteDryRun({request:tow(),quoteId:QID,
  serviceCents:{reboque_moto:490000},travelCents:30000}),/limite/);
});
test("Matemática F2/F3 igual para diversos centavos e deslocamentos",()=>{
 const services=[100,101,105,199,999,23000,45000];
 const travels=[0,1,199,4000];
 for(const s of services)for(const t of travels){
  const tirePrice=BR.quoteDryRun({request:tire(),quoteId:QID,
   serviceCents:{pneu_furado:s},travelCents:t});
  const towPrice=BR.quoteDryRun({request:tow(),quoteId:QID,
   serviceCents:{reboque_moto:s},travelCents:t});
  for(const key of ["serviceCents","travelCents","riderFeeCents",
   "providerFeeCents","customerSubtotalBeforeProcessingCents",
   "providerReceivableCents","platformGrossCommissionCents"]){
   assert.equal(tirePrice[key],towPrice[key],"Divergência no "+key+" para "+s+"/"+t);
  }
 }
});
test("Bridge apenas planeja: não há método de pagamento, API, push ou autorização real",()=>{
 assert.equal(typeof BR.planNextInvitation,"function");
 assert.equal(typeof BR.quoteDryRun,"function");
 assert.equal(BR.notify,undefined);
 assert.equal(BR.pay,undefined);
 assert.equal(BR.dispatch,undefined);
 assert.equal(BR.authorize,undefined);
 assert.equal(F2.RESPONSE_MS,BR.INVITE_WINDOW_MS);
});

// SM-DEC-047: política de raios 5/15/60, sem operação externa.
test("Anéis do fundador 5, 15 e 60 km são o padrão congelado",()=>{
 assert.deepEqual(BR.APPROVED_RADII_KM,[5,15,60]);
 assert.ok(Object.isFrozen(BR.APPROVED_RADII_KM));
 for(const req of [tire(),tow()]){
  const p=req.categoryCode==="reboque_moto"?nearTow():nearTire();
  assert.equal(run(req,[p]).radiusKm,5);
 }
});
test("F2/F3 abrem o terceiro anel a 60 km, mas jamais vão além dele",()=>{
 const remote={lat:-20.20,lng:-43.938}; // ~30 km, posições sintéticas
 const beyond={lat:-20.65,lng:-43.938}; // >60 km, posições sintéticas
 const tireResult=run(tire(),[nearTire("remote",{location:remote,coverageKm:65})]);
 assert.equal(tireResult.stage,3);assert.equal(tireResult.radiusKm,60);
 const towResult=run(tow(),[nearTow("remote",{location:remote,
  capacity:{...capacity(),coverageKm:65}})]);
 assert.equal(towResult.stage,3);assert.equal(towResult.radiusKm,60);
 assert.equal(run(tire(),[nearTire("too-far",{location:beyond,coverageKm:100})]).status,"no_provider");
 assert.equal(run(tow(),[nearTow("too-far",{location:beyond,
  capacity:{...capacity(),coverageKm:100}})]).status,"no_provider");
});
test("Anel de 60 km não substitui limite de cobertura declarado pelo prestador",()=>{
 const remote={lat:-20.20,lng:-43.938};
 assert.equal(run(tire(),[nearTire("limited",{location:remote,coverageKm:15})]).status,"no_provider");
 assert.equal(run(tow(),[nearTow("limited",{location:remote,
  capacity:{...capacity(),coverageKm:20}})]).status,"no_provider");
});

// SM-DEC-048 — as três cidades formam uma ÚNICA praça, sem estender a RMG toda.
test("F2/F3 permitem atendimento cruzado entre BH, Contagem e Betim",()=>{
 const t=tire();t.city="Contagem";
 const fromBh=run(t,[nearTire("bh",{city:"Belo Horizonte"})]);
 assert.equal(fromBh.status,"invite_mock");
 assert.equal(fromBh.radiusKm,5);
 const towRequest=tow();towRequest.pickupCity="Betim";
 const fromContagem=run(towRequest,[nearTow("contagem",{city:"Contagem"})]);
 assert.equal(fromContagem.status,"invite_mock");
 assert.equal(fromContagem.radiusKm,5);
 proveNoAuthority(fromBh);proveNoAuthority(fromContagem);
});
test("F2/F3 nunca expandem para municípios não autorizados, mesmo a poucos metros",()=>{
 const fromOutside=tire();fromOutside.city="Sabará";
 assert.equal(run(fromOutside,[nearTire("bh")]).status,"no_provider");
 const notPartner=nearTire("out",{city:"Nova Lima",coverageKm:60});
 assert.equal(run(tire(),[notPartner]).status,"no_provider");
 const towRequest=tow();towRequest.pickupCity="Nova Lima";
 assert.equal(run(towRequest,[nearTow("bh")]).status,"no_provider");
 assert.equal(run(tow(),[nearTow("out",{city:"Sabará"})]).status,"no_provider");
});

// SM-DEC-050: requests can be considered 24/7 (no arbitrary opening-hour gate).
test("F2/F3 aceitam candidatos elegíveis de madrugada, manhã e fim de semana",()=>{
 for(const when of [
   "2026-11-18T06:15:00Z", // 03:15 em Belo Horizonte (UTC-3)
   "2026-11-18T13:00:00Z", // 10:00 local
   "2026-11-22T05:40:00Z"  // domingo, 02:40 local
 ]){
   const now=Date.parse(when);
   for(const [request,provider] of [
      [tire(),nearTire("online-tire",{lastSeenAt:now-15000})],
      [tow(),nearTow("online-tow",{lastSeenAt:now-15000})]
   ]){
     const result=run(request,[provider],[],{now});
     assert.equal(result.status,"invite_mock");
     assert.equal(result.radiusKm,5);
     proveNoAuthority(result);
   }
 }
});
test("F2/F3 fora do horário comercial nunca inventam atendimento sem online",()=>{
 const now=Date.parse("2026-11-22T05:40:00Z");
 for(const req of [tire(),tow()]){
   assert.equal(run(req,[],[],{now}).status,"no_provider");
   const p=req.categoryCode==="reboque_moto"?nearTow():nearTire();
   assert.equal(run(req,[{...p,onlineRequested:false,lastSeenAt:now-15000}],[],{now}).status,"no_provider");
   assert.equal(run(req,[{...p,onlineRequested:true,lastSeenAt:now-90001}],[],{now}).status,"no_provider");
   const result=run(req,[{...p,onlineRequested:true,lastSeenAt:now-15000}],[],{now});
   assert.equal(result.status,"invite_mock");
   proveNoAuthority(result);
 }
});

// SM-DEC-051: triagem de suporte aprovada, somente simulação.
test("Suporte híbrido: dúvidas podem receber orientação digital de madrugada, sem humano garantido",()=>{
 const result=SUPPORT.previewSupportCase({kind:"general_question",
   eventAt:"2026-11-22T05:15:00Z",humanSupportAvailable:false});
 assert.equal(result.intakeAvailable24h,true);
 assert.equal(result.automatedGuidanceOnly,true);
 assert.equal(result.humanSupportAvailableInMock,false);
 assert.equal(result.ticketCreated,false);
 assert.equal(result.customerNotified,false);
 assert.equal(result.productionAuthorized,false);
});
test("Suporte híbrido: divergência de serviço entra em mediação, sem resolução automática",()=>{
 const x=SUPPORT.previewSupportCase({kind:"service_issue",
   eventAt:"2026-11-18T13:00:00Z",humanSupportAvailable:false,
   linkedToActiveRequest:true});
 assert.equal(x.humanReviewRequired,true);
 assert.equal(x.queueForHuman,true);
 assert.equal(x.priority,"routine");
 assert.equal(x.refundAllowed,false);
 assert.equal(x.dispatchAllowed,false);
});
test("Suporte híbrido: pagamento contestado sugere retenção; repasse continua bloqueado por F4",()=>{
 const x=SUPPORT.previewSupportCase({kind:"payment_dispute",
   eventAt:"2026-11-18T13:00:00Z",humanSupportAvailable:false,
   linkedToActiveRequest:true});
 assert.equal(x.priority,"high");
 assert.equal(x.freezeSettlementPendingReview,true);
 assert.equal(x.payoutAllowed,false);
 assert.equal(x.refundAllowed,false);
 const finance=require("../f4-finance.js");
 const hold=finance.settlementEligibility({paymentVerifiedByServer:true,
   providerConfirmed:true,customerConfirmed:true,disputeOpen:true});
 assert.equal(hold.candidateForServerSettlement,false);
 assert.equal(hold.transferAllowedInThisModule,false);
});
test("Suporte híbrido: relato grave à noite pede revisão urgente, sem simular plantão ativo",()=>{
 for(const humanSupportAvailable of [false,true]){
   const x=SUPPORT.previewSupportCase({kind:"safety_report",
     eventAt:"2026-11-22T06:00:00Z",humanSupportAvailable,
     linkedToActiveRequest:true});
   assert.equal(x.priority,"critical");
   assert.equal(x.showEmergencyServiceGuidance,true);
   assert.equal(x.pauseRequestPendingReview,true);
   assert.equal(x.freezeSettlementPendingReview,true);
   assert.equal(x.criticalWithoutHumanCoverage,!humanSupportAvailable);
   assert.equal(x.humanActionConfirmed,false);
   assert.equal(x.ticketCreated,false);
   assert.equal(x.productionAuthorized,false);
   assert.equal(x.paymentCaptured,false);
 }
});
test("Suporte híbrido: não aceita categorias inventadas ou dados de triagem inválidos",()=>{
 const x={eventAt:"2026-11-18T13:00:00Z"};
 assert.throws(()=>SUPPORT.previewSupportCase({...x,kind:"automatically_release_funds"}),/Categoria/);
 assert.throws(()=>SUPPORT.previewSupportCase({...x,kind:"safety_report",humanSupportAvailable:"yes"}),/Disponibilidade/);
 assert.throws(()=>SUPPORT.previewSupportCase({...x,kind:"safety_report",linkedToActiveRequest:"yes"}),/Vínculo/);
 assert.throws(()=>SUPPORT.previewSupportCase({kind:"payment_dispute",eventAt:"not-a-date"}),/Horário/);
 assert.ok(Object.isFrozen(SUPPORT.KINDS));
});
