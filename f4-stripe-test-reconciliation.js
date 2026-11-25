/* Salva Motoca! — candidato de conciliação Stripe TESTE, somente Node.
 * Não cria PaymentIntent, não chama rede, não confirma pagamento real,
 * não libera chat, despacho, estorno ou transferência.
 * A leitura independente é injetada pelo ensaio; produção exige persistência
 * transacional, credenciais privadas e homologação contratual.
 */
"use strict";
const crypto=require("node:crypto");
const F4=require("./f4-finance.js");
const DENIAL=Object.freeze({mockOnly:true,realPaymentVerified:false,canMarkPaid:false,chatAllowed:false,dispatchAllowed:false,transferAuthorized:false,refundAuthorized:false});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stripeId=(v,p)=>typeof v==="string"&&new RegExp("^"+p+"_[a-zA-Z0-9]{8,100}$").test(v);
function need(ok,msg){if(!ok)throw Error(msg);}
function bind(input){
 need(input&&UUID.test(input.attemptId||"")&&UUID.test(input.customerId||"")&&UUID.test(input.providerId||"")&&input.customerId!==input.providerId,"Vínculo inválido.");
 need(stripeId(input.intentId,"pi")&&stripeId(input.stripeCustomerId,"cus"),"Identificador PSP inválido.");
 const q=F4.quoteSnapshot(input.quote);
 need(input.processingFeeFixtureVerified===true&&Number.isSafeInteger(input.processingFeeCents),"Tarifa de fixture não confirmada.");
 const a=F4.costBreakdown({quote:q,processingFeeCents:input.processingFeeCents,feeVerifiedByPSP:true});
 need(a.customerTotalCents!==null,"Total desconhecido.");
 return Object.freeze({intentId:input.intentId,customer:input.stripeCustomerId,amount:a.customerTotalCents,meta:Object.freeze({project:"salvamotoca",attempt_id:input.attemptId,request_id:q.requestId,quote_id:q.quoteId,customer_id:input.customerId,provider_id:input.providerId}),transferGroup:"sm_"+input.attemptId});
}
function intentMatches(pi,b){
 return pi&&pi.object==="payment_intent"&&pi.id===b.intentId&&pi.livemode===false&&
 pi.currency==="brl"&&pi.amount===b.amount&&pi.customer===b.customer&&pi.transfer_group===b.transferGroup&&
 pi.transfer_data==null&&pi.on_behalf_of==null&&pi.application_fee_amount==null&&
 Object.entries(b.meta).every(([k,v])=>pi.metadata?.[k]===v);
}
function captured(pi,b){
 return intentMatches(pi,b)&&pi.status==="succeeded"&&pi.amount_received===b.amount&&stripeId(pi.latest_charge,"ch");
}
function chargeMatches(ch,pi,b){
 return ch&&ch.object==="charge"&&ch.id===pi.latest_charge&&ch.payment_intent===b.intentId&&
 ch.livemode===false&&ch.currency==="brl"&&ch.amount===b.amount&&ch.amount_captured===b.amount&&
 ch.customer===b.customer&&ch.status==="succeeded"&&ch.paid===true&&ch.captured===true&&
 ch.refunded===false&&ch.amount_refunded===0&&ch.disputed===false&&ch.transfer==null;
}
function verifiedEvent(stripe,webhookSecret,raw,signature){
   need(Buffer.isBuffer(raw)&&raw.length>=2&&raw.length<=65536&&typeof signature==="string"&&signature.length<=4096,"Envelope inválido.");
   const ts=signature.split(",").filter(x=>x.startsWith("t="));
   need(ts.length===1&&/^t=\d{10}$/.test(ts[0])&&Math.abs(Math.floor(Date.now()/1000)-Number(ts[0].slice(2)))<=300,"Assinatura de teste fora da janela.");
   // Official SDK validates the raw bytes with default Stripe signing protocol.
   let event;try{event=stripe.webhooks.constructEvent(raw,signature,webhookSecret,300);}catch{throw Error("Assinatura de teste inválida.");}
   need(event?.object==="event"&&stripeId(event.id,"evt")&&event.livemode===false&&!event.account&&!event.context,"Evento fora do contexto da plataforma de teste.");
 return event;
}
function makeInbox({stripe,webhookSecret,binding,readIntentFixture,readChargeFixture,storeEvidenceFixture=null}){
 need(stripe?.webhooks?.constructEvent&&typeof readIntentFixture==="function"&&typeof readChargeFixture==="function","Dependências de teste ausentes.");
 need(typeof webhookSecret==="string"&&webhookSecret.startsWith("whsec_fixture_")&&webhookSecret.length>=40,"Segredo exclusivamente sintético obrigatório.");
 need(storeEvidenceFixture===null||typeof storeEvidenceFixture==="function","Persistência de fixture inválida.");
 const b=bind(binding),seen=new Map();let state="awaiting_evidence",busy=false;
 const view=()=>Object.freeze({state,eventCount:seen.size,...DENIAL});
 return Object.freeze({view,async receive(raw,signature){
  need(!busy,"Processamento concorrente: repetir após conclusão.");
  busy=true;
  try{
   const event=verifiedEvent(stripe,webhookSecret,raw,signature);
   need(event.type==="payment_intent.succeeded","Tipo não aceito; risco exige fluxo separado.");
   need(captured(event.data?.object,b),"Snapshot não corresponde à tentativa.");
   const hash=crypto.createHash("sha256").update(raw).digest("hex");
   if(!storeEvidenceFixture&&seen.has(event.id)){need(seen.get(event.id)===hash,"Replay divergente.");return Object.freeze({duplicate:true,...view()});}
   // Do not trust the webhook snapshot alone. Read both objects independently.
   const pi=await readIntentFixture(b.intentId);
   need(captured(pi,b)&&pi.latest_charge===event.data.object.latest_charge,"Conciliação de intenção falhou.");
   const ch=await readChargeFixture(pi.latest_charge);
   need(chargeMatches(ch,pi,b),"Conciliação de cobrança ou risco falhou.");
   need(seen.size<1000,"Limite de ensaio.");
   let persisted=null;
   if(storeEvidenceFixture){
    persisted=await storeEvidenceFixture(Object.freeze({attemptId:b.meta.attempt_id,eventId:event.id,bodySha256:hash,intentId:b.intentId,chargeId:ch.id,requestId:b.meta.request_id,quoteId:b.meta.quote_id,customerId:b.meta.customer_id,providerId:b.meta.provider_id,stripeCustomerId:b.customer,totalCents:b.amount}));
    need(persisted&&typeof persisted.duplicate==="boolean"&&typeof persisted.evidenceAlreadyExists==="boolean"&&persisted.realPaymentVerified===false&&persisted.transferAuthorized===false,"Resposta de persistência inválida.");
   }
   seen.set(event.id,hash);state="test_evidence_reconciled";
   return Object.freeze({duplicate:persisted?.duplicate??false,evidenceAlreadyExists:persisted?.evidenceAlreadyExists??false,...view()});
  }finally{busy=false;}
 }});
}

/** Risk evidence only: no refund/dispute outcome or money movement is inferred.
 * Holds are monotonic. Even a later clean snapshot never clears one. */
function makeRiskInbox({stripe,webhookSecret,binding,readIntentFixture,readChargeFixture,readDisputeFixture,storeRiskFixture}){
 need(stripe?.webhooks?.constructEvent&&typeof webhookSecret==="string"&&webhookSecret.startsWith("whsec_fixture_")&&webhookSecret.length>=40,"Dependências de risco inválidas.");
 need([readIntentFixture,readChargeFixture,readDisputeFixture,storeRiskFixture].every(f=>typeof f==="function"),"Leituras e persistência de risco obrigatórias.");
 const b=bind(binding);
 const validCharge=(ch,pi)=>ch&&ch.object==="charge"&&ch.id===pi.latest_charge&&ch.payment_intent===b.intentId&&
  ch.livemode===false&&ch.currency==="brl"&&ch.amount===b.amount&&ch.customer===b.customer&&
  ch.amount_captured===b.amount&&ch.paid===true&&ch.captured===true;
 return Object.freeze({async receive(raw,signature){
  const event=verifiedEvent(stripe,webhookSecret,raw,signature);
  const obj=event.data?.object;
  need(["payment_intent.canceled","charge.refunded","charge.dispute.created"].includes(event.type),"Evento de risco não suportado.");
  const pi=await readIntentFixture(b.intentId);
  need(intentMatches(pi,b),"Intenção de risco divergente.");
  let kind,chargeId=null,disputeId=null,observedCents=0;
  if(event.type==="payment_intent.canceled"){
   need(intentMatches(obj,b)&&obj.status==="canceled"&&pi.status==="canceled"&&obj.amount_received===0&&pi.amount_received===0,"Cancelamento não conciliado.");
   kind="cancellation";
  }else{
   need(captured(pi,b),"Intenção capturada de risco inválida.");
   const ch=await readChargeFixture(pi.latest_charge);
   need(validCharge(ch,pi),"Cobrança de risco divergente.");
   chargeId=ch.id;
   if(event.type==="charge.refunded"){
    need(validCharge(obj,pi)&&Number.isSafeInteger(obj.amount_refunded)&&obj.amount_refunded>0&&
     Number.isSafeInteger(ch.amount_refunded)&&ch.amount_refunded>=obj.amount_refunded&&ch.amount_refunded<=b.amount,
     "Estorno não conciliado.");
    // Cumulative, not delta. A late smaller snapshot cannot decrease the hold.
    kind="refund_observed";observedCents=ch.amount_refunded;
   }else{
    const validDispute=d=>d&&d.object==="dispute"&&stripeId(d.id,"dp")&&d.charge===ch.id&&
     d.payment_intent===b.intentId&&d.livemode===false&&d.currency==="brl"&&
     Number.isSafeInteger(d.amount)&&d.amount>0&&d.amount<=b.amount;
    need(validDispute(obj),"Contestação divergente.");
    const dp=await readDisputeFixture(obj.id);
    need(validDispute(dp)&&dp.id===obj.id&&dp.amount===obj.amount,"Contestação não conciliada.");
    kind="dispute_observed";disputeId=dp.id;observedCents=dp.amount;
   }
  }
  const r=await storeRiskFixture(Object.freeze({attemptId:b.meta.attempt_id,eventId:event.id,bodySha256:crypto.createHash("sha256").update(raw).digest("hex"),
   intentId:b.intentId,requestId:b.meta.request_id,quoteId:b.meta.quote_id,customerId:b.meta.customer_id,providerId:b.meta.provider_id,stripeCustomerId:b.customer,
   totalCents:b.amount,kind,chargeId,disputeId,observedCents}));
  need(r&&r.held===true&&typeof r.duplicate==="boolean"&&r.realPaymentVerified===false&&r.transferAuthorized===false,"Persistência de risco inválida.");
  return Object.freeze({duplicate:r.duplicate,held:true,...DENIAL});
 }});
}
module.exports=Object.freeze({makeInbox,makeRiskInbox,DENIAL});
