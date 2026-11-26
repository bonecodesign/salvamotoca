"use strict";
(() => {
 if(location.hostname!=="127.0.0.1")return;
 const role=location.pathname.split("/")[1];
 if(!["customer","provider","outsider"].includes(role))return;
 const $=id=>document.getElementById(id);
 const labels={customer:"Solicitante fictício",provider:"Prestador fictício",outsider:"Terceiro fictício"};
 $("identity").textContent=labels[role];
 $("provider").hidden=role!=="provider";$("customer").hidden=role!=="customer";
 $("participant").hidden=role==="outsider";
 let busy=false,pending=null,current=null,recoverId=null,uncertain=false;
 const scope=document.body.dataset.receiptScope;
 const storageKey=/^[0-9a-f]{32}$/.test(scope||"")?"sm_fixture_receipt:"+scope+":"+role:null;
 if(storageKey){try{const id=sessionStorage.getItem(storageKey);if(/^[0-9a-f-]{36}$/i.test(id||""))recoverId=id;}catch{}}
 function remember(id){recoverId=id;if(storageKey){try{sessionStorage.setItem(storageKey,id);}catch{}}}
 function clearReceipt(){recoverId=null;uncertain=false;if(storageKey){try{sessionStorage.removeItem(storageKey);}catch{}}}
 const endpoint="/"+role+"/";
 const actions=[...document.querySelectorAll("[data-action]")];
 function render(){
  // In-memory pending state also covers unavailable browser storage.
  document.body.dataset.operationPending=String(!!pending||!!recoverId);
  const s=current;
  $("stage").textContent=s?(s.sessionStatus||"Sem acesso"):"Situação indisponível";
  $("completion").textContent=s?.completionStatus||"";
  $("gps").textContent=s?.gpsVisible?"Localização fictícia visível":"Localização indisponível";
  $("messages").textContent=s?"Mensagens visíveis: "+s.messageCount:"Mensagens indisponíveis";
  $("received-summary").textContent=s?.summary||"Resumo indisponível";
  const allowed={
   dispatch:s?.sessionStatus==="ready_for_dispatch",location:s?.sessionStatus==="en_route",
   arrive:s?.sessionStatus==="en_route",start:s?.sessionStatus==="arrived",handoff:s?.sessionStatus==="in_service",
   message:["ready_for_dispatch","en_route","arrived","in_service"].includes(s?.sessionStatus),
   summary:s?.completionStatus==="awaiting_summary",
   provider_confirm:s?.completionStatus==="awaiting_both"&&!s.providerConfirmed,
   customer_confirm:s?.completionStatus==="awaiting_both"&&!s.customerConfirmed,
   rating:s?.completionStatus==="completed"&&!s.rated,
   dispute:["awaiting_both","completed"].includes(s?.completionStatus),
   support_message:s?.completionStatus==="support_review"
  };
  actions.forEach(b=>b.disabled=busy||!!pending||!!recoverId||!s||!allowed[b.dataset.action]);
  $("refresh").disabled=busy;
  $("retry").hidden=!pending;$("retry").disabled=busy||!pending;
  $("connection").textContent=pending?"Envio sem confirmação. Repita o mesmo evento; não inicie outro.":recoverId?"Envio anterior sem confirmação. Atualize para consultar o registro; não repita a operação.":s?"Situação consultada no servidor de teste.":"Conexão ou acesso indisponível. Atualize para continuar.";
 }
 async function request(path,options={}){
  const r=await fetch(endpoint+path,{...options,cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(10000)});
  if(!r.ok){const e=Error("Operação recusada pelo servidor de teste.");e.definitive=r.status>=400&&r.status<500&&r.status!==408&&r.status!==429;throw e;}
  return r.json();
 }
 async function readState(){
  try{
   const s=await request("state");
   if(!s||!Number.isSafeInteger(s.messageCount)||s.messageCount<0||typeof s.gpsVisible!=="boolean")throw Error("Estado inválido.");
   current=s;
  }catch{current=null;}
 }
 async function refresh(){
  if(busy)return;
  busy=true;render();
  try{
   if(recoverId&&!pending&&storageKey){
    try{
     const r=await request("receipt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventId:recoverId})});
     if(r.mockOnly===true&&r.transferAuthorized===false&&r.recorded===true){clearReceipt();$("feedback").textContent="Envio anterior confirmado pelo servidor.";}
    }catch{}
   }
   await readState();
  }finally{busy=false;render();}
 }
 function payloadFor(action){
  if(action==="dispatch")return {consent:$("consent").checked};
  if(action==="location")return {lat:-19.92,lng:-43.93,accuracy:15,sampledAt:new Date().toISOString()};
  if(action==="message"||action==="support_message")return {body:$("body").value};
  if(action==="summary")return {body:$("summary").value};
  if(action==="customer_confirm")return {summaryRead:$("summaryRead").checked};
  if(action==="rating")return {stars:Number($("stars").value)};
  return {};
 }
 async function sendPending(){
  if(busy||!pending)return;
  busy=true;render();
  try{
   const r=await request("action",{method:"POST",headers:{"Content-Type":"application/json"},body:pending});
   if(r.mockOnly!==true||r.transferAuthorized!==false)throw Error("Resposta fora do escopo.");
   pending=null;clearReceipt();$("feedback").textContent="Evento registrado na fixture.";
  }catch(e){
   if(e.definitive&&!uncertain){pending=null;clearReceipt();$("feedback").textContent=e.message;}
   else if(e.definitive&&storageKey){pending=null;$("feedback").textContent="Registro anterior incerto. Atualize para consultar o recibo.";}
   else{uncertain=true;$("feedback").textContent="Envio não confirmado. Repita o mesmo evento quando a conexão retornar.";}
  }finally{
   await readState();busy=false;render();
  }
 }
 async function act(action){
  if(busy||pending||recoverId||!current)return;
  const eventId=crypto.randomUUID();
  pending=JSON.stringify({eventId,action,payload:payloadFor(action)});
  if(storageKey)remember(eventId);
  await sendPending();
 }
 actions.forEach(b=>b.addEventListener("click",()=>act(b.dataset.action)));
 $("retry").addEventListener("click",sendPending);
 $("refresh").addEventListener("click",refresh);
 addEventListener("offline",()=>{current=null;render();});
 // No automatic mutation on reconnect; retry requires an explicit tap.
 addEventListener("online",()=>refresh());
 render();refresh();
})();
