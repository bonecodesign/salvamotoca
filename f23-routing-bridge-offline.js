/* Salva Motoca! — ponte F2/F3 SOMENTE OFFLINE, sem rede, banco ou notificacoes.
 * Esta funcao e um planejador de dominio, NAO uma autorizacao do servidor.
 * Nunca submeta a resposta a um worker, push ou PSP real.
 */
"use strict";
const F2=require("./f2-flow.js");
const F3=require("./f3-tow.js");
const F4=require("./f4-finance.js");

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVITE_WINDOW_MS=300000;
// SM-DEC-047: anéis aprovados pelo fundador; APENAS planejamento offline.
const APPROVED_RADII_KM=F2.APPROVED_RADII_KM;
need(APPROVED_RADII_KM.join(",")===F3.APPROVED_RADII_KM.join(","),"Etapas F2/F3 divergentes.");
const CLOSED=new Set(["declined","expired_no_delivery","expired_after_mock_open","cancelled"]);
const ACTIVE=new Set(["pending","opened_mock","quoted"]);
const WINNER=new Set(["accepted","selected"]);
const PHASES=Object.freeze({TIRE:"F2",TOW:"F3"});
const SAFE=Object.freeze({
 mockOnly:true,notificationSent:false,deliveryVerified:false,absenceCounted:false,
 paymentAllowed:false,chatAllowed:false,dispatchAllowed:false,
 exactLocationShared:false,realAuthorizationVerified:false
});
function need(test,message){if(!test)throw new Error(message);}
function integer(v){return Number.isSafeInteger(v)&&v>=0;}
function identify(request){
 need(request&&typeof request==="object"&&!Array.isArray(request),"Solicitação inexistente.");
 need(UUID.test(request.requestId||""),"Identificador fictício do pedido inválido.");
 need(Array.isArray(request.serviceTypes),"Serviços inválidos.");
 const tow=request.serviceTypes.includes("reboque_moto");
 if(tow){
  need(request.categoryCode==="reboque_moto","Pedido misto com reboque exige rota F3.");
  // Validate motorcycle weight, equipment context, private destination and codes.
  return {phase:PHASES.TOW,domain:F3.validateTowRequest(request)};
 }
 need(request.categoryCode==="borracharia_delivery","Somente pedidos de borracharia podem usar a F2.");
 return {phase:PHASES.TIRE,domain:F2.serviceTypes(request.serviceTypes)};
}
function validateHistory(history,requestId,now){
 need(Array.isArray(history)&&history.length<=100,"Histórico de convites inválido.");
 const ids=new Set(),providers=new Set(),closed=[];
 let hasActive=false,hasWinner=false;
 for(const h of history){
  need(h&&typeof h==="object"&&h.requestId===requestId
    &&typeof h.offerId==="string"&&h.offerId.length>0
    &&typeof h.providerId==="string"&&h.providerId.length>0,
   "Convite de outra solicitação ou sem vínculo.");
  need(!ids.has(h.offerId)&&!providers.has(h.providerId),
   "Convite duplicado para o mesmo prestador ou identificador.");
  ids.add(h.offerId);providers.add(h.providerId);
  need(integer(h.offeredAt)&&h.offeredAt<=now
   &&typeof h.status==="string"
   &&(ACTIVE.has(h.status)||CLOSED.has(h.status)||WINNER.has(h.status)),
   "Histórico com horário ou status inválido.");
  if(h.openedAt!==undefined&&h.openedAt!==null){
   need(integer(h.openedAt)&&h.openedAt>=h.offeredAt&&h.openedAt<=now,
    "Abertura fictícia anterior ou posterior ao horário permitido.");
  }
  if(h.status==="opened_mock"){
   need(integer(h.openedAt),"Convite aberto requer horário de abertura fictícia.");
   if(now<h.openedAt+INVITE_WINDOW_MS)hasActive=true;
   else closed.push({offerId:h.offerId,reason:"expired_after_mock_open"});
  }else if(h.status==="pending"){
   need(h.openedAt==null,"Convite pendente não pode constar como aberto.");
   if(now<h.offeredAt+INVITE_WINDOW_MS)hasActive=true;
   else closed.push({offerId:h.offerId,reason:"expired_no_delivery"});
  }else if(h.status==="quoted"){
   need(h.openedAt!=null,"Proposta sem abertura de convite.");
   hasActive=true;
  }else if(WINNER.has(h.status))hasWinner=true;
 }
 return {used:providers,hasActive,hasWinner,closed};
}
function planNextInvitation({
 request,providers,history=[],radiiKm=APPROVED_RADII_KM,now,rotationSeed=""
}={}){
 need(Number.isSafeInteger(now)&&now>0,"Horário fictício inválido.");
 const route=identify(request);
 need(Array.isArray(radiiKm)&&radiiKm.length===APPROVED_RADII_KM.length&&radiiKm.every((r,i)=>r===APPROVED_RADII_KM[i]),"Etapas devem respeitar os raios aprovados 5/15/60 km.");
 need(Array.isArray(providers)&&providers.length<=1000,"Prestadores inválidos.");
 const providerIds=new Set();
 for(const p of providers){
  need(p&&typeof p.id==="string"&&p.id.length>0&&!providerIds.has(p.id),"Prestador inválido ou duplicado.");
  providerIds.add(p.id);
 }
 const info=validateHistory(history,request.requestId,now);
 const shell={...SAFE,phase:route.phase,requestId:request.requestId};
 if(request.status!=="requested"||info.hasWinner)
  return {...shell,status:"blocked",reason:"request_not_open"};
 if(request.mode!=="automatic")
  return {...shell,status:"manual_review",reason:"manual_routing_not_automatic"};
 if(info.hasActive)
  return {...shell,status:"waiting",reason:"previous_invite_or_quote_active"};
 const available=providers.filter(p=>p&&p.id&&!info.used.has(p.id));
 let choice;
 if(route.phase===PHASES.TIRE){
  const result=F2.distribute({
   providers:available,
   request:{
    city:request.city,stateCode:request.stateCode,
    serviceTypes:route.domain,location:request.location,
    justDeclinedProviderId:null
   },
   radiiKm,now,rotationSeed
  });
  // F2 motor penaliza uma recusa ANTES da distancia. Neste contrato
  // aprovado a proximidade deve prevalecer; recusa desempata.
  choice=result.status==="candidates"
    ?[...result.candidates].sort((a,b)=>a.distanceKm-b.distanceKm
      || a.rejectionCount-b.rejectionCount
      || String(a.id).localeCompare(String(b.id)))[0]
    :null;
  if(!choice)return {...shell,status:"no_provider",reason:"none_eligible",historyClosed:info.closed.length};
  return {...shell,status:"invite_mock",providerId:choice.id,
   radiusKm:result.radiusKm,stage:result.stage,historyClosed:info.closed.length};
 }
 const result=F3.findTowProviders({
  providers:available,request:route.domain,radiiKm,now
 });
 choice=result.status==="candidates"?result.candidates[0]:null;
 if(!choice)return {...shell,status:"no_provider",reason:"none_eligible",historyClosed:info.closed.length};
 return {...shell,status:"invite_mock",providerId:choice.id,
  radiusKm:result.radiusKm,stage:result.stage,historyClosed:info.closed.length};
}
function quoteDryRun({request,quoteId,serviceCents,travelCents}={}){
 const route=identify(request);
 need(UUID.test(quoteId||""),"Proposta fictícia inválida.");
 let lines;
 if(route.phase===PHASES.TOW){
  const q=F3.quoteTow({serviceTypes:route.domain.serviceTypes,serviceCents,
    travelCents,parts:[]});
  lines=q.rows;
 }else{
  need(serviceCents&&typeof serviceCents==="object"&&!Array.isArray(serviceCents),
   "Valores dos serviços inválidos.");
  const q=F2.quoteBreakdown({
   serviceTypes:route.domain,
   services:Object.entries(serviceCents).map(([code,amountCents])=>({code,amountCents})),
   travelCents,parts:[]
  });
  lines=q.rows.map(x=>({kind:x.type,code:x.code,amountCents:x.amountCents}));
 }
 const snapshot=F4.quoteSnapshot({quoteId,requestId:request.requestId,items:lines});
 const cost=F4.costBreakdown({quote:snapshot});
 return {
  ...SAFE,phase:route.phase,requestId:request.requestId,quoteId,
  serviceCents:cost.serviceCents,travelCents:cost.travelCents,
  riderFeeCents:cost.riderFeeCents,providerFeeCents:cost.providerFeeCents,
  customerSubtotalBeforeProcessingCents:cost.customerSubtotalBeforeProcessingCents,
  providerReceivableCents:cost.providerReceivableCents,
  platformGrossCommissionCents:cost.commissionCents,
  processingFeeCents:null,customerTotalCents:null,
  currency:"BRL",materialsIncludedInService:true
 };
}
module.exports=Object.freeze({
 PHASES,INVITE_WINDOW_MS,APPROVED_RADII_KM,identify,planNextInvitation,quoteDryRun
});
