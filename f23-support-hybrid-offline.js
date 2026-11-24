/* Salva Motoca! SM-DEC-051 — triagem híbrida SOMENTE OFFLINE.
 * Não cria chamados de suporte, alertas, bloqueios reais ou transferências.
 * Nenhuma rede, Supabase, pagamento, IA ou autoridade de suporte.
 */
"use strict";
const KINDS=Object.freeze([
  "general_question","service_issue","payment_dispute","safety_report"
]);
const PRIORITY=Object.freeze({
  general_question:"routine",
  service_issue:"routine",
  payment_dispute:"high",
  safety_report:"critical"
});
function assert(ok,msg){if(!ok)throw new Error(msg);}
function previewSupportCase({
  kind,humanSupportAvailable=false,linkedToActiveRequest=false,
  eventAt
}={}){
  assert(KINDS.includes(kind),"Categoria de suporte não reconhecida.");
  assert(typeof humanSupportAvailable==="boolean","Disponibilidade humana inválida.");
  assert(typeof linkedToActiveRequest==="boolean","Vínculo com solicitação inválido.");
  const instant=typeof eventAt==="number"?eventAt:Date.parse(eventAt);
  assert(Number.isFinite(instant),"Horário do relato inválido.");
  const priority=PRIORITY[kind];
  const critical=kind==="safety_report";
  const disputed=kind==="payment_dispute";
  const reviewRequired=kind!=="general_question";
  // Informações de suporte 24h são assíncronas; presença humana não é presumida.
  return Object.freeze({
    mockOnly:true,
    incidentAt:instant,
    category:kind,
    priority,
    intakeAvailable24h:true,
    humanSupportAvailableInMock:humanSupportAvailable,
    acknowledgementSuggested:true,
    automatedGuidanceOnly:kind==="general_question",
    humanReviewRequired:reviewRequired,
    queueForHuman:reviewRequired&&!humanSupportAvailable,
    criticalWithoutHumanCoverage:critical&&!humanSupportAvailable,
    showEmergencyServiceGuidance:critical,
    // Proposta de bloqueio: backend e operadores precisarão verificar
    // identidade, pedido e evento antes de qualquer alteração real.
    pauseRequestPendingReview:critical&&linkedToActiveRequest,
    freezeSettlementPendingReview:(critical||disputed)&&linkedToActiveRequest,
    retainAuditTrail:true,
    humanActionConfirmed:false,
    ticketCreated:false,
    customerNotified:false,
    providerNotified:false,
    paymentCaptured:false,
    refundAllowed:false,
    payoutAllowed:false,
    dispatchAllowed:false,
    productionAuthorized:false
  });
}

// SM-DEC-052: desenho de escala OFFLINE; sinalizadores de cobertura são
// estritamente sintéticos, NÃO comprovam um responsável ou canal de plantão.
// Horário de referência: seg-sex 09:00-18:00 America/Sao_Paulo, fim exclusivo.
// Feriados exigem um calendário confiável na implementação de produção.
const DUTY_TIMEZONE="America/Sao_Paulo";
const OFFICE_START_MINUTE=9*60;
const OFFICE_END_MINUTE=18*60;
function planDutyCoverage({
  kind,eventAt,isHolidayMock=false,officeStaffedMock=false,
  onCallAssignedMock=false,onCallChannelReadyMock=false
}={}){
  assert(KINDS.includes(kind),"Categoria de suporte não reconhecida.");
  for(const [name,value] of Object.entries({
    isHolidayMock,officeStaffedMock,onCallAssignedMock,onCallChannelReadyMock
  })){
    assert(typeof value==="boolean",name+" precisa ser booleano.");
  }
  const at=typeof eventAt==="number"?eventAt:Date.parse(eventAt);
  assert(Number.isFinite(at),"Horário do relato inválido.");
  const segments=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
    timeZone:DUTY_TIMEZONE,weekday:"short",hour:"2-digit",
    minute:"2-digit",hourCycle:"h23"
  }).formatToParts(new Date(at)).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  const day=segments.weekday;
  const minutes=Number(segments.hour)*60+Number(segments.minute);
  const workday=["Mon","Tue","Wed","Thu","Fri"].includes(day);
  const officeWindow=workday&&!isHolidayMock&&
    minutes>=OFFICE_START_MINUTE&&minutes<OFFICE_END_MINUTE;
  const officeCovered=officeWindow&&officeStaffedMock;
  const onCallCovered=onCallAssignedMock&&onCallChannelReadyMock;
  const critical=kind==="safety_report";
  const decision=critical
    ?officeCovered?"critical_office_mock":
      onCallCovered?"critical_oncall_mock":"critical_uncovered"
    :officeCovered?"human_office_mock":"queue_for_human";
  return Object.freeze({
    mockOnly:true,timezone:DUTY_TIMEZONE,
    officeWindow,officeCoveredMock:officeCovered,
    onCallCoveredMock:onCallCovered,
    priority:PRIORITY[kind],category:kind,decision,
    supportIntake24h:true,automaticGuidanceAvailable:true,
    queueForHuman:decision==="queue_for_human",
    criticalWithoutVerifiedCoverageMock:decision==="critical_uncovered",
    emergencyGuidanceSuggested:critical,
    holidayCalendarVerified:false,
    staffingVerifiedByServer:false,
    supportDutyConfirmed:false,
    realAlertSent:false,realTicketOpened:false,realRequestPaused:false,
    realPaymentHeld:false,realRefundIssued:false,realPayoutIssued:false,
    humanResponseGuaranteed:false,launchAllowed:false
  });
}

// SM-DEC-053 — titular fundador, substituto somente quando futuramente habilitado.
// A simulação não conhece nomes, contatos, escala real ou disponibilidade verificada.
function planOnCallEscalation({
  founderAssignedMock=false,founderReachableMock=false,
  delegateAssignedMock=false,delegateReachableMock=false
}={}){
  for(const [name,value] of Object.entries({
    founderAssignedMock,founderReachableMock,delegateAssignedMock,delegateReachableMock
  })) assert(typeof value==="boolean",name+" precisa ser booleano.");
  const primaryReady=founderAssignedMock&&founderReachableMock;
  const delegateReady=delegateAssignedMock&&delegateReachableMock;
  const suggestedTarget=primaryReady?"founder_mock":
    delegateReady?"future_delegate_mock":"uncovered";
  return Object.freeze({
    mockOnly:true,
    primaryRole:"founder",
    delegateRole:"future_designated_person",
    delegateDesignatedInProject:false,
    suggestedTarget,
    noHumanCoverageMock:suggestedTarget==="uncovered",
    requiresHumanConfirmation:true,
    contactChannelVerified:false,
    liveRotaVerified:false,
    humanAcknowledgementReceived:false,
    realPageSent:false,
    escalationGuaranteed:false,
    paymentOrRefundAuthorized:false,
    productionAuthorized:false
  });
}
module.exports=Object.freeze({KINDS,PRIORITY,previewSupportCase,planDutyCoverage,planOnCallEscalation});
