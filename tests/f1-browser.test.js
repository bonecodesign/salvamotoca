/* F1 — prévia real no Google Chrome/Chromium (desktop e viewport de celular).
 * Sem conexão com Supabase. Não cria pedidos, pagamentos ou despachos.
 * Rode: node --test tests/f1-browser.test.js
 * Requer playwright-core pinado pelo job e Chrome/Chromium instalado.
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright-core");

const PAGE = pathToFileURL(path.join(__dirname, "../docs/F1_PREVIEW.html")).href;
const executablePath = process.env.CHROME_BIN || [
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium", "/usr/bin/chromium-browser"
].find(file => fs.existsSync(file));

// PNG 1 x 1, fictício; os bytes não contêm metadados de localização.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/RZ8AAAAASUVORK5CYII=",
  "base64"
);

async function visit(viewport) {
  assert.ok(executablePath, "Chrome/Chromium nao foi encontrado no runner");
  const browser = await chromium.launch({
    executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage({ viewport });
  const external = [];
  page.on("request", request => {
    if (/^https?:/i.test(request.url())) external.push(request.url());
  });
  await page.route(/^https?:\/\//, route => route.abort());
  await page.goto(PAGE);
  return { browser, page, external };
}

async function fillRequest(page, services) {
  for (const value of services) await page.locator(`input[name="services"][value="${value}"]`).check();
  await page.locator('input[name="brand"]').fill("Honda");
  await page.locator('input[name="model"]').fill("CG 160");
  await page.locator('input[name="year"]').fill("2024");
  await page.locator('textarea[name="problem"]').fill("O pneu traseiro furou.");
  await page.locator('textarea[name="address"]').fill("Rua de Testes, 123");
  await page.locator('input[name="photo"]').setInputFiles({
    name: "problema.png", mimeType: "image/png", buffer: png
  });
  await page.locator('button[type="submit"]').click();
  return page.locator("#f1-preview-status");
}

test("Chrome desktop: formulário real valida serviços múltiplos, mostra foto e não envia dados", async () => {
  const { browser, page, external } = await visit({ width: 1280, height: 800 });
  try {
    const status = await fillRequest(page, ["pneu_furado", "troca_camara"]);
    await status.getByText(/Dados válidos para simulação/).waitFor();
    const message = await status.textContent();
    assert.match(message, /Honda CG 160 \(2024\)/);
    assert.match(message, /Foto selecionada: problema.png/);
    assert.match(message, /Nenhuma informação foi transmitida/);
    assert.equal(await page.locator("#f1-preview-image").isVisible(), true);
    assert.deepEqual(external, [], "A prévia tentou chamar serviço externo");
  } finally {
    await browser.close();
  }
});

test("Chrome com viewport móvel: reboque bloqueado e interface sem rolagem horizontal", async () => {
  const { browser, page, external } = await visit({ width: 375, height: 812 });
  try {
    const status = await fillRequest(page, ["pneu_furado", "reboque_moto"]);
    await status.getByText(/Reboque será liberado/).waitFor();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= 375, `Rolagem horizontal indevida: ${width}px`);
    assert.deepEqual(external, [], "A prévia tentou chamar serviço externo");
  } finally {
    await browser.close();
  }
});

test("Chrome desktop: foto de formato não permitido é recusada pela validação", async () => {
  const { browser, page } = await visit({ width: 1280, height: 800 });
  try {
    await page.locator('input[name="services"][value="pneu_furado"]').check();
    await page.locator('input[name="brand"]').fill("Honda");
    await page.locator('input[name="model"]').fill("CG 160");
    await page.locator('input[name="year"]').fill("2024");
    await page.locator('textarea[name="problem"]').fill("O pneu traseiro furou.");
    await page.locator('textarea[name="address"]').fill("Rua de Testes, 123");
    await page.locator('input[name="photo"]').setInputFiles({
      name: "falso.svg", mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")
    });
    await page.locator('button[type="submit"]').click();
    await page.locator("#f1-preview-status").getByText(/JPG, PNG ou WebP/).waitFor();
  } finally {
    await browser.close();
  }
});


// Monta um JPEG válido com IFD GPS em EXIF, sem foto nem localização pessoal.
// Testa o mesmo preparePrivatePhoto usado no aplicativo, não uma cópia da lógica.
function withGPSExif(jpeg) {
  assert.equal(jpeg.readUInt16BE(0), 0xffd8, "A origem deve ser JPEG");
  const tiff = Buffer.alloc(44);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);             // uma tag no IFD principal
  tiff.writeUInt16LE(0x8825, 10);      // tag GPSInfo IFD pointer
  tiff.writeUInt16LE(4, 12);           // tipo LONG
  tiff.writeUInt32LE(1, 14); tiff.writeUInt32LE(26, 18);
  tiff.writeUInt32LE(0, 22);           // sem próximo IFD
  tiff.writeUInt16LE(1, 26);
  tiff.writeUInt16LE(1, 28);           // GPSLatitudeRef
  tiff.writeUInt16LE(2, 30);           // ASCII
  tiff.writeUInt32LE(2, 32);
  tiff[36] = 0x53; tiff[37] = 0; // GPS latitude sul (fictícia)
  tiff.writeUInt32LE(0, 40);
  const payload = Buffer.concat([Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0]), tiff]);
  const length = payload.length + 2;
  return Buffer.concat([
    jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1, length >> 8, length & 255]),
    payload, jpeg.subarray(2)
  ]);
}

test("Chrome real: conversão da foto elimina marcador EXIF e IFD de GPS", async () => {
  const { browser, page, external } = await visit({ width: 1280, height: 800 });
  try {
    const plainBase64 = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 2; canvas.height = 2;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ddd"; context.fillRect(0, 0, 2, 2);
      return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    });
    const original = withGPSExif(Buffer.from(plainBase64, "base64"));
    assert.ok(original.includes(Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0])));
    const converted = await page.evaluate(async bytes => {
      const photo = new File([new Uint8Array(bytes)], "exif-gps.jpg", { type: "image/jpeg" });
      const result = await window.SMRequestF1.preparePrivatePhoto(photo);
      return {
        type: result.type, size: result.size,
        bytes: Array.from(new Uint8Array(await result.arrayBuffer()))
      };
    }, Array.from(original));
    const sanitized = Buffer.from(converted.bytes);
    assert.equal(converted.type, "image/jpeg");
    assert.ok(converted.size > 0 && converted.size <= 5 * 1024 * 1024);
    assert.equal(sanitized.readUInt16BE(0), 0xffd8);
    assert.equal(sanitized.includes(Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0])), false);
    assert.equal(sanitized.includes(Buffer.from([0x25, 0x88])), false, "IFD GPS permaneceu na imagem");
    assert.deepEqual(external, []);
  } finally {
    await browser.close();
  }
});

test("Chrome real: arquivo com MIME de JPEG mas bytes corrompidos é recusado", async () => {
  const { browser, page } = await visit({ width: 1280, height: 800 });
  try {
    const message = await page.evaluate(async () => {
      const file = new File([new Uint8Array([1, 2, 3, 4])], "falso.jpg", {type: "image/jpeg"});
      try {
        await window.SMRequestF1.preparePrivatePhoto(file);
        return "ACEITO";
      } catch (e) { return e.message; }
    });
    assert.match(message, /Não foi possível ler a foto|Foto ilegível/);
  } finally {
    await browser.close();
  }
});


// Use the actual PWA shell, worker and bootstrap over loopback HTTP.
// No credentials, hosted backend, external SDK or live requests are allowed.
test("Chrome móvel: cache público real, limpeza do legado e abertura offline segura", async () => {
  const http = require("node:http");
  const root = path.resolve(__dirname, "..");
  const assets = new Set(["index.html","config.js","app.js","bootstrap.js","request-f1.js","f2-flow.js","f3-tow.js","f4-finance.js","live-app-current.js","styles.css","manifest.webmanifest","assets/icon-192.png","assets/icon.svg","sw.js"]);
  const csp = "default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' data:; worker-src 'self'; object-src 'none'; base-uri 'none'";
  const types = {".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".webmanifest":"application/manifest+json",".png":"image/png",".svg":"image/svg+xml"};
  let privateReads = 0;
  const server = http.createServer((req,res) => {
    res.setHeader("Content-Security-Policy",csp);
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Cache-Control","no-store");
    if(req.method !== "GET"){res.writeHead(405).end();return;}
    if(req.url === "/seed"){res.writeHead(200,{"Content-Type":types[".html"]}).end("<!doctype html><title>Seed fixture</title>");return;}
    if(req.url === "/private-fixture"){privateReads++;res.writeHead(200,{"Content-Type":"text/plain"}).end("synthetic-private-response");return;}
    const file = req.url === "/" ? "index.html" : req.url.slice(1);
    if(!assets.has(file)){res.writeHead(404).end();return;}
    try{
      // The configuration is deliberately synthetic, never the hosted project.
      const bytes = file === "config.js" ? "window.BJ_CONFIG={supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'sb_publishable_fixture'};" : fs.readFileSync(path.join(root,file));
      res.writeHead(200,{"Content-Type":types[path.extname(file)],"Cache-Control":"no-cache"}).end(bytes);
    }catch{res.writeHead(500).end();}
  });
  let browser;
  try {
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
    const base = "http://127.0.0.1:"+server.address().port+"/";
    assert.ok(executablePath,"Chrome/Chromium não encontrado");
    browser = await chromium.launch({executablePath,headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"]});
    const context = await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,deviceScaleFactor:2});
    const page = await context.newPage();
    await page.goto(base+"seed");
    await page.evaluate(async()=>{
      await (await caches.open("salva-motoca-static-legacy-test")).put("/private-fixture",new Response("old-synthetic-private"));
      await caches.open("unrelated-test");
    });
    await page.goto(base+"index.html");
    await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,{},{timeout:20000});
    await page.getByRole("alert").filter({hasText:"Aplicativo indisponível"}).waitFor();
    assert.equal(await page.locator("[data-page]:enabled").count(),0);
    const snapshot = () => page.evaluate(async()=>{
      const names=await caches.keys();
      const name=names.find(n=>n.startsWith("salva-motoca-static-f7-"));
      const keys=name?(await (await caches.open(name)).keys()).map(r=>new URL(r.url).pathname).sort():[];
      return {names,keys};
    });
    const before=await snapshot();
    assert.ok(before.names.includes("unrelated-test"));
    assert.ok(!before.names.includes("salva-motoca-static-legacy-test"));
    assert.equal(before.keys.length,14);
    assert.ok(before.keys.includes("/index.html"));
    assert.equal(await page.evaluate(async()=>await (await fetch("/private-fixture")).text()),"synthetic-private-response");
    assert.equal(privateReads,1);
    assert.deepEqual(await snapshot(),before);
    await context.setOffline(true);
    assert.equal(await page.evaluate(async()=>{try{await fetch("/private-fixture",{cache:"no-store"});return false;}catch{return true;}}),true);
    await page.reload({waitUntil:"domcontentloaded"});
    await page.getByRole("alert").filter({hasText:"Aplicativo indisponível"}).waitFor();
    assert.equal(await page.locator("[data-page]:enabled").count(),0);
    assert.equal(await page.getByRole("button",{name:"Tentar novamente"}).count(),1);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(privateReads,1);
    assert.deepEqual(await snapshot(),before);
    await context.setOffline(false);
    await context.close();
    console.log("PWA_CHROME_CACHE=PASS LEGACY_REMOVED=PASS PRIVATE_NOT_CACHED=PASS OFFLINE_BLOCKED=PASS");
  } finally {
    if(browser)await browser.close();
    if(server.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  }
});
