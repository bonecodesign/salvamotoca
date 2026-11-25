"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {execFileSync}=require("node:child_process");
const {randomUUID}=require("node:crypto");
const {chromium}=require("playwright-core");
const ROOT=path.resolve(__dirname,".."),FIX=path.join(__dirname,"fixtures/f56-browser");
const SESSION="55555555-5555-4555-8555-555555555555";
const USERS={customer:"11111111-1111-4111-8111-111111111111",provider:"22222222-2222-4222-8222-222222222222",outsider:"33333333-3333-4333-8333-333333333333"};
const env={PATH:process.env.PATH,LC_ALL:"C.UTF-8",PGHOST:"127.0.0.1",PGPORT:"5432",PGDATABASE:"sm_history_disposable",PGUSER:"postgres",PGPASSWORD:"postgres",PGCONNECT_TIMEOUT:"5",PGOPTIONS:"-c statement_timeout=8000 -c lock_timeout=5000"};
function sql(q){
 return execFileSync("psql",["-X","-Atq","-v","ON_ERROR_STOP=1"],{input:q,env,encoding:"utf8",timeout:12000,stdio:["pipe","pipe","pipe"]}).trim();
}
function asRole(role,q){
 assert.ok(Object.hasOwn(USERS,role));
 return sql("begin; set local role authenticated; set local request.jwt.claim.sub='"+USERS[role]+"'; set local app.f5_test_only='local_fixture'; set local app.f6_test_only='local_fixture'; "+q+"; commit;");
}
const literal=v=>"convert_from(decode('"+Buffer.from(v,"utf8").toString("hex")+"','hex'),'UTF8')";
function state(role){
 return JSON.parse(asRole(role,"select jsonb_build_object('sessionStatus',(select status from public.f5_mock_sessions where id='"+SESSION+"'),'completionStatus',(select status from public.f6_mock_completions where session_id='"+SESSION+"'),'summary',(select summary from public.f6_mock_completions where session_id='"+SESSION+"'),'providerConfirmed',exists(select 1 from public.f6_mock_completions where session_id='"+SESSION+"' and provider_confirmed_at is not null),'customerConfirmed',exists(select 1 from public.f6_mock_completions where session_id='"+SESSION+"' and customer_confirmed_at is not null),'rated',exists(select 1 from public.f6_mock_completions where session_id='"+SESSION+"' and rating_stars is not null),'gpsVisible',exists(select 1 from public.f5_mock_latest_location where session_id='"+SESSION+"'),'messageCount',(select count(*) from public.f5_mock_messages where session_id='"+SESSION+"'))"));
}
function action(role,input){
 assert.ok(input&&typeof input==="object"&&Object.keys(input).sort().join(",")==="action,eventId,payload");
 assert.match(input.eventId,/^[0-9a-f-]{36}$/i);
 assert.match(input.action,/^[a-z_]{1,32}$/);
 const q="select public.f56_apply_fixture('"+SESSION+"',"+literal(input.eventId)+"::uuid,"+literal(input.action)+","+literal(JSON.stringify(input.payload))+"::jsonb)";
 return JSON.parse(asRole(role,q));
}
function seed(){
 assert.equal(process.env.GITHUB_ACTIONS,"true");
 assert.equal(process.env.SM_BROWSER_PG_FIXTURE,"yes");
 assert.equal(sql("select current_database()='sm_history_disposable' and current_user='postgres' and not exists(select 1 from auth.users) and not exists(select 1 from public.service_requests) and not exists(select 1 from private.f56_mock_events) and not (select enabled from private.f4_release_gate);"),"t");
 const original=fs.readFileSync(path.join(__dirname,"integration-history-tow-finance.sql"),"utf8");
 const marker="set local role authenticated;\nset local app.f5_test_only='local_fixture';";
 const index=original.indexOf(marker);
 assert.ok(index>0&&original.slice(0,index).includes("true,'ready_for_dispatch');"));
 sql(original.slice(0,index)+"\ncommit;");
}
const ASSETS={"/fixture.css":["fixture.css","text/css"],"/fixture.js":["fixture.js","text/javascript"]};
function respond(res,status,body,type="application/json"){
 res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});
 res.end(body);
}
async function server(){
 const srv=http.createServer(async(req,res)=>{
  try{
   if(!req.socket.remoteAddress?.endsWith("127.0.0.1"))return respond(res,403,"{}");
   const url=new URL(req.url,"http://127.0.0.1");
   if(url.search||url.hash)return respond(res,400,"{}");
   const asset=ASSETS[url.pathname];
   if(asset&&req.method==="GET")return respond(res,200,fs.readFileSync(path.join(FIX,asset[0])),asset[1]);
   const m=/^\/(customer|provider|outsider)\/(state|action)?$/.exec(url.pathname);
   if(!m)return respond(res,404,"{}");
   const [,role,kind]=m;
   if(!kind&&req.method==="GET")return respond(res,200,fs.readFileSync(path.join(FIX,"index.html")),"text/html; charset=utf-8");
   if(kind==="state"&&req.method==="GET")return respond(res,200,JSON.stringify(state(role)));
   if(kind==="action"&&req.method==="POST"){
    let raw="";
    for await(const chunk of req){raw+=chunk;if(raw.length>16000)return respond(res,413,"{}");}
    return respond(res,200,JSON.stringify(action(role,JSON.parse(raw))));
   }
   respond(res,405,"{}");
  }catch{respond(res,403,JSON.stringify({error:"fixture_denied"}));}
 });
 await new Promise((resolve,reject)=>{srv.once("error",reject);srv.listen(0,"127.0.0.1",resolve);});
 return srv;
}
const chrome=process.env.CHROME_BIN||["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser"].find(p=>fs.existsSync(p));
async function textIs(page,id,value){await page.waitForFunction(({id,value})=>document.getElementById(id).textContent===value,{id,value});}
async function click(page,actionName){
 const response=page.waitForResponse(r=>r.url().endsWith("/action")&&r.request().method()==="POST");
 await page.locator('[data-action="'+actionName+'"]').click();
 const r=await response;assert.equal(r.status(),200,actionName);
 const data=await r.json();assert.equal(data.mockOnly,true);assert.equal(data.transferAuthorized,false);
 await textIs(page,"stage",data.sessionStatus);
 await textIs(page,"completion",data.completionStatus||"");
 await page.waitForFunction(()=>!document.getElementById("refresh").disabled);
}
test("Chrome desktop/mobile -> loopback -> PG17 authenticated fixture commands", {timeout:120000},async()=>{
 let srv,browser;
 const errors=[],external=[];
 try{
  seed();
  srv=await server();
  const base="http://127.0.0.1:"+srv.address().port;
  assert.ok(chrome,"Chrome missing");
  browser=await chromium.launch({executablePath:chrome,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  async function open(role,width){
   const page=await browser.newPage({viewport:{width,height:850}});
   page.on("pageerror",e=>errors.push(e.message));
   await page.route("**/*",r=>{if(!r.request().url().startsWith(base+"/")){external.push(r.request().url());return r.abort();}return r.continue();});
   await page.goto(base+"/"+role+"/");
   await textIs(page,"stage",role==="outsider"?"Sem acesso":"ready_for_dispatch");
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   return page;
  }
  const provider=await open("provider",1100),customer=await open("customer",375),outsider=await open("outsider",375);
  await customer.locator("#body").fill("Mensagem de teste pelo navegador");
  await click(customer,"message");
  await textIs(customer,"messages","Mensagens visíveis: 1");
  assert.equal((await outsider.request.post(base+"/outsider/action",{data:{eventId:randomUUID(),action:"message",payload:{body:"Terceiro"}}})).status(),403);
  assert.equal((await customer.request.post(base+"/customer/action",{data:{eventId:randomUUID(),action:"dispatch",payload:{consent:true}}})).status(),403);
  await provider.locator("#consent").check();
  await click(provider,"dispatch");await click(provider,"location");
  await customer.locator("#refresh").click();
  await textIs(customer,"gps","Localização fictícia visível");
  await outsider.locator("#refresh").click();
  await textIs(outsider,"gps","Localização indisponível");
  await click(provider,"arrive");
  await customer.locator("#refresh").click();
  await textIs(customer,"gps","Localização indisponível");
  assert.equal(sql("select count(*) from public.f5_mock_latest_location;"),"0");
  await click(provider,"start");await click(provider,"handoff");await click(provider,"summary");await click(provider,"provider_confirm");
  await customer.locator("#refresh").click();
  await textIs(customer,"completion","awaiting_both");
  await customer.locator("#summaryRead").check();
  await click(customer,"customer_confirm");await click(customer,"rating");
  await textIs(customer,"completion","completed");
  assert.equal(sql("select rating_stars from public.f6_mock_completions;"),"5");
  const review=JSON.parse(sql("set app.f4_test_only='local_fixture'; select private.f4_queue_mock_settlement_review(id,'settle_browser_fixture',true,true) from private.f4_mock_payment_attempts;"));
  assert.equal(review.status,"review_only");assert.equal(review.transferAuthorized,false);
  await click(customer,"dispute");
  await customer.locator("#body").fill("Divergência fictícia encaminhada ao suporte");
  await click(customer,"support_message");
  assert.equal(sql("select status from private.f4_mock_settlement_intents;"),"held");
  assert.equal(sql("select count(*) from public.f6_mock_support_messages;"),"1");
  assert.equal(sql("select count(*) from public.payment_records;"),"0");
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log("BROWSER_PG17=PASS MOBILE_VIEWPORT=375 DESKTOP=1100 THIRD_PARTY_DENIED=PASS GPS_ERASED=PASS REVIEW_HELD=PASS REAL_PAYMENTS=0 RELEASE=NO_GO");
 }finally{
  if(browser)await browser.close();
  if(srv){srv.closeAllConnections();await new Promise(resolve=>srv.close(resolve));}
  // This CI service is destroyed after the job; close gates before teardown.
  if(process.env.GITHUB_ACTIONS==="true"&&process.env.SM_BROWSER_PG_FIXTURE==="yes"){
   sql("update private.f2_release_gate set enabled=false; update private.f3_release_gate set enabled=false; update private.f4_release_gate set enabled=false; update private.f5_mock_release_gate set enabled=false; update private.f6_mock_release_gate set enabled=false;");
  }
 }
});
