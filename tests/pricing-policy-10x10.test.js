"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const P=require("../pricing-policy-10x10.js");
const Q=()=>P.quoteSnapshot({
 quoteId:"Q_TEST",requestId:"R_TEST",
 items:[
  {kind:"service",amountCents:23000,materialsIncluded:true},
  {kind:"travel",code:"deslocamento",amountCents:4000}
 ]
});
test("10% + 10% sobre serviço com materiais inclusos; deslocamento sem comissão",()=>{
 const p=P.costBreakdown({quote:Q()});
 assert.equal(p.serviceCents,23000);
 assert.equal(p.travelCents,4000);
 assert.equal(p.quoteSubtotalCents,27000);
 assert.equal(p.riderFeeCents,2300);
 assert.equal(p.providerFeeCents,2300);
 assert.equal(p.platformGrossCommissionCents,4600);
 assert.equal(p.customerSubtotalBeforeProcessingCents,29300);
 assert.equal(p.providerReceivableCents,24700);
 assert.equal(p.customerTotalCents,null);
 assert.equal(p.paymentAllowed,false);
 assert.equal(p.payoutAllowed,false);
});
test("PSP simulado só como linha adicional validada; não se inventa tarifa",()=>{
 assert.throws(()=>P.costBreakdown({quote:Q(),processingFeeCents:350}),/PSP/);
 const p=P.costBreakdown({quote:Q(),processingFeeCents:350,feeVerifiedByPSP:true});
 assert.equal(p.customerTotalCents,29650);
 assert.equal(p.providerReceivableCents,24700);
 assert.equal(p.platformGrossCommissionCents,4600);
});
test("materiais/peças separados são proibidos e já incluem serviço",()=>{
 assert.throws(()=>P.quoteSnapshot({
  quoteId:"A",requestId:"B",items:[
   {kind:"service",amountCents:23000,materialsIncluded:true},
   {kind:"travel",code:"deslocamento",amountCents:4000},
   {kind:"part",amountCents:1000}
  ]
 }),/duas categorias/);
 assert.throws(()=>P.quoteSnapshot({
  quoteId:"A",requestId:"B",items:[
   {kind:"service",amountCents:23000,materialsIncluded:false},
   {kind:"travel",code:"deslocamento",amountCents:4000}
  ]
 }),/materiais inclusos/);
});
test("deslocamento obrigatório até quando R$ 0,00",()=>{
 const q=P.quoteSnapshot({
  quoteId:"A",requestId:"B",items:[
   {kind:"service",amountCents:10000,materialsIncluded:true},
   {kind:"travel",code:"deslocamento",amountCents:0}
  ]
 });
 const p=P.costBreakdown({quote:q});
 assert.equal(p.riderFeeCents,1000);
 assert.equal(p.providerFeeCents,1000);
 assert.equal(p.providerReceivableCents,9000);
 assert.equal(p.customerSubtotalBeforeProcessingCents,11000);
});
test("tentativa de cobrar 10% sobre deslocamento rejeitada pelo cálculo",()=>{
 const q=P.quoteSnapshot({
  quoteId:"A",requestId:"B",items:[
   {kind:"service",amountCents:1000,materialsIncluded:true},
   {kind:"travel",code:"deslocamento",amountCents:9000}
  ]
 });
 const p=P.costBreakdown({quote:q});
 assert.equal(p.riderFeeCents,100);
 assert.equal(p.providerFeeCents,100);
 assert.equal(p.platformGrossCommissionCents,200);
});
test("arredondamento de 10% independente por lado",()=>{
 const q=P.quoteSnapshot({
  quoteId:"A",requestId:"B",items:[
   {kind:"service",amountCents:105,materialsIncluded:true},
   {kind:"travel",code:"deslocamento",amountCents:0}
  ]
 });
 const p=P.costBreakdown({quote:q});
 assert.equal(p.riderFeeCents,11);
 assert.equal(p.providerFeeCents,11);
 assert.equal(p.platformGrossCommissionCents,22);
 assert.equal(p.providerReceivableCents,94);
});
test("impede preço adulterado, tarifa negativa e orçamento sem aceite",()=>{
 const q={...Q(),quoteSubtotalCents:1};
 assert.throws(()=>P.costBreakdown({quote:q}),/adulterado/);
 assert.throws(()=>P.costBreakdown({quote:Q(),processingFeeCents:-1,feeVerifiedByPSP:true}),/Tarifa/);
 assert.throws(()=>P.quoteSnapshot({
  quoteId:"A",requestId:"B",status:"proposed",
  items:[{kind:"service",amountCents:1000,materialsIncluded:true},
    {kind:"travel",code:"deslocamento",amountCents:100}]
 }),/aceito/);
});
test("invalida tipos duplicados e serviço não declarado inclusivo",()=>{
 for(const items of [
  [{kind:"service",amountCents:200,materialsIncluded:true},
   {kind:"service",amountCents:200,materialsIncluded:true}],
  [{kind:"service",amountCents:200,materialsIncluded:true},
   {kind:"travel",code:"tarifa",amountCents:100}],
  [{kind:"service",amountCents:0,materialsIncluded:true},
   {kind:"travel",code:"deslocamento",amountCents:100}]
 ])assert.throws(()=>P.quoteSnapshot({quoteId:"A",requestId:"B",items}));
});
