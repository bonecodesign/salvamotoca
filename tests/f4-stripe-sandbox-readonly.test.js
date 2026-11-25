"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {runPreflight}=require("../f4-stripe-sandbox-readonly");
const u=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const base={mode:"sandbox_readonly",dedicatedProject:"salvamotoca",ack:"SM_DEDICATED_TEST_READ_ONLY",key:"rk_test_fixture000000000000000000",accountId:"acct_fixture00001",apiVersion:"2025-08-27.basil"};
const p={intentId:"pi_fixture00001",attemptId:u(1),requestId:u(2),quoteId:u(3),customerId:u(4),providerId:u(5),stripeCustomerId:"cus_fixture00001",totalCents:30000};
const account={object:"account",id:base.accountId,country:"BR",charges_enabled:true,payouts_enabled:false,email:"must-not-leak@example.invalid"};
const balance={object:"balance",livemode:false,available:[{amount:123456,currency:"brl"}]};
const pi={object:"payment_intent",id:p.intentId,livemode:false,currency:"brl",amount:30000,amount_received:30000,customer:p.stripeCustomerId,status:"succeeded",transfer_group:"sm_"+p.attemptId,transfer_data:null,on_behalf_of:null,application_fee_amount:null,latest_charge:"ch_fixture00001",metadata:{project:"salvamotoca",attempt_id:p.attemptId,request_id:p.requestId,quote_id:p.quoteId,customer_id:p.customerId,provider_id:p.providerId},client_secret:"never-return"};
const charge={object:"charge",id:pi.latest_charge,payment_intent:pi.id,customer:p.stripeCustomerId,livemode:false,currency:"brl",amount:30000,amount_captured:30000,status:"succeeded",paid:true,captured:true,amount_refunded:0,refunded:false,disputed:false,transfer:null};
function fixture(overrides={}){
 const paths=[];
 const objects={"/v1/account":account,"/v1/balance":balance,["/v1/payment_intents/"+pi.id]:pi,["/v1/charges/"+charge.id]:charge,...overrides};
 const fetch=async(url,opts)=>{
  const v=new URL(url);
  assert.equal(v.origin,"https://api.stripe.com");assert.equal(v.search,"");assert.equal(opts.method,"GET");assert.equal(opts.redirect,"error");
  assert.equal(opts.headers.Authorization,"Bearer "+base.key);assert.equal(opts.headers["Stripe-Version"],base.apiVersion);
  paths.push(v.pathname);assert.ok(Object.hasOwn(objects,v.pathname));
  return {ok:true,json:async()=>objects[v.pathname]};
 };
 return {fetch,paths};
}
test("account-only preflight redacts all identifiers, balances and sensitive fields",async()=>{
 const f=fixture(),r=await runPreflight(base,f.fetch);
 assert.deepEqual(f.paths,["/v1/account","/v1/balance"]);
 assert.equal(r.testModeVerified,true);assert.equal(r.accountMatches,true);assert.equal(r.connectEligibility,"not_verified");assert.equal(r.pixEligibility,"not_verified");
 assert.equal(r.paymentEvidence,"not_requested");assert.equal(r.productionAuthorized,false);assert.equal(r.writes,0);
 for(const secret of [base.key,base.accountId,"123456",account.email])assert.ok(!JSON.stringify(r).includes(secret));
});
test("wrong scope, live key, unrestricted key and unpinned API fail before I/O",async()=>{
 for(const x of [{ack:"yes"},{dedicatedProject:"fraldacycle"},{key:"rk_live_fake000000000000000000"},{key:"sk_test_fake000000000000000000"},{apiVersion:"latest"},{accountId:"acct_../other"}]){
  const f=fixture();await assert.rejects(runPreflight({...base,...x},f.fetch));assert.equal(f.paths.length,0);
 }
});
test("wrong account or live balance prevents payment lookup",async()=>{
 for(const o of [{"/v1/account":{...account,id:"acct_other00001"}},{"/v1/account":{...account,country:"US"}},{"/v1/balance":{...balance,livemode:true}}]){
  const f=fixture(o);await assert.rejects(runPreflight({...base,payment:p},f.fetch));assert.ok(f.paths.length<=2);
 }
});
test("payment read only checks exact bound intent and charge; never authorizes service",async()=>{
 const f=fixture(),r=await runPreflight({...base,payment:p},f.fetch);
 assert.equal(r.paymentEvidence,"test_capture_observed");assert.equal(f.paths.length,4);assert.equal(r.transferAuthorized,false);assert.equal(r.refundAuthorized,false);
 assert.ok(!JSON.stringify(r).includes(pi.client_secret));assert.ok(!JSON.stringify(r).includes(pi.id));
});
test("another project's intent or mismatched amount is rejected before charge lookup",async()=>{
 for(const x of [{metadata:{...pi.metadata,project:"another"}},{amount:29999},{livemode:true},{customer:"cus_other00001"},{transfer_data:{destination:"acct_other"}}]){
  const f=fixture({["/v1/payment_intents/"+pi.id]:{...pi,...x}});
  await assert.rejects(runPreflight({...base,payment:p},f.fetch));assert.equal(f.paths.length,3);
 }
});
test("partial refund, dispute, and noncaptured payment never produce clean evidence",async()=>{
 for(const x of [{amount_refunded:1000},{disputed:true},{refunded:true}]){
  const f=fixture({["/v1/charges/"+charge.id]:{...charge,...x}});
  assert.equal((await runPreflight({...base,payment:p},f.fetch)).paymentEvidence,"test_risk_observed");
 }
 const f=fixture({["/v1/payment_intents/"+pi.id]:{...pi,status:"processing",amount_received:0,latest_charge:null}});
 assert.equal((await runPreflight({...base,payment:p},f.fetch)).paymentEvidence,"test_not_captured");assert.equal(f.paths.length,3);
});
test("unexpected charge, inaccessible API and malformed payment fail closed",async()=>{
 const f=fixture({["/v1/charges/"+charge.id]:{...charge,payment_intent:"pi_other00001"}});
 await assert.rejects(runPreflight({...base,payment:p},f.fetch));
 await assert.rejects(runPreflight(base,async()=>({ok:false})),/não autorizada/);
 const invalid=fixture();await assert.rejects(runPreflight({...base,payment:{...p,intentId:"pi_/../charges"}},invalid.fetch));
 assert.equal(invalid.paths.length,2);
});
