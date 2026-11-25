"use strict";
(()=>{
 if(location.hostname!=="127.0.0.1"||location.pathname!=="/admin/")return;
 const $=id=>document.getElementById(id);
 let busy=false;
 const categories={safety_report:"Segurança",payment_dispute:"Divergência financeira",service_issue:"Problema no serviço",general_question:"Dúvida geral"};
 const reasons={safety_report:"safety_reviewed_mock",payment_dispute:"financial_reviewed_mock",service_issue:"service_reviewed_mock",general_question:"guidance_reviewed_mock"};
 async function req(path,options={}){
  const r=await fetch("/admin/"+path,{...options,cache:"no-store"});
  if(!r.ok)throw Error("Acesso ou operação negada.");
  const d=await r.json();
  if(d.mockOnly!==true||d.productionAuthorized!==false)throw Error("Resposta fora da fixture.");
  return d;
 }
 async function refresh(){
  const s=await req("snapshot");
  if(s.transferAuthorized!==false||s.refundAuthorized!==false||s.realFundsAvailable!==null)throw Error("Resposta financeira fora do escopo.");
  $("sessions").textContent="Sessões: "+s.sessions;
  $("completed").textContent="Concluídas: "+s.completed;
  $("pending").textContent="Incidentes pendentes: "+s.pendingIncidents;
  $("critical").textContent="Críticos sem reconhecimento: "+s.criticalPending;
  $("candidates").textContent="Revisões possíveis: "+s.reviewCandidates;
  $("held").textContent="Revisões retidas: "+s.heldReviews;
  $("review-total").textContent="Valores fictícios em revisão: "+new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(s.providerReviewCents/100);
  $("queue").replaceChildren();
  for(const c of s.queue){
   const div=document.createElement("article"),p=document.createElement("p");
   p.textContent=(categories[c.category]||"Incidente")+" — "+c.status;
   div.append(p);
   const actions={queued_mock:["acknowledge","Reconhecer"],escalated_uncovered_mock:["acknowledge","Reconhecer"],acknowledged_mock:["start_review","Iniciar análise"],under_review_mock:["resolve_review_mock","Registrar análise concluída"]};
   const a=actions[c.status];
   if(a){const b=document.createElement("button");b.textContent=a[1];b.dataset.adminAction=a[0];b.disabled=busy;b.addEventListener("click",()=>apply(c,a[0]));div.append(b);}
   $("queue").append(div);
  }
  if(!s.queue.length)$("queue").textContent="Nenhum incidente.";
 }
 async function apply(c,action){
  if(busy)return;busy=true;
  document.querySelectorAll("button").forEach(b=>b.disabled=true);
  try{
   await req("event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({caseKey:c.caseKey,eventKey:crypto.randomUUID(),action,reason:action==="resolve_review_mock"?reasons[c.category]:null})});
   $("feedback").textContent="Análise de teste registrada. Nenhum dinheiro liberado.";
  }catch(e){$("feedback").textContent=e.message;}
  finally{busy=false;$("refresh").disabled=false;try{await refresh();}catch(e){$("feedback").textContent=e.message;}}
 }
 $("refresh").addEventListener("click",()=>refresh().catch(e=>$("feedback").textContent=e.message));
 refresh().catch(e=>$("feedback").textContent=e.message);
})();