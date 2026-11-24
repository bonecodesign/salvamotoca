"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const A=require("../admin-supervision-offline.js");
const Desk=require("../f23-founder-incident-desk-offline.js");
const {makeFixture,T,C,P}=require("../scripts/admin-preview-fixtures.js");
const {render}=require("../scripts/render-admin-preview.js");
test("Admin: painel agrega jornadas e prioriza incidentes críticos, sem dinheiro real",()=>{
 const p=A.project(makeFixture());
 assert.deepEqual(p.counts,{sessions:3,paidFixtures:3,pendingIncidents:3,criticalUnacknowledged:1,mockRiskHolds:2,reviewCandidates:1});
 assert.equal(p.incidents[0].kind,"safety_report");
 assert.equal(p.incidents[0].escalationDueMock,true);
 assert.equal(p.operations[0].reviewCandidate,false);
 assert.equal(p.operations[1].reviewCandidate,true);
 assert.equal(p.operations[2].reviewCandidate,false);
 assert.deepEqual(p.totals,{reviewProviderCents:24700,reviewCommissionCents:4600,realAvailableCents:null});
 for(const [k,v] of Object.entries(A.DENIAL))assert.equal(p[k],v);
});
test("Admin: não reconhece papéis externos e não expõe identificadores ou textos privados",()=>{
 for(const role of ["customer","provider","admin",null])assert.equal(A.project({...makeFixture(),role}).access,"denied");
 const fixture=makeFixture(),p=A.project(fixture),json=JSON.stringify(p);
 for(const id of [C,P,...fixture.sessions.flatMap(x=>[x.session.requestId,x.session.quoteId]),...fixture.incidents.map(x=>x.incident.caseId)])assert.ok(!json.includes(id));
 assert.ok(!json.includes("Servico integralmente"));
 assert.equal(p.realDataRetrieved,false);
});
test("Admin: rejeita vínculos, duplicatas, relógio incorreto e campos extras",()=>{
 for(const mutate of [
  x=>x.sessions.push(x.sessions[0]),
  x=>x.incidents.push(x.incidents[0]),
  x=>x.incidents[0].alias="demo-999",
  x=>x.incidents[0].alias=null,
  x=>x.now=T,
  x=>x.sessions[0].email="fixture@example.invalid",
  x=>x.sessions[0].session={...x.sessions[0].session,realPaymentVerified:true}
 ]){
  const x=makeFixture();mutate(x);assert.throws(()=>A.project(x));
 }
});
test("Admin: resolução fictícia não autoriza transferência",()=>{
 const x=makeFixture();
 let c=x.incidents[0].incident;
 c=Desk.applyIncidentFixture(c,{eventId:"fixture_ack",action:"acknowledge",actorRole:"founder_mock",at:T+40000,dutyConfirmedMock:true,channelVerifiedMock:true}).state;
 c=Desk.applyIncidentFixture(c,{eventId:"fixture_review",action:"start_review",actorRole:"founder_mock",at:T+50000}).state;
 c=Desk.applyIncidentFixture(c,{eventId:"fixture_resolve",action:"resolve_review_mock",actorRole:"founder_mock",at:T+60000,reasonCode:"financial_reviewed_mock",evidenceCheckedMock:true}).state;
 x.incidents[0].incident=c;
 const p=A.project(x);
 assert.equal(p.counts.reviewCandidates,2);
 assert.equal(p.transferAuthorized,false);
 assert.equal(p.realFundsHeld,false);
});
test("Admin: prévia HTML independente, somente leitura e sem recursos externos",()=>{
 const h=render(A.project(makeFixture()));
 assert.match(h,/DEMONSTRAÇÃO OFFLINE/);assert.match(h,/RELEASE=NO_GO/);
 assert.match(h,/Content-Security-Policy/);assert.match(h,/Candidata à revisão/);
 assert.doesNotMatch(h,/<script|<form|<button|https?:\/\/|fixture-dispute|11111111-1111/i);
 assert.throws(()=>render(A.project({...makeFixture(),role:"customer"})));
});
