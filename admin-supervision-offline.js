/* Salva Motoca! — read-only supervisory projection for synthetic fixtures.
 * This is NOT authentication, production administration, a PSP or a database API.
 */
"use strict";
const Desk=require("./f23-founder-incident-desk-offline.js");
const Support=require("./f23-support-hybrid-offline.js");
const Alerts=require("./f23-critical-alert-plan-offline.js");
const Bridge=require("./f456-financial-bridge-offline.js");
const ALIAS=/^demo-[0-9]{3}$/;
const STATES=new Set(["awaiting_payment","ready_for_dispatch","en_route","arrived","in_service","handoff_f6","support_review","awaiting_summary","awaiting_both","completed","mock_hold"]);
const DENIAL=Object.freeze({mockOnly:true,productionAuthorized:false,realDataRetrieved:false,humanIdentityVerified:false,realAlertSent:false,realFundsHeld:false,transferAuthorized:false,refundAuthorized:false,dispatchAuthorized:false});
function need(ok,msg){if(!ok)throw new Error(msg);}
function only(input,keys,label){
 need(input&&typeof input==="object"&&!Array.isArray(input)&&Object.keys(input).every(k=>keys.includes(k)),label+" contém campos não autorizados.");
}
function project(input){
 only(input,["role","now","sessions","incidents"],"Painel");
 const {role,now,sessions=[],incidents=[]}=input;
 if(role!=="founder_mock")return Object.freeze({access:"denied",...DENIAL});
 need(Number.isSafeInteger(now)&&now>0,"Relógio inválido.");
 need(Array.isArray(sessions)&&sessions.length<=1000&&Array.isArray(incidents)&&incidents.length<=1000,"Limite de fixtures excedido.");
 const aliases=new Set(),requestIds=new Set(),quotes=new Set(),caseIds=new Set();
 const projected=sessions.map(row=>{
  only(row,["alias","session"],"Atendimento");
  const {alias,session:s}=row;
  need(typeof alias==="string"&&ALIAS.test(alias)&&!aliases.has(alias),"Identificador demonstrativo inválido ou duplicado.");
  need(s?.engine==="SM_F456_BRIDGE_NO_PSP"&&Object.keys(Bridge.REAL_DENIAL).every(k=>s[k]===false),"Sessão não é fixture segura.");
  need(!requestIds.has(s.requestId)&&!quotes.has(s.quoteId),"Pedido ou orçamento duplicado.");
  need(now>=(s.f6?.lastEventAt??s.f5.lastEventAt)&&now>=(s.riskEvents[0]?.at??0),"Relógio anterior à sessão.");
  aliases.add(alias);requestIds.add(s.requestId);quotes.add(s.quoteId);
  const state=s.risk!=="clear"?"mock_hold":s.stage==="f6"?s.f6.status:s.f5.status;
  need(STATES.has(state),"Etapa inválida.");
  const review=Bridge.settlementReview(s);
  const a=s.amounts;
  need([a.customerSubtotalBeforeProcessingCents,a.providerReceivableCents,a.platformGrossCommissionCents].every(v=>Number.isSafeInteger(v)&&v>=0)&&a.customerSubtotalBeforeProcessingCents===a.providerReceivableCents+a.platformGrossCommissionCents,"Totais fictícios incoerentes.");
  return {alias,state,mockPaid:s.mockPaymentRecorded===true,reviewCandidate:review.mockHumanReviewCandidate===true,
   subtotalCents:a.customerSubtotalBeforeProcessingCents,providerCents:a.providerReceivableCents,commissionCents:a.platformGrossCommissionCents};
 });
 const mapped=new Map();
 for(const row of incidents){
  only(row,["alias","incident"],"Incidente");
  const {alias,incident:c}=row;
  need(c&&c.productionAuthorized===false&&c.mockOnly===true&&!caseIds.has(c.caseId),"Caso inválido ou duplicado.");
  need((alias===null&&!c.linkedToRequestMock)||(aliases.has(alias)&&c.linkedToRequestMock===true),"Vínculo de incidente incompatível.");
  need(c.openedAt<=now&&c.lastEventAt<=now,"Incidente posterior ao relógio.");
  caseIds.add(c.caseId);mapped.set(c.caseId,row);
 }
 const desk=Desk.founderDeskPreview(incidents.map(x=>x.incident));
 const rows=desk.cases.map((c,i)=>{
  const source=mapped.get(c.caseId);
  const active=c.status!=="reviewed_mock";
  const duty=Support.planDutyCoverage({kind:c.kind,eventAt:c.openedAt});
  const alert=active&&c.priority==="critical"&&source.incident.founderAckAtMock===null?
   Alerts.planCriticalAlert({kind:c.kind,incidentAt:c.openedAt,now,linkedToRequestMock:source.incident.linkedToRequestMock}):null;
  return Object.freeze({number:i+1,alias:source.alias,kind:c.kind,priority:Support.PRIORITY[c.kind],status:c.status,
   ageMinutes:Math.floor((now-c.openedAt)/60000),duty:duty.decision,
   escalationDueMock:alert?.escalationDueMock===true,
   holdReview:active&&(c.kind==="payment_dispute"||c.kind==="safety_report")&&source.alias!==null});
 });
 const blocked=new Set(rows.filter(x=>x.holdReview).map(x=>x.alias));
 const operations=projected.map(s=>Object.freeze({...s,reviewCandidate:s.reviewCandidate&&!blocked.has(s.alias),
  mockRiskHold:s.state==="mock_hold"||blocked.has(s.alias)}));
 const reviewed=operations.filter(s=>s.reviewCandidate);
 return Object.freeze({access:"founder_mock",...DENIAL,generatedAt:now,
  counts:Object.freeze({sessions:operations.length,paidFixtures:operations.filter(x=>x.mockPaid).length,
   pendingIncidents:desk.pendingCount,criticalUnacknowledged:desk.criticalUnacknowledgedCount,
   mockRiskHolds:operations.filter(x=>x.mockRiskHold).length,reviewCandidates:reviewed.length}),
  totals:Object.freeze({reviewProviderCents:reviewed.reduce((n,s)=>n+s.providerCents,0),
   reviewCommissionCents:reviewed.reduce((n,s)=>n+s.commissionCents,0),realAvailableCents:null}),
  operations:Object.freeze(operations),incidents:Object.freeze(rows)});
}
module.exports=Object.freeze({project,DENIAL});
