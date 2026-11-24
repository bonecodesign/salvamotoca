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
const TTL_SECONDS=20;
const EXPIRY_GRACE_MS=3000;
// 429, timeouts and malformed responses are not proof of authorization denial.
async function assertDenied(response, step, missingOnly=false) {
  const status=response.status;
  let code="",description="";
  if(status===400 || status===404){
    try{
      const data=await response.json();
      code=String(data.code??data.error??"").toLowerCase();
      description=String(data.message??"").toLowerCase();
    }catch{ /* Invalid error body cannot establish absence. */ }
  }else{await response.body?.cancel();}
  const absent= status===404 && /not.?found|no.?such.?key|does not exist/.test(code+" "+description) ||
    status===400 && /not.?found|no.?such.?key|does not exist/.test(code+" "+description);
  const explicit400=status===400&&/unauthorized|forbidden|access.?denied|invalid.?jwt|expired|not.?found|no.?such.?key/.test(code+" "+description);
  if(missingOnly?!absent:!(status===401||status===403||absent||explicit400))
    throw new Error(step+": HTTP "+status+" (negativa específica não comprovada)");
}
export function signedDownloadUrl(body,path){
  const raw=body?.signedURL??body?.signedUrl;
  if(typeof raw!=="string"||raw.length>8192)throw new Error("URL assinada inválida.");
  let url;
  try{url=new URL(raw.startsWith("/object/sign/")?"/storage/v1"+raw:raw,PROJECT_URL);}catch{throw new Error("URL assinada inválida.");}
  if(url.origin!==PROJECT_URL||url.username||url.password||url.hash||
      url.pathname!=="/storage/v1/object/sign/request-photos/"+parts(path)||
      url.searchParams.getAll("token").length!==1||!url.searchParams.get("token")||
      [...url.searchParams.keys()].some(k=>k!=="token"))
    throw new Error("URL assinada fora do objeto ou projeto autorizado.");
  return url.href;
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function headers(key, jwt, type) {
  const result = { apikey: key };
  if (jwt) result.Authorization = "Bearer " + jwt;
  if (type) result["Content-Type"] = type;
  return result;
}

async function call(url, options) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(20000), redirect: "manual" });
}

async function login(env, prefix, request) {
  const endpoint = PROJECT_URL + "/auth/v1/token?grant_type=password";
  const response = await request(endpoint, {
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
    "5. A lê; C e anônimo não leem; A assina; C não assina. Conferir bytes sem JWT e expiração.",
    "6. Apagar APENAS o arquivo gerado, via Storage API; confirmar exclusão.",
    "7. Documentar evidências sem JWT/senha/URL assinada; continuar Android físico manual."
  ];
}

export async function run(env = process.env) {
  if(process.env.CI||process.env.GITHUB_ACTIONS)throw new Error("Execução hospedada proibida em CI.");
  if (!env.F1_BACKUP_REPORT_PATH)
    throw new Error("F1_BACKUP_REPORT_PATH obrigatório; prova privada fora do repositório.");
  const proof = JSON.parse(readFileSync(env.F1_BACKUP_REPORT_PATH, "utf8"));
  validateExecution(env, proof);
  return exerciseStorage(env,proof,{request:call,wait:sleep});
}

// Explicit dependency injection for offline regression tests; no default network.
// The private runner above is the only command-line entry point.
export async function exerciseStorage(env,proof,{request,wait}={}){
  validateExecution(env,proof);
  if(typeof request!=="function"||typeof wait!=="function")throw new Error("Transporte e relógio obrigatórios.");
  const a = await login(env, "A",request);
  const c = await login(env, "C",request);
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
    const created = await request(fileRoute, {
      method: "POST",
      headers: { ...headers(env.F1_PUBLISHABLE_KEY, a.jwt, "image/jpeg"), "x-upsert": "false", "cache-control": "no-store" },
      body: JPG
    });
    assertOk(created, "Upload da imagem sintética");
    log("Upload privado A sem sobrescrita", true);

    const owner = await request(authRoute, { headers: headers(env.F1_PUBLISHABLE_KEY, a.jwt) });
    assertOk(owner, "Download pelo autor A");
    const received = Buffer.from(await owner.arrayBuffer());
    if (!received.equals(JPG)) throw new Error("Foto baixada por A difere dos bytes enviados.");
    log("A lê bytes exatos da própria foto", true);

    const outsider = await request(authRoute, { headers: headers(env.F1_PUBLISHABLE_KEY, c.jwt) });
    await assertDenied(outsider, "Terceiro C não pode baixar foto de A");
    log("C não baixa foto de A", true);

    const anonymous = await request(authRoute, { headers: headers(env.F1_PUBLISHABLE_KEY, null) });
    await assertDenied(anonymous, "Visitante não pode baixar foto privada");
    const publicAttempt = await request(publicRoute, { headers: headers(env.F1_PUBLISHABLE_KEY, null) });
    await assertDenied(publicAttempt, "Bucket não pode servir URL pública");
    log("Anônimo não lê por rota autenticada nem pública", true);

    const signedByC = await request(signRoute, {
      method: "POST", headers: headers(env.F1_PUBLISHABLE_KEY, c.jwt, "application/json"),
      body: JSON.stringify({ expiresIn: TTL_SECONDS })
    });
    await assertDenied(signedByC, "Terceiro C não pode gerar URL assinada");
    log("C não gera URL assinada de A", true);

    const signedByA = await request(signRoute, {
      method: "POST", headers: headers(env.F1_PUBLISHABLE_KEY, a.jwt, "application/json"),
      body: JSON.stringify({ expiresIn: TTL_SECONDS })
    });
    assertOk(signedByA, "A gera URL assinada curta");
    const url=signedDownloadUrl(await signedByA.json(),path);
    const initial=await request(url,{headers:{"Cache-Control":"no-cache, no-store"}});
    assertOk(initial,"Download pela URL assinada sem JWT");
    if(!Buffer.from(await initial.arrayBuffer()).equals(JPG))throw new Error("Bytes da URL assinada divergentes.");
    log("URL assinada entrega bytes exatos sem JWT",true);
    // Wait from the received response, not before the request.
    await wait(TTL_SECONDS*1000+EXPIRY_GRACE_MS);
    const expired=await request(url,{headers:{"Cache-Control":"no-cache, no-store"}});
    await assertDenied(expired,"URL assinada expirada");
    log("Expiração da URL assinada observada via HTTP",true);
    const retained=await request(authRoute,{headers:headers(env.F1_PUBLISHABLE_KEY,a.jwt)});
    assertOk(retained,"Autor continua lendo depois da expiração");
    if(!Buffer.from(await retained.arrayBuffer()).equals(JPG))throw new Error("Objeto original não comprovado após expiração.");
    log("Expiração não removeu o objeto original",true);
  } finally {
    if (uploadAttempted) {
      try {
        const removed = await request(PROJECT_URL + "/storage/v1/object/request-photos", {
          method: "DELETE",
          headers: headers(env.F1_PUBLISHABLE_KEY, a.jwt, "application/json"),
          body: JSON.stringify({ prefixes: [path] })
        });
        assertOk(removed, "Exclusão do único JPEG criado nesta execução");
        const check = await request(authRoute, { headers: headers(env.F1_PUBLISHABLE_KEY, a.jwt) });
        await assertDenied(check, "Foto não pode permanecer acessível após exclusão",true);
        log("Remoção do arquivo de teste via Storage API", true);
      } catch (error) {
        cleanupFailed = true;
        // O arquivo foi gerado nesta execução; evitar expor UUID pessoal em logs.
        console.error("PENDENTE: limpeza do arquivo de teste não comprovada; verificar privadamente no bucket com a conta A.");
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
      console.error("FALHA F1 E2E: ensaio não aprovado; consulte somente os rótulos PASS anteriores e revise o ambiente privado.");
      process.exitCode = 1;
    });
  } else {
    console.log("MODO SEGURO: planejamento somente; nenhuma rede, login ou gravação.");
    for (const step of plan()) console.log(step);
    console.log("Para execução real: seguir docs/F1_WORK_EXECUCAO.md e então --run.");
  }
}
