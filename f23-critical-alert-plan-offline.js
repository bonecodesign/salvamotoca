/* Salva Motoca! — plano de alerta crítico SEM CUSTO ADICIONAL (somente OFFLINE).
 * Não envia push, e-mail, SMS, Whatsapp, requisição Supabase ou qualquer alerta real.
 * Flags *Mock NÃO comprovam disponibilidade, entrega ou reconhecimento real.
 */
"use strict";
const MINUTE=60000;
const REMINDER_AFTER_MS=2*MINUTE;
const ESCALATE_AFTER_MS=5*MINUTE;
const KINDS=Object.freeze(["safety_report","payment_dispute"]);
const GENERIC_PUBLIC_LABEL="Alerta importante: abra o painel seguro do Salva Motoca!";
function need(test,message){if(!test)throw new Error(message);}
function timestamp(value,name){
 const t=typeof value==="number"?value:Date.parse(value);
 need(Number.isSafeInteger(t)&&t>=0,name+" inválido.");
 return t;
}
function flag(value,name){need(typeof value==="boolean",name+" precisa ser booleano.");return value;}
function planCriticalAlert({
 kind,incidentAt,now,linkedToRequestMock=false,
 founderAssignedMock=false,founderDutyConfirmedMock=false,
 founderChannelVerifiedMock=false,founderAckAtMock=null,
 delegateAssignedMock=false,delegateDutyConfirmedMock=false,
 delegateChannelVerifiedMock=false,delegateAckAtMock=null
}={}){
 need(KINDS.includes(kind),"Tipo de alerta crítico inválido.");
 const incident=timestamp(incidentAt,"Horário do incidente");
 const current=timestamp(now,"Horário atual");
 need(current>=incident,"Horário atual não pode anteceder o incidente.");
 for(const [name,v] of Object.entries({linkedToRequestMock,
 founderAssignedMock,founderDutyConfirmedMock,founderChannelVerifiedMock,
 delegateAssignedMock,delegateDutyConfirmedMock,delegateChannelVerifiedMock}))
   flag(v,name);
 const primaryReady=founderAssignedMock&&founderDutyConfirmedMock&&founderChannelVerifiedMock;
 const delegateReady=delegateAssignedMock&&delegateDutyConfirmedMock&&delegateChannelVerifiedMock;
 function ack(value,ready,name){
   if(value==null)return null;
   const at=timestamp(value,name);
   need(ready,"Confirmação fictícia sem responsável e canal habilitados.");
   need(at>=incident&&at<=current,"Horário de confirmação fictícia fora da janela.");
   return at;
 }
 const founderAck=ack(founderAckAtMock,primaryReady,"Aceite fundador");
 const delegateAck=ack(delegateAckAtMock,delegateReady,"Aceite substituto");
 const age=current-incident;
 const reminderDue=primaryReady&&founderAck==null&&age>=REMINDER_AFTER_MS;
 const escalationDue=founderAck==null&&age>=ESCALATE_AFTER_MS;
 // NUNCA alegar segundo responsável habilitado apenas porque existe projeto futuro.
 let status;
 if(founderAck!==null)status="founder_acknowledged_mock";
 else if(delegateAck!==null)status="delegate_acknowledged_mock";
 else if(!primaryReady&&!delegateReady)status="uncovered_mock";
 else if(escalationDue&&delegateReady)status="delegate_escalation_candidate_mock";
 else if(escalationDue)status="no_verified_ack_mock";
 else if(primaryReady)status="awaiting_founder_ack_mock";
 else status="uncovered_mock";
 return Object.freeze({
   mockOnly:true,kind,priority:kind==="safety_report"?"critical":"high",
   status,incidentAt:incident,checkedAt:current,
   publicNotificationLabel:GENERIC_PUBLIC_LABEL,
   founderRoleDefined:true,secondPersonNotDesignatedInProject:true,
   founderCoverageReadyMock:primaryReady,delegateCoverageReadyMock:delegateReady,
   reminderAfterMs:REMINDER_AFTER_MS,escalateAfterMs:ESCALATE_AFTER_MS,
   reminderDueMock:reminderDue,
   escalationDueMock:escalationDue,
   escalateToDelegateMock:escalationDue&&delegateReady&&founderAck==null,
   lackOfHumanCoverageMock:status==="uncovered_mock"||status==="no_verified_ack_mock",
   humanAcknowledgementProved:false,
   supportResponseGuaranteed:false,
   emergencyServiceGuidanceSuggested:kind==="safety_report",
   manualReviewRequired:true,
   recommendPauseRequestMock:kind==="safety_report"&&linkedToRequestMock,
   recommendHoldSettlementMock:linkedToRequestMock,
   // Não há autorização para abrir tickets, publicar dados ou atuar em incidentes reais.
   realAlertSent:false,realAlertDelivered:false,realTicketCreated:false,
   requestPausedInServer:false,paymentHeldInPSP:false,
   payoutAllowed:false,refundAllowed:false,dispatchAllowed:false,
   productionAuthorized:false
 });
}
module.exports=Object.freeze({KINDS,REMINDER_AFTER_MS,ESCALATE_AFTER_MS,
 GENERIC_PUBLIC_LABEL,planCriticalAlert});
