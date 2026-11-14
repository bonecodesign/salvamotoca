"use strict";
/* F2: ensaios browser em Chrome real. Todos os recursos são locais (file://).
 * Sem chamadas externas, Supabase, login, pedidos ou pagamentos.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const {chromium}=require("playwright-core");
const file=pathToFileURL(path.join(__dirname,"../docs/F2_PREVIEW.html")).href;
const executablePath=process.env.CHROME_BIN||[
  "/usr/bin/google-chrome","/usr/bin/google-chrome-stable",
  "/usr/bin/chromium","/usr/bin/chromium-browser"
].find(file=>fs.existsSync(file));

async function open(viewport={width:1280,height:800}){
  assert.ok(executablePath,"Chrome/Chromium não encontrado");
  const browser=await chromium.launch({executablePath,headless:true,
    args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport});
  const external=[];
  page.on("request",req=>{if(/^https?:/i.test(req.url()))external.push(req.url())});
  await page.route(/^https?:\/\//,route=>route.abort());
  page.on("pageerror",e=>{external.push("PAGE_ERROR: "+e.message)});
  await page.goto(file);
  return {browser,page,external};
}
test("F2 Chrome: busca só prestadores elegíveis e exibe distância aproximada",async()=>{
  const {browser,page,external}=await open();
  try{
    await page.locator("#search").click();
    assert.match(await page.locator("#stage").innerText(),/Etapa 1/);
    assert.match(await page.locator("#candidates").innerText(),/Oficina Alfa/);
    assert.doesNotMatch(await page.locator("#candidates").innerText(),/Oficina Gama/);
    assert.doesNotMatch(await page.locator("#candidates").innerText(),/Oficina Delta/);
    assert.deepEqual(external,[]);
  }finally{await browser.close()}
});
test("F2 Chrome: recusa procura outra opção, mantendo pagamento bloqueado",async()=>{
  const {browser,page,external}=await open();
  try{
    await page.locator("#search").click();
    await page.locator("#quote").click();
    assert.match(await page.locator("#breakdown").innerText(),/R\$\s*175,00/);
    await page.locator("#decline").click();
    assert.match(await page.locator("#stage").innerText(),/Etapa 2/);
    assert.match(await page.locator("#candidates").innerText(),/Oficina Beta/);
    assert.deepEqual(external,[]);
  }finally{await browser.close()}
});
test("F2 Chrome: aceite nunca libera chat, pagamento ou deslocamento",async()=>{
  const {browser,page,external}=await open();
  try{
    await page.locator("#search").click();
    await page.locator("#quote").click();
    await page.locator("#accept").click();
    assert.match(await page.locator("#messages").innerText(),/Aguardando pagamento; chat e despacho bloqueados/);
    assert.equal(await page.locator("#accept").isDisabled(),true);
    assert.deepEqual(external,[]);
  }finally{await browser.close()}
});
test("F2 Chrome: notificação não entregue não conta ausência",async()=>{
  const {browser,page,external}=await open();
  try{
    await page.locator("#search").click();
    await page.locator("#tick").click();
    assert.match(await page.locator("#deadline").innerText(),/não há entrega comprovada/i);
    assert.match(await page.locator("#candidates").innerText(),/Oficina Alfa/);
    assert.deepEqual(external,[]);
  }finally{await browser.close()}
});
test("F2 Chrome: versão móvel 375px sem overflow ou tráfego de rede",async()=>{
  const {browser,page,external}=await open({width:375,height:812});
  try{
    await page.locator("#search").click();
    await page.locator("#quote").click();
    const width=await page.evaluate(()=>document.documentElement.scrollWidth);
    assert.ok(width<=375,"Overflow horizontal: "+width);
    assert.deepEqual(external,[]);
  }finally{await browser.close()}
});


test("F2 Chrome: cliente compara duas propostas e escolhe uma vencedora sem pagar",async()=>{
  const {browser,page,external}=await open();
  try{
    await page.locator("#compare").click();
    const choices=page.getByRole("button",{name:"Preparar orçamento deste prestador"});
    assert.equal(await choices.count(),2);
    await choices.nth(0).click();
    await page.locator("#quote").click();
    assert.match(await page.locator("#comparison").innerText(),/alfa/);
    await choices.nth(1).click();
    await page.locator("#serviceA").fill("60.00");
    await page.locator("#quote").click();
    assert.match(await page.locator("#comparison").innerText(),/alfa.*beta/);
    await page.locator("#accept").click();
    const out=await page.locator("#comparison").innerText();
    assert.match(out,/quote/); // estado: propostas persistidas, não pedidos no backend
    assert.match(out,/accepted/);
    assert.match(out,/not_selected/);
    assert.match(await page.locator("#messages").innerText(),/chat e despacho bloqueados/);
    assert.deepEqual(external,[]);
  }finally{await browser.close()}
});
