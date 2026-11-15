/* Salva Motoca! / F4 — MODELO FINANCEIRO OFFLINE, não confirma pagamentos.
 * Nenhuma rede, Stripe, token, cartão, Pix, repasse, saque ou transição do banco.
 * Cálculos são estimativas de negócio, sujeitos a contrato, PSP e impostos.
 */
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root&&typeof root==="object")root.SMF4Finance=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const COMMISSION_BPS=1500;
  const MAX_QUOTE_CENTS=500000; // espelha limite do simulador F2/F3.
  const MAX_PROCESSING_FEE_CENTS=500000; // limite defensivo, não tarifa prevista.
  const VALID_KINDS=Object.freeze(["service","travel","part"]);
  function requireCondition(ok,msg){if(!ok)throw new Error(msg);}
  function cents(value,name,min=0,max=MAX_QUOTE_CENTS){
    requireCondition(Number.isSafeInteger(value)&&value>=min&&value<=max,
      name+" deve ser número inteiro de centavos na faixa permitida.");
    return value;
  }
  function validId(value,name){
    requireCondition(typeof value==="string"&&/^[0-9a-f-]{36}$/i.test(value),
      name+" obrigatório.");
    return value;
  }
  function quoteSnapshot({quoteId,requestId,items,status="accepted"}){
    validId(quoteId,"ID do orçamento");
    validId(requestId,"ID da solicitação");
    requireCondition(status==="accepted","Somente orçamento aceito compõe prévia financeira.");
    requireCondition(Array.isArray(items)&&items.length>=2&&items.length<=16,
      "Orçamento incompleto.");
    let serviceCents=0,travelCents=0,partsCents=0,travelLines=0;
    const services=new Set(),normalized=[];
    for(const line of items){
      requireCondition(line&&VALID_KINDS.includes(line.kind),
        "Tipo de item do orçamento inválido.");
      requireCondition(typeof line.code==="string"&&line.code.trim().length>=2&&
        line.code.trim().length<=80,"Código do item inválido.");
      const code=line.code.trim();
      const cost=cents(line.amountCents,"Preço do item",
        line.kind==="travel"?0:1);
      if(line.kind==="service"){
        requireCondition(!services.has(code),"Serviço repetido.");
        services.add(code);
        serviceCents+=cost;
      }else if(line.kind==="travel"){
        requireCondition(code==="deslocamento","Código de deslocamento inválido.");
        travelLines++;
        travelCents+=cost;
      }else partsCents+=cost;
      normalized.push({kind:line.kind,code,amountCents:cost});
    }
    requireCondition(services.size>=1&&travelLines===1,
      "Orçamento precisa de serviço e deslocamento discriminado.");
    const quoteTotalCents=serviceCents+travelCents+partsCents;
    requireCondition(quoteTotalCents>=100&&quoteTotalCents<=MAX_QUOTE_CENTS,
      "Total da proposta fora do limite de teste.");
    return {quoteId,requestId,status,items:normalized,
      serviceCents,travelCents,partsCents,quoteTotalCents};
  }
  function costBreakdown({quote,processingFeeCents=null,feeConfirmedByProvider=false}){
    requireCondition(quote&&quote.status==="accepted"&&
      Number.isSafeInteger(quote.serviceCents)&&
      Number.isSafeInteger(quote.travelCents)&&Number.isSafeInteger(quote.partsCents),
      "Orçamento aceito do servidor obrigatório.");
    const subtotal=quote.serviceCents+quote.travelCents+quote.partsCents;
    requireCondition(subtotal===quote.quoteTotalCents,
      "Não é permitido alterar preço aceito.");
    cents(subtotal,"Subtotal",100);
    const commissionCents=Math.floor((quote.serviceCents*COMMISSION_BPS+5000)/10000);
    const providerReceivableCents=subtotal-commissionCents;
    requireCondition(providerReceivableCents>=0,"Repasse líquido negativo.");
    let customerTotalCents=null;
    if(processingFeeCents!==null){
      cents(processingFeeCents,"Tarifa de processamento",0,MAX_PROCESSING_FEE_CENTS);
      requireCondition(feeConfirmedByProvider===true,
        "Tarifa precisa ser comprovada pelo processador, não estimada pelo app.");
      customerTotalCents=subtotal+processingFeeCents;
    }
    return {
      currency:"BRL",commissionBasisCents:quote.serviceCents,
      commissionBps:COMMISSION_BPS,commissionCents,
      serviceCents:quote.serviceCents,travelCents:quote.travelCents,
      partsCents:quote.partsCents,quoteSubtotalCents:subtotal,
      processingFeeCents,customerTotalCents,
      providerReceivableCents,
      processingFeeChargedToCustomer:processingFeeCents!==null,
      processingFeeRequiresLegalReview:true,
      quoteId:quote.quoteId,requestId:quote.requestId,
      paymentAllowed:false,chatAllowed:false,dispatchAllowed:false,
      payoutAllowed:false,legalAndProviderReviewRequired:true
    };
  }
  function paymentResultFromBrowser(_input){
    // Qualquer "pago" recebido do navegador é insuficiente: nenhum evento
    // financeiro pode ser validado sem assinatura no servidor e conciliação.
    return Object.freeze({accepted:false,reason:"O navegador nunca confirma pagamento.",
      authoritative:false,paid:false,canDispatch:false,canChat:false});
  }
  function refundDecision({
    paymentVerifiedByServer,requestedBy,providerDispatched,
    disputeOpen=false,paymentAlreadyRefunded=false
  }){
    requireCondition(["customer","provider","support"].includes(requestedBy),
      "Solicitante de cancelamento inválido.");
    if(paymentAlreadyRefunded)return {
      action:"no_duplicate_refund",fullRefund:false,manualReview:false};
    if(paymentVerifiedByServer!==true)return {
      action:"cancel_without_refund",fullRefund:false,manualReview:false};
    if(disputeOpen||requestedBy==="support"||
       (requestedBy==="customer"&&providerDispatched===true))
      return {action:"hold_for_mediation",fullRefund:false,manualReview:true};
    return {
      action:"request_full_refund_from_psp",fullRefund:true,
      includeProcessingFee:true,manualReview:false,
      // Pede reembolso; não afirma que o PSP devolveu o dinheiro.
      refundCompleted:false
    };
  }
  function settlementEligibility({
    paymentVerifiedByServer,providerConfirmed,customerConfirmed,
    disputeOpen=false,refundRequested=false,refundCompleted=false,
    alreadyTransferred=false
  }){
    const ok=paymentVerifiedByServer===true&&providerConfirmed===true&&
      customerConfirmed===true&&disputeOpen!==true&&refundRequested!==true&&
      refundCompleted!==true&&alreadyTransferred!==true;
    return {
      candidateForServerSettlement:ok,
      transferAllowedInThisModule:false,
      reason:ok?"Aguardando revisão de saldo disponível e autorização do PSP.":
        "Sem pagamento verificado ou sem conclusão bilateral, ou bloqueio financeiro aberto."
    };
  }
  return Object.freeze({COMMISSION_BPS,MAX_QUOTE_CENTS,quoteSnapshot,
    costBreakdown,paymentResultFromBrowser,refundDecision,settlementEligibility});
});
