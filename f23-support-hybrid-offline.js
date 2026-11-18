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
module.exports=Object.freeze({KINDS,PRIORITY,previewSupportCase});
