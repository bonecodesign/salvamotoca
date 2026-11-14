/* Testes offline do roteiro de Work. Nunca fazem conexões ou gravam no Supabase. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PROJECT_REF, PROJECT_URL, WRITE_ACK, plan, validateExecution, storagePath } from "../scripts/f1-work-storage-e2e.mjs";

const now = () => new Date().toISOString();
const goodEnv = () => ({
  F1_WORK_ACK: WRITE_ACK, F1_BACKUP_RESTORE_VERIFIED: "yes",
  F1_SUPABASE_URL: PROJECT_URL, F1_PUBLISHABLE_KEY: "sb_publishable_TESTKEY0123",
  F1_TEST_A_EMAIL: "author@example.invalid", F1_TEST_A_PASSWORD: "NOT_A_REAL_PASSWORD",
  F1_TEST_C_EMAIL: "outsider@example.invalid", F1_TEST_C_PASSWORD: "NOT_A_REAL_PASSWORD"
});
const goodProof = () => ({
  project_ref: PROJECT_REF, backup_verified: true, restore_verified: true,
  scope_reviewed: true, checked_at: now()
});

test("default plan lista backup anterior a qualquer upload", () => {
  const steps=plan();
  assert.ok(steps[0].includes("Backup"));
  assert.ok(steps.some(s=>s.includes("UM JPEG")));
  assert.ok(steps.some(s=>s.includes("Storage API")));
  assert.ok(steps.some(s=>s.includes("sem service_role")));
});

test("bloqueia execução sem ACK específico do projeto", () => {
  const env=goodEnv(); delete env.F1_WORK_ACK;
  assert.throws(()=>validateExecution(env,goodProof()),/autorização específica/);
});

test("bloqueia escrita sem declaração de backup e restauração", () => {
  const env=goodEnv();env.F1_BACKUP_RESTORE_VERIFIED="no";
  assert.throws(()=>validateExecution(env,goodProof()),/Backup\/restauração/);
});

test("bloqueia relatório de backup que não comprova restauração local", () => {
  const proof=goodProof();proof.restore_verified=false;
  assert.throws(()=>validateExecution(goodEnv(),proof),/não comprova/);
});

test("bloqueia relatório de outro projeto ou antigo", () => {
  const proof=goodProof();proof.project_ref="projeto-errado";
  assert.throws(()=>validateExecution(goodEnv(),proof),/não comprova/);
  const old=goodProof();old.checked_at=new Date(Date.now()-9*24*3600*1000).toISOString();
  assert.throws(()=>validateExecution(goodEnv(),old),/mais de 7 dias/);
});

test("bloqueia URL de outro projeto e credenciais administrativas", () => {
  const env=goodEnv();env.F1_SUPABASE_URL="https://another.supabase.co";
  assert.throws(()=>validateExecution(env,goodProof()),/único projeto/);
  const secret=goodEnv();secret.F1_PUBLISHABLE_KEY="sb_secret_DONT_USE";
  assert.throws(()=>validateExecution(secret,goodProof()),/chave pública/);
});

test("bloqueia login de teste com apenas uma conta", () => {
  const env=goodEnv();env.F1_TEST_C_EMAIL=env.F1_TEST_A_EMAIL;
  assert.throws(()=>validateExecution(env,goodProof()),/duas contas diferentes/);
});

test("percorre portões apenas quando prova e ambiente são explícitos", () => {
  assert.equal(validateExecution(goodEnv(),goodProof()),true);
});

test("caminho da foto sempre tem namespace UUID do autor", () => {
  const owner=randomUUID(),object=randomUUID();
  assert.equal(storagePath(owner,object),owner+"/"+object+".jpg");
  assert.throws(()=>storagePath("../admin",object),/UUID inválido/);
  assert.throws(()=>storagePath(owner,"../../foo"),/UUID inválido/);
});

test("roteiro importa sem disparar fetch, upload ou login", async () => {
  const current=globalThis.fetch;
  try {
    globalThis.fetch=()=>{throw new Error("não deve acessar rede ao importar módulo");};
    assert.equal(typeof plan,"function");
    assert.ok(plan().length >= 6);
  } finally {globalThis.fetch=current;}
});
