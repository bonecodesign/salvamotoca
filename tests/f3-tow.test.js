"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const F=require("../f3-tow.js");
const T=Date.parse("2026-11-14T21:00:00Z");
const base=()=>({
 serviceTypes:["reboque_moto"],motorcycleBrand:"Honda",motorcycleModel:"CG 160",
 motorcycleYear:2024,motorcycleWeightKg:140,pickupCity:"Belo Horizonte",
 pickupStateCode:"MG",destinationCity:"Contagem",destinationStateCode:"MG",
 destinationAddress:"Rua Fictícia, 123 - área de teste",estimatedRouteKm:20,
 pickupLocation:{lat:-19.924,lng:-43.938}
});
const request=()=>F.validateTowRequest(base());
const capacity=()=>({equipment:"plataforma",maxMotoKg:250,coverageKm:25,
 tieDownPoints:4,hasRamp:true,hasWheelChock:true,verifiedByAdmin:true});
const provider=(id="a",over={})=>({
 id,label:"Reboque fictício",approved:true,active:true,towServiceActive:true,
 onlineRequested:true,lastSeenAt:T-12000,city:"Belo Horizonte",stateCode:"MG",
 location:{lat:-19.925,lng:-43.940},capacity:capacity(),refusals:0,...over
});
const find=(ps,r=request(),radii=[1,3,10])=>F.findTowProviders({providers:ps,request:r,
 radiiKm:radii,now:T});
test("F3: reboque obrigatório e serviço extra permitido no mesmo pedido",()=>{
 assert.deepEqual(request().serviceTypes,["reboque_moto"]);
 assert.deepEqual(F.servicesOf(["reboque_moto","troca_pneu"]),
  ["reboque_moto","troca_pneu"]);
 assert.throws(()=>F.servicesOf(["troca_pneu"]),/Reboque/);
});
test("F3: proíbe serviço repetido ou código não homologado",()=>{
 assert.throws(()=>F.servicesOf(["reboque_moto","reboque_moto"]),/repetidos/);
 assert.throws(()=>F.servicesOf(["reboque_moto","moto_taxi"]),/não reconhecidos/);
});
test("F3: valida dados de moto, peso e destino obrigatório",()=>{
 const r=request();
 assert.equal(r.motorcycle.weightKg,140);
 assert.equal(r.destination.city,"Contagem");
 assert.equal(r.estimatedRouteKm,20);
 const invalid=base();invalid.motorcycleWeightKg=-1;
 assert.throws(()=>F.validateTowRequest(invalid),/Peso/);
 invalid.motorcycleWeightKg=140;invalid.destinationAddress="";
 assert.throws(()=>F.validateTowRequest(invalid),/Endereço/);
});
test("F3: rejeita UF inválida, rota e latitude adulterada",()=>{
 for(const field of ["pickupStateCode","destinationStateCode"]){
  const x=base();x[field]="mg";assert.throws(()=>F.validateTowRequest(x),/UF/);
 }
 const y=base();y.estimatedRouteKm=0;
 assert.throws(()=>F.validateTowRequest(y),/Distância/);
 const z=base();z.pickupLocation={lat:999,lng:0};
 assert.throws(()=>F.validateTowRequest(z),/Localização/);
});
test("F3: resumo pré-pagamento omite endereço privado e GPS exato",()=>{
 const payload=request(),summary=F.publicSummary(payload);
 assert.equal(summary.motorcycle.model,"CG 160");
 assert.equal(summary.pickup.city,"Belo Horizonte");
 assert.equal(summary.destination.city,"Contagem");
 assert.equal(summary.private,undefined);
 assert.equal(summary.destinationAddress,undefined);
 assert.equal(summary.pickupLocation,undefined);
 assert.ok(!JSON.stringify(summary).includes("Rua Fictícia"));
});
test("F3: três tipos de equipamento suportados e segurança mínima",()=>{
 for(const equipment of F.EQUIPMENT)assert.equal(F.validateProviderCapacity({
  ...capacity(),equipment}).equipment,equipment);
 assert.throws(()=>F.validateProviderCapacity({...capacity(),equipment:"moto"}),/Equipamento/);
 assert.throws(()=>F.validateProviderCapacity({...capacity(),hasRamp:false}),/rampa/);
 assert.throws(()=>F.validateProviderCapacity({...capacity(),tieDownPoints:1}),/amarração/);
 assert.throws(()=>F.validateProviderCapacity({...capacity(),maxMotoKg:10}),/Carga/);
});
test("F3: apenas prestador homologado, disponível e com capacidade verificada",()=>{
 assert.equal(find([provider()]).candidates.length,1);
 for(const patch of [
  {approved:false},{active:false},{towServiceActive:false},{onlineRequested:false},
  {capacity:{...capacity(),verifiedByAdmin:false}},
  {capacity:{...capacity(),hasWheelChock:false}}
 ])assert.equal(find([provider("x",patch)]).status,"no_provider");
});
test("F3: não aceita peso acima da carga declarada",()=>{
 const p=provider("x",{capacity:{...capacity(),maxMotoKg:130}});
 assert.equal(find([p]).status,"no_provider");
 assert.match(find([p]).excluded[0].reason,/Peso/);
});
test("F3: serviço misto exige capacidade para todos os itens",()=>{
 const src=base();src.serviceTypes=["reboque_moto","troca_camara"];
 const req=F.validateTowRequest(src);
 assert.equal(find([provider()],req).status,"no_provider");
 assert.equal(find([provider("x",{otherServiceTypes:["troca_camara"]})],req).candidates.length,1);
});
test("F3: heartbeat expira em 90 segundos e não aceita relógio futuro",()=>{
 assert.equal(find([provider("a",{lastSeenAt:T-90000})]).candidates.length,1);
 assert.equal(find([provider("a",{lastSeenAt:T-90001})]).status,"no_provider");
 assert.equal(find([provider("a",{lastSeenAt:T+1})]).status,"no_provider");
});
test("F3: cobertura por proximidade e município de origem",()=>{
 assert.equal(find([provider("a",{city:"Contagem"})]).status,"no_provider");
 assert.equal(find([provider("a",{location:{lat:-20.3,lng:-43.95}})]).status,"no_provider");
 assert.equal(find([provider("a",{capacity:{...capacity(),coverageKm:1}})]).candidates.length,1);
});
test("F3: busca em anéis amplia somente quando necessário",()=>{
 const p=provider("a",{location:{lat:-19.94,lng:-43.938}});
 const result=find([p],request(),[1,2,10]);
 assert.equal(result.stage,2);
 assert.equal(result.radiusKm,2);
});
test("F3: candidatos ordenados por distância sem expor GPS",()=>{
 const near=provider("near"),far=provider("far",{location:{lat:-19.94,lng:-43.938}});
 const x=find([far,near],request(),[3]);
 assert.deepEqual(x.candidates.map(v=>v.id),["near","far"]);
 assert.equal(x.candidates[0].location,undefined);
});
test("F3: recusa recente e duas recusas excluem prestador",()=>{
 assert.equal(find([provider("a",{justDeclined:true})]).status,"no_provider");
 assert.equal(find([provider("a",{refusals:2})]).status,"no_provider");
 assert.equal(find([provider("a",{refusals:1})]).candidates.length,1);
});
test("F3: orçamento exige serviço e deslocamento explícitos",()=>{
 const quote=F.quoteTow({serviceTypes:["reboque_moto"],
  serviceCents:{reboque_moto:23000},travelCents:4000});
 assert.equal(quote.totalCents,27000);
 assert.equal(quote.serviceTotalCents,23000);
 assert.equal(quote.customerCommissionCents,2300);
 assert.equal(quote.providerCommissionCents,2300);
 assert.equal(quote.customerPayableCents,29300);
 assert.equal(quote.providerReceivableCents,24700);
 assert.equal(quote.travelTotalCents,4000);
 assert.equal(quote.paymentAllowed,false);
 assert.equal(quote.chatAllowed,false);
 assert.equal(quote.dispatchAllowed,false);
});
test("F3: serviço misto aplica 10% + 10% somente sobre serviços",()=>{
 const q=F.quoteTow({serviceTypes:["reboque_moto","troca_camara"],
  serviceCents:{reboque_moto:20000,troca_camara:3500},
  travelCents:3000});
 assert.equal(q.customerCommissionCents,2350);
 assert.equal(q.providerCommissionCents,2350);
 assert.equal(q.customerPayableCents,28850);
 assert.equal(q.providerReceivableCents,24150);
 assert.equal(q.totalCents,26500);
});
test("F3: não admite valores negativos, extras ou deslocamento ausente",()=>{
 const src={serviceTypes:["reboque_moto"],serviceCents:{reboque_moto:10000},travelCents:0};
 assert.equal(F.quoteTow(src).totalCents,10000);
 assert.throws(()=>F.quoteTow({...src,travelCents:undefined}),/Deslocamento/);
 assert.throws(()=>F.quoteTow({...src,serviceCents:{...src.serviceCents,outro:1000}}),/sem extras/);
 assert.throws(()=>F.quoteTow({...src,serviceCents:{reboque_moto:-1}}),/Serviço/);
 assert.throws(()=>F.quoteTow({...src,parts:[{name:"extra",amountCents:100}]}),/Materiais já estão inclusos/);
});
test("F3: rejeita orçamento acima de R$ 5 mil",()=>{
 assert.throws(()=>F.quoteTow({serviceTypes:["reboque_moto"],
  serviceCents:{reboque_moto:490000},travelCents:20000}),/limite/);
});
test("F3: nome de equipamento não equivale a aprovação administrativa",()=>{
 const v=F.validateProviderCapacity({...capacity(),verifiedByAdmin:false});
 assert.equal(v.verifiedByAdmin,false);
 assert.equal(find([provider("a",{capacity:v})]).candidates.length,0);
});
test("F3: jamais calcula distância de endereço exato confidencial",()=>{
 const req=request();
 const p=provider("a");
 const d=F.distanceKm(req.pickupLocation,p.location);
 assert.ok(d<1);
 assert.equal(F.distanceKm({lat:999,lng:0},p.location),Infinity);
});
