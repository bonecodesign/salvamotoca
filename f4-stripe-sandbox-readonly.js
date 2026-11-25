/* Salva Motoca! — verificação READ ONLY para futuro sandbox dedicado.
 * Nunca cria objetos Stripe, não lista clientes/transações, não retorna IDs,
 * saldos, valores, metadados ou credenciais. Nenhuma autoridade financeira.
 * Não é endpoint público, nem autorização de produção.
 */
"use strict";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id=(v,p)=>typeof v==="string"&&new RegExp("^"+p+"_[a-zA-Z0-9]{8,100}$").test(v);
function requireCondition(ok,msg){if(!ok)throw Error(msg);}
function config(input){
 requireCondition(input?.mode==="sandbox_readonly"&&input?.dedicatedProject==="salvamotoca"&&input?.ack==="SM_DEDICATED_TEST_READ_ONLY","Sandbox dedicado não autorizado.");
 requireCondition(typeof input.key==="string"&&/^rk_test_[A-Za-z0-9_]{16,250}$/.test(input.key),"Somente chave restrita de teste.");
 requireCondition(id(input.accountId,"acct"),"Conta de teste esperada obrigatória.");
 requireCondition(typeof input.apiVersion==="string"&&/^\d{4}-\d{2}-\d{2}\.[a-z]+$/.test(input.apiVersion),"Versão explícita da API obrigatória.");
 return Object.freeze({...input});
}
async function runPreflight(input,fetchImpl=globalThis.fetch){
 const c=config(input);
 requireCondition(typeof fetchImpl==="function","Transporte ausente.");
 const allowed=new Set(["/v1/account","/v1/balance"]);
 const result={mockOnly:true,productionAuthorized:false,transferAuthorized:false,refundAuthorized:false,
  writes:0,accountMatches:false,testModeVerified:false,brazilAccount:false,
  accountChargesEnabled:false,accountPayoutsEnabled:false,connectEligibility:"not_verified",
  pixEligibility:"not_verified",paymentEvidence:"not_requested"};
 const timeout=AbortSignal.timeout(15000);
 async function get(path){
  requireCondition(allowed.has(path),"Rota não permitida.");
  const response=await fetchImpl("https://api.stripe.com"+path,{method:"GET",headers:{Authorization:"Bearer "+c.key,"Stripe-Version":c.apiVersion,Accept:"application/json"},redirect:"error",signal:timeout});
  requireCondition(response&&response.ok===true,"Leitura Stripe não autorizada ou indisponível.");
  return response.json();
 }
 const account=await get("/v1/account");
 requireCondition(account?.object==="account"&&account.id===c.accountId,"Conta Stripe divergente.");
 result.accountMatches=true;
 result.brazilAccount=account.country==="BR";
 requireCondition(result.brazilAccount,"Conta fora do Brasil.");
 const balance=await get("/v1/balance");
 requireCondition(balance?.object==="balance"&&balance.livemode===false,"Modo de teste não comprovado.");
 result.testModeVerified=true;
 result.accountChargesEnabled=account.charges_enabled===true;
 result.accountPayoutsEnabled=account.payouts_enabled===true;
 // Optional exact objects only, never list or search by customer.
 if(c.payment!==undefined){
  const p=c.payment;
  requireCondition(id(p.intentId,"pi")&&UUID.test(p.attemptId||"")&&UUID.test(p.requestId||"")&&UUID.test(p.quoteId||"")&&UUID.test(p.customerId||"")&&UUID.test(p.providerId||"")&&id(p.stripeCustomerId,"cus")&&Number.isSafeInteger(p.totalCents)&&p.totalCents>=100&&p.totalCents<=1050000,"Vínculo de teste inválido.");
  const intentPath="/v1/payment_intents/"+p.intentId;allowed.add(intentPath);
  const pi=await get(intentPath);
  const metadata={project:"salvamotoca",attempt_id:p.attemptId,request_id:p.requestId,quote_id:p.quoteId,customer_id:p.customerId,provider_id:p.providerId};
  requireCondition(pi?.object==="payment_intent"&&pi.id===p.intentId&&pi.livemode===false&&pi.currency==="brl"&&pi.amount===p.totalCents&&pi.customer===p.stripeCustomerId&&pi.transfer_group==="sm_"+p.attemptId&&pi.transfer_data==null&&pi.on_behalf_of==null&&pi.application_fee_amount==null&&Object.entries(metadata).every(([k,v])=>pi.metadata?.[k]===v),"Intenção não vinculada ao projeto de teste.");
  if(pi.status==="succeeded"){
   requireCondition(pi.amount_received===p.totalCents&&id(pi.latest_charge,"ch"),"Captura de teste divergente.");
   const chargePath="/v1/charges/"+pi.latest_charge;allowed.add(chargePath);
   const ch=await get(chargePath);
   requireCondition(ch?.object==="charge"&&ch.id===pi.latest_charge&&ch.payment_intent===pi.id&&ch.customer===p.stripeCustomerId&&ch.livemode===false&&ch.currency==="brl"&&ch.amount===p.totalCents&&ch.amount_captured===p.totalCents&&ch.status==="succeeded"&&ch.paid===true&&ch.captured===true&&ch.transfer==null,"Cobrança de teste divergente.");
   requireCondition(Number.isSafeInteger(ch.amount_refunded)&&ch.amount_refunded>=0&&ch.amount_refunded<=p.totalCents&&typeof ch.refunded==="boolean"&&typeof ch.disputed==="boolean","Estado de risco desconhecido.");
   result.paymentEvidence=ch.amount_refunded>0||ch.refunded||ch.disputed?"test_risk_observed":"test_capture_observed";
  }else{
   requireCondition(["requires_payment_method","requires_confirmation","requires_action","processing","requires_capture","canceled"].includes(pi.status),"Estado de teste desconhecido.");
   result.paymentEvidence="test_not_captured";
  }
 }
 return Object.freeze(result);
}
module.exports=Object.freeze({runPreflight});
