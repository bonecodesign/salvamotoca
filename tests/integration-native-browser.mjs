// Isolated browser test: actual Auth login, native REST/RPC, no elevated API keys.
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright-core');
export async function browserNativeJourney({root,origin,call,sql,actors,session,attempt,requestId}){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.SM_NATIVE_INTEGRATION_FIXTURE,'yes');
 const native=new URL(origin);assert.equal(native.hostname,'127.0.0.1');assert.equal(native.protocol,'http:');
 const dir=resolve(root,'tests/fixtures/f56-browser');
 const cookies=new Map();
 const assets={'/fixture.js':['fixture.js','text/javascript'],'/admin-fixture.js':['admin-fixture.js','text/javascript'],'/fixture.css':['fixture.css','text/css']};
 const rolePaths=new Set(['customer','provider','outsider','admin']);
 let base;
 function send(res,status,body,headers={}){
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",...headers});res.end(body);
 }
 function html(res,body){send(res,200,body,{'Content-Type':'text/html; charset=utf-8'});}
 async function body(req){
  let s='';for await(const chunk of req){s+=chunk;if(s.length>16000)throw Error('body limit');}return s;
 }
 const post=(path,jwt,value)=>call(path,{method:'POST',jwt,contentType:'application/json',body:JSON.stringify(value)});
 async function nativeJSON(p,opts){const r=await call(p,opts);if(!r.ok)throw Error('native rejected');return r.json();}
 async function state(jwt){
  const get=(table,columns,filter)=>nativeJSON('/rest/v1/'+table+'?select='+columns+'&'+filter,{jwt});
  const f='session_id=eq.'+session;
  const [ss,cc,gg,mm]=await Promise.all([
   get('f5_mock_sessions','status','id=eq.'+session),
   get('f6_mock_completions','status,summary,provider_confirmed_at,customer_confirmed_at,rating_stars',f),
   get('f5_mock_latest_location','session_id',f),get('f5_mock_messages','id',f)]);
  const c=cc[0];
  return {sessionStatus:ss[0]?.status??null,completionStatus:c?.status??null,summary:c?.summary??null,
    providerConfirmed:!!c?.provider_confirmed_at,customerConfirmed:!!c?.customer_confirmed_at,rated:!!c?.rating_stars,
    gpsVisible:gg.length>0,messageCount:mm.length};
 }
 const srv=http.createServer(async(req,res)=>{
  try{
   if(req.socket.remoteAddress!=='127.0.0.1'||req.headers.host!==new URL(base).host)return send(res,403,'{}');
   const u=new URL(req.url,base);if(u.origin!==base||u.search||u.hash)return send(res,400,'{}');
   if(assets[u.pathname]&&req.method==='GET'){const [p,type]=assets[u.pathname];return send(res,200,readFileSync(resolve(dir,p)),{'Content-Type':type});}
   const m=/^\/(customer|provider|outsider|admin)\/(login|state|action|snapshot|event|receipt)?$/.exec(u.pathname);
   if(!m||!rolePaths.has(m[1]))return send(res,404,'{}');
   const [,role,kind]=m;
   if(kind==='login'&&req.method==='POST'){
    if(req.headers.origin!==base||!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded'))return send(res,403,'{}');
    const form=new URLSearchParams(await body(req));
    if(form.getAll('email').length!==1||form.getAll('password').length!==1)return send(res,400,'{}');
    const r=await post('/auth/v1/token?grant_type=password',undefined,{email:form.get('email'),password:form.get('password')});
    if(!r.ok)return send(res,403,'{}');
    const a=await r.json();if(!a.access_token||!a.user?.id)return send(res,403,'{}');
    const key=randomBytes(32).toString('hex');cookies.set(key,{jwt:a.access_token,scope:randomBytes(16).toString('hex')});
    return send(res,303,'',{'Location':'/'+role+'/','Set-Cookie':'sm_fixture='+key+'; HttpOnly; SameSite=Strict; Path=/'});
   }
   const token=/^sm_fixture=([0-9a-f]{64})$/.exec(req.headers.cookie??'')?.[1];
   const login=cookies.get(token);const jwt=login?.jwt;
   if(!jwt){
    if(!kind&&req.method==='GET')return html(res,'<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Autenticação local</title><link rel="stylesheet" href="/fixture.css"><main><h1>Entrar no ensaio Salva Motoca!</h1><form method="post" action="/'+role+'/login"><label for="email">E-mail fictício</label><input id="email" name="email" type="email" required><label for="password">Senha de teste</label><input id="password" name="password" type="password" required><button type="submit">Entrar</button></form></main></html>');
    return send(res,401,'{}');
   }
   if(!kind&&req.method==='GET'){
    const source=readFileSync(resolve(dir,role==='admin'?'admin.html':'index.html'),'utf8');
    return html(res,source.replace('<body>','<body data-receipt-scope="'+login.scope+'">').replace('Identidade simulada','Auth local — conta fictícia').replace('Identidade de ensaio, não autenticação real.','Auth nativo local, conta de ensaio.'));
   }
   if(kind==='state'&&req.method==='GET')return send(res,200,JSON.stringify(await state(jwt)));
   if(kind==='snapshot'&&req.method==='GET'){
    const r=await post('/rest/v1/rpc/f7_mock_admin_snapshot',jwt,{});return send(res,r.status,r.ok?await r.text():'{}');
   }
   if(kind==='receipt'&&req.method==='POST'){
    if(req.headers.origin!==base||!req.headers['content-type']?.startsWith('application/json'))return send(res,403,'{}');
    const v=JSON.parse(await body(req));
    if(!v||Object.keys(v).length!==1||typeof v.eventId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.eventId))return send(res,400,'{}');
    const r=await post('/rest/v1/rpc/f56_fixture_receipt',jwt,{p_session:session,p_event:v.eventId});return send(res,r.status,r.ok?await r.text():'{}');
   }
   if(req.method==='POST'&&(kind==='action'||kind==='event')){
    if(req.headers.origin!==base||!req.headers['content-type']?.startsWith('application/json'))return send(res,403,'{}');
    const v=JSON.parse(await body(req));
    const [name,params]=kind==='action'
      ?['f56_apply_fixture',{p_session:session,p_event:v.eventId,p_action:v.action,p_payload:v.payload}]
      :['f23_mock_apply_event',{p_case_key:v.caseKey,p_event_key:v.eventKey,p_action:v.action,p_reason_code:v.reason}];
    const r=await post('/rest/v1/rpc/'+name,jwt,params);return send(res,r.status,r.ok?await r.text():'{}');
   }
   send(res,405,'{}');
  }catch{if(!res.headersSent)send(res,503,'{}');else res.end();}
 });
 let browser;const errors=[],external=[];
 const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
 async function textIs(p,id,value){await p.waitForFunction(({id,value})=>document.getElementById(id)?.textContent===value,{id,value});}
 async function click(p,a){
  const response=p.waitForResponse(r=>r.url().endsWith('/action')&&r.request().method()==='POST');
  await p.locator('[data-action="'+a+'"]').click();
  const r=await response;assert.equal(r.status(),200,a);
  const d=await r.json();assert.equal(d.mockOnly,true);assert.equal(d.transferAuthorized,false);
  await textIs(p,'stage',d.sessionStatus);await textIs(p,'completion',d.completionStatus||'');
  await p.waitForFunction(()=>!document.getElementById('refresh').disabled);
 }
 try{
  await new Promise((resolve,reject)=>{srv.once('error',reject);srv.listen(0,'127.0.0.1',resolve);});
  base='http://127.0.0.1:'+srv.address().port;
  assert.ok(chrome,'Chrome required');
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  async function open(role,width){
   const p=await browser.newPage({viewport:{width,height:850}});
   p.on('pageerror',()=>errors.push('page error'));
   await p.route('**/*',r=>{if(!r.request().url().startsWith(base+'/')){external.push('external');return r.abort();}return r.continue();});
   await p.goto(base+'/'+role+'/');
   await p.locator('#email').fill(actors[role].email);await p.locator('#password').fill(actors[role].password);
   await p.getByRole('button',{name:'Entrar'}).click();
   await p.waitForSelector('#refresh');
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   return p;
  }
  const a=await open('customer',375),b=await open('provider',1100),d=await open('outsider',375),admin=await open('admin',375);
  await textIs(a,'stage','ready_for_dispatch');await textIs(b,'stage','ready_for_dispatch');await textIs(d,'stage','Sem acesso');
  await textIs(admin,'sessions','Sessões: 2');
  await textIs(admin,'stripe-status','Ensaio isolado — somente leitura');
  await textIs(admin,'stripe-held','Tentativas retidas: 1');
  await admin.waitForFunction(()=>document.getElementById('stripe-refunds').textContent.includes('25,00'));
  await textIs(admin,'stripe-evidence','Evidências sem retenção: 0');
  assert.equal(await admin.locator('#stripe-held').count(),1);
  console.log('NATIVE_STRIPE_BROWSER=PASS SEPARATE_RISK_DISPLAY=PASS');
  const attack={eventId:randomUUID(),action:'dispatch',payload:{consent:true}};
  assert.ok([400,401,403].includes((await a.request.post(base+'/provider/action',{headers:{Origin:base},data:attack})).status()));
  const noAdmin=await a.request.get(base+'/admin/snapshot');assert.ok([400,401,403].includes(noAdmin.status()));
  // Exercise an actual committed write with the response lost in transit.
  // The only retry must carry the same event identifier and payload.
  const beforeMessages=Number(sql("select count(*) from public.f5_mock_messages where session_id='"+session+"'"));
  let firstBody,retryBody;
  const loseResponse=async route=>{
   if(route.request().method()!=='POST')return route.continue();
   firstBody=route.request().postData();
   const committed=await route.fetch();
   assert.equal(committed.status(),200);
   await route.abort('failed');
  };
  await a.route('**/customer/action',loseResponse,{times:1});
  await a.locator('#body').fill('Mensagem por Auth local');
  await a.locator('[data-action="message"]').click();
  await a.locator('#retry').waitFor({state:'visible'});
  await a.waitForFunction(()=>!document.getElementById('retry').disabled);
  assert.equal(Number(sql("select count(*) from public.f5_mock_messages where session_id='"+session+"'")),beforeMessages+1);
  assert.ok(await a.locator('[data-action="message"]').isDisabled());
  // Editing the input must not alter the pending body.
  await a.locator('#body').fill('Texto alterado após falha');
  await a.route('**/customer/action',route=>{retryBody=route.request().postData();return route.continue();},{times:1});
  await a.locator('#retry').click();
  await a.locator('#retry').waitFor({state:'hidden'});
  assert.equal(retryBody,firstBody);
  assert.equal(Number(sql("select count(*) from public.f5_mock_messages where session_id='"+session+"'")),beforeMessages+1);
  // A second lost response is recovered after a reload, with no message
  // or credential stored in browser storage and no second mutation.
  let recordedId;
  await a.route('**/customer/action',async route=>{
   recordedId=JSON.parse(route.request().postData()).eventId;
   const r=await route.fetch();assert.equal(r.status(),200);await route.abort('failed');
  },{times:1});
  await a.locator('#body').fill('Mensagem para recuperar após recarga');
  await a.locator('[data-action="message"]').click();
  await a.locator('#retry').waitFor({state:'visible'});
  await a.waitForFunction(()=>!document.getElementById('retry').disabled);
  const browserStorage=await a.evaluate(()=>({session:Object.entries(sessionStorage),local:Object.entries(localStorage)}));
  assert.equal(browserStorage.session.length,1);assert.equal(browserStorage.session[0][1],recordedId);assert.deepEqual(browserStorage.local,[]);
  const own=await a.request.post(base+'/customer/receipt',{headers:{Origin:base},data:{eventId:recordedId}});
  assert.deepEqual(await own.json(),{mockOnly:true,transferAuthorized:false,recorded:true});
  const other=await b.request.post(base+'/provider/receipt',{headers:{Origin:base},data:{eventId:recordedId}});
  assert.equal(other.status(),200);assert.equal((await other.json()).recorded,false);
  const denied=await d.request.post(base+'/outsider/receipt',{headers:{Origin:base},data:{eventId:recordedId}});
  assert.ok([400,401,403].includes(denied.status()));
  await a.reload();
  await textIs(a,'feedback','Envio anterior confirmado pelo servidor.');
  await a.waitForFunction(()=>!document.getElementById('refresh').disabled);
  assert.equal(await a.evaluate(()=>sessionStorage.length),0);
  assert.equal(Number(sql("select count(*) from public.f5_mock_messages where session_id='"+session+"'")),beforeMessages+2);
  console.log('NATIVE_RECEIPT_RECOVERY=PASS RELOAD=PASS ACTOR_SCOPE=PASS NO_PAYLOAD_STORAGE=PASS SINGLE_WRITE=PASS');
  // Narrow viewport and keyboard focus, without claiming a physical Android.
  await a.setViewportSize({width:320,height:720});
  assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await a.locator('#refresh').focus();
  await a.keyboard.press('Tab');
  assert.ok(await a.evaluate(()=>document.activeElement!==document.body));
  assert.ok(await a.locator('#refresh').evaluate(el=>el.getBoundingClientRect().height>=44));
  console.log('NATIVE_MOBILE_RETRY=PASS SAME_EVENT_ID=PASS SINGLE_MESSAGE=PASS VIEWPORT_320=PASS');

  await b.locator('#consent').check();await click(b,'dispatch');await click(b,'location');
  await a.locator('#refresh').click();await textIs(a,'gps','Localização fictícia visível');
  await a.context().setOffline(true);
  await a.locator('#refresh').click();
  await textIs(a,'stage','Situação indisponível');
  await textIs(a,'gps','Localização indisponível');
  assert.ok(await a.locator('[data-action="message"]').isDisabled());
  await a.context().setOffline(false);
  await a.locator('#refresh').click({timeout:15000});
  await textIs(a,'gps','Localização fictícia visível');
  console.log('NATIVE_MOBILE_OFFLINE=PASS STALE_GPS_CLEARED=PASS RECONNECTED=PASS');
  await d.locator('#refresh').click();await textIs(d,'gps','Localização indisponível');
  await click(b,'arrive');await a.locator('#refresh').click();await textIs(a,'gps','Localização indisponível');
  await click(b,'start');await click(b,'handoff');await click(b,'summary');await click(b,'provider_confirm');
  await a.locator('#refresh').click();await textIs(a,'completion','awaiting_both');
  await a.locator('#summaryRead').check();await click(a,'customer_confirm');await click(a,'rating');
  const review=JSON.parse(sql("set app.f4_test_only='local_fixture';select private.f4_queue_mock_settlement_review('"+attempt+"','settle_browser_native',true,true);"));
  assert.equal(review.transferAuthorized,false);
  await admin.locator('#refresh').click();await textIs(admin,'candidates','Revisões possíveis: 1');
  await click(a,'dispute');await a.locator('#body').fill('Divergência via navegador');await click(a,'support_message');
  assert.equal(sql("select status from private.f4_mock_settlement_intents where attempt_id='"+attempt+"'"),'held');
  await admin.locator('#refresh').click();await textIs(admin,'held','Revisões retidas: 2');
  // The path does not choose identity, and the cookie cannot retain revoked Auth authority.
  sql("delete from auth.sessions where user_id='"+actors.admin.id+"'");
  const revoked=await admin.request.get(base+'/admin/snapshot');assert.ok([400,401,403].includes(revoked.status()));
  await admin.locator('#refresh').click();
  await textIs(admin,'stripe-status','Indisponível');
  await textIs(admin,'held','');
  await textIs(admin,'queue','Situação indisponível. Atualize a consulta.');
  console.log('NATIVE_ADMIN_STALE_STATE=PASS REVOKED_SESSION_CLEARED=PASS');
  assert.equal(sql('select count(*) from public.payment_records'),'0');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('NATIVE_BROWSER=PASS AUTH_LOGIN=PASS ROLE_PATH_BYPASS=DENIED GPS_ERASED=PASS REVIEW_HELD=PASS REVOKED_ADMIN=DENIED REAL_PAYMENTS=0');
 }finally{
  cookies.clear();if(browser)await browser.close();if(srv.listening){srv.closeAllConnections();await new Promise(resolve=>srv.close(resolve));}
 }
}
