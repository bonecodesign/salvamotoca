import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('SM-DEC-045/046 constam como regras comerciais vigentes',()=>{
 const official=file('docs/PRODUTO_OFICIAL.md');
 const economics=file('docs/fundacao/05_MODELO_ECONOMICO.md');
 const decisions=file('docs/fundacao/08_REGISTRO_DE_DECISOES.md');
 assert.match(official,/SM-DEC-045\s*\/\s*SM-DEC-046/);
 assert.match(official,/materiais.*inclu[ií]dos/i);
 assert.doesNotMatch(official,/15%/);
 assert.match(economics,/10%.*solicitante.*10%.*prestador/);
 assert.match(decisions,/\|\s*SM-DEC-045\s*\|/);
 assert.match(decisions,/\|\s*SM-DEC-046\s*\|/);
});
test('tabela de decisões conserva colunas fechadas em todas as versões',()=>{
 const decisions=file('docs/fundacao/08_REGISTRO_DE_DECISOES.md');
 const entries=decisions.split('\n').filter(x=>x.startsWith('| SM-DEC-'));
 assert.ok(entries.length>=46);
 for(const entry of entries) {
  assert.ok(entry.trimEnd().endsWith('|'),entry.slice(0,70));
  assert.equal(entry.split('|').length,5,'colunas de ID, decisão e estado: '+entry.slice(0,50));
 }
});
test('F2 e F3 aceitam só serviço e deslocamento, sem peça como nova cobrança',()=>{
 const f2=file('f2-flow.js'),f3=file('f3-tow.js');
 const sql2=file('supabase/drafts/f2_backend_candidate.sql');
 assert.match(f2,/parts\.length\s*===\s*0/);
 assert.match(f3,/parts\.length===0/);
 assert.match(sql2,/kind in \('service','travel'\)/);
 assert.doesNotMatch(f3,/kind:"part"/);
});
test('F4 calcula 10% por lado sobre serviço, com subtotal comprador distinto',()=>{
 const f4=file('f4-finance.js');
 const db=file('supabase/drafts/f4_financial_backend_candidate.sql');
 const journal=file('supabase/drafts/f4_double_entry_mock_candidate.sql');
 assert.match(f4,/RIDER_FEE_BPS=1000/);
 assert.match(f4,/PROVIDER_FEE_BPS=1000/);
 assert.match(f4,/VALID_KINDS=Object\.freeze\(\["service","travel"\]\)/);
 assert.match(db,/customer_subtotal_cents=quote_total_cents\+rider_fee_cents/);
 assert.match(db,/expected_provider_cents=quote_total_cents-provider_fee_cents/);
 assert.match(journal,/v_attempt\.customer_subtotal_cents/);
});
test('F5, F6 e F7 nunca são autorizadores reais por recibo offline',()=>{
 const b=file('f456-financial-bridge-offline.js');
 const cfg=file('config.js');
 const d=file('docs/F456_RECONCILIACAO_CONTRATO_10X10.md');
 for(const key of [
  'f1TestRequestsEnabled','f2TestOffersEnabled','f3TowEnabled',
  'f4PaymentsEnabled','f5OperationsEnabled','f6CompletionEnabled'
 ])assert.match(cfg,new RegExp(key+':\\s*false'));
 assert.match(b,/realPaymentVerified:false/);
 assert.match(b,/realTransferExecuted:false/);
 assert.match(b,/transferAuthorized:false/);
 assert.match(d,/PR #47/);
});
