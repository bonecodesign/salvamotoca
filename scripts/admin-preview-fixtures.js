"use strict";
const F4=require("../f4-finance.js");
const B=require("../f456-financial-bridge-offline.js");
const Desk=require("../f23-founder-incident-desk-offline.js");
const Admin=require("../admin-supervision-offline.js");
const T=Date.parse("2026-11-22T05:30:00Z");
const uuid=n=>"11111111-1111-4111-8111-"+String(n).padStart(12,"0");
const C=uuid(1),P=uuid(2);
function session(n,complete){
 const requestId=uuid(100+n),quoteId=uuid(200+n);
 const quote=F4.quoteSnapshot({requestId,quoteId,items:[
  {kind:"service",code:"pneu_furado",amountCents:23000},
  {kind:"travel",code:"deslocamento",amountCents:4000}]});
 let s=B.make({quote,customerId:C,providerId:P,createdAt:T});
 s=B.mockPayment(s,{kind:"mock_payment_confirmed",id:"fixture_paid_"+n,actorId:"offline_fixture",
  fixtureReceipt:B.MOCK_RECEIPT,requestId,quoteId,currency:"BRL",amountCents:29300,providerReceivableCents:24700,at:T+1000});
 function op(kind,dt,extra={}){s=B.operational(s,{kind,id:"fixture_"+kind+"_"+n,actorId:P,at:T+dt,...extra}).state;}
 function end(kind,dt,extra={}){s=B.completion(s,{kind,id:"fixture_"+kind+"_"+n,actorId:P,at:T+dt,...extra}).state;}
 op("dispatch",2000,{shareLocationConsent:true});
 if(complete){
  op("provider_arrived",3000);op("service_started",4000);op("handoff_f6",5000);
  end("submit_summary",6000,{text:"Servico integralmente sintetico para demonstracao."});
  end("provider_confirm",7000);end("customer_confirm",8000,{actorId:C,summaryRead:true});
 }
 return s;
}
function makeFixture(){
 const sessions=[{alias:"demo-001",session:session(1,true)},{alias:"demo-002",session:session(2,true)},{alias:"demo-003",session:session(3,false)}];
 const incidents=[
  {alias:"demo-001",incident:Desk.createIncidentFixture({caseId:"fixture-dispute",kind:"payment_dispute",linkedToRequestMock:true,openedAt:T+10000})},
  {alias:"demo-003",incident:Desk.createIncidentFixture({caseId:"fixture-safety",kind:"safety_report",linkedToRequestMock:true,openedAt:T+20000})},
  {alias:null,incident:Desk.createIncidentFixture({caseId:"fixture-general",kind:"general_question",openedAt:T+30000})}
 ];
 return {role:"founder_mock",now:T+360000,sessions,incidents};
}
module.exports={makeFixture,T,C,P};
if(require.main===module)process.stdout.write(JSON.stringify(Admin.project(makeFixture()),null,2)+"\n");
