"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {execFile}=require("node:child_process"),{promisify}=require("node:util");
const {randomUUID}=require("node:crypto");
const Stripe=require("stripe");
const {makeInbox,makeRiskInbox}=require("../f4-stripe-test-reconciliation");
const exec=promisify(execFile);
const db={PATH:process.env.PATH,PGHOST:"127.0.0.1",PGPORT:"5432",PGDATABASE:"f4_stripe_disposable",PGUSER:"postgres",PGPASSWORD:"postgres",PGCONNECT_TIMEOUT:"5",PGOPTIONS:"-c statement_timeout=8000 -c lock_timeout=5000"};
assert.equal(process.env.GITHUB_ACTIONS,"true");
assert.equal(process.env.SM_STRIPE_DURABLE_FIXTURE,"yes");
async function sql(q){const r=await exec("psql",["-X","-Atq","-v","ON_ERROR_STOP=1","-c",q],{env:db,timeout:12000});return r.stdout.trim();}
const lit=s=>"convert_from(decode('"+Buffer.from(String(s)).toString("hex")+"','hex'),'UTF8')";
test("durable Stripe evidence: restart, concurrent retry, distinct event, immutable rows and no money",{timeout:60000},async()=>{
 assert.equal(await sql("select current_database()='f4_stripe_disposable' and current_user='postgres'"),"t");
 const a=JSON.parse(await sql("select row_to_json(a) from private.f4_mock_payment_attempts a"));
 const binding={attemptId:a.id,customerId:a.customer_id,providerId:a.provider_id,intentId:"pi_fixture00001",stripeCustomerId:"cus_fixture00001",quote:{requestId:a.request_id,quoteId:a.quote_id,items:[{kind:"service",code:"pneu_furado",amountCents:23000},{kind:"travel",code:"deslocamento",amountCents:4000}]},processingFeeCents:700,processingFeeFixtureVerified:true};
 await sql("insert into private.f4_stripe_fixture_bindings(attempt_id,intent_id,stripe_customer_id,fee_fixture_cents) values("+lit(a.id)+"::uuid,'pi_fixture00001','cus_fixture00001',700)");
 const stripe=new Stripe("sk_test_fixture_not_a_real_key",{httpClient:{getClientName:()=>"deny-network",makeRequest(){throw Error("Network disabled");}}});
 const secret="whsec_fixture_"+"s".repeat(48);
 const pi={object:"payment_intent",id:binding.intentId,livemode:false,currency:"brl",amount:30000,amount_received:30000,customer:binding.stripeCustomerId,transfer_group:"sm_"+a.id,transfer_data:null,on_behalf_of:null,application_fee_amount:null,status:"succeeded",latest_charge:"ch_fixture00001",metadata:{project:"salvamotoca",attempt_id:a.id,customer_id:a.customer_id,provider_id:a.provider_id,request_id:a.request_id,quote_id:a.quote_id}};
 const ch={object:"charge",id:pi.latest_charge,payment_intent:pi.id,livemode:false,currency:"brl",amount:30000,amount_captured:30000,customer:pi.customer,status:"succeeded",paid:true,captured:true,refunded:false,amount_refunded:0,disputed:false,transfer:null};
 function statement(e){return "select private.f4_stripe_store_fixture("+[lit(e.attemptId)+"::uuid",lit(e.eventId),lit(e.bodySha256),lit(e.intentId),lit(e.chargeId),lit(e.requestId)+"::uuid",lit(e.quoteId)+"::uuid",lit(e.customerId)+"::uuid",lit(e.providerId)+"::uuid",lit(e.stripeCustomerId),Number(e.totalCents)].join(",")+")";}
 async function store(e){return JSON.parse(await sql("set app.f4_test_only='local_fixture';"+statement(e)));}
 let disputed=false,readCount=0;
 const inbox=()=>makeInbox({stripe,webhookSecret:secret,binding,readIntentFixture:async()=>pi,readChargeFixture:async()=>{readCount++;return {...ch,disputed};},storeEvidenceFixture:store});
 function signed(id="evt_fixture00001",extra={}){
  const raw=Buffer.from(JSON.stringify({object:"event",id,livemode:false,type:"payment_intent.succeeded",data:{object:pi},...extra}));
  return [raw,stripe.webhooks.generateTestHeaderString({payload:raw.toString("utf8"),secret})];
 }
 const same=signed();
 const two=await Promise.all([inbox().receive(...same),inbox().receive(...same)]);
 assert.equal(two.filter(x=>!x.duplicate).length,1);
 assert.equal(two.filter(x=>x.duplicate).length,1);
 assert.equal((await inbox().receive(...same)).duplicate,true);
 assert.equal(readCount,3);
 await assert.rejects(inbox().receive(...signed("evt_fixture00001",{created:100})),/Replay Stripe fixture divergente/);
 const another=await inbox().receive(...signed("evt_fixture00002"));assert.equal(another.duplicate,false);assert.equal(another.evidenceAlreadyExists,true);
 disputed=true;await assert.rejects(inbox().receive(...same),/Conciliação/);disputed=false;
 assert.equal(await sql("select count(*) from private.f4_stripe_fixture_receipts"),"2");
 assert.equal(await sql("select count(*) from private.f4_stripe_fixture_evidence"),"1");
 assert.equal(await sql("select total_cents from private.f4_stripe_fixture_evidence"),"30000");
 await assert.rejects(sql("update private.f4_stripe_fixture_evidence set total_cents=30001"),/imutavel/);
 await assert.rejects(sql("delete from private.f4_stripe_fixture_receipts"),/imutavel/);
 assert.equal(await sql("select has_table_privilege('authenticated','private.f4_stripe_fixture_receipts','SELECT') or has_table_privilege('anon','private.f4_stripe_fixture_evidence','INSERT') or has_function_privilege('authenticated','private.f4_stripe_store_fixture(uuid,text,text,text,text,uuid,uuid,uuid,uuid,text,integer)','EXECUTE')"),"f");
 assert.equal(await sql("select status from private.f4_mock_payment_attempts"),"mock_prepared");
 assert.equal(await sql("select status from public.service_requests"),"awaiting_payment");
 assert.equal(await sql("select count(*) from private.f4_mock_ledger_entries"),"0");

 // Reconcile signed risk events using independent fixtures. Cumulative refund
 // is a maximum, never a sum of repeated snapshots.
 let refunded=1000,disputeAmount=23000;
 const dp={object:"dispute",id:"dp_fixture00001",charge:ch.id,payment_intent:pi.id,livemode:false,currency:"brl",amount:23000};
 const nullable=v=>v===null?"null":lit(v);
 const storeRisk=async(e)=>JSON.parse(await sql("set app.f4_test_only='local_fixture';select private.f4_stripe_store_risk_fixture("+[
  lit(e.attemptId)+"::uuid",lit(e.eventId),lit(e.bodySha256),lit(e.intentId),lit(e.requestId)+"::uuid",lit(e.quoteId)+"::uuid",
  lit(e.customerId)+"::uuid",lit(e.providerId)+"::uuid",lit(e.stripeCustomerId),Number(e.totalCents),lit(e.kind),nullable(e.chargeId),nullable(e.disputeId),Number(e.observedCents)].join(",")+")"));
 const risk=()=>makeRiskInbox({stripe,webhookSecret:secret,binding,readIntentFixture:async()=>pi,
  readChargeFixture:async()=>({...ch,amount_refunded:refunded,refunded:refunded===ch.amount,disputed:true}),
  readDisputeFixture:async()=>({...dp,amount:disputeAmount}),storeRiskFixture:storeRisk});
 function riskSigned(id,type,obj){
  const raw=Buffer.from(JSON.stringify({object:"event",id,livemode:false,type,data:{object:obj}}));
  return [raw,stripe.webhooks.generateTestHeaderString({payload:raw.toString("utf8"),secret})];
 }
 const refund=riskSigned("evt_refund00001","charge.refunded",{...ch,amount_refunded:1000});
 await assert.rejects(risk().receive(...riskSigned("evt_fixture00001","charge.refunded",{...ch,amount_refunded:1000})),/Replay Stripe fixture divergente/);
 const concurrent=await Promise.all([risk().receive(...refund),risk().receive(...refund)]);
 assert.equal(concurrent.filter(r=>r.duplicate).length,1);
 assert.ok(concurrent.every(r=>r.held&&!r.transferAuthorized&&!r.refundAuthorized));
 refunded=2500;
 await risk().receive(...riskSigned("evt_refund00002","charge.refunded",{...ch,amount_refunded:2500}));
 await risk().receive(...riskSigned("evt_refund00003","charge.refunded",{...ch,amount_refunded:500}));
 await assert.rejects(risk().receive(...riskSigned("evt_refund00004","charge.refunded",{...ch,amount_refunded:2600})),/Estorno/);
 await assert.rejects(risk().receive(...riskSigned("evt_refund00001","charge.refunded",{...ch,amount_refunded:1})),/Replay Stripe fixture divergente/);
 const dispute=riskSigned("evt_dispute00001","charge.dispute.created",dp);
 disputeAmount=100;await assert.rejects(risk().receive(...dispute),/Contestação não conciliada/);
 disputeAmount=23000;await risk().receive(...dispute);
 assert.equal((await risk().receive(...dispute)).duplicate,true);
 // Cancellation is accepted only after an independently observed cancellation,
 // and cannot coexist with captured evidence for the same attempt.
 await assert.rejects(risk().receive(...riskSigned("evt_cancel00001","payment_intent.canceled",{...pi,status:"canceled",amount_received:0})),/Cancelamento/);
 await assert.rejects(inbox().receive(...signed("evt_fixture00005")),/Risco Stripe fixture retido/);
 const review=JSON.parse(await sql("select private.f4_stripe_fixture_review()"));
 assert.deepEqual(review,{mockOnly:true,transferAuthorized:false,refundAuthorized:false,heldAttempts:1,observedRefundCents:2500,disputedAttempts:1,canceledAttempts:0,evidenceWithoutHold:0});
 assert.equal(await sql("select count(*) from private.f4_stripe_fixture_risk"),"4");
 assert.equal(await sql("select has_table_privilege('authenticated','private.f4_stripe_fixture_risk','SELECT') or has_function_privilege('authenticated','private.f4_stripe_fixture_review()','EXECUTE')"),"f");
 await assert.rejects(sql("delete from private.f4_stripe_fixture_risk"),/imutavel/);
 assert.equal(await sql("select status from private.f4_mock_payment_attempts"),"mock_prepared");
 assert.equal(await sql("select count(*) from private.f4_mock_ledger_entries"),"0");
 console.log("STRIPE_RISK_FIXTURE=PASS REFUND_MAX=2500 DISPUTE_HELD=PASS LATE_SUCCESS_DENIED=PASS CROSS_TYPE_REPLAY_DENIED=PASS");
 await sql("update private.f4_release_gate set enabled=false");
 await assert.rejects(inbox().receive(...signed("evt_fixture00003")),/indisponivel/);
 console.log("STRIPE_DURABLE_FIXTURE=PASS RECEIPTS=2 EVIDENCE=1 CONCURRENT_DUPLICATE=PASS FRESH_INSTANCE=PASS REAL_PAYMENT=NONE RELEASE=NO_GO");
});
