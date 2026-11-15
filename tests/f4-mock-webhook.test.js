"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const W=require("../f4-mock-webhook.js");
const secret="CHAVE_FICTICIA_APENAS_PARA_TESTE_LOCAL_123";
const now=1794700000,attemptId="11111111-1111-4111-8111-111111111111";
function event(id,kind="mock_payment_verified",extras={}){
 return JSON.stringify({id,kind,attemptId,currency:"BRL",amountCents:28000,...extras});
}
const signature=(body,t=now,s=secret)=>W.signMock({body,timestamp:t,secret:s});
const verifier=(body,header,clock=now)=>W.verifyMock({body,header,secret,nowSeconds:clock});
test("F4 assinatura mock: verifica mensagem íntegra e nunca confirma PSP real",()=>{
 const body=event("evt_confirm_mock_1"),header=signature(body);
 const data=verifier(body,header);
 assert.equal(data.amountCents,28000);
 assert.equal(data.providerVerified,false);
 assert.equal(data.canMarkPaid,false);
 assert.equal(data.canDispatch,false);
});
test("F4 assinatura mock: alteração de valor após assinatura é recusada",()=>{
 const body=event("evt_confirm_mock_2");
 assert.throws(()=>verifier(event("evt_confirm_mock_2","mock_payment_verified",
   {amountCents:28001}),signature(body)),/Assinatura mock/);
});
test("F4 assinatura mock: não aceita segredo diferente nem header malformado",()=>{
 const body=event("evt_confirm_mock_3");
 assert.throws(()=>verifier(body,signature(body,now,"OUTRA_CHAVE_FICTICIA_INCOMPATIVEL_123")),/Assinatura/);
 assert.throws(()=>verifier(body,"t=1794700000,v1=errado"),/Assinatura/);
 assert.throws(()=>verifier(body,null),/Assinatura/);
});
test("F4 assinatura mock: timestamp expirado ou futuro é rejeitado",()=>{
 const body=event("evt_confirm_mock_4");
 assert.throws(()=>verifier(body,signature(body,now-301)),/janela temporal/);
 assert.throws(()=>verifier(body,signature(body,now+301)),/janela temporal/);
 assert.doesNotThrow(()=>verifier(body,signature(body,now-300)));
});
test("F4 assinatura mock: formato inválido e corpo grande não são aceitos",()=>{
 const invalid="[]";
 assert.throws(()=>verifier(invalid,signature(invalid)),/Envelope inválido/);
 const tooLong="a".repeat(17000);
 assert.throws(()=>signature(tooLong),/muito grande/);
 const broken="{";
 assert.throws(()=>verifier(broken,signature(broken)),/Corpo mock não é JSON/);
});
test("F4 assinatura mock: não aceita moeda USD ou valor fracionado",()=>{
 for(const extra of [{currency:"USD"},{amountCents:28.55},{amountCents:-1}]){
  const body=event("evt_bad_mock_01","mock_payment_verified",extra);
  assert.throws(()=>verifier(body,signature(body)),/Valor ou moeda/);
 }
});
test("F4 inbox mock: replay idêntico retorna duplicate sem dupla entrada",()=>{
 const inbox=W.createOfflineMockInbox({secret,expectedAmountCents:28000,attemptId,nowSeconds:now});
 const body=event("evt_confirm_mock_5"),h=signature(body);
 assert.equal(inbox.receive(body,h).status,"mock_verified");
 assert.equal(inbox.receive(body,h).result,"duplicate");
 assert.equal(inbox.state().eventCount,1);
 assert.equal(inbox.state().canMarkPaid,false);
});
test("F4 inbox mock: event ID reaproveitado com outro tipo é rejeitado",()=>{
 const inbox=W.createOfflineMockInbox({secret,expectedAmountCents:28000,attemptId,nowSeconds:now});
 const body=event("evt_confirm_mock_6");
 inbox.receive(body,signature(body));
 const forged=event("evt_confirm_mock_6","mock_refund_confirmed");
 assert.throws(()=>inbox.receive(forged,signature(forged)),/Reutilização divergente/);
});
test("F4 inbox mock: estorno antes do pagamento e segundo pagamento são bloqueados",()=>{
 const inbox=W.createOfflineMockInbox({secret,expectedAmountCents:28000,attemptId,nowSeconds:now});
 let body=event("evt_refund_early","mock_refund_confirmed");
 assert.throws(()=>inbox.receive(body,signature(body)),/Estorno de teste fora de ordem/);
 body=event("evt_confirm_mock_7");
 inbox.receive(body,signature(body));
 body=event("evt_double_payment");
 assert.throws(()=>inbox.receive(body,signature(body)),/Pagamento de teste fora de ordem/);
});
test("F4 inbox mock: estorno compensatório e recibo replay não habilitam transferências",()=>{
 const inbox=W.createOfflineMockInbox({secret,expectedAmountCents:28000,attemptId,nowSeconds:now});
 let body=event("evt_confirm_mock_8");
 inbox.receive(body,signature(body));
 body=event("evt_refund_mock_8","mock_refund_confirmed");
 assert.equal(inbox.receive(body,signature(body)).status,"mock_refunded");
 assert.equal(inbox.receive(body,signature(body)).result,"duplicate");
 assert.equal(inbox.state().eventCount,2);
 assert.equal(inbox.state().canTransfer,false);
});
test("F4 inbox mock: disputa exige evento anterior e bloqueia estorno automático",()=>{
 const inbox=W.createOfflineMockInbox({secret,expectedAmountCents:28000,attemptId,nowSeconds:now});
 let body=event("evt_dispute_before","mock_dispute_opened");
 assert.throws(()=>inbox.receive(body,signature(body)),/Disputa de teste fora de ordem/);
 body=event("evt_confirm_mock_9");
 inbox.receive(body,signature(body));
 body=event("evt_dispute_late","mock_dispute_opened");
 assert.equal(inbox.receive(body,signature(body)).status,"mock_disputed");
 body=event("evt_refund_after_dispute","mock_refund_confirmed");
 assert.throws(()=>inbox.receive(body,signature(body)),/Estorno de teste fora de ordem/);
});
test("F4 inbox mock: tentativa errada e valor alterado são rejeitados mesmo assinados",()=>{
 const inbox=W.createOfflineMockInbox({secret,expectedAmountCents:28000,attemptId,nowSeconds:now});
 for(const patch of [{attemptId:"22222222-2222-4222-8222-222222222222"},
                     {amountCents:28001}]){
  const body=event("evt_wrong_mock_01","mock_payment_verified",patch);
  assert.throws(()=>inbox.receive(body,signature(body)),/não corresponde/);
 }
 assert.equal(inbox.state().eventCount,0);
});
