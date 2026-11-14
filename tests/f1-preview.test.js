const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const F1 = require('../request-f1.js');
const html = fs.readFileSync(path.join(__dirname, '../docs/F1_PREVIEW.html'), 'utf8');

test('prévia da F1 oferece os mesmos serviços do formulário de produção', () => {
  const codes = [...html.matchAll(/name="services" value="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(codes, Object.keys(F1.SERVICE_TYPES));
});

test('prévia não chama Supabase, pagamento, upload ou APIs externas', () => {
  assert.doesNotMatch(html, /\bsupabase\b|\bfetch\s*\(|\.upload\s*\(|payment_records|https?:\/\//i);
  assert.match(html, /Nenhuma informação foi transmitida/);
  assert.match(html, /event\.preventDefault\(\)/);
});

test('scripts embutidos da prévia têm JavaScript válido', () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1].trim()).filter(Boolean);
  assert.equal(scripts.length, 1);
  for(const script of scripts) assert.doesNotThrow(() => new vm.Script(script));
});

test('a prévia usa apenas arquivos locais', () => {
  assert.match(html, /href="\.\.\/styles\.css"/);
  assert.match(html, /src="\.\.\/request-f1\.js"/);
});
