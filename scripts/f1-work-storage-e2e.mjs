/**
 * F1 / Salva Motoca — ensaio HTTP mínimo com duas contas fictícias legítimas.
 *
 * PADRÃO: --plan é 100% offline, sem login nem escrita.
 * --run exige evidência de backup+restore local e autorização explícita.
 * Não cria pedidos, prestadores, orçamentos, pagamentos ou notificações.
 * Usa APENAS publishable key e JWT de login; nunca service_role.
 *
 * Node >= 22. Sem dependências ou arquivos de imagem do usuário.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const PROJECT_REF = "yivkqyjdeouxnwtwfekc";
export const PROJECT_URL = "https://" + PROJECT_REF + ".supabase.co";
export const WRITE_ACK = "F1_STORAGE_ONLY_" + PROJECT_REF;
const JPG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKcAD//Z",
  "base64"
);

export function storagePath(userId, id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new Error("Identificador UUID inválido; operação bloqueada.");
  return userId + "/" + id + ".jpg";
}

export function validateExecution(env, report) {
  if (env.F1_WORK_ACK !== WRITE_ACK)
    throw new Error("Sem autorização específica para ensaio de UM arquivo fictício no projeto existente.");
  if (env.F1_BACKUP_RESTORE_VERIFIED !== "yes")
    throw new Error("Backup/restauração não comprovados. Não executar operações HTTP.");
  if (env.F1_SUPABASE_URL !== PROJECT_URL)
    throw new Error("URL não corresponde ao único projeto autorizado.");
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.F1_PUBLISHABLE_KEY || ""))
    throw new Error("Exige chave pública sb_publishable_ válida, nunca segredo/service_role.");
  for (const item of ["F1_TEST_A_EMAIL", "F1_TEST_A_PASSWORD", "F1_TEST_C_EMAIL", "F1_TEST_C_PASSWORD"]) {
    if (!env[item] || !String(env[item]).trim()) throw new Error("Falta variável privada: " + item);
  }
  if (env.F1_TEST_A_EMAIL === env.F1_TEST_C_EMAIL)
    throw new Error("A e C precisam ser duas contas diferentes.");
  if (report?.project_ref !== PROJECT_REF || report?.backup_verified !== true ||
      report?.restore_verified !== true || report?.scope_reviewed !== true)
    throw new Error("Relatório local de backup/restauração não comprova este projeto.");
  const date = Date.parse(report.checked_at);
  if (!Number.isFinite(date) || date > Date.now() + 300000 ||
      Date.now() - date > 7 * 24 * 3600 * 1000)
    throw new Error("Comprovação de restauração ausente, futura ou com mais de 7 dias.");
  return true;
}

const parts = p => p.split("/").map(encodeURIComponent).join("/");
const log = (label, pass) => console.log((pass ? "PASS " : "FAIL ") + label);
const assertOk = (response, step) => {
  if (!response.ok) throw new Error(step + ": HTTP " + response.status + " (esperado 2xx)");
};
const assertDenied = (response, step) => {
  if (response.status < 400 || response.status >= 500)
    throw new Error(step + ": HTTP " + response.status + " (esperado bloqueio 4xx)");
};

function headers(key, jwt, type) {
  const result = { apikey: key };
  if (jwt) result.Authorization = "Bearer " + jwt;
  if (type) result["Content-Type"] = type;
  return result;
}

async function call(url, options) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(20000), redirect: "manual" });
}

async function login(env, prefix) {
  const endpoint = PROJECT_URL + "/auth/v1/token?grant_type=password";
  const response = await call(endpoint, {
    method: "POST", headers: headers(env.F1_PUBLISHABLE_KEY, null, "application/json"),
    body: JSON.stringify({
      email: env["F1_TEST_" + prefix + "_EMAIL"],
      password: env["F1_TEST_" + prefix + "_PASSWORD"]
    })
  });
  assertOk(response, "Login fictício " + prefix);
  const data = await response.json();
  if (!data.access_token || !data.user?.id) throw new Error("Auth não retornou JWT e ID legítimos.");
  return { jwt: data.access_token, id: data.user.id };
}

export function plan() {
  return [
    "1. Backup privado do único Supabase + teste REAL de restauração local; evidência fora do GitHub.",
    "2. Criar duas contas Auth de teste (A e C) com e-mails controlados, após backup.",
    "3. Fazer login HTTP como A e C (sem service_role).",
    "4. Criar UM JPEG sintético em namespace A, sem pedido de serviço.",
    "5. A lê; C e anônimo não leem; A assina; C não assina.",
    "6. Apagar APENAS o arquivo gerado, via Storage API; confirmar exclusão.",
    "7. Documentar evidências sem JWT/senha/URL assinada; continuar Android físico manual."
  ];
}

export async function run(env = process.env) {
  if (!env.F1_BACKUP_REPORT_PATH)
    throw new Error("F1_BACKUP_REPORT_PATH obrigatório; prova privada fora do repositório.");
  const proof = JSON.parse(readFileSync(env.F1_BACKUP_REPORT_PATH, "utf8"));
  validateExecution(env, proof);

  const a = await login(env, "A");
  const c = await login(env, "C");
  if (a.id === c.id) throw new Error("Ambas as credenciais autenticaram a mesma identidade.");
  log("Auth A/C, contas distintas", true);

  const path = storagePath(a.id, randomUUID());
  const fileRoute = PROJECT_URL + "/storage/v1/object/request-photos/" + parts(path);
  const authRoute = PROJECT_URL + "/storage/v1/object/authenticated/request-photos/" + parts(path);
  const publicRoute = PROJECT_URL + "/storage/v1/object/public/request-photos/" + parts(path);
  const signRoute = PROJECT_URL + "/storage/v1/object/sign/request-photos/" + parts(path);
  let uploadAttempted = false, cleanupFailed = false;
  try {
    // Até um timeout após POST pode ter gravado o arquivo. A limpeza é tentada
    // sempre que a solicitação de upload foi iniciada (path aleatório exclusivo).
    uploadAttempted = true;
    const created = await call(fileRoute, {
      method: "POST",
      headers: { ...headers(env.F1_PUBLISHABLE_KEY, a.jwt, "image/jpeg"), "x-upsert": "false", "cache-control": "no-store" },
      body: JPG
    });
    assertOk(created, "Upload da imagem sintética");
    log("Upload privado A sem sobrescrita", true);

    const owner = await call(authRoute, { headers: headers(env.F1_PUBLISHABLE_KEY, a.jwt) });
    assertOk(owner, "Download pelo autor A");
    const received = Buffer.from(await owner.arrayBuffer());
    if (!received.equals(JPG)) throw new Error("Foto baixada por A difere dos bytes enviados.");
    log("A lê bytes exatos da própria foto", true);

    const outsider = await call(authRoute, { headers: headers(env.F1_PUBLISHABLE_KEY, c.jwt) });
    assertDenied(outsider, "Terceiro C não pode baixar foto de A");
    log("C não baixa foto de A", true);

    const anonymous = await call(authRoute, { headers: headers(env.F1_PUBLISHABLE_KEY, null) });
    assertDenied(anonymous, "Visitante não pode baixar foto privada");
    const publicAttempt = await call(publicRoute, { headers: headers(env.F1_PUBLISHABLE_KEY, null) });
    assertDenied(publicAttempt, "Bucket não pode servir URL pública");
    log("Anônimo não lê por rota autenticada nem pública", true);

    const signedByC = await call(signRoute, {
      method: "POST", headers: headers(env.F1_PUBLISHABLE_KEY, c.jwt, "application/json"),
      body: JSON.stringify({ expiresIn: 60 })
    });
    assertDenied(signedByC, "Terceiro C não pode gerar URL assinada");
    log("C não gera URL assinada de A", true);

    const signedByA = await call(signRoute, {
      method: "POST", headers: headers(env.F1_PUBLISHABLE_KEY, a.jwt, "application/json"),
      body: JSON.stringify({ expiresIn: 60 })
    });
    assertOk(signedByA, "A gera URL assinada de 60 segundos");
    const signedBody = await signedByA.json();
    if (!(signedBody.signedURL || signedBody.signedUrl))
      throw new Error("A autorização retornou 2xx, mas sem URL assinada.");
    // Não registrar o token da URL nem a URL em logs ou relatórios.
    log("A gera URL assinada (segredo não exibido)", true);
  } finally {
    if (uploadAttempted) {
      try {
        const removed = await call(PROJECT_URL + "/storage/v1/object/request-photos", {
          method: "DELETE",
          headers: headers(env.F1_PUBLISHABLE_KEY, a.jwt, "application/json"),
          body: JSON.stringify({ prefixes: [path] })
        });
        assertOk(removed, "Exclusão do único JPEG criado nesta execução");
        const check = await call(authRoute, { headers: headers(env.F1_PUBLISHABLE_KEY, a.jwt) });
        assertDenied(check, "Foto não pode permanecer acessível após exclusão");
        log("Remoção do arquivo de teste via Storage API", true);
      } catch (error) {
        cleanupFailed = true;
        // O arquivo foi gerado nesta execução; evitar expor UUID pessoal em logs.
        console.error("PENDENTE: limpeza do arquivo de teste não comprovada; verificar no bucket com a conta A. " +
          String(error.message || error));
      }
    }
  }
  if (cleanupFailed) throw new Error("Homologação reprovada: cleanup pendente.");
  console.log("RESULTADO: teste HTTP de Auth/Storage A e C aprovado; não testa prestador B, pedido completo ou Android.");
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  if (process.argv.includes("--run")) {
    run().catch(error => {
      // Nunca exibir URLs assinadas ou respostas de autenticação neste canal.
      console.error("FALHA F1 E2E: " + String(error.message || error));
      process.exitCode = 1;
    });
  } else {
    console.log("MODO SEGURO: planejamento somente; nenhuma rede, login ou gravação.");
    for (const step of plan()) console.log(step);
    console.log("Para execução real: seguir docs/F1_WORK_EXECUCAO.md e então --run.");
  }
}
