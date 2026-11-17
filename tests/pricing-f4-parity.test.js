"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const Product=require("../pricing-policy-10x10.js");
const F4=require("../f4-finance.js");
const C="11111111-1111-4111-8111-111111111111";
const R="33333333-3333-4333-8333-333333333333";

function compare(service,travel,psp=null) {
 const p=Product.quoteSnapshot({quoteId:"Q_STATIC",requestId:"R_STATIC",items:[
  {kind:"service",amountCents:service,materialsIncluded:true},
  {kind:"travel",code:"deslocamento",amountCents:travel}
 ]});
 const q=F4.quoteSnapshot({quoteId:C,requestId:R,items:[
  {kind:"service",code:"reparo_com_pecas",amountCents:service},
  {kind:"travel",code:"deslocamento",amountCents:travel}
 ]});
 const arg=psp==null?{}:{processingFeeCents:psp,feeVerifiedByPSP:true};
 const a=Product.costBreakdown({quote:p,...arg});
 const b=F4.costBreakdown({quote:q,...arg});
 for(const key of [
  "serviceCents","travelCents","quoteSubtotalCents",
  "riderFeeCents","providerFeeCents","providerReceivableCents",
  "customerSubtotalBeforeProcessingCents","customerTotalCents"
 ])assert.equal(a[key],b[key],key+" service="+service+" travel="+travel+" psp="+psp);
 assert.equal(a.platformGrossCommissionCents,b.commissionCents);
 assert.equal(a.platformGrossCommissionCents,a.riderFeeCents+a.providerFeeCents);
 assert.equal(a.providerReceivableCents+a.platformGrossCommissionCents,
  a.customerSubtotalBeforeProcessingCents);
 for(const k of ["paymentAllowed","chatAllowed","dispatchAllowed","payoutAllowed"])
  assert.equal(a[k],false);
 for(const k of ["paymentAllowed","chatAllowed","dispatchAllowed","payoutAllowed"])
  assert.equal(b[k],false);
}
test("Política 10+10 e F4: 96 amostras de valores, deslocamento e centavos",()=>{
 const services=[100,101,105,149,199,999,1234,23000,499990,499999];
 const travels=[0,1,3,9,40,1234,4000,9900,499000];
 let verified=0;
 for(const s of services)for(const t of travels)if(s+t<=500000){
  compare(s,t);compare(s,t,350);verified+=2;
 }
 assert.ok(verified>=100);
});
test("Orçamento F4 com vários serviços e materiais embutidos preserva soma e taxas",()=>{
 const items=[
  {kind:"service",code:"pneu_furado",amountCents:23000},
  {kind:"service",code:"troca_camara",amountCents:4000},
  {kind:"travel",code:"deslocamento",amountCents:3000}
 ];
 const q=F4.quoteSnapshot({quoteId:C,requestId:R,items});
 const x=F4.costBreakdown({quote:q});
 assert.equal(x.serviceCents,27000);
 assert.equal(x.travelCents,3000);
 assert.equal(x.quoteSubtotalCents,30000);
 assert.equal(x.riderFeeCents,2700);
 assert.equal(x.providerFeeCents,2700);
 assert.equal(x.providerReceivableCents,27300);
 assert.equal(x.customerSubtotalBeforeProcessingCents,32700);
 assert.equal(x.commissionCents,5400);
 assert.equal(x.paymentAllowed,false);
});
test("Cobrança extra de peças proibida nos dois motores",()=>{
 assert.throws(()=>F4.quoteSnapshot({quoteId:C,requestId:R,items:[
  {kind:"service",code:"pneu",amountCents:23000},
  {kind:"travel",code:"deslocamento",amountCents:4000},
  {kind:"part",code:"material",amountCents:1000}
 ]}),/Tipo de item/);
 assert.throws(()=>Product.quoteSnapshot({quoteId:"Q",requestId:"R",items:[
  {kind:"service",materialsIncluded:false,amountCents:23000},
  {kind:"travel",code:"deslocamento",amountCents:4000}
 ]}),/materiais inclusos/);
});
test("Taxa PSP desconhecida não é incorporada como valor recebido",()=>{
 const q=F4.quoteSnapshot({quoteId:C,requestId:R,items:[
  {kind:"service",code:"pneu",amountCents:23000},
  {kind:"travel",code:"deslocamento",amountCents:4000}
 ]});
 assert.equal(F4.costBreakdown({quote:q}).customerTotalCents,null);
 assert.throws(()=>F4.costBreakdown({quote:q,processingFeeCents:350}),/Tarifa/);
 assert.throws(()=>Product.costBreakdown({quote:Product.quoteSnapshot({
  quoteId:"Q",requestId:"R",items:[
   {kind:"service",materialsIncluded:true,amountCents:23000},
   {kind:"travel",code:"deslocamento",amountCents:4000}]
 }),processingFeeCents:350}),/PSP/);
});
