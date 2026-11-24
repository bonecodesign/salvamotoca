/* Salva Motoca! — ponte F4 -> F5 -> F6 EXCLUSIVAMENTE OFFLINE.
 * SM-DEC-045/046: 10% cliente + 10% prestador, só serviço com materiais inclusos.
 * Esta ponte não valida webhook, não aceita confirmação real nem chama rede/PSP.
 * Cada permissão operacional/financeira real permanece false sem exceção.
 */
(function(root, factory) {
 "use strict";
 const api=factory(
   typeof module==="object"&&module.exports?require("./f4-finance.js"):root?.SMF4Finance,
   typeof module==="object"&&module.exports?require("./f5-offline-flow.js"):root?.SMF5Offline,
   typeof module==="object"&&module.exports?require("./f6-offline-completion.js"):root?.SMF6Offline
 );
 if(typeof module==="object"&&module.exports) module.exports=api;
 if(root&&typeof root==="object") root.SMF456OfflineBridge=api;
})(typeof window!=="undefined"?window:null,function(F4,F5,F6) {
 "use strict";
 const MOCK_RECEIPT="F456_LOCAL_FINANCE_NOT_PSP";
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const EVENT=/^[a-z0-9_-]{8,80}$/i;
 const SERVICE_EVENTS=Object.freeze([
   "chat_message","dispatch","provider_location","provider_arrived",
   "service_started","handoff_f6","request_support","support_message"
 ]);
 const REAL_DENIAL=Object.freeze({
   realPaymentVerified:false,realChatAuthorized:false,
   realTrackingAuthorized:false,realDispatchAuthorized:false,
   realSettlementAuthorized:false,realTransferExecuted:false
 });
 function requireOk(ok,reason){if(!ok)throw new Error(reason);}
 function frozen(value){return Object.freeze(value);}
 function uuid(value,name){
   requireOk(typeof value==="string"&&UUID.test(value),name+" inválido.");
   return value.toLowerCase();
 }
 function make({quote,customerId,providerId,createdAt}) {
   requireOk(F4&&F5&&F6,"F4/F5/F6 offline obrigatórias.");
   requireOk(quote?.status==="accepted","Orçamento aceito obrigatório.");
   requireOk(quote?.materialsIncludedInService===true&&quote.partsCents===0,
     "Materiais devem estar incluídos no serviço; recusar orçamento legado.");
   const canonical=F4.quoteSnapshot({quoteId:quote.quoteId,requestId:quote.requestId,items:quote.items,status:quote.status});
   requireOk(["serviceCents","travelCents","quoteTotalCents","partsCents"].every(k=>canonical[k]===quote[k]),
     "Totais divergentes dos itens do orçamento.");
   const cost=F4.costBreakdown({quote:canonical});
   requireOk(cost.riderFeeBps===1000&&cost.providerFeeBps===1000&&
     cost.riderFeeCents===cost.providerFeeCents&&
     cost.commissionCents===cost.riderFeeCents+cost.providerFeeCents,
     "Contrato bilateral de 10% não corresponde.");
   requireOk(cost.serviceCents+cost.travelCents===cost.quoteSubtotalCents,
     "Preço de serviço/deslocamento diverge.");
   const requestId=uuid(quote.requestId,"Pedido"),quoteId=uuid(quote.quoteId,"Orçamento");
   const customer=uuid(customerId,"Cliente"),provider=uuid(providerId,"Prestador");
   const f5=F5.createOfflineSession({
      requestId,quoteId,customerId:customer,providerId:provider,createdAt
   });
   return frozen({
     engine:"SM_F456_BRIDGE_NO_PSP",stage:"awaiting_mock_payment",
     requestId,quoteId,customerId:customer,providerId:provider,
     amounts:frozen({
       currency:"BRL",serviceCents:cost.serviceCents,travelCents:cost.travelCents,
       materialsIncludedInService:true,
       quoteSubtotalCents:cost.quoteSubtotalCents,
       riderFeeCents:cost.riderFeeCents,providerFeeCents:cost.providerFeeCents,
       customerSubtotalBeforeProcessingCents:cost.customerSubtotalBeforeProcessingCents,
       providerReceivableCents:cost.providerReceivableCents,
       platformGrossCommissionCents:cost.commissionCents
     }),
     f5,f6:null,mockPaymentRecorded:false,risk:"clear",riskEvents:[],
     ...REAL_DENIAL
   });
 }
 function stateOk(s) {requireOk(s?.engine==="SM_F456_BRIDGE_NO_PSP","Ponte apenas OFFLINE.");}
 function mockPayment(s,event) {
   stateOk(s);
   requireOk(s.stage==="awaiting_mock_payment"&&s.risk==="clear",
     "Estado financeiro fictício não permite reconfirmação.");
   requireOk(event&&event.kind==="mock_payment_confirmed"&&
     event.fixtureReceipt===MOCK_RECEIPT &&
     event.actorId==="offline_fixture"&&EVENT.test(event.id||"") &&
     event.currency==="BRL"&&
     event.requestId===s.requestId&&event.quoteId===s.quoteId &&
     event.amountCents===s.amounts.customerSubtotalBeforeProcessingCents &&
     event.providerReceivableCents===s.amounts.providerReceivableCents,
     "Pagamento de fixture inválido, preço alterado ou vínculo divergente.");
   // A fixture de F5 é deliberadamente inválida para qualquer PSP.
   const r=F5.applyOfflineEvent(s.f5,{
     id:event.id,at:event.at,kind:"mock_payment_confirmed",
     actorId:"offline_fixture",fixtureReceipt:"F5_LOCAL_FIXTURE_NOT_PSP",
     requestId:s.requestId,quoteId:s.quoteId
   });
   requireOk(!r.duplicate,"Pagamento fictício já confirmado.");
   return frozen({...s,f5:r.state,stage:"f5",mockPaymentRecorded:true,
     ...REAL_DENIAL});
 }
 function operational(s,event) {
   stateOk(s);
   requireOk(s.stage==="f5"&&s.risk==="clear"&&s.mockPaymentRecorded,
     "Atendimento bloqueado sem fixture local ou durante disputa/estorno.");
   requireOk(event&&SERVICE_EVENTS.includes(event.kind),
     "A ponte não aceita comprovante financeiro nem evento operacional desconhecido.");
   const r=F5.applyOfflineEvent(s.f5,event);
   if(r.duplicate)return {state:s,duplicate:true};
   if(event.kind!=="handoff_f6")return {state:frozen({...s,f5:r.state,...REAL_DENIAL}),duplicate:false};
   const f6=F6.startOfflineCompletion({
     requestId:s.requestId,customerId:s.customerId,
     providerId:s.providerId,handoff:F6.HANDOFF,createdAt:event.at
   });
   return {state:frozen({...s,f5:r.state,f6,stage:"f6",...REAL_DENIAL}),duplicate:false};
 }
 function completion(s,event) {
   stateOk(s);
   requireOk(s.stage==="f6"&&s.risk==="clear"&&s.mockPaymentRecorded,
     "Conclusão bloqueada sem handoff ou durante disputa/estorno.");
   requireOk(!s.f5.processed.some(x=>x.id===event?.id),"ID de evento já usado na F5.");
   const r=F6.applyOffline(s.f6,event);
   if(r.duplicate)return {state:s,duplicate:true};
   return {state:frozen({...s,f6:r.state,...REAL_DENIAL}),duplicate:false};
 }
 function risk(s,event) {
   stateOk(s);
   requireOk(s.mockPaymentRecorded&&s.risk==="clear",
     "Risco só é simulado após fixture de pagamento e uma única vez.");
   requireOk(event&&event.fixtureReceipt===MOCK_RECEIPT &&
      event.actorId==="offline_fixture"&&EVENT.test(event.id||"")&&
      event.requestId===s.requestId&&event.quoteId===s.quoteId&&event.currency==="BRL"&&
      Number.isSafeInteger(event.at)&&event.at>=(s.f6?.lastEventAt??s.f5.lastEventAt)&&
      !s.f5.processed.some(x=>x.id===event.id)&&!s.f6?.processed.some(x=>x.id===event.id)&&
      ["mock_dispute","mock_refund_requested","mock_chargeback"].includes(event.kind)&&
      Number.isSafeInteger(event.amountCents)&&event.amountCents>=1&&
      event.amountCents<=s.amounts.customerSubtotalBeforeProcessingCents,
      "Risco financeiro fictício inválido.");
   return frozen({...s,risk:"mock_hold",riskEvents:frozen([{
     id:event.id,kind:event.kind,amountCents:event.amountCents,at:event.at
   }]),...REAL_DENIAL});
 }
 function viewFor(s,viewerId,now=s.f5.lastEventAt) {
   stateOk(s);
   const id=typeof viewerId==="string"?viewerId.toLowerCase():"";
   if(id!==s.customerId&&id!==s.providerId)
     return frozen({access:"denied",mockOnly:true,...REAL_DENIAL});
   const participant=id===s.customerId?"customer":"provider";
   const base=s.stage==="f6"?F6.viewFor(s.f6,id):F5.viewFor(s.f5,id,now);
   const locked=s.risk!=="clear";
   return frozen({
     access:"participant",role:participant,mockOnly:true,
     status:locked?"mock_hold":base.status,
     amounts:s.amounts,
     f5MockChatOpen:!locked&&s.stage!=="f6"&&base.chatMockOpen===true,
     f5MockLocation:!locked&&s.stage!=="f6"?base.lastLocation:null,
     mockCompletionStatus:s.f6?.status||null,
     mockRiskHold:locked,
     ...REAL_DENIAL
   });
 }
 function settlementReview(s) {
   stateOk(s);
   const bilateral=!!(s.f6?.status==="completed"&&
     s.f6.customerConfirmed&&s.f6.providerConfirmed);
   const reviewEligible=s.stage==="f6"&&bilateral&&s.risk==="clear"&&
     s.mockPaymentRecorded;
   // O módulo F4 recusa sem PSP validado; nem a dupla confirmação offline o altera.
   const f4=F4.settlementEligibility({
     paymentVerifiedByServer:false,
     providerConfirmed:bilateral,customerConfirmed:bilateral,
     disputeOpen:s.risk!=="clear"
   });
   requireOk(f4.candidateForServerSettlement===false&&
     f4.transferAllowedInThisModule===false,"O simulador não autoriza repasse.");
   return frozen({
     mockHumanReviewCandidate:reviewEligible,transferAuthorized:false,
     pspFundsConfirmed:false,realSettlementVerified:false,
     realTransferExecuted:false,
     providerReceivableMockCents:s.amounts.providerReceivableCents,
     platformGrossCommissionMockCents:s.amounts.platformGrossCommissionCents,
     reason:reviewEligible?
       "Somente avaliação humana fictícia: sem PSP, sem disponibilidade de fundos, sem transferência.":
       "Sem dupla confirmação ou com risco financeiro: não revisar repasse."
   });
 }
 return frozen({make,mockPayment,operational,completion,risk,viewFor,
   settlementReview,MOCK_RECEIPT,REAL_DENIAL});
});
