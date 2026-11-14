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
