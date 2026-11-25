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
 let busy=false;
 const endpoint="/"+role+"/";
 async function request(path,options={}){
  const r=await fetch(endpoint+path,{...options,cache:"no-store",credentials:"same-origin"});
  if(!r.ok)throw Error("Operação recusada pelo servidor de teste.");
  return r.json();
 }
 async function refresh(){
  const s=await request("state");
  $("stage").textContent=s.sessionStatus||"Sem acesso";
  $("completion").textContent=s.completionStatus||"";
  $("gps").textContent=s.gpsVisible?"Localização fictícia visível":"Localização indisponível";
  $("messages").textContent="Mensagens visíveis: "+s.messageCount;
  $("received-summary").textContent=s.summary||"Resumo indisponível";
  const allowed={
   dispatch:s.sessionStatus==="ready_for_dispatch",location:s.sessionStatus==="en_route",
   arrive:s.sessionStatus==="en_route",start:s.sessionStatus==="arrived",handoff:s.sessionStatus==="in_service",
   message:["ready_for_dispatch","en_route","arrived","in_service"].includes(s.sessionStatus),
   summary:s.completionStatus==="awaiting_summary",
   provider_confirm:s.completionStatus==="awaiting_both"&&!s.providerConfirmed,
   customer_confirm:s.completionStatus==="awaiting_both"&&!s.customerConfirmed,
   rating:s.completionStatus==="completed"&&!s.rated,
   dispute:["awaiting_both","completed"].includes(s.completionStatus),
   support_message:s.completionStatus==="support_review"
  };
  document.querySelectorAll("[data-action]").forEach(b=>b.disabled=!allowed[b.dataset.action]);
 }
 async function act(action){
  if(busy)return;
  busy=true;
  const buttons=[...document.querySelectorAll("button")];
  buttons.forEach(b=>b.disabled=true);
  try{
   let payload={};
   if(action==="dispatch")payload={consent:$("consent").checked};
   if(action==="location")payload={lat:-19.92,lng:-43.93,accuracy:15,sampledAt:new Date().toISOString()};
   if(action==="message"||action==="support_message")payload={body:$("body").value};
   if(action==="summary")payload={body:$("summary").value};
   if(action==="customer_confirm")payload={summaryRead:$("summaryRead").checked};
   if(action==="rating")payload={stars:Number($("stars").value)};
   const r=await request("action",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({eventId:crypto.randomUUID(),action,payload})});
   if(r.mockOnly!==true||r.transferAuthorized!==false)throw Error("Resposta fora do escopo.");
   $("feedback").textContent="Evento registrado na fixture.";
  }catch(e){$("feedback").textContent=e.message;}
  finally{busy=false;$("refresh").disabled=false;try{await refresh();}catch{$("feedback").textContent="Não foi possível atualizar o teste."}}
 }
 document.querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>act(b.dataset.action)));
 $("refresh").addEventListener("click",()=>refresh().catch(e=>$("feedback").textContent=e.message));
 refresh().catch(e=>$("feedback").textContent=e.message);
})();
