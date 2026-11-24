"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const SUPPORT=require("../f23-support-hybrid-offline.js");
const CRITICAL=require("../f23-critical-alert-plan-offline.js");
const DESK=require("../f23-founder-incident-desk-offline.js");
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

// SM-DEC-052: horários são referências de produto, não plantão comprovado.
test("SM-DEC-052: 9h inclusivo e 18h exclusivo em São Paulo, sem alterar busca 24h",()=>{
 for(const [at,officeWindow] of [
   ["2026-11-18T11:59:00Z",false], // 08h59 de quarta
   ["2026-11-18T12:00:00Z",true],  // 09h00 de quarta
   ["2026-11-18T20:59:00Z",true],  // 17h59 de quarta
   ["2026-11-18T21:00:00Z",false], // 18h00 de quarta
   ["2026-11-22T13:00:00Z",false], // domingo 10h
   ["2026-11-23T12:00:00Z",true]   // segunda 09h
 ]){
   const x=SUPPORT.planDutyCoverage({kind:"service_issue",eventAt:at,officeStaffedMock:true});
   assert.equal(x.officeWindow,officeWindow,at);
   assert.equal(x.timezone,"America/Sao_Paulo");
   assert.equal(x.supportIntake24h,true);
   assert.equal(x.launchAllowed,false);
 }

});
test("SM-DEC-052: janela de expediente sem responsável não finge atendimento",()=>{
 const x=SUPPORT.planDutyCoverage({kind:"service_issue",
   eventAt:"2026-11-18T13:00:00Z",officeStaffedMock:false});
 assert.equal(x.officeWindow,true);
 assert.equal(x.officeCoveredMock,false);
 assert.equal(x.decision,"queue_for_human");
 assert.equal(x.realTicketOpened,false);
 assert.equal(x.humanResponseGuaranteed,false);
});
test("SM-DEC-052: feriado simulado desativa expediente e exige plantão habilitado",()=>{
 const input={kind:"safety_report",eventAt:"2026-11-18T13:00:00Z",
   isHolidayMock:true,officeStaffedMock:true};
 const noOncall=SUPPORT.planDutyCoverage(input);
 assert.equal(noOncall.officeWindow,false);
 assert.equal(noOncall.decision,"critical_uncovered");
 const oncall=SUPPORT.planDutyCoverage({...input,onCallAssignedMock:true,
   onCallChannelReadyMock:true});
 assert.equal(oncall.decision,"critical_oncall_mock");
 assert.equal(oncall.holidayCalendarVerified,false);
 assert.equal(oncall.supportDutyConfirmed,false);
});
test("SM-DEC-052: crítico na madrugada só indica plantão com pessoa E canal simulados",()=>{
 const base={kind:"safety_report",eventAt:"2026-11-22T05:30:00Z"};
 for(const flags of [
   {},{onCallAssignedMock:true},{onCallChannelReadyMock:true}
 ]){
   const x=SUPPORT.planDutyCoverage({...base,...flags});
   assert.equal(x.decision,"critical_uncovered");
   assert.equal(x.criticalWithoutVerifiedCoverageMock,true);
   assert.equal(x.emergencyGuidanceSuggested,true);
   assert.equal(x.launchAllowed,false);
 }
 const oncall=SUPPORT.planDutyCoverage({...base,onCallAssignedMock:true,
   onCallChannelReadyMock:true});
 assert.equal(oncall.decision,"critical_oncall_mock");
 for(const forbidden of [
   "realAlertSent","realTicketOpened","realRequestPaused","realPaymentHeld",
   "realRefundIssued","realPayoutIssued","humanResponseGuaranteed","launchAllowed"
 ]) assert.equal(oncall[forbidden],false,forbidden);
});
test("SM-DEC-052: disputa financeira à noite aguarda humano; F4 preserva retenção",()=>{
 const x=SUPPORT.planDutyCoverage({kind:"payment_dispute",
   eventAt:"2026-11-22T05:30:00Z",onCallAssignedMock:true,onCallChannelReadyMock:true});
 assert.equal(x.priority,"high");
 assert.equal(x.decision,"queue_for_human");
 assert.equal(x.realPaymentHeld,false);
 const F4=require("../f4-finance.js");
 const settlement=F4.settlementEligibility({paymentVerifiedByServer:true,
   providerConfirmed:true,customerConfirmed:true,disputeOpen:true});
 assert.equal(settlement.candidateForServerSettlement,false);
 assert.equal(settlement.transferAllowedInThisModule,false);
});
test("SM-DEC-052: rejeita horário inválido, categoria desconhecida e sinalizadores malformados",()=>{
 assert.throws(()=>SUPPORT.planDutyCoverage({kind:"safety_report",eventAt:"bad"}),/Horário/);
 assert.throws(()=>SUPPORT.planDutyCoverage({kind:"other",eventAt:Date.now()}),/Categoria/);
 assert.throws(()=>SUPPORT.planDutyCoverage({kind:"safety_report",
   eventAt:"2026-11-22T05:30:00Z",onCallAssignedMock:"yes"}),/booleano/);
});

// SM-DEC-053: fundador assume inicialmente; outro responsável somente no futuro.
test("SM-DEC-053: fundador é destinatário preferencial apenas no cenário em que está disponível",()=>{
 const x=SUPPORT.planOnCallEscalation({
   founderAssignedMock:true,founderReachableMock:true,
   delegateAssignedMock:true,delegateReachableMock:true
 });
 assert.equal(x.primaryRole,"founder");
 assert.equal(x.suggestedTarget,"founder_mock");
 assert.equal(x.contactChannelVerified,false);
 assert.equal(x.realPageSent,false);
 assert.equal(x.productionAuthorized,false);
});
test("SM-DEC-053: fundador indisponível e substituto não designado nunca geram falsa cobertura",()=>{
 for(const flags of [
   {},{founderAssignedMock:true},
   {founderAssignedMock:true,delegateReachableMock:true},
   {founderReachableMock:true}
 ]){
   const x=SUPPORT.planOnCallEscalation(flags);
   assert.equal(x.suggestedTarget,"uncovered");
   assert.equal(x.noHumanCoverageMock,true);
   assert.equal(x.escalationGuaranteed,false);
   assert.equal(x.humanAcknowledgementReceived,false);
 }
});
test("SM-DEC-053: outro responsável só entra quando futuramente designado e disponível",()=>{
 const flags={founderAssignedMock:true,founderReachableMock:false,
   delegateAssignedMock:true,delegateReachableMock:true};
 const x=SUPPORT.planOnCallEscalation(flags);
 assert.equal(x.suggestedTarget,"future_delegate_mock");
 assert.equal(x.delegateDesignatedInProject,false);
 assert.equal(x.liveRotaVerified,false);
 assert.equal(x.paymentOrRefundAuthorized,false);
 assert.equal(x.productionAuthorized,false);
 assert.equal(SUPPORT.planOnCallEscalation({...flags,
   delegateReachableMock:false}).suggestedTarget,"uncovered");
 assert.throws(()=>SUPPORT.planOnCallEscalation({delegateAssignedMock:"yes"}),/booleano/);
});

// SM-PLAN-001: preparação zero contratação; protótipo NUNCA envia alertas reais.
test("SM-PLAN-001: marcos 2min/5min apenas na simulação, sem envio real",()=>{
 const begin=Date.parse("2026-11-22T05:30:00Z");
 const base={kind:"safety_report",incidentAt:begin,
   founderAssignedMock:true,founderDutyConfirmedMock:true,
   founderChannelVerifiedMock:true,linkedToRequestMock:true};
 for(const [elapsed,reminder,escalate,status] of [
  [0,false,false,"awaiting_founder_ack_mock"],
  [119999,false,false,"awaiting_founder_ack_mock"],
  [120000,true,false,"awaiting_founder_ack_mock"],
  [299999,true,false,"awaiting_founder_ack_mock"],
  [300000,true,true,"no_verified_ack_mock"]
 ]){
  const x=CRITICAL.planCriticalAlert({...base,now:begin+elapsed});
  assert.equal(x.reminderDueMock,reminder,elapsed);
  assert.equal(x.escalationDueMock,escalate,elapsed);
  assert.equal(x.status,status,elapsed);
  assert.equal(x.realAlertSent,false);
  assert.equal(x.realAlertDelivered,false);
  assert.equal(x.humanAcknowledgementProved,false);
  assert.equal(x.productionAuthorized,false);
  assert.equal(x.requestPausedInServer,false);
 }
});
test("SM-PLAN-001: sem rede/canal ou titular fora de plantão é SEM COBERTURA",()=>{
 const start="2026-11-22T05:30:00Z",now="2026-11-22T05:31:00Z";
 for(const flags of [
  {},{founderAssignedMock:true},
  {founderAssignedMock:true,founderDutyConfirmedMock:true},
  {founderAssignedMock:true,founderChannelVerifiedMock:true}
 ]){
  const x=CRITICAL.planCriticalAlert({kind:"safety_report",incidentAt:start,now,...flags});
  assert.equal(x.status,"uncovered_mock");
  assert.equal(x.lackOfHumanCoverageMock,true);
  assert.equal(x.humanAcknowledgementProved,false);
  assert.equal(x.emergencyServiceGuidanceSuggested,true);
 }
});
test("SM-PLAN-001: ACK fictício válido encerra lembretes sem virar prova de leitura real",()=>{
 const incident=Date.parse("2026-11-22T05:30:00Z");
 const x=CRITICAL.planCriticalAlert({kind:"safety_report",incidentAt:incident,
  now:incident+360000,founderAssignedMock:true,founderDutyConfirmedMock:true,
  founderChannelVerifiedMock:true,founderAckAtMock:incident+120000});
 assert.equal(x.status,"founder_acknowledged_mock");
 assert.equal(x.reminderDueMock,false);
 assert.equal(x.escalationDueMock,false);
 assert.equal(x.humanAcknowledgementProved,false);
 assert.equal(x.supportResponseGuaranteed,false);
 assert.throws(()=>CRITICAL.planCriticalAlert({
  kind:"safety_report",incidentAt:incident,now:incident+60000,
  founderAckAtMock:incident+30000}),/sem responsável/);
 assert.throws(()=>CRITICAL.planCriticalAlert({
  kind:"safety_report",incidentAt:incident,now:incident+60000,
  founderAssignedMock:true,founderDutyConfirmedMock:true,
  founderChannelVerifiedMock:true,founderAckAtMock:incident+90000}),/janela/);
});
test("SM-PLAN-001: substituto futuro não existe até credenciamento e canal simulados",()=>{
 const base={kind:"safety_report",incidentAt:"2026-11-22T05:30:00Z",
  now:"2026-11-22T05:36:00Z",founderAssignedMock:true,
  founderDutyConfirmedMock:true,founderChannelVerifiedMock:true};
 for(const flags of [
  {},{delegateAssignedMock:true,delegateDutyConfirmedMock:true},
  {delegateAssignedMock:true,delegateChannelVerifiedMock:true}
 ]){
  const x=CRITICAL.planCriticalAlert({...base,...flags});
  assert.equal(x.escalateToDelegateMock,false);
  assert.equal(x.status,"no_verified_ack_mock");
 }
 const x=CRITICAL.planCriticalAlert({...base,
  delegateAssignedMock:true,delegateDutyConfirmedMock:true,
  delegateChannelVerifiedMock:true});
 assert.equal(x.escalateToDelegateMock,true);
 assert.equal(x.status,"delegate_escalation_candidate_mock");
 assert.equal(x.secondPersonNotDesignatedInProject,true);
 assert.equal(x.realTicketCreated,false);
 assert.equal(x.payoutAllowed,false);
 assert.equal(x.productionAuthorized,false);
});
test("SM-PLAN-001: contestação financeira continua em revisão, mesmo com flags de plantão",()=>{
 const x=CRITICAL.planCriticalAlert({kind:"payment_dispute",
  incidentAt:"2026-11-18T21:00:00Z",now:"2026-11-18T21:10:00Z",
  linkedToRequestMock:true,founderAssignedMock:true,founderDutyConfirmedMock:true,
  founderChannelVerifiedMock:true});
 assert.equal(x.priority,"high");
 assert.equal(x.recommendHoldSettlementMock,true);
 assert.equal(x.refundAllowed,false);
 assert.equal(x.payoutAllowed,false);
 assert.equal(x.paymentHeldInPSP,false);
 const finance=require("../f4-finance.js");
 assert.equal(finance.settlementEligibility({paymentVerifiedByServer:true,
  providerConfirmed:true,customerConfirmed:true,disputeOpen:true})
  .candidateForServerSettlement,false);
});
test("SM-PLAN-001: texto público não expõe ocorrência, GPS, contato ou identidade",()=>{
 const incident={kind:"safety_report",incidentAt:"2026-11-18T21:00:00Z",
  now:"2026-11-18T21:01:00Z",linkedToRequestMock:true};
 const x=CRITICAL.planCriticalAlert(incident);
 for(const word of ["Rua","GPS","CPF","cliente","telefone","foto"]){
  assert.ok(!x.publicNotificationLabel.includes(word),word);
 }
 assert.equal(x.realTicketCreated,false);
 assert.equal(x.paymentHeldInPSP,false);
 assert.equal(x.dispatchAllowed,false);
 assert.ok(Object.isFrozen(x));
 assert.throws(()=>CRITICAL.planCriticalAlert({...incident,kind:"other"}),/Tipo/);
 assert.throws(()=>CRITICAL.planCriticalAlert({...incident,now:"invalid"}),/Horário/);
 assert.throws(()=>CRITICAL.planCriticalAlert({...incident,
  founderAssignedMock:"yes"}),/booleano/);
});

// SM-PLAN-002 — central de incidentes do fundador: somente estado/auditoria sintéticos.
test("SM-PLAN-002: fila organizada por segurança, disputa e horário, sem detalhes pessoais",()=>{
 const opened="2026-11-18T22:00:00Z";
 const cases=[
  DESK.createIncidentFixture({caseId:"routine-case-001",kind:"general_question",openedAt:opened}),
  DESK.createIncidentFixture({caseId:"money-case-001",kind:"payment_dispute",
    openedAt:"2026-11-18T23:00:00Z",linkedToRequestMock:true}),
  DESK.createIncidentFixture({caseId:"security-case-001",kind:"safety_report",
    openedAt:"2026-11-18T23:30:00Z",linkedToRequestMock:true}),
  DESK.createIncidentFixture({caseId:"security-case-002",kind:"safety_report",
    openedAt:"2026-11-18T23:20:00Z"})
 ];
 const board=DESK.founderDeskPreview(cases);
 assert.deepEqual(board.cases.map(c=>c.caseId),
  ["security-case-002","security-case-001","money-case-001","routine-case-001"]);
 assert.equal(board.ticketCount,4);
 assert.equal(board.pendingCount,4);
 assert.equal(board.criticalUnacknowledgedCount,2);
 assert.equal(board.potentialFinancialHolds,2);
 for(const flag of ["realCasesRetrieved","humanCoverageVerified",
   "realNotificationSent","realFundsFrozen","productionAuthorized"])
  assert.equal(board[flag],false);
 assert.equal(JSON.stringify(board).includes("Rua"),false);
 assert.ok(Object.isFrozen(board.cases));
 assert.ok(Object.isFrozen(board.cases[0]));
});
test("SM-PLAN-002: só titular de teste reconhece um caso com sinalização de escala e canal",()=>{
 const a=DESK.createIncidentFixture({caseId:"security-case-001",
   kind:"safety_report",openedAt:"2026-11-18T22:00:00Z",linkedToRequestMock:true});
 const when="2026-11-18T22:01:00Z";
 const base={eventId:"acknowledge-0001",action:"acknowledge",at:when};
 for(const extras of [
  {actorRole:"system_mock",dutyConfirmedMock:true,channelVerifiedMock:true},
  {actorRole:"founder_mock",dutyConfirmedMock:true},
  {actorRole:"founder_mock",channelVerifiedMock:true}
 ]){
  assert.throws(()=>DESK.applyIncidentFixture(a,{...base,...extras}),/Reconhecimento/);
 }
 const accepted=DESK.applyIncidentFixture(a,{...base,actorRole:"founder_mock",
   dutyConfirmedMock:true,channelVerifiedMock:true});
 assert.equal(accepted.duplicate,false);
 assert.equal(accepted.state.status,"acknowledged_mock");
 assert.equal(accepted.state.version,1);
 assert.equal(accepted.state.supportTicketCreated,false);
 assert.equal(accepted.state.humanIdentityVerified,false);
 assert.equal(accepted.state.realServiceRequestPaused,false);
 assert.equal(accepted.state.productionAuthorized,false);
 assert.ok(Object.isFrozen(accepted.state.events));
 assert.ok(Object.isFrozen(accepted.state.events[0]));
});
test("SM-PLAN-002: alerta sem resposta vira escalado, nunca resolvido ou enviado de verdade",()=>{
 const initial=DESK.createIncidentFixture({caseId:"security-case-001",
   kind:"safety_report",openedAt:"2026-11-18T22:00:00Z"});
 const late={eventId:"escalate-000001",action:"flag_unanswered",
   actorRole:"system_mock",at:"2026-11-18T22:05:00Z"};
 assert.throws(()=>DESK.applyIncidentFixture(initial,{...late,at:"2026-11-18T22:04:59Z"}),/Somente/);
 const x=DESK.applyIncidentFixture(initial,late);
 assert.equal(x.state.status,"escalated_uncovered_mock");
 assert.equal(x.state.productionAuthorized,false);
 assert.equal(x.state.realCustomerNotified,false);
 assert.equal(x.state.financialReleaseAuthorized,false);
 const y=DESK.applyIncidentFixture(x.state,{eventId:"ack-late-0001",
   action:"acknowledge",actorRole:"founder_mock",at:"2026-11-18T22:06:00Z",
   dutyConfirmedMock:true,channelVerifiedMock:true});
 assert.equal(y.state.status,"acknowledged_mock");
 assert.equal(y.state.version,2);
});
test("SM-PLAN-002: eventos duplicados são idempotentes, adulterações ou ordem inválida falham",()=>{
 const initial=DESK.createIncidentFixture({caseId:"financial-case-001",
   kind:"payment_dispute",openedAt:"2026-11-18T22:00:00Z",linkedToRequestMock:true});
 const e={eventId:"acknowledge-0001",action:"acknowledge",
   actorRole:"founder_mock",at:"2026-11-18T22:01:00Z",
   dutyConfirmedMock:true,channelVerifiedMock:true};
 const once=DESK.applyIncidentFixture(initial,e);
 const twice=DESK.applyIncidentFixture(once.state,e);
 assert.equal(twice.duplicate,true);
 assert.equal(twice.state,once.state);
 assert.equal(twice.state.version,1);
 assert.throws(()=>DESK.applyIncidentFixture(once.state,{...e,at:"2026-11-18T22:02:00Z"}),/Colisão/);
 assert.throws(()=>DESK.applyIncidentFixture(once.state,{
   eventId:"review-00000001",action:"start_review",actorRole:"founder_mock",
   at:"2026-11-18T21:59:59Z"}),/fora de ordem/);
 assert.throws(()=>DESK.applyIncidentFixture(once.state,{...e,
   eventId:"another-00001",note:"Rua da pessoa, 100"}),/campos não autorizados/);
});
test("SM-PLAN-002: revisão exige reconhecimento, evidência mock e motivo compatível; sem repasse",()=>{
 let x=DESK.createIncidentFixture({caseId:"financial-case-001",
   kind:"payment_dispute",openedAt:"2026-11-18T22:00:00Z",
   linkedToRequestMock:true});
 const review={eventId:"review-00000001",action:"start_review",
   actorRole:"founder_mock",at:"2026-11-18T22:02:00Z"};
 assert.throws(()=>DESK.applyIncidentFixture(x,review),/reconhecido/);
 x=DESK.applyIncidentFixture(x,{eventId:"acknowledge-0001",
   action:"acknowledge",actorRole:"founder_mock",
   at:"2026-11-18T22:01:00Z",
   dutyConfirmedMock:true,channelVerifiedMock:true}).state;
 x=DESK.applyIncidentFixture(x,review).state;
 const completion={eventId:"resolve-0000001",action:"resolve_review_mock",
   actorRole:"founder_mock",at:"2026-11-18T22:03:00Z"};
 assert.throws(()=>DESK.applyIncidentFixture(x,{...completion,
   reasonCode:"service_reviewed_mock",evidenceCheckedMock:true}),/Revisão fictícia/);
 assert.throws(()=>DESK.applyIncidentFixture(x,{...completion,
   reasonCode:"financial_reviewed_mock"}),/Revisão fictícia/);
 x=DESK.applyIncidentFixture(x,{...completion,
   reasonCode:"financial_reviewed_mock",evidenceCheckedMock:true}).state;
 assert.equal(x.status,"reviewed_mock");
 assert.equal(x.version,3);
 assert.equal(x.recommendHoldSettlementMock,true); // liberação depende do PSP/servidor real
 for(const prop of ["financialReleaseAuthorized","refundAuthorized",
   "humanIdentityVerified","productionAuthorized"]) assert.equal(x[prop],false);
 assert.throws(()=>DESK.applyIncidentFixture(x,{...completion,eventId:"resolve-0000002"}),/Revisão fictícia/);
 const finance=require("../f4-finance.js");
 assert.equal(finance.settlementEligibility({
   paymentVerifiedByServer:true,providerConfirmed:true,
   customerConfirmed:true,disputeOpen:true}).candidateForServerSettlement,false);
});
test("SM-PLAN-002: impede campos livres/PII e casos duplicados em fila",()=>{
 assert.throws(()=>DESK.createIncidentFixture({caseId:"bad",kind:"safety_report",
   openedAt:"2026-11-18T22:00:00Z"}),/ID fictício/);
 assert.throws(()=>DESK.createIncidentFixture({caseId:"unknown-case-001",
   kind:"unsafe_custom",openedAt:"2026-11-18T22:00:00Z"}),/Categoria/);
 const c=DESK.createIncidentFixture({caseId:"security-case-001",
   kind:"safety_report",openedAt:"2026-11-18T22:00:00Z"});
 assert.throws(()=>DESK.founderDeskPreview([c,c]),/duplicado/);
 assert.throws(()=>DESK.applyIncidentFixture(c,{eventId:"wrong-00001",
   action:"release_payment",actorRole:"founder_mock",
   at:"2026-11-18T22:01:00Z"}),/Ação de suporte desconhecida/);
 assert.throws(()=>DESK.applyIncidentFixture(c,{eventId:"wrong-00002",
   action:"acknowledge",actorRole:"founder_mock",
   at:"2026-11-18T22:01:00Z",reasonCode:"Rua Secreta"}),/Motivo padronizado/);
});

test("Suporte: reconhecimento pelo futuro substituto encerra lembretes e escalonamento fictícios",()=>{
 const start=Date.parse("2026-11-22T05:30:00Z");
 const x=CRITICAL.planCriticalAlert({kind:"safety_report",incidentAt:start,now:start+420000,
 founderAssignedMock:true,founderDutyConfirmedMock:true,founderChannelVerifiedMock:true,
 delegateAssignedMock:true,delegateDutyConfirmedMock:true,delegateChannelVerifiedMock:true,
 delegateAckAtMock:start+360000});
 assert.equal(x.status,"delegate_acknowledged_mock");
 assert.equal(x.reminderDueMock,false);
 assert.equal(x.escalationDueMock,false);
 assert.equal(x.escalateToDelegateMock,false);
 assert.equal(x.productionAuthorized,false);
});
test("Suporte: criação de caso rejeita campos pessoais livres",()=>{
 assert.throws(()=>DESK.createIncidentFixture({caseId:"case-synthetic-001",kind:"safety_report",
 openedAt:1000,description:"texto privado fictício"}),/campos não autorizados/);
});
