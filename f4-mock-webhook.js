/* Salva Motoca! — verificador de assinatura de WEBHOOK FICTÍCIO (NÃO STRIPE).
 * Demonstra autenticação de evento sem rede ou PSP. Nunca marcar pago real.
 * Nunca usar como verificador de webhooks Stripe em produção.
 */
"use strict";
const crypto=require("node:crypto");
const VERSION="mock-v1",MAX_BODY_BYTES=16384,MAX_SKEW_SECONDS=300;
function fail(message){throw new Error(message)}
function normalizeBody(body){
  if(typeof body!=="string"||Buffer.byteLength(body)>MAX_BODY_BYTES||body.length<2)
    fail("Corpo de evento mock ausente ou muito grande.");
  return body;
}
function headerParts(header){
  if(typeof header!=="string"||header.length>200)fail("Assinatura mock inválida.");
  const m=/^t=(\d{10,13}),v1=([a-f0-9]{64})$/.exec(header);
  if(!m)fail("Assinatura mock inválida.");
  const t=Number(m[1]);if(!Number.isSafeInteger(t))fail("Timestamp inválido.");
  return {timestamp:t,signature:Buffer.from(m[2],"hex")};
}
function signMock({body,timestamp,secret}){
  normalizeBody(body);
  if(typeof secret!=="string"||secret.length<32)fail("Segredo de teste insuficiente.");
  if(!Number.isSafeInteger(timestamp)||timestamp<1000000000)fail("Timestamp inválido.");
  const signature=crypto.createHmac("sha256",secret)
    .update(VERSION+"."+timestamp+"."+body,"utf8").digest("hex");
  return "t="+timestamp+",v1="+signature;
}
function verifyMock({body,header,secret,nowSeconds}){
  normalizeBody(body);
  if(typeof secret!=="string"||secret.length<32)fail("Segredo de teste insuficiente.");
  if(!Number.isSafeInteger(nowSeconds))fail("Relógio inválido.");
  const {timestamp,signature}=headerParts(header);
  if(Math.abs(nowSeconds-timestamp)>MAX_SKEW_SECONDS)
    fail("Evento mock fora da janela temporal.");
  const expected=crypto.createHmac("sha256",secret)
    .update(VERSION+"."+timestamp+"."+body,"utf8").digest();
  if(!crypto.timingSafeEqual(expected,signature))
    fail("Assinatura mock não corresponde ao corpo.");
  let data;
  try{data=JSON.parse(body)}catch(_){fail("Corpo mock não é JSON válido.")}
  if(!data||typeof data!=="object"||Array.isArray(data))fail("Envelope inválido.");
  if(!/^[a-z0-9_-]{8,100}$/.test(data.id||""))fail("ID de evento mock inválido.");
  if(!/^[0-9a-f-]{36}$/i.test(data.attemptId||""))fail("ID de tentativa mock inválido.");
  if(!["mock_payment_verified","mock_refund_confirmed","mock_dispute_opened"].includes(data.kind))
    fail("Evento mock desconhecido.");
  if(data.currency!=="BRL"||!Number.isSafeInteger(data.amountCents)||
      data.amountCents<1||data.amountCents>500000)
    fail("Valor ou moeda mock inválidos.");
  return Object.freeze({
    eventId:data.id,attemptId:data.attemptId,kind:data.kind,
    amountCents:data.amountCents,currency:data.currency,
    providerVerified:false,canMarkPaid:false,canDispatch:false
  });
}
function createOfflineMockInbox({secret,expectedAmountCents,attemptId,nowSeconds}){
  if(!Number.isSafeInteger(expectedAmountCents)||expectedAmountCents<100)
    fail("Orçamento fictício inválido.");
  if(!/^[0-9a-f-]{36}$/i.test(attemptId||""))fail("Tentativa fictícia inválida.");
  const seen=new Map();let status="mock_prepared";
  return Object.freeze({
    receive(body,header){
      const data=verifyMock({body,header,secret,nowSeconds});
      if(data.attemptId!==attemptId||data.amountCents!==expectedAmountCents)
        fail("Evento não corresponde à tentativa ou ao orçamento.");
      const hash=crypto.createHash("sha256").update(body).digest("hex");
      if(seen.has(data.eventId)){
        if(seen.get(data.eventId)!==hash)fail("Reutilização divergente de evento.");
        return {result:"duplicate",status,canMarkPaid:false};
      }
      if(data.kind==="mock_payment_verified"){
        if(status!=="mock_prepared")fail("Pagamento de teste fora de ordem.");
        status="mock_verified";
      }else if(data.kind==="mock_refund_confirmed"){
        if(status!=="mock_verified")fail("Estorno de teste fora de ordem.");
        status="mock_refunded";
      }else{
        if(status!=="mock_verified")fail("Disputa de teste fora de ordem.");
        status="mock_disputed";
      }
      seen.set(data.eventId,hash);
      return {result:"applied",status,canMarkPaid:false};
    },
    state(){return {status,eventCount:seen.size,canMarkPaid:false,canTransfer:false}}
  });
}
module.exports=Object.freeze({signMock,verifyMock,createOfflineMockInbox});
