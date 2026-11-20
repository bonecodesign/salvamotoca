/* Salva Motoca! — F3: motor de DOMÍNIO local para reboque de motocicletas.
 * Não é uma autorização do servidor. Não envia GPS, chamados, fotos ou pagamentos.
 * Backend real exige Auth/RLS/RPC homologados e gate de F1+F2+F3.
 */
(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root&&typeof root==="object")root.SMF3Tow=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const EQUIPMENT=Object.freeze(["plataforma","carretinha","caminhonete_adaptada"]);
  const REBOQUE="reboque_moto";
  const BASIC=Object.freeze(["pneu_furado","troca_camara","troca_pneu","calibragem_valvula","outro"]);
  const ALL=Object.freeze([...BASIC,REBOQUE]);
  const MAX_QUOTE_CENTS=500000;
  const CUSTOMER_COMMISSION_BPS=1000; // 10% pago pelo motociclista, somente sobre o serviço.
  const PROVIDER_COMMISSION_BPS=1000; // 10% descontado do prestador, somente sobre o serviço.
  const PRESENCE_MS=90000;
  function ensure(ok,message){if(!ok)throw new Error(message)}
  function string(v){return typeof v==="string"?v.trim():""}
  function city(v){return string(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
  function integer(v,min,max,name){
    ensure(Number.isSafeInteger(v)&&v>=min&&v<=max,name+" fora da faixa permitida.");
    return v;
  }
  function servicesOf(list){
    ensure(Array.isArray(list)&&list.length>=1&&list.length<=ALL.length,
      "Selecione serviços válidos.");
    ensure(new Set(list).size===list.length&&list.every(x=>ALL.includes(x)),
      "Serviços repetidos ou não reconhecidos.");
    ensure(list.includes(REBOQUE),"Reboque deve estar entre os serviços selecionados.");
    return [...list];
  }
  function text(v,min,max,name){
    const clean=string(v);
    ensure(clean.length>=min&&clean.length<=max,name+" obrigatório ou inválido.");
    return clean;
  }
  function placeCode(v){
    ensure(/^[A-Z]{2}$/.test(string(v)),"UF precisa ter duas letras maiúsculas.");
    return v;
  }
  function coordinate(v){
    return !!v&&typeof v.lat==="number"&&Number.isFinite(v.lat)&&v.lat>=-90&&v.lat<=90
      &&typeof v.lng==="number"&&Number.isFinite(v.lng)&&v.lng>=-180&&v.lng<=180;
  }
  function distanceKm(a,b){
    if(!coordinate(a)||!coordinate(b))return Infinity;
    const r=Math.PI/180, lat1=a.lat*r,lat2=b.lat*r;
    const dlat=lat2-lat1,dlon=(b.lng-a.lng)*r;
    const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
    return 6371.0088*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  }
  function validateTowRequest(input){
    ensure(input&&typeof input==="object","Solicitação inexistente.");
    const types=servicesOf(input.serviceTypes);
    const year=integer(input.motorcycleYear,1950,2100,"Ano da motocicleta");
    const weightKg=integer(input.motorcycleWeightKg,40,650,"Peso estimado da moto");
    const pickup={city:text(input.pickupCity,2,80,"Município de origem"),
      stateCode:placeCode(input.pickupStateCode)};
    const destination={city:text(input.destinationCity,2,80,"Município de destino"),
      stateCode:placeCode(input.destinationStateCode)};
    const privateDestination=text(input.destinationAddress,5,240,"Endereço de destino");
    const estimatedKm=integer(input.estimatedRouteKm,1,500,"Distância estimada");
    // Distância é informativa, não substitui cálculo de percurso no servidor.
    ensure(coordinate(input.pickupLocation),"Localização da origem inválida.");
    const motorcycle={brand:text(input.motorcycleBrand,2,60,"Marca"),
      model:text(input.motorcycleModel,2,80,"Modelo"),year,weightKg};
    return {
      serviceTypes:types,motorcycle,pickup,destination,estimatedRouteKm:estimatedKm,
      pickupLocation:{lat:input.pickupLocation.lat,lng:input.pickupLocation.lng},
      // NÃO propagar destino exato para provedores antes de pagamento confirmado.
      private:{destinationAddress:privateDestination}
    };
  }
  function publicSummary(tow){
    ensure(tow&&tow.motorcycle&&tow.destination&&tow.pickup,
      "Pedido de reboque inválido.");
    return {
      serviceTypes:[...tow.serviceTypes],
      motorcycle:{...tow.motorcycle},
      pickup:{...tow.pickup},destination:{...tow.destination},
      estimatedRouteKm:tow.estimatedRouteKm
    };
  }
  function validateProviderCapacity(input){
    ensure(input&&typeof input==="object","Capacidade inexistente.");
    ensure(EQUIPMENT.includes(input.equipment),"Equipamento incompatível.");
    const maxMotoKg=integer(input.maxMotoKg,50,1000,"Carga máxima declarada");
    const coverageKm=integer(input.coverageKm,1,150,"Cobertura em km");
    const ties=integer(input.tieDownPoints,2,12,"Pontos de amarração");
    ensure(input.hasRamp===true&&input.hasWheelChock===true,
      "Requer rampa e suporte seguro de roda.");
    return {equipment:input.equipment,maxMotoKg,coverageKm,tieDownPoints:ties,
      hasRamp:true,hasWheelChock:true,verifiedByAdmin:input.verifiedByAdmin===true};
  }
  function eligibleProvider(provider,tow,now){
    if(!provider||!provider.id||!provider.approved||!provider.active
      ||!provider.towServiceActive||!provider.onlineRequested)
      return {ok:false,reason:"Prestador não homologado, ativo ou disponível"};
    const last=typeof provider.lastSeenAt==="number"?provider.lastSeenAt:Date.parse(provider.lastSeenAt);
    if(!Number.isFinite(last)||last>now||now-last>PRESENCE_MS)
      return {ok:false,reason:"Presença expirada"};
    if(city(provider.city)!==city(tow.pickup.city)
      ||provider.stateCode!==tow.pickup.stateCode)
      return {ok:false,reason:"Fora da praça inicial"};
    let capacity;
    try{capacity=validateProviderCapacity(provider.capacity)}
    catch(e){return {ok:false,reason:"Equipamento sem capacidade válida"}}
    if(!capacity.verifiedByAdmin)return {ok:false,reason:"Equipamento não homologado"};
    if(capacity.maxMotoKg<tow.motorcycle.weightKg)
      return {ok:false,reason:"Peso da moto excede limite homologado"};
    const other=tow.serviceTypes.filter(s=>s!==REBOQUE);
    if(other.length&&!other.every(s=>
      Array.isArray(provider.otherServiceTypes)&&provider.otherServiceTypes.includes(s)))
      return {ok:false,reason:"Não atende serviços adicionais"};
    const km=distanceKm(provider.location,tow.pickupLocation);
    if(!Number.isFinite(km)||km>capacity.coverageKm)
      return {ok:false,reason:"Fora da cobertura declarada"};
    if(provider.justDeclined===true||Number(provider.refusals||0)>=2)
      return {ok:false,reason:"Recusa recente ou limite da rodada"};
    return {ok:true,distanceKm:km};
  }
  function findTowProviders({providers,request,radiiKm,now}){
    ensure(Array.isArray(providers)&&providers.length<=1000,"Prestadores inválidos.");
    ensure(request&&request.motorcycle,"Solicitação não validada.");
    ensure(Number.isFinite(now),"Horário inválido.");
    ensure(Array.isArray(radiiKm)&&radiiKm.length>=1&&radiiKm.length<=10&&
      radiiKm.every((r,i)=>Number.isFinite(r)&&r>0&&r<=150&&
        (!i||r>radiiKm[i-1])),"Raios progressivos inválidos.");
    const eligible=[],excluded=[];
    for(const p of providers){
      const e=eligibleProvider(p,request,now);
      if(e.ok)eligible.push({id:p.id,label:p.label||"Prestador",distanceKm:e.distanceKm});
      else excluded.push({id:p?.id||null,reason:e.reason});
    }
    const first=radiiKm.findIndex(r=>eligible.some(p=>p.distanceKm<=r));
    if(first<0)return {stage:null,status:"no_provider",candidates:[],excluded};
    const radius=radiiKm[first];
    const candidates=eligible.filter(p=>p.distanceKm<=radius)
      .sort((a,b)=>a.distanceKm-b.distanceKm||a.id.localeCompare(b.id))
      .map(x=>({id:x.id,label:x.label,distanceKm:Math.round(x.distanceKm*100)/100}));
    return {stage:first+1,radiusKm:radius,status:"candidates",candidates,excluded};
  }
  function quoteTow({serviceTypes,serviceCents,travelCents,parts=[]}){
    const types=servicesOf(serviceTypes);
    ensure(serviceCents&&typeof serviceCents==="object"&&!Array.isArray(serviceCents),
      "Valores dos serviços ausentes.");
    ensure(Object.keys(serviceCents).length===types.length&&types.every(s=>
      Object.prototype.hasOwnProperty.call(serviceCents,s)),
      "Preço deve discriminar cada serviço selecionado, sem extras.");
    ensure(Array.isArray(parts)&&parts.length===0,"Materiais já estão inclusos no serviço; não informar itens separados.");
    const rows=types.map(code=>({kind:"service",code,
      amountCents:integer(serviceCents[code],1,MAX_QUOTE_CENTS,"Serviço")}));
    rows.push({kind:"travel",code:"deslocamento",
      amountCents:integer(travelCents,0,MAX_QUOTE_CENTS,"Deslocamento")});
    const totalCents=rows.reduce((s,r)=>s+r.amountCents,0);
    ensure(totalCents>=100&&totalCents<=MAX_QUOTE_CENTS,
      "Total de teste acima do limite seguro.");
    const serviceTotalCents=rows.filter(r=>r.kind==="service")
      .reduce((s,r)=>s+r.amountCents,0);
    const commissionCents=Math.floor((serviceTotalCents*COMMISSION_BPS+5000)/10000);
    return {rows,totalCents,serviceTotalCents,commissionCents,
      travelTotalCents:travelCents,paymentAllowed:false,
      chatAllowed:false,dispatchAllowed:false};
  }
  return Object.freeze({
    EQUIPMENT,REBOQUE,BASIC,ALL,PRESENCE_MS,CUSTOMER_COMMISSION_BPS,PROVIDER_COMMISSION_BPS,
    validateTowRequest,publicSummary,validateProviderCapacity,eligibleProvider,
    findTowProviders,quoteTow,distanceKm,servicesOf
  });
});
