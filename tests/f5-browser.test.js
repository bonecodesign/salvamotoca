"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {pathToFileURL}=require("node:url");
const {chromium}=require("playwright-core");
const executablePath=process.env.CHROME_BIN||[
 "/usr/bin/google-chrome","/usr/bin/google-chrome-stable",
 "/usr/bin/chromium","/usr/bin/chromium-browser"
].find(p=>fs.existsSync(p));
const url=pathToFileURL(path.resolve(__dirname,"../docs/F5_PREVIEW.html")).href;
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
const click=(page,kind)=>page.locator('[data-kind="'+kind+'"]').click();
test("F5 Chrome: pagamento é simulado e não libera atividade real",async()=>{
 const {browser,page,external,errors}=await open();
 try{
  assert.match(await page.title(),/F5/);
  await click(page,"mock_payment_confirmed");
  const view=JSON.parse(await page.locator("#view").innerText());
  assert.equal(view.status,"ready_for_dispatch");
  assert.equal(view.paymentIsReal,false);
  assert.equal(view.realChatAuthorized,false);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test("F5 Chrome: chat não abre antes de fixture fictícia",async()=>{
 const {browser,page,external,errors}=await open();
 try{
  await page.locator("#msg").fill("Mensagem de demonstração");
  await page.locator("#send").click();
  assert.match(await page.locator("#feedback").innerText(),/Sem confirmação/);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test("F5 Chrome: chegada encerra localização e mantém chat sem envio",async()=>{
 const {browser,page,external,errors}=await open();
 try{
  for(const k of ["mock_payment_confirmed","dispatch","provider_location"])await click(page,k);
  let view=JSON.parse(await page.locator("#view").innerText());
  assert.equal(view.displacementMockActive,true);
  assert.equal(view.lastLocation.lat,-19.924);
  await click(page,"provider_arrived");
  view=JSON.parse(await page.locator("#view").innerText());
  assert.equal(view.displacementMockActive,false);
  assert.equal(view.lastLocation,null);
  assert.equal(view.arrivalNotice,true);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
test("F5 Chrome: prévia responsiva sem chamadas externas",async()=>{
 const {browser,page,external,errors}=await open(375);
 try{
  await click(page,"mock_payment_confirmed");
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=375);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
