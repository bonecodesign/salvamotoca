/*
 * Salva Motoca! — contrato financeiro OFFLINE, SM-DEC-045/046.
 * NOVO modelo aprovado: 10% solicitante + 10% prestador, APENAS sobre servico.
 * Orcamento: servico (materiais inclusos) + deslocamento (separado).
 * Nenhum PSP, rede, login, cobranca, cadastro, repasse ou prova financeira.
 */
(function(root, factory) {
  "use strict";
  const api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root && typeof root === "object") root.SMFinancialSplit10x10 = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";
  const RIDER_BPS = 1000, PROVIDER_BPS = 1000, MAX_ITEM_CENTS = 500000;
  const assert = (ok, msg) => { if(!ok) throw new Error(msg); };
  const integer = (value, name, min = 0) => {
    assert(Number.isSafeInteger(value) && value >= min && value <= MAX_ITEM_CENTS,
      name + " deve ser inteiro de centavos válido.");
    return value;
  };
  function quoteSnapshot({quoteId, requestId, status = "accepted", items}) {
    assert(typeof quoteId === "string" && quoteId.length > 0 &&
      typeof requestId === "string" && requestId.length > 0, "IDs de pedido/orçamento obrigatórios.");
    assert(status === "accepted", "Orçamento deve estar aceito.");
    assert(Array.isArray(items) && items.length === 2,
      "Orçamento deve ter exatamente duas categorias: serviço e deslocamento.");
    const svc = items.filter(item => item?.kind === "service");
    const mov = items.filter(item => item?.kind === "travel");
    assert(svc.length === 1 && mov.length === 1,
      "Peças/materiais incluídos no serviço; linhas separadas são proibidas.");
    const serviceCents = integer(svc[0].amountCents, "Serviço com materiais", 1);
    const travelCents = integer(mov[0].amountCents, "Deslocamento");
    assert(svc[0].materialsIncluded === true,
      "Preço do serviço deve declarar materiais inclusos.");
    assert(mov[0].code === "deslocamento", "Categoria deslocamento obrigatória.");
    assert(serviceCents + travelCents <= MAX_ITEM_CENTS,
      "Total de orçamento acima do limite de simulação.");
    return Object.freeze({
      quoteId,requestId,status,serviceCents,travelCents,
      materialsIncludedInService:true,quoteSubtotalCents:serviceCents + travelCents
    });
  }
  const roundBps = (value, bps) => Math.floor((value * bps + 5000) / 10000);
  function costBreakdown({quote, processingFeeCents = null, feeVerifiedByPSP = false}) {
    assert(quote?.materialsIncludedInService === true &&
      quote.status === "accepted", "Orçamento confiável com materiais inclusos obrigatório.");
    const serviceCents=integer(quote.serviceCents,"Serviço com materiais",1);
    const travelCents=integer(quote.travelCents,"Deslocamento");
    const quoteSubtotalCents = serviceCents + travelCents;
    assert(quoteSubtotalCents === quote.quoteSubtotalCents &&
      quoteSubtotalCents <= MAX_ITEM_CENTS, "Orçamento original não pode ser adulterado.");
    const riderFeeCents=roundBps(serviceCents,RIDER_BPS);
    const providerFeeCents=roundBps(serviceCents,PROVIDER_BPS);
    const providerReceivableCents=quoteSubtotalCents-providerFeeCents;
    const platformGrossCommissionCents=riderFeeCents+providerFeeCents;
    let customerTotalCents=null;
    if(processingFeeCents!==null) {
      integer(processingFeeCents,"Tarifa do processador");
      assert(feeVerifiedByPSP===true,
        "Não inventar tarifa; valor deve ser validado pelo PSP e juridicamente.");
      customerTotalCents=quoteSubtotalCents+riderFeeCents+processingFeeCents;
    }
    return Object.freeze({
      currency:"BRL", quoteId:quote.quoteId,requestId:quote.requestId,
      serviceCents,travelCents,materialsIncludedInService:true,
      quoteSubtotalCents,commissionBasisCents:serviceCents,
      riderCommissionBps:RIDER_BPS,providerCommissionBps:PROVIDER_BPS,
      riderFeeCents,providerFeeCents,platformGrossCommissionCents,
      processingFeeCents, customerTotalCents,providerReceivableCents,
      customerSubtotalBeforeProcessingCents:quoteSubtotalCents+riderFeeCents,
      paymentAllowed:false,chatAllowed:false,dispatchAllowed:false,payoutAllowed:false,
      requiresPSPAndLegalValidation:true
    });
  }
  return Object.freeze({RIDER_BPS,PROVIDER_BPS,quoteSnapshot,costBreakdown});
});
