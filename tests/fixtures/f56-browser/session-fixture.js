"use strict";
// Loopback test-only page. Never stores tokens or message bodies.
(()=>{
 if(location.hostname!=="127.0.0.1")return;
 const b=document.getElementById("logout"),status=document.getElementById("logout-status");
 if(!b||!status)return;
 const role=location.pathname.split("/")[1];
 if(!["customer","provider","outsider","admin"].includes(role))return;
 let ending=false;
 async function logout(){
  if(ending)return;
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
 b.addEventListener("click",logout);
})();
