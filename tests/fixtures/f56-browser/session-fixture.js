"use strict";
// Loopback test-only page. Never stores tokens or message bodies.
(()=>{
 if(location.hostname!=="127.0.0.1")return;
 const b=document.getElementById("logout"),status=document.getElementById("logout-status");
 if(!b||!status)return;
 const role=location.pathname.split("/")[1];
 if(!["customer","provider","outsider","admin"].includes(role))return;
 let ending=false;
 const confirm=document.createElement("button"),cancel=document.createElement("button");
 confirm.id="logout-confirm";confirm.type="button";confirm.textContent="Sair mesmo assim";confirm.hidden=true;
 cancel.id="logout-cancel";cancel.type="button";cancel.textContent="Continuar na sessão";cancel.hidden=true;
 status.after(confirm,cancel);
 function warningVisible(show){confirm.hidden=!show;cancel.hidden=!show;}
 function hasPending(){
  if(document.body.dataset.operationPending==="true")return true;
  const scope=document.body.dataset.receiptScope;
  if(!/^[0-9a-f]{32}$/.test(scope||""))return false;
  try{return Object.keys(sessionStorage).some(key=>key.startsWith("sm_fixture_receipt:"+scope+":"));}catch{return false;}
 }
 async function logout(confirmed=false){
  if(ending)return;
  if(!confirmed&&hasPending()){
   status.textContent="Há um envio sem confirmação. Sair não cancela o envio e pode impedir a recuperação local do recibo. Você pode continuar na sessão para consultar ou repetir o mesmo evento.";
   warningVisible(true);cancel.focus();return;
  }
  warningVisible(false);
  ending=true;
  // Do not leave stale private state visible if the network fails.
  for(const el of document.querySelectorAll("main section,main #feedback"))el.hidden=true;
  for(const el of document.querySelectorAll("textarea,input")){if(el.type==="checkbox")el.checked=false;else el.value="";}
  b.disabled=true;status.textContent="Encerrando a sessão de teste.";
  try{
   const r=await fetch("/"+role+"/logout",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw Error("logout");
   const data=await r.json();if(data.signedOut!==true||typeof data.nativeRevoked!=="boolean")throw Error("logout");
   // Only discard this page's opaque scope, never persist payloads.
   const scope=document.body.dataset.receiptScope;
   if(/^[0-9a-f]{32}$/.test(scope||"")){
    try{for(const key of Object.keys(sessionStorage))if(key.startsWith("sm_fixture_receipt:"+scope+":"))sessionStorage.removeItem(key);}catch{}
   }
   if(data.nativeRevoked){location.replace("/"+role+"/");return;}
   status.textContent="Acesso local encerrado. Revogação no Auth não confirmada. Volte à tela de entrada.";
   b.textContent="Voltar à entrada";b.disabled=false;b.onclick=()=>location.replace("/"+role+"/");
  }catch{
   status.textContent="Encerramento não confirmado. Os dados foram ocultados; tente sair novamente.";
   ending=false;b.disabled=false;
  }
 }
 // A restored history page must obtain current server authorization.
 addEventListener("pageshow",event=>{if(event.persisted)location.reload();});
 b.addEventListener("click",()=>logout());
 confirm.addEventListener("click",()=>logout(true));
 cancel.addEventListener("click",()=>{warningVisible(false);status.textContent="Sessão mantida. Consulte o envio pendente antes de sair.";b.focus();});
})();
