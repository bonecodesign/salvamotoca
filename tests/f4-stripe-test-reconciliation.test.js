"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const Stripe=require("stripe");
const {makeInbox,DENIAL}=require("../f4-stripe-test-reconciliation");
const stripe=new Stripe("sk_test_fixture_not_a_real_key",{httpClient:{getClientName:()=>"deny-network",makeRequest(){throw Error("Network disabled");}}});
const secret="whsec_fixture_"+"s".repeat(48);
const binding={attemptId:"00000000-0000-4000-8000-000000000001",customerId:"00000000-0000-4000-8000-000000000002",providerId:"00000000-0000-4000-8000-000000000003",intentId:"pi_fixture00001",stripeCustomerId:"cus_fixture00001",quote:{requestId:"00000000-0000-4000-8000-000000000004",quoteId:"00000000-0000-4000-8000-000000000005",items:[{kind:"service",code:"repair",amountCents:23000},{kind:"travel",code:"deslocamento",amountCents:4000}]},processingFeeCents:700,processingFeeFixtureVerified:true};
function intent(){
 return {object:"payment_intent",id:binding.intentId,livemode:false,currency:"brl",amount:30000,amount_received:30000,customer:binding.stripeCustomerId,transfer_group:"sm_"+binding.attemptId,transfer_data:null,on_behalf_of:null,application_fee_amount:null,status:"succeeded",latest_charge:"ch_fixture00001",metadata:{project:"salvamotoca",attempt_id:binding.attemptId,customer_id:binding.customerId,provider_id:binding.providerId,request_id:binding.quote.requestId,quote_id:binding.quote.quoteId}};
}
function charge(){
 return {object:"charge",id:"ch_fixture00001",payment_intent:binding.intentId,livemode:false,currency:"brl",amount:30000,amount_captured:30000,customer:binding.stripeCustomerId,status:"succeeded",paid:true,captured:true,refunded:false,amount_refunded:0,disputed:false,transfer:null};
}
function event(){return {object:"event",id:"evt_fixture00001",livemode:false,type:"payment_intent.succeeded",data:{object:intent()}};}
function signed(e=event(),timestamp=Math.floor(Date.now()/1000)){
 const raw=Buffer.from(JSON.stringify(e));
 const signature=stripe.webhooks.generateTestHeaderString({payload:raw.toString("utf8"),secret,timestamp});
 return [raw,signature];
}
function setup(overrides={}){
 let reads=0;
 const inbox=makeInbox({stripe,webhookSecret:secret,binding,readIntentFixture:async(id)=>{assert.equal(id,binding.intentId);reads++;return intent();},readChargeFixture:async(id)=>{assert.equal(id,"ch_fixture00001");reads++;return charge();},...overrides});
 return {inbox,reads:()=>reads};
}
test("official SDK signature and exact reconciliation never grant real authority",async()=>{
 const {inbox,reads}=setup();const result=await inbox.receive(...signed());
 assert.equal(result.state,"test_evidence_reconciled");assert.equal(reads(),2);
 for(const [k,v] of Object.entries(DENIAL))assert.equal(result[k],v);
});
test("duplicate event does not repeat reads or produce additional effect",async()=>{
 const {inbox,reads}=setup();const args=signed();await inbox.receive(...args);
 assert.equal((await inbox.receive(...args)).duplicate,true);assert.equal(reads(),2);assert.equal(inbox.view().eventCount,1);
 const e=event();e.created=100;await assert.rejects(inbox.receive(...signed(e)),/Replay divergente/);
});
test("signature alteration, expired timestamp and invalid raw body fail closed",async()=>{
 const {inbox,reads}=setup();const [raw,sig]=signed();
 await assert.rejects(inbox.receive(Buffer.concat([raw,Buffer.from(" ")]),sig),/Assinatura/);
 await assert.rejects(inbox.receive(...signed(event(),Math.floor(Date.now()/1000)-600)),/Assinatura/);
 await assert.rejects(inbox.receive(raw.toString(),sig),/Envelope/);assert.equal(reads(),0);
});
test("wrong account, event type, currency, identifiers, amount and recipient rejected",async()=>{
 for(const edit of [
  e=>e.livemode=true,e=>e.account="acct_other",e=>e.type="charge.refunded",
  e=>e.data.object.currency="usd",e=>e.data.object.amount=29999,
  e=>e.data.object.amount_received=0,e=>e.data.object.metadata.provider_id="other",
  e=>e.data.object.customer="cus_other00001",e=>e.data.object.id="pi_other00001",
  e=>e.data.object.transfer_data={destination:"acct_other"},e=>e.data.object.status="processing"
 ]){
  const {inbox,reads}=setup();const e=event();edit(e);await assert.rejects(inbox.receive(...signed(e)));assert.equal(reads(),0);assert.equal(inbox.view().eventCount,0);
 }
});
test("authoritative read must agree; dispute, partial refund and missing capture blocked",async()=>{
 for(const edit of [c=>c.disputed=true,c=>c.amount_refunded=1,c=>c.captured=false,c=>c.amount_captured=29999,c=>c.livemode=true,c=>c.transfer="tr_other",c=>c.payment_intent="pi_other00001"]){
  const {inbox}=setup({readChargeFixture:async()=>{const c=charge();edit(c);return c;}});
  await assert.rejects(inbox.receive(...signed()),/Conciliação/);assert.equal(inbox.view().state,"awaiting_evidence");
 }
 const {inbox}=setup({readIntentFixture:async()=>({...intent(),amount_received:1})});
 await assert.rejects(inbox.receive(...signed()),/Conciliação/);
});
test("transient error is retryable and no receipt is recorded",async()=>{
 let fail=true;const {inbox}=setup({readIntentFixture:async()=>{if(fail)throw Error("fixture unavailable");return intent();}});
 const args=signed();await assert.rejects(inbox.receive(...args),/unavailable/);assert.equal(inbox.view().eventCount,0);fail=false;
 assert.equal((await inbox.receive(...args)).state,"test_evidence_reconciled");
});
test("parallel receipt cannot race; successful retry is duplicate",async()=>{
 let release;const gate=new Promise(r=>release=r);
 const {inbox}=setup({readIntentFixture:async()=>{await gate;return intent();}});
 const args=signed();const pending=inbox.receive(...args);
 await assert.rejects(inbox.receive(...args),/concorrente/);release();await pending;
 assert.equal((await inbox.receive(...args)).duplicate,true);
});
test("no guessed fee, invalid quote or nonfixture secret",()=>{
 assert.throws(()=>setup({binding:{...binding,processingFeeFixtureVerified:false}}),/Tarifa/);
 assert.throws(()=>setup({binding:{...binding,processingFeeCents:-1}}));
 assert.throws(()=>setup({webhookSecret:"not-a-fixture"}),/sintético/);
});
