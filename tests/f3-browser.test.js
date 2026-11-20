"use strict";
/* F3 Chrome: somente dados sintéticos, modo file://, HTTP bloqueado. */
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {pathToFileURL}=require("node:url");
const {chromium}=require("playwright-core");
const executablePath=process.env.CHROME_BIN||[
 "/usr/bin/google-chrome","/usr/bin/google-chrome-stable",
 "/usr/bin/chromium","/usr/bin/chromium-browser"
].find(p=>fs.existsSync(p));
const url=pathToFileURL(path.resolve(__dirname,"../docs/F3_PREVIEW.html")).href;
async function open(width=1100){
 assert.ok(executablePath,"Chrome ausente");
 const browser=await chromium.launch({executablePath,headless:true,
  args:["--no-sandbox","--disable-dev-shm-usage"]});
 const page=await browser.newPage({viewport:{width,height:850}});
 const errors=[];
 page.on("request",r=>{if(/^https?:/i.test(r.url()))errors.push(r.url())});
 page.on("pageerror",e=>errors.push("JS: "+e.message));
 await page.route(/^https?:\/\//,route=>route.abort());
 await page.goto(url);
 return {browser,page,errors};
}
test("F3 Chrome: simulação não solicita dados de rede ou API real",async()=>{
 const {browser,page,errors}=await open();
 try{
  assert.match(await page.title(),/F3 reboque/);
  assert.match(await page.locator(".warning").innerText(),/Somente simulação local/);
  await page.locator("#search").click();
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test("F3 Chrome: oferece só equipamento homologado e peso suficiente",async()=>{
 const {browser,page,errors}=await open();
 try{
  await page.locator("#search").click();
  assert.match(await page.locator("#providers").innerText(),/Reboque Alfa/);
  assert.doesNotMatch(await page.locator("#providers").innerText(),/Reboque Beta/);
  assert.doesNotMatch(await page.locator("#providers").innerText(),/Reboque Gama/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test("F3 Chrome: moto acima da carga homologada não recebe oferta",async()=>{
 const {browser,page,errors}=await open();
 try{
  await page.locator("#weight").fill("300");
  await page.locator("#search").click();
  assert.match(await page.locator("#requestState").innerText(),/Nenhum reboque homologado/);
  assert.equal(await page.locator("#providers .result").count(),0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test("F3 Chrome: destino exato permanece fora do resumo de prestador",async()=>{
 const {browser,page,errors}=await open();
 try{
  await page.locator("#privateAddress").fill("Rua Privada do Cliente, 999");
  await page.locator("#search").click();
  const summary=await page.locator("#publicSummary").innerText();
  assert.match(summary,/Belo Horizonte.*Contagem/);
  assert.doesNotMatch(summary,/Rua Privada/);
  assert.ok(!JSON.stringify(await page.locator("#providers").innerText()).includes("Rua Privada"));
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test("F3 Chrome: orçamento discrimina e aceite não libera pagamento",async()=>{
 const {browser,page,errors}=await open();
 try{
  await page.locator("#search").click();
  await page.locator("#providers button").first().click();
  await page.locator("#calculate").click();
  const prices=await page.locator("#prices").innerText();
  assert.match(prices,/R\$\s*293,00/);
  assert.match(prices,/R\$\s*23,00/);
  assert.match(prices,/Repasse estimado ao prestador/);
  await page.locator("#choose").click();
  assert.match(await page.locator("#finalState").innerText(),/aguardando pagamento/i);
  assert.match(await page.locator("#finalState").innerText(),/chat e despacho bloqueados/i);
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test("F3 Chrome: mobile 375px sem overflow horizontal",async()=>{
 const {browser,page,errors}=await open(375);
 try{
  await page.locator("#search").click();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth);
  assert.ok(overflow<=375,"Overflow de "+overflow+"px");
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
