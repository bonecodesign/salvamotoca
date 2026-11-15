/* Salva Motoca! F6 — CONCLUSAO OFFLINE, sem pagamentos ou atendimento real.
 * Entradas sao fixtures locais. Nao existe Auth, PSP, Supabase ou abertura de repasse.
 */
(function(root,factory) {
 "use strict";
 const api=factory();
 if(typeof module==="object" && module.exports) module.exports=api;
 if(root && typeof root==="object") root.SMF6Offline=api;
})(typeof window!=="undefined"?window:null,function() {
 "use strict";
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const EVENT=/^[a-z0-9_-]{8,80}$/i;
 const CUSTOMER_WINDOW_MS=300000;
 const PHOTO_TAG="F6_SYNTHETIC_PHOTO_ONLY";
 const HANDOFF="F5_LOCAL_HANDOFF_NOT_REAL";
 const FORBIDDEN=["paymentStatus","paymentToken","secret","signedUrl","bankAccount"];
 function check(ok,msg){if(!ok)throw new Error(msg)}
 function uuid(v,name){check(typeof v==="string"&&UUID.test(v),name+" invalido.");return v.toLowerCase()}
 function stamp(v){check(Number.isSafeInteger(v)&&v>0,"Horario invalido.");return v}
 function startOfflineCompletion({requestId,customerId,providerId,handoff,createdAt}){
  const customer=uuid(customerId,"Cliente"),provider=uuid(providerId,"Prestador");
  check(customer!==provider,"Cliente e prestador distintos.");
  check(handoff===HANDOFF,"Exige fixture offline F5, nunca recibo real.");
  return {
   engine:"F6_LOCAL_ONLY",requestId:uuid(requestId,"Pedido"),
   customerId:customer,providerId:provider,createdAt:stamp(createdAt),lastEventAt:createdAt,
   status:"awaiting_summary",summary:null,summaryAt:null,deadline:null,
   customerConfirmed:false,providerConfirmed:false,
   rating:null,supportMessages:[],processed:[],version:0,
   paymentVerifiedByPSP:false,realCompletionAuthorized:false,
   realPayoutAuthorized:false,realReviewPublished:false
  };
 }
 function role(s,id){
  return id===s.customerId?"customer":id===s.providerId?"provider":"outsider";
 }
 function applyOffline(s,entry){
  check(s&&s.engine==="F6_LOCAL_ONLY","Sessao F6 so offline.");
  check(entry&&typeof entry==="object"&&!Array.isArray(entry),"Evento invalido.");
  check(typeof entry.id==="string"&&EVENT.test(entry.id),"ID de evento invalido.");
  check(typeof entry.kind==="string"&&entry.kind.length<=45,"Tipo de evento invalido.");
  const at=stamp(entry.at);
  check(at>=s.createdAt,"Horario anterior a sessao.");
  for(const key of FORBIDDEN)check(!Object.prototype.hasOwnProperty.call(entry,key),
     "Evento nao pode conter dados financeiros ou URL assinada.");
  const serialized=JSON.stringify(entry);
  const found=s.processed.find(e=>e.id===entry.id);
  if(found){
   check(found.serialized===serialized,"ID de evento reutilizado com conteudo diferente.");
   return {state:s,duplicate:true};
  }
  check(at>=s.lastEventAt,"Evento anterior ao ultimo evento processado.");
  const who=role(s,entry.actorId);
  const next={...s,processed:[...s.processed],supportMessages:[...s.supportMessages],
    summary:s.summary?{...s.summary}:null,rating:s.rating?{...s.rating}:null};
  if(entry.kind==="submit_summary"){
   check(who==="provider"&&s.status==="awaiting_summary",
      "Somente prestador com servico iniciado informa resumo.");
   check(typeof entry.text==="string"&&entry.text.trim().length>=15&&
    entry.text.length<=600,"Resumo obrigatorio entre 15 e 600 caracteres.");
   check(entry.photoTag==null||entry.photoTag===PHOTO_TAG,
     "Foto real, URL e arquivos nao sao aceitos na simulacao.");
   next.summary={text:entry.text.trim(),
     optionalSyntheticPhoto:entry.photoTag===PHOTO_TAG};
   next.summaryAt=at;next.deadline=at+CUSTOMER_WINDOW_MS;
   next.status="awaiting_both";
  }else if(entry.kind==="provider_confirm"){
   check(who==="provider"&&s.summary&&s.status==="awaiting_both"&&
       !s.providerConfirmed,"Confirmacao do prestador indisponivel.");
   next.providerConfirmed=true;
   next.status=s.customerConfirmed?"completed":"awaiting_both";
  }else if(entry.kind==="customer_confirm"){
   check(who==="customer"&&s.summary&&s.status==="awaiting_both"&&
       !s.customerConfirmed,"Confirmacao do motociclista indisponivel.");
   check(at<=s.deadline,"Janela de 5 minutos encerrada; exige suporte.");
   check(entry.summaryRead===true,
     "O cliente precisa visualizar o resumo antes de confirmar.");
   next.customerConfirmed=true;
   next.status=s.providerConfirmed?"completed":"awaiting_both";
  }else if(entry.kind==="expire_customer_window"){
   check(entry.actorId==="offline_clock"&&s.summary&&
     s.status==="awaiting_both"&&!s.customerConfirmed&&at>s.deadline,
     "Prazo ainda valido ou cliente ja confirmou.");
   next.status="support_review";
  }else if(entry.kind==="request_support"){
   check(who!=="outsider"&&
     (s.status==="awaiting_summary"||s.status==="awaiting_both"||s.status==="completed"),
     "Divergencia indisponivel.");
   check(typeof entry.reason==="string"&&
     entry.reason.trim().length>=5&&entry.reason.length<=300,
     "Informe motivo da divergencia.");
   next.status="support_review";
   next.supportMessages.push({id:entry.id,actorId:entry.actorId,
     text:entry.reason.trim(),at});
  }else if(entry.kind==="support_message"){
   check(who!=="outsider"&&s.status==="support_review"&&
     typeof entry.text==="string"&&
     entry.text.trim().length>=1&&entry.text.length<=2000,
     "Mensagem de suporte indisponivel.");
   next.supportMessages.push({id:entry.id,actorId:entry.actorId,
     text:entry.text.trim(),at});
  }else if(entry.kind==="rate_provider"){
   check(who==="customer"&&s.status==="completed"&&s.rating===null,
     "Avaliacao somente por motociclista apos confirmacao bilateral.");
   check(Number.isSafeInteger(entry.stars)&&entry.stars>=1&&entry.stars<=5,
     "Nota deve ser inteiro de 1 a 5.");
   check(entry.comment==null||(typeof entry.comment==="string"&&
     entry.comment.length<=300),"Comentario excede limite.");
   next.rating={stars:entry.stars,comment:(entry.comment||"").trim(),at};
  }else{
   throw new Error("Evento de conclusao desconhecido.");
  }
  next.processed.push({id:entry.id,serialized});
  next.version++;next.lastEventAt=at;
  return {state:next,duplicate:false};
 }
 function viewFor(s,viewerId){
  check(s&&s.engine==="F6_LOCAL_ONLY","Sessao F6 invalida.");
  const who=role(s,viewerId);
  if(who==="outsider")return Object.freeze({access:"denied",mockOnly:true});
  return {
   access:"participant",role:who, mockOnly:true,status:s.status,
   summary:s.summary?{...s.summary}:null,deadline:s.deadline,
   customerConfirmed:s.customerConfirmed,providerConfirmed:s.providerConfirmed,
   supportMessages:s.status==="support_review"?
     s.supportMessages.map(x=>({...x})):[],
   rating:s.rating?{...s.rating}:null, realCompletionAuthorized:false,
   realPayoutAuthorized:false,realReviewPublished:false
  };
 }
 function settlementCandidate(_state){
  return Object.freeze({authorized:false,transferExecuted:false,
   reason:"Sem PSP autenticado, dupla confirmacao no servidor e mediacao real, nao existe repasse."});
 }
 return Object.freeze({startOfflineCompletion,applyOffline,viewFor,
  settlementCandidate,CUSTOMER_WINDOW_MS,PHOTO_TAG,HANDOFF});
});
