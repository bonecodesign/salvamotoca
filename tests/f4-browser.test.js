"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {pathToFileURL}=require("node:url");
const {chromium}=require("playwright-core");
const executablePath=process.env.CHROME_BIN||[
 "/usr/bin/google-chrome","/usr/bin/google-chrome-stable",
 "/usr/bin/chromium","/usr/bin/chromium-browser"
].find(p=>fs.existsSync(p));
const url=pathToFileURL(path.resolve(__dirname,"../docs/F4_PREVIEW.html")).href;
async function open(width=1100){
 assert.ok(executablePath,"Chrome/Chromium ausente");
 const browser=await chromium.launch({executablePath,headless:true,
  args:["--no-sandbox","--disable-dev-shm-usage"]});
 const page=await browser.newPage({viewport:{width,height:850}});
 const external=[],errors=[];
 page.on("request",r=>{if(/^https?:/i.test(r.url()))external.push(r.url())});
 page.on("pageerror",e=>errors.push(e.message));
 await page.route(/^https?:\/\//,r=>r.abort());
 await page.goto(url);
 return {browser,page,external,errors};
}
test("F4 Chrome: prévia financeira funciona sem HTTP externo",async()=>{
 const {browser,page,external,errors}=await open();
 try{
  assert.match(await page.title(),/F4/);
  assert.match(await page.locator(".notice").innerText(),/Simulador 100% offline/);
  await page.locator("#calculate").click();
  assert.deepEqual(external,[]);
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test("F4 Chrome: comissões 10+10 apenas sobre serviço; materiais embutidos",async()=>{
 const {browser,page,external,errors}=await open();
 try{
  await page.locator("#calculate").click();
  const text=await page.locator("#breakdown").innerText();
  assert.match(text,/R\$\s*23,00/);
  assert.match(text,/R\$\s*46,00/);
  assert.match(text,/R\$\s*247,00/);
  assert.match(text,/R\$\s*296,50/);
  assert.equal(await page.locator("#parts").count(),0);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test("F4 Chrome: cliente após deslocamento vai para mediação",async()=>{
 const {browser,page,external,errors}=await open();
 try{
  await page.locator("#paid").selectOption("yes");
  await page.locator("#cancelPhase").selectOption("after");
  await page.locator("#cancel").click();
  assert.match(await page.locator("#refundState").innerText(),/mediação humana/);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test("F4 Chrome: cancelamento de prestador requer reembolso integral, não executa",async()=>{
 const {browser,page,external,errors}=await open();
 try{
  await page.locator("#paid").selectOption("yes");
  await page.locator("#cancelBy").selectOption("provider");
  await page.locator("#cancelPhase").selectOption("after");
  await page.locator("#cancel").click();
  assert.match(await page.locator("#refundState").innerText(),/Solicitar ao PSP reembolso integral/);
  assert.match(await page.locator("#refundState").innerText(),/Não foi executado/);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test("F4 Chrome: dupla confirmação é necessária e não gera transferência",async()=>{
 const {browser,page,external,errors}=await open();
 try{
  await page.locator("#paid").selectOption("yes");
  await page.locator("#settlement").click();
  assert.match(await page.locator("#settlementState").innerText(),/Repasse bloqueado/);
  await page.locator("#providerDone").check();
  await page.locator("#customerDone").check();
  await page.locator("#settlement").click();
  assert.match(await page.locator("#settlementState").innerText(),/Transferência desativada/);
  await page.locator("#dispute").check();
  await page.locator("#settlement").click();
  assert.match(await page.locator("#settlementState").innerText(),/Repasse bloqueado/);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test("F4 Chrome: responsivo 375px",async()=>{
 const {browser,page,external,errors}=await open(375);
 try{
  await page.locator("#calculate").click();
  const w=await page.evaluate(()=>document.documentElement.scrollWidth);
  assert.ok(w<=375,"Overflow horizontal "+w);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
