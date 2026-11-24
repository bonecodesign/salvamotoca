"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const F=require("../f4-finance.js");
const QUOTE="11111111-1111-4111-8111-111111111111";
const REQUEST="22222222-2222-4222-8222-222222222222";
function quote(lines=[
 {kind:"service",code:"reboque_moto",amountCents:23000},
 {kind:"travel",code:"deslocamento",amountCents:4000}
]){return F.quoteSnapshot({quoteId:QUOTE,requestId:REQUEST,items:lines})}
test("F4: comissão 10% cada lado incide só sobre serviço com materiais inclusos",()=>{
 const x=F.costBreakdown({quote:quote()});
 assert.equal(x.serviceCents,23000);
 assert.equal(x.travelCents,4000);
 assert.equal(x.partsCents,0);
 assert.equal(x.materialsIncludedInService,true);
 assert.equal(x.riderFeeCents,2300);
 assert.equal(x.providerFeeCents,2300);
 assert.equal(x.customerSubtotalBeforeProcessingCents,29300);
 assert.equal(x.quoteSubtotalCents,27000);
 assert.equal(x.commissionCents,4600);
 assert.equal(x.providerReceivableCents,24700);
 assert.equal(x.customerTotalCents,null);
 assert.equal(x.paymentAllowed,false);
});
test("F4: tarifa do cliente exige comprovação do PSP; não fixar tarifa fictícia",()=>{
 const q=quote();
 assert.throws(()=>F.costBreakdown({quote:q,processingFeeCents:350}),/processador/);
 const x=F.costBreakdown({quote:q,processingFeeCents:350,feeVerifiedByPSP:true});
 assert.equal(x.customerTotalCents,29650);
 assert.equal(x.processingFeeCents,350);
 assert.equal(x.commissionCents,4600);
 assert.equal(x.providerReceivableCents,24700);
});
test("F4: tarifa zero autorizada pelo PSP permanece discriminada",()=>{
 const x=F.costBreakdown({quote:quote(),processingFeeCents:0,feeVerifiedByPSP:true});
 assert.equal(x.customerTotalCents,29300);
 assert.equal(x.processingFeeChargedToCustomer,true);
});
test("F4: não recebe dinheiro, não cria checkout e não libera chat/despacho",()=>{
 const x=F.costBreakdown({quote:quote()});
 assert.deepEqual([x.paymentAllowed,x.chatAllowed,x.dispatchAllowed,x.payoutAllowed],
 [false,false,false,false]);
});
test("F4: orçamento não aceito é recusado antes de qualquer cálculo",()=>{
 assert.throws(()=>F.quoteSnapshot({quoteId:QUOTE,requestId:REQUEST,
  items:[{kind:"service",code:"reboque_moto",amountCents:500},
   {kind:"travel",code:"deslocamento",amountCents:0}],status:"proposed"}),/aceito/);
});
test("F4: valor do cliente não pode ser adulterado sem alterar o quote original",()=>{
 const q=quote();q.quoteTotalCents=1;
 assert.throws(()=>F.costBreakdown({quote:q}),/alterar preço/);
});
test("F4: valores negativos, decimais, repetidos e deslocamento ausente falham",()=>{
 assert.throws(()=>quote([{kind:"service",code:"reboque_moto",amountCents:-1},
 {kind:"travel",code:"deslocamento",amountCents:100}]),/centavos/);
 assert.throws(()=>quote([{kind:"service",code:"reboque_moto",amountCents:100.5},
 {kind:"travel",code:"deslocamento",amountCents:100}]),/centavos/);
 assert.throws(()=>quote([{kind:"service",code:"reboque_moto",amountCents:100},
 {kind:"service",code:"reboque_moto",amountCents:300},
 {kind:"travel",code:"deslocamento",amountCents:100}]),/repetido/);
 assert.throws(()=>quote([{kind:"service",code:"reboque_moto",amountCents:100},
 {kind:"part",code:"material",amountCents:100}]),/Tipo de item/);
});
test("F4: comissão de centavos arredondada deterministicamente",()=>{
 const q=quote([{kind:"service",code:"pneu_furado",amountCents:101},
 {kind:"travel",code:"deslocamento",amountCents:0}]);
 const x=F.costBreakdown({quote:q});
 assert.equal(x.commissionCents,20);
 assert.equal(x.riderFeeCents,10);
 assert.equal(x.providerFeeCents,10);
 assert.equal(x.providerReceivableCents,91);
});
test("F4: recusa taxa negativa, excessiva ou não inteira",()=>{
 const q=quote();
 for(const val of [-1,1.5,600000])
  assert.throws(()=>F.costBreakdown({quote:q,
    processingFeeCents:val,feeVerifiedByPSP:true}),/Tarifa/);
});
test("F4: pagamento nunca é confirmado por evento fabricado no navegador",()=>{
 for(const input of [
  {status:"paid",verified:true},{event:"checkout.session.completed",signature:"fake"},
  {source:"redirect",amount:28000}
 ]){
  const x=F.paymentResultFromBrowser(input);
  assert.equal(x.paid,false);
  assert.equal(x.authoritative,false);
  assert.equal(x.canDispatch,false);
 }
});
test("F4: cancelamento pelo prestador após pagamento pede estorno integral",()=>{
 const x=F.refundDecision({paymentVerifiedByServer:true,requestedBy:"provider",providerDispatched:true});
 assert.equal(x.action,"request_full_refund_from_psp");
 assert.equal(x.includeProcessingFee,true);
 assert.equal(x.refundCompleted,false);
});
test("F4: cliente cancela antes do deslocamento e pede estorno integral",()=>{
 const x=F.refundDecision({paymentVerifiedByServer:true,requestedBy:"customer",providerDispatched:false});
 assert.equal(x.fullRefund,true);
 assert.equal(x.includeProcessingFee,true);
});
test("F4: cancelamento após deslocamento ou disputa não libera estorno automático",()=>{
 for(const data of [
  {requestedBy:"customer",providerDispatched:true},
  {requestedBy:"provider",providerDispatched:false,disputeOpen:true},
  {requestedBy:"support",providerDispatched:false}
 ]){
  const x=F.refundDecision({paymentVerifiedByServer:true,...data});
  assert.equal(x.action,"hold_for_mediation");
  assert.equal(x.manualReview,true);
  assert.equal(x.fullRefund,false);
 }
});
test("F4: pedido sem pagamento não chama restituição de PSP",()=>{
 const x=F.refundDecision({paymentVerifiedByServer:false,requestedBy:"customer",
  providerDispatched:false});
 assert.equal(x.action,"cancel_without_refund");
});
test("F4: estorno repetido não é solicitado",()=>{
 const x=F.refundDecision({paymentVerifiedByServer:true,
  requestedBy:"provider",paymentAlreadyRefunded:true});
 assert.equal(x.action,"no_duplicate_refund");
});
test("F4: repasse só pode ser candidato com pagamento verificado e duas confirmações",()=>{
 let x=F.settlementEligibility({paymentVerifiedByServer:true,
  providerConfirmed:true,customerConfirmed:true});
 assert.equal(x.candidateForServerSettlement,true);
 assert.equal(x.transferAllowedInThisModule,false);
 x=F.settlementEligibility({paymentVerifiedByServer:true,
  providerConfirmed:true,customerConfirmed:false});
 assert.equal(x.candidateForServerSettlement,false);
});
test("F4: disputa, pedido de reembolso e transferência anterior bloqueiam repasse",()=>{
 for(const additional of [
  {disputeOpen:true},{refundRequested:true},{refundCompleted:true},
  {alreadyTransferred:true}
 ]){
 const x=F.settlementEligibility({paymentVerifiedByServer:true,
 providerConfirmed:true,customerConfirmed:true,...additional});
 assert.equal(x.candidateForServerSettlement,false);
 }
});
test("F4: orçamento de borracharia e reboque seguem a mesma comissão",()=>{
 const b=F.costBreakdown({quote:quote([
  {kind:"service",code:"pneu_furado",amountCents:15000},
  {kind:"travel",code:"deslocamento",amountCents:3000}
 ])});
 assert.equal(b.commissionCents,3000);
 const r=F.costBreakdown({quote:quote([
  {kind:"service",code:"reboque_moto",amountCents:15000},
  {kind:"travel",code:"deslocamento",amountCents:3000}
 ])});
 assert.equal(r.commissionCents,b.commissionCents);
});

test("F4: materiais separados nunca compõem orçamento aceito",()=>{
 assert.throws(()=>quote([
  {kind:"service",code:"pneu_furado",amountCents:23000},
  {kind:"travel",code:"deslocamento",amountCents:4000},
  {kind:"part",code:"câmara",amountCents:1000}
 ]),/Tipo de item/);
});

test("SM-DEC-045/046: F2 and F3 quote handoff to F4 uses same service-only commission",()=>{
 const F2=require("../f2-flow.js"),F3=require("../f3-tow.js");
 const tire=F2.quoteBreakdown({serviceTypes:["pneu_furado","troca_camara"],
  services:[{code:"pneu_furado",amountCents:8000},{code:"troca_camara",amountCents:15000}],travelCents:4000});
 const tow=F3.quoteTow({serviceTypes:["reboque_moto"],serviceCents:{reboque_moto:23000},travelCents:4000});
 for(const proposal of [tire,tow]){
  const items=proposal.rows.map(row=>({kind:row.kind||row.type,code:row.code,amountCents:row.amountCents}));
  assert.equal(items.some(row=>row.kind==="part"),false);
  const result=F.costBreakdown({quote:quote(items)});
  assert.equal(result.quoteSubtotalCents,27000);
  assert.equal(result.customerSubtotalBeforeProcessingCents,29300);
  assert.equal(result.providerReceivableCents,24700);
  assert.equal(result.commissionCents,4600);
  assert.equal(result.paymentAllowed,false);
 }
});
