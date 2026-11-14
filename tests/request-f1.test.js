/* Execute: node --test tests/request-f1.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const F1 = require("../request-f1.js");

const valid = (more = {}) => ({
  brand: "Honda", model: "CG 160", year: "2024",
  services: ["pneu_furado", "troca_camara"],
  problem: "Pneu traseiro furado", address: "Rua Exemplo, número 12",
  photo: { type: "image/jpeg", size: 1000 }, ...more
});

test("monta pedido completo com serviços múltiplos e normaliza texto", () => {
  const result = F1.validateRequest(valid({ brand: "  Honda  ", services: ["pneu_furado", "troca_camara", "pneu_furado"] }), 2026);
  assert.deepEqual(result.services, ["pneu_furado", "troca_camara"]);
  assert.equal(result.brand, "Honda");
  assert.equal(result.model, "CG 160");
  assert.equal(result.year, 2024);
});

test("não reduz silenciosamente campos acima do limite", () => {
  assert.throws(() => F1.validateRequest(valid({ brand: "H".repeat(71) }), 2026), /70 caracteres/);
  assert.throws(() => F1.validateRequest(valid({ model: "M".repeat(91) }), 2026), /90 caracteres/);
});
test("impede pedido sem foto", () => assert.throws(() => F1.validateRequest(valid({ photo: null }), 2026), /foto/));
test("impede arquivo com tipo inválido", () => assert.throws(() => F1.validateRequest(valid({ photo: { type: "image/svg+xml", size: 200 } }), 2026), /JPG/));
test("impede imagem original acima de 8 MB", () => assert.throws(() => F1.validateRequest(valid({ photo: { type: "image/png", size: 9 * 1024 * 1024 } }), 2026), /8 MB/));
test("impede ano inválido ou futuro absurdo", () => {
  assert.throws(() => F1.validateRequest(valid({ year: "2035" }), 2026), /ano válido/);
  assert.throws(() => F1.validateRequest(valid({ year: "20xx" }), 2026), /ano válido/);
});
test("impede pedido sem marca ou modelo", () => assert.throws(() => F1.validateRequest(valid({ brand: " " }), 2026), /marca/));
test("impede seleção desconhecida", () => assert.throws(() => F1.validateRequest(valid({ services: ["pneu_furado", "cambio_motor"] }), 2026), /serviço válido/));
test("impede lista vazia", () => assert.throws(() => F1.validateRequest(valid({ services: [] }), 2026), /serviço válido/));
test("reboque permanece bloqueado até F3, inclusive quando combinado", () => {
  assert.throws(() => F1.validateRequest(valid({ services: ["reboque_moto"] }), 2026), /Reboque será liberado/);
  assert.throws(() => F1.validateRequest(valid({ services: ["reboque_moto", "pneu_furado"] }), 2026), /Reboque será liberado/);
});
test("impede endereço ou descrição incompletos", () => {
  assert.throws(() => F1.validateRequest(valid({ address: "A" }), 2026), /endereço/);
  assert.throws(() => F1.validateRequest(valid({ problem: "x" }), 2026), /Descreva/);
});
test("monta caminho privado com escopo do autor, sem aceitar path arbitrário", () => {
  const id = "de305d54-75b4-431b-adb2-eb6b9e546014";
  const upload = "5d1f9a25-a31e-40bb-8c38-43d637115215";
  assert.equal(F1.makePhotoPath(id, upload), id + "/" + upload + ".jpg");
  assert.throws(() => F1.makePhotoPath("../admin", upload), /Identificador seguro/);
});
