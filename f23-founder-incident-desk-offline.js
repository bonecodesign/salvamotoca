/* Salva Motoca! — central do fundador: ocorrências auditáveis, SOMENTE OFFLINE.
 * Não registra tickets reais, não autentica pessoas, não envia alertas,
 * não altera o Supabase, o Stripe ou solicitações reais.
 * Papéis, eventos, evidências e disponibilidade são inteiramente sintéticos.
 */
"use strict";
const {KINDS,PRIORITY}=require("./f23-support-hybrid-offline.js");
const {ESCALATE_AFTER_MS}=require("./f23-critical-alert-plan-offline.js");
const ID=/^[a-zA-Z0-9_-]{8,64}$/;
const ROLES=Object.freeze(["founder_mock","system_mock"]);
const ACTIONS=Object.freeze([
  "flag_unanswered","acknowledge","start_review","resolve_review_mock"
]);
const RESOLUTION_REASON=Object.freeze({
  general_question:"guidance_reviewed_mock",
  service_issue:"service_reviewed_mock",
  payment_dispute:"financial_reviewed_mock",
  safety_report:"safety_reviewed_mock"
});
function ensure(ok,message){if(!ok)throw new Error(message);}
function checkKeys(value,allowed,name){
 ensure(value&&typeof value==="object"&&!Array.isArray(value),name+" inválido.");
 const extras=Object.keys(value).filter(k=>!allowed.includes(k));
 ensure(extras.length===0,name+" tem campos não autorizados.");
}
function id(value,name){ensure(typeof value==="string"&&ID.test(value),name+" inválido.");return value;}
function stamp(value,name){
 const v=typeof value==="number"?value:Date.parse(value);
 ensure(Number.isSafeInteger(v)&&v>=0,name+" inválido.");return v;
}
function isFlag(v,name){ensure(typeof v==="boolean",name+" deve ser booleano.");return v;}
function freezeCase(state){
 const events=Object.freeze(state.events.map(e=>Object.freeze({...e})));
 return Object.freeze({...state,events,
   mockOnly:true,
   supportTicketCreated:false,
   humanIdentityVerified:false,
   humanCoverageVerified:false,
   financialReleaseAuthorized:false,
   refundAuthorized:false,
   realCustomerNotified:false,
   realServiceRequestPaused:false,
   productionAuthorized:false
 });
}
function createIncidentFixture({caseId,kind,linkedToRequestMock=false,openedAt}={}){
 id(caseId,"ID fictício do caso");
 ensure(KINDS.includes(kind),"Categoria desconhecida.");
 isFlag(linkedToRequestMock,"Vínculo com pedido");
 const at=stamp(openedAt,"Abertura");
 return freezeCase({caseId,kind,priority:PRIORITY[kind],
   linkedToRequestMock,status:"queued_mock",openedAt:at,lastEventAt:at,
   version:0,events:[],founderAckAtMock:null,manualReviewedAtMock:null,
   // Recomendações futuras; backend + PSP devem validar eventos de disputa.
   recommendHoldSettlementMock:linkedToRequestMock&&
     (kind==="payment_dispute"||kind==="safety_report"),
   recommendPauseRequestMock:linkedToRequestMock&&kind==="safety_report"
 });
}
function applyIncidentFixture(state,input){
 ensure(state&&state.mockOnly===true&&Array.isArray(state.events)&&
   state.productionAuthorized===false,"Estado não é um incidente de simulação.");
 checkKeys(input,["eventId","action","actorRole","at","reasonCode",
   "dutyConfirmedMock","channelVerifiedMock","evidenceCheckedMock"],"Evento");
 const eventId=id(input.eventId,"ID fictício do evento");
 const action=input.action;
 ensure(ACTIONS.includes(action),"Ação de suporte desconhecida.");
 ensure(ROLES.includes(input.actorRole),"Papel de teste inválido.");
 const at=stamp(input.at,"Horário do evento");
 const dutyConfirmedMock=input.dutyConfirmedMock??false;
 const channelVerifiedMock=input.channelVerifiedMock??false;
 const evidenceCheckedMock=input.evidenceCheckedMock??false;
 for(const [name,v] of Object.entries({dutyConfirmedMock,channelVerifiedMock,
   evidenceCheckedMock}))isFlag(v,name);
 const reasonCode=input.reasonCode??null;
 ensure(reasonCode===null||(typeof reasonCode==="string"&&
   Object.values(RESOLUTION_REASON).includes(reasonCode)),
   "Motivo padronizado de revisão inválido.");
 const signature=JSON.stringify({eventId,action,actorRole:input.actorRole,
   at,reasonCode,dutyConfirmedMock,channelVerifiedMock,evidenceCheckedMock});
 const prior=state.events.find(e=>e.eventId===eventId);
 if(prior){
   ensure(prior.signature===signature,"Colisão de ID com conteúdo diferente.");
   return Object.freeze({state,duplicate:true});
 }
 ensure(at>=state.lastEventAt&&at>=state.openedAt,
   "Evento fora de ordem.");
 let status=state.status;
 let founderAckAtMock=state.founderAckAtMock;
 let manualReviewedAtMock=state.manualReviewedAtMock;
 if(action==="flag_unanswered"){
   ensure(input.actorRole==="system_mock"&&
     state.kind==="safety_report"&&state.status==="queued_mock"&&
     at>=state.openedAt+ESCALATE_AFTER_MS,
     "Somente incidente crítico sem resposta pode escalar após o intervalo de teste.");
   status="escalated_uncovered_mock";
 }else if(action==="acknowledge"){
   ensure(input.actorRole==="founder_mock"&&
     (state.status==="queued_mock"||state.status==="escalated_uncovered_mock")&&
     dutyConfirmedMock&&channelVerifiedMock,
     "Reconhecimento fictício exige fundador e canal/escala confirmados no teste.");
   status="acknowledged_mock";founderAckAtMock=at;
 }else if(action==="start_review"){
   ensure(input.actorRole==="founder_mock"&&
     state.status==="acknowledged_mock",
     "Somente fundador reconhecido pode iniciar revisão fictícia.");
   status="under_review_mock";
 }else if(action==="resolve_review_mock"){
   ensure(input.actorRole==="founder_mock"&&
     state.status==="under_review_mock"&&
     reasonCode===RESOLUTION_REASON[state.kind]&&
     evidenceCheckedMock===true,
     "Revisão fictícia exige motivo compatível e evidência marcada para revisão humana.");
   status="reviewed_mock";manualReviewedAtMock=at;
 }
 const entry={eventId,action,actorRole:input.actorRole,at,reasonCode,signature};
 return Object.freeze({state:freezeCase({...state,
   status,founderAckAtMock,manualReviewedAtMock,lastEventAt:at,
   version:state.version+1,events:[...state.events,entry]}),duplicate:false});
}
function founderDeskPreview(cases=[]){
 ensure(Array.isArray(cases)&&cases.length<=1000,"Fila de incidentes inválida.");
 const seen=new Set();
 const priorityRank={critical:0,high:1,routine:2};
 const queue=cases.map(c=>{
   ensure(c&&c.mockOnly===true&&KINDS.includes(c.kind)&&
     typeof c.caseId==="string"&&ID.test(c.caseId),
     "Caso de simulação inválido.");
   ensure(!seen.has(c.caseId),"ID de caso duplicado.");
   seen.add(c.caseId);
   return {caseId:c.caseId,kind:c.kind,priority:c.priority,
     status:c.status,openedAt:c.openedAt,
     version:c.version,
     requiresHumanReview:c.kind!=="general_question",
     recommendHoldSettlementMock:!!c.recommendHoldSettlementMock,
     recommendPauseRequestMock:!!c.recommendPauseRequestMock};
 }).sort((a,b)=>{
   const resolvedA=a.status==="reviewed_mock"?1:0;
   const resolvedB=b.status==="reviewed_mock"?1:0;
   return resolvedA-resolvedB||priorityRank[a.priority]-priorityRank[b.priority]||
     a.openedAt-b.openedAt||a.caseId.localeCompare(b.caseId);
 });
 const pending=queue.filter(c=>c.status!=="reviewed_mock");
 const unacknowledgedCritical=pending.filter(c=>c.priority==="critical"&&
   ["queued_mock","escalated_uncovered_mock"].includes(c.status));
 return Object.freeze({mockOnly:true,
   ticketCount:queue.length,
   pendingCount:pending.length,
   criticalUnacknowledgedCount:unacknowledgedCritical.length,
   potentialFinancialHolds:pending.filter(c=>c.recommendHoldSettlementMock).length,
   cases:Object.freeze(queue.map(c=>Object.freeze(c))),
   realCasesRetrieved:false,
   humanCoverageVerified:false,
   realNotificationSent:false,
   realFundsFrozen:false,
   productionAuthorized:false
 });
}
module.exports=Object.freeze({ACTIONS,ROLES,RESOLUTION_REASON,
 createIncidentFixture,applyIncidentFixture,founderDeskPreview});
