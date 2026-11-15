"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const F=require("../f6-offline-completion.js");
const C="11111111-1111-4111-8111-111111111111";
const P="22222222-2222-4222-8222-222222222222";
const X="55555555-5555-4555-8555-555555555555";
const R="33333333-3333-4333-8333-333333333333";
const make=()=>F.startOfflineCompletion({
 requestId:R,customerId:C,providerId:P,handoff:F.HANDOFF,createdAt:1000});
const apply=(s,e)=>F.applyOffline(s,e).state;
const summary=(s,more={})=>apply(s,{kind:"submit_summary",id:"evt_summary_001",
 actorId:P,at:2000,text:"Conserto do pneu realizado e conferencia de pressao efetuada.",...more});
const pc=s=>apply(s,{kind:"provider_confirm",id:"evt_provider_01",actorId:P,at:2100});
const cc=(s,more={})=>apply(s,{kind:"customer_confirm",id:"evt_customer_01",
 actorId:C,at:2200,summaryRead:true,...more});
const finished=()=>cc(pc(summary(make())));
test("F6: exige handoff estritamente ficticio; nunca libera pagamento real",()=>{
 const s=make();assert.equal(s.status,"awaiting_summary");
 assert.equal(s.realCompletionAuthorized,false);
 assert.equal(s.realPayoutAuthorized,false);
 assert.equal(s.paymentVerifiedByPSP,false);
 assert.throws(()=>F.startOfflineCompletion({requestId:R,customerId:C,
  providerId:P,handoff:"payment_verified",createdAt:1000}),/fixture offline/);
 assert.equal(F.settlementCandidate(s).authorized,false);
});
test("F6: somente prestador pode apresentar resumo de pelo menos 15 caracteres",()=>{
 assert.throws(()=>summary(make(),{actorId:C}),/Somente prestador/);
 assert.throws(()=>summary(make(),{text:"Sem detalhes"}),/Resumo obrigatorio/);
 const s=summary(make());assert.equal(s.status,"awaiting_both");
 assert.equal(s.deadline,302000);
 assert.match(F.viewFor(s,C).summary.text,/Conserto/);
});
test("F6: foto é opcional, apenas rótulo sintético e nunca URL real",()=>{
 const s=summary(make(),{photoTag:F.PHOTO_TAG});
 assert.equal(s.summary.optionalSyntheticPhoto,true);
 assert.throws(()=>summary(make(),{photoTag:"https://private/file.jpeg"}),/Foto real/);
 assert.equal(summary(make()).summary.optionalSyntheticPhoto,false);
});
test("F6: dupla confirmacao obrigatoria sem repasse",()=>{
 const s=summary(make());
 const p=pc(s);assert.equal(p.status,"awaiting_both");
 assert.equal(p.providerConfirmed,true);assert.equal(p.customerConfirmed,false);
 const c=cc(p);assert.equal(c.status,"completed");
 assert.equal(c.providerConfirmed,true);assert.equal(c.customerConfirmed,true);
 assert.equal(F.settlementCandidate(c).transferExecuted,false);
 assert.equal(c.realPayoutAuthorized,false);
});
test("F6: cliente pode confirmar primeiro mas nao encerra sozinho",()=>{
 const c=cc(summary(make()));
 assert.equal(c.status,"awaiting_both");
 assert.equal(c.customerConfirmed,true);
 assert.equal(pc(c).status,"completed");
});
test("F6: antes de resumo ninguem confirma",()=>{
 assert.throws(()=>pc(make()),/Confirmacao/);
 assert.throws(()=>cc(make()),/Confirmacao/);
});
test("F6: confirmacao do cliente exige ter lido resumo",()=>{
 assert.throws(()=>cc(summary(make()),{summaryRead:false}),/visualizar/);
});
test("F6: confirmacao em 5min exatos passa e 1ms depois falha",()=>{
 const s=pc(summary(make()));
 assert.equal(cc(s,{at:302000}).status,"completed");
 assert.throws(()=>cc(s,{at:302001}),/5 minutos/);
});
test("F6: vencimento sem confirmacao encaminha suporte, nao autoriza concluir",()=>{
 const s=pc(summary(make()));
 const x=apply(s,{kind:"expire_customer_window",id:"evt_expire_001",
  actorId:"offline_clock",at:302001});
 assert.equal(x.status,"support_review");
 assert.equal(x.customerConfirmed,false);
 assert.equal(F.settlementCandidate(x).authorized,false);
 assert.throws(()=>cc(x,{at:302002}),/indisponivel/);
});
test("F6: nao vence antes do prazo nem apos confirmacao do motociclista",()=>{
 const s=summary(make());
 assert.throws(()=>apply(s,{kind:"expire_customer_window",id:"evt_expire_001",
  actorId:"offline_clock",at:302000}),/Prazo/);
 assert.throws(()=>apply(cc(s),{kind:"expire_customer_window",id:"evt_expire_001",
  actorId:"offline_clock",at:302001}),/Prazo/);
});
test("F6: contestacao gera suporte sem finalizar, inclusive antes do resumo",()=>{
 const s=apply(make(),{kind:"request_support",id:"evt_support_01",
  actorId:C,at:1500,reason:"Prestador nao compareceu."});
 assert.equal(s.status,"support_review");
 assert.equal(s.customerConfirmed,false);
 assert.throws(()=>summary(s),/Somente prestador/);
 assert.equal(F.viewFor(s,P).supportMessages.length,1);
});
test("F6: apoio por mensagem somente a participantes em divergencia",()=>{
 const s=apply(summary(make()),{kind:"request_support",id:"evt_support_01",
  actorId:P,at:2300,reason:"Cliente contesta resultado."});
 const t=apply(s,{kind:"support_message",id:"evt_support_02",
  actorId:C,at:2400,text:"Solicito verificacao por suporte."});
 assert.equal(F.viewFor(t,P).supportMessages.length,2);
 assert.throws(()=>apply(s,{kind:"support_message",id:"evt_support_03",
  actorId:X,at:2400,text:"Invasor"}),/indisponivel/);
});
test("F6: cliente avalia apenas depois de duas confirmacoes",()=>{
 assert.throws(()=>apply(summary(make()),{kind:"rate_provider",id:"evt_rating_001",
  actorId:C,at:4000,stars:5}),/Avaliacao/);
 const s=finished();
 const r=apply(s,{kind:"rate_provider",id:"evt_rating_001",
  actorId:C,at:4100,stars:5,comment:"Atendimento de teste"});
 assert.equal(r.rating.stars,5);assert.equal(r.status,"completed");
 assert.equal(r.realReviewPublished,false);
});
test("F6: nota de 1 a 5, unica, sem fraude de prestador",()=>{
 const s=finished();
 const e={kind:"rate_provider",id:"evt_rating_001",actorId:C,at:4100,stars:5};
 assert.throws(()=>apply(s,{...e,stars:0}),/Nota/);
 assert.throws(()=>apply(s,{...e,stars:6}),/Nota/);
 assert.throws(()=>apply(s,{...e,stars:4.5}),/Nota/);
 assert.throws(()=>apply(s,{...e,actorId:P}),/Avaliacao/);
 assert.throws(()=>apply(s,{...e,comment:"x".repeat(301)}),/Comentario/);
 const once=apply(s,e);
 assert.throws(()=>apply(once,{...e,id:"evt_rating_002"}),/Avaliacao/);
});
test("F6: idempotencia de evento nao cria nova confirmacao",()=>{
 const s=summary(make());
 const e={kind:"provider_confirm",id:"evt_provider_01",actorId:P,at:2100};
 const first=F.applyOffline(s,e);const again=F.applyOffline(first.state,e);
 assert.equal(again.duplicate,true);
 assert.equal(again.state.version,first.state.version);
 assert.equal(again.state.providerConfirmed,true);
});
test("F6: mesmo event ID com conteudo diferente e recusado",()=>{
 const s=summary(make());
 const e={kind:"provider_confirm",id:"evt_provider_01",actorId:P,at:2100};
 assert.throws(()=>apply(apply(s,e),{...e,at:2110}),/reutilizado/);
});
test("F6: terceiro nao visualiza detalhes da conclusao nem pontuacao",()=>{
 const view=F.viewFor(finished(),X);
 assert.deepEqual(view,{access:"denied",mockOnly:true});
});
test("F6: nao aceita dados financeiros, URLs assinadas ou evento desconhecido",()=>{
 const s=summary(make());
 assert.throws(()=>apply(s,{kind:"customer_confirm",id:"evt_customer_01",
  actorId:C,at:2100,summaryRead:true,paymentStatus:"paid"}),/financeiros/);
 assert.throws(()=>apply(s,{kind:"customer_confirm",id:"evt_customer_01",
  actorId:C,at:2100,summaryRead:true,signedUrl:"secret"}),/financeiros/);
 assert.throws(()=>apply(s,{kind:"transfer",id:"evt_transf_01",
  actorId:P,at:2100}),/desconhecido/);
});
test("F6: nenhum timeout aprova pagamento ou confirma por silencio",()=>{
 const s=apply(summary(make()),{kind:"expire_customer_window",
  id:"evt_expire_001",actorId:"offline_clock",at:302001});
 assert.equal(s.status,"support_review");
 assert.equal(s.realCompletionAuthorized,false);
 assert.equal(s.customerConfirmed,false);
 assert.equal(s.realPayoutAuthorized,false);
});
test("F6: eventos anteriores ao handoff nao sao aceitos",()=>{
 assert.throws(()=>apply(make(),{kind:"request_support",id:"evt_support_01",
  actorId:C,at:999,reason:"Atendimento atrasou"}),/anterior/);
});
