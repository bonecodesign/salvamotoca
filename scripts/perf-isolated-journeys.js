"use strict";
// Only a test harness, never a server for the actual app.
// Loopback HTTP, fixed synthetic requests, no auth, DB, PSP or external traffic.
const http=require("node:http"),assert=require("node:assert/strict");
const {performance}=require("node:perf_hooks");
const Routing=require("../f23-routing-bridge-offline.js");
const F2=require("../f2-flow.js"),F3=require("../f3-tow.js"),F4=require("../f4-finance.js");
const B=require("../f456-financial-bridge-offline.js");
const Desk=require("../f23-founder-incident-desk-offline.js");
const Admin=require("../admin-supervision-offline.js");
const T=Date.parse("2026-11-22T05:30:00Z");
const id=n=>"11111111-1111-4111-8111-"+String(n).padStart(12,"0");
const C=id(1),P=id(2);
const coord={lat:-19.924,lng:-43.938};
function catalog(count){
 return Array.from({length:count},(_,i)=>({
  id:i===0?P:id(10000+i),name:"Fixture",label:"Fixture",
  city:["Belo Horizonte","Contagem","Betim"][i%3],stateCode:"MG",
  location:{lat:coord.lat+0.0001+i*0.0004,lng:coord.lng},
  approved:true,active:true,deliveryEnabled:true,serviceActive:true,towServiceActive:true,
  onlineRequested:i%7!==6,lastSeenAt:T-1000,
  coverageKm:60,serviceTypes:["pneu_furado","troca_camara"],
  otherServiceTypes:["troca_camara"],rejectionCount:0,refusals:0,
  capacity:{equipment:"plataforma",maxMotoKg:220,coverageKm:60,tieDownPoints:4,hasRamp:true,hasWheelChock:true,verifiedByAdmin:true}
 }));
}
function journey(n,providers){
 const tow=n%2===0;
 const requestId=id(100000+n),quoteId=id(200000+n);
 const serviceTypes=tow?["reboque_moto","troca_camara"]:["pneu_furado","troca_camara"];
 const request={requestId,categoryCode:tow?"reboque_moto":"borracharia_delivery",serviceTypes,
  status:"requested",mode:"automatic",city:"Betim",stateCode:"MG",location:coord,
  motorcycleBrand:"Honda",motorcycleModel:"CG 160",motorcycleYear:2024,motorcycleWeightKg:140,
  pickupCity:"Betim",pickupStateCode:"MG",pickupLocation:coord,destinationCity:"Nova Lima",destinationStateCode:"MG",
  destinationAddress:"DESTINO SINTETICO",estimatedRouteKm:25};
 const plan=Routing.planNextInvitation({request,providers,now:T});
 assert.equal(plan.status,"invite_mock");assert.equal(plan.providerId,P);
 assert.equal(plan.notificationSent,false);
 const prices=tow?{reboque_moto:20000,troca_camara:3000}:{pneu_furado:8000,troca_camara:15000};
 const items=tow?F3.quoteTow({serviceTypes,serviceCents:prices,travelCents:4000}).rows:
  F2.quoteBreakdown({serviceTypes,services:Object.entries(prices).map(([code,amountCents])=>({code,amountCents})),travelCents:4000}).rows.map(x=>({kind:x.type,code:x.code,amountCents:x.amountCents}));
 let s=B.make({quote:F4.quoteSnapshot({requestId,quoteId,items}),customerId:C,providerId:P,createdAt:T});
 assert.equal(s.amounts.customerSubtotalBeforeProcessingCents,29300);
 assert.equal(s.amounts.providerReceivableCents,24700);
 s=B.mockPayment(s,{kind:"mock_payment_confirmed",id:"perf_payment_"+n,actorId:"offline_fixture",fixtureReceipt:B.MOCK_RECEIPT,requestId,quoteId,currency:"BRL",amountCents:29300,providerReceivableCents:24700,at:T+1000});
 function op(kind,dt,extra={}){s=B.operational(s,{kind,id:"perf_"+kind+"_"+n,actorId:P,at:T+dt,...extra}).state;}
 function end(kind,dt,extra={}){s=B.completion(s,{kind,id:"perf_"+kind+"_"+n,actorId:P,at:T+dt,...extra}).state;}
 op("dispatch",2000,{shareLocationConsent:true});
 op("provider_arrived",3000);op("service_started",4000);op("handoff_f6",5000);
 end("submit_summary",6000,{text:"Servico integralmente sintetico para teste de carga."});
 end("provider_confirm",7000);end("customer_confirm",8000,{actorId:C,summaryRead:true});
 for(const k of Object.keys(B.REAL_DENIAL))assert.equal(s[k],false);
 assert.equal(B.settlementReview(s).mockHumanReviewCandidate,true);
 assert.equal(B.settlementReview(s).transferAuthorized,false);
 return s;
}
function stats(values){
 const sorted=[...values].sort((a,b)=>a-b);
 const q=p=>Number(sorted[Math.ceil(p*sorted.length)-1].toFixed(2));
 return {minMs:q(1/sorted.length),p50Ms:q(.5),p95Ms:q(.95),p99Ms:q(.99),maxMs:q(1)};
}
async function burst(count,providerCount){
 const providers=catalog(providerCount),received=new Set(),serviceTimes=[];
 const server=http.createServer((req,res)=>{
  if(req.method!=="GET"||!/^\/fixture\/[0-9]+$/.test(req.url||"")){res.writeHead(404).end();return;}
  const n=Number(req.url.split("/").pop());
  if(!Number.isInteger(n)||n<1||n>count||received.has(n)){res.writeHead(400).end();return;}
  const start=performance.now();
  try{
   const s=journey(n,providers);received.add(n);
   serviceTimes.push(performance.now()-start);
   res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});
   res.end(JSON.stringify({fixture:n,mockOnly:true,review:B.settlementReview(s).mockHumanReviewCandidate,transfer:false}));
  }catch(_err){res.writeHead(500).end();}
 });
 const agent=new http.Agent({keepAlive:false,maxSockets:count});
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
 const port=server.address().port;
 const start=performance.now(),rssBefore=process.memoryUsage().rss;
 let maxRss=rssBefore;
 const sampler=setInterval(()=>{maxRss=Math.max(maxRss,process.memoryUsage().rss)},10);
 try{
  const results=await Promise.all(Array.from({length:count},(_,i)=>new Promise((resolve,reject)=>{
   const began=performance.now();
   const req=http.get({host:"127.0.0.1",port,path:"/fixture/"+(i+1),agent,timeout:30000},res=>{
    let raw="";res.setEncoding("utf8");res.on("data",chunk=>raw+=chunk);res.on("error",reject);
    res.on("end",()=>{try{
     assert.equal(res.statusCode,200);assert.deepEqual(JSON.parse(raw),{fixture:i+1,mockOnly:true,review:true,transfer:false});
     resolve(performance.now()-began);
    }catch(e){reject(e)}});
   });req.on("timeout",()=>req.destroy(new Error("Fixture timeout")));req.on("error",reject);
  })));
  assert.equal(received.size,count);assert.equal(serviceTimes.length,count);
  const elapsed=performance.now()-start;
  maxRss=Math.max(maxRss,process.memoryUsage().rss);
  return {concurrentClients:count,catalogProviders:providerCount,successful:received.size,failed:0,
   elapsedMs:Number(elapsed.toFixed(2)),throughputPerSecond:Number((count*1000/elapsed).toFixed(2)),
   clientLatency:stats(results),domainLatency:stats(serviceTimes),sampledPeakRssMiB:Number((maxRss/1048576).toFixed(1))};
 }finally{clearInterval(sampler);agent.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
function adminVolume(count){
 const providers=catalog(1);
 const sessions=[],incidents=[];
 for(let i=0;i<count;i++){
  const alias="demo-"+String(i).padStart(3,"0");
  sessions.push({alias,session:journey(i+1,providers)});
  const kind=i%3===0?"safety_report":i%3===1?"payment_dispute":"general_question";
  incidents.push({alias,incident:Desk.createIncidentFixture({caseId:"perf_case_"+i,kind,linkedToRequestMock:true,openedAt:T+10000})});
 }
 const times=[];
 let p;
 for(let i=0;i<5;i++){
  const start=performance.now();p=Admin.project({role:"founder_mock",now:T+360000,sessions,incidents});times.push(performance.now()-start);
  assert.equal(p.counts.sessions,count);assert.equal(p.counts.pendingIncidents,count);
  assert.equal(p.counts.criticalUnacknowledged,Math.ceil(count/3));
  assert.equal(p.counts.reviewCandidates,Math.floor(count/3));
  assert.equal(p.counts.mockRiskHolds,count-Math.floor(count/3));
  assert.equal(p.totals.reviewProviderCents,Math.floor(count/3)*24700);
  assert.equal(p.totals.reviewCommissionCents,Math.floor(count/3)*4600);
  assert.equal(p.transferAuthorized,false);assert.equal(p.totals.realAvailableCents,null);
 }
 assert.throws(()=>Admin.project({role:"founder_mock",now:T+360000,sessions:[...sessions,sessions[0]],incidents}),/duplicado|Limite/);
 if(count===1000)assert.throws(()=>Admin.project({role:"founder_mock",now:T+360000,sessions,incidents:[...incidents,incidents[0]]}),/Limite/);
 return {sessions:count,incidents:count,passes:5,projection:stats(times),blockedReview:p.counts.mockRiskHolds,candidates:p.counts.reviewCandidates};
}
async function main(){
 const result={scope:"SYNTHETIC_LOOPBACK_NODE_ONLY",node:process.version,platform:process.platform,arch:process.arch,realOperations:0,
  bursts:[await burst(100,1000),await burst(300,1000)],
  admin:[adminVolume(100),adminVolume(300),adminVolume(1000)],release:"NO_GO"};
 console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error("FAIL:",e.message);process.exitCode=1;});
