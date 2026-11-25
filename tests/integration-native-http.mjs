// Historical F1-F4 native HTTP integration; no hosted endpoint or credential.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(process.argv[3]||'.');
const fixture=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(process.env.SM_NATIVE_INTEGRATION_FIXTURE,'yes');
assert.equal(fixture.runtime,'native');
const e=fixture.env;
const api=new URL(e.API_URL),db=new URL(e.DB_URL);
assert.equal(api.protocol,'http:');assert.equal(api.hostname,'127.0.0.1');
assert.equal(db.hostname,'127.0.0.1');assert.equal(db.pathname,'/postgres');
assert.ok(api.port&&db.port&&api.port!==db.port);
assert.match(e.PUBLISHABLE_KEY,/^sb_publishable_/);
assert.ok(e.SERVICE_ROLE_KEY);
const origin=api.origin;
const env={PATH:process.env.PATH,PGHOST:db.hostname,PGPORT:db.port,PGDATABASE:'postgres',PGUSER:decodeURIComponent(db.username),PGPASSWORD:decodeURIComponent(db.password),PGCONNECT_TIMEOUT:'5',PGSSLMODE:'disable'};
function sql(s){return execFileSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{env,input:s,stdio:['pipe','pipe','pipe']}).toString().trim()}
const uuid=()=>randomUUID();
const png=readFileSync(resolve(root,'scripts/f1-work-storage-e2e.mjs'),'utf8').match(/const JPG = Buffer\.from\(\s*"([^"]+)"/)?.[1];
assert.ok(png);const jpg=Buffer.from(png,'base64');
let checks=0,step='initial';
function pass(label){checks++;console.log('PASS '+label)}
async function call(path,{method='GET',jwt,key=e.PUBLISHABLE_KEY,body,contentType,extra={}}={}){
 const u=new URL(path,origin);
 assert.equal(u.origin,origin);
 const headers={apikey:key,...extra};
 if(jwt)headers.Authorization='Bearer '+jwt;
 if(contentType)headers['Content-Type']=contentType;
 return fetch(u,{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(20000)});
}
async function ok(label,op){step=label;const r=await op();assert.ok(r.ok,label+' HTTP '+r.status);pass(label);return r}
async function deny(label,op){step=label;const r=await op();assert.ok(r.status>=400&&r.status<500&&r.status!==429,label+' HTTP '+r.status);pass(label);return r}
async function actor(label){
 const email='f1-'+uuid()+'@example.invalid',password=randomBytes(24).toString('hex');
 const admin=await ok('local auth admin '+label,()=>call('/auth/v1/admin/users',{method:'POST',jwt:e.SERVICE_ROLE_KEY,key:e.SERVICE_ROLE_KEY,contentType:'application/json',body:JSON.stringify({email,password,email_confirm:true})}));
 const u=await admin.json();
 const login=await ok('real local JWT '+label,()=>call('/auth/v1/token?grant_type=password',{method:'POST',contentType:'application/json',body:JSON.stringify({email,password})}));
 const a=await login.json();assert.equal(a.user.id,u.id);assert.ok(a.access_token);
 return {id:u.id,jwt:a.access_token};
}
const signBody=JSON.stringify({expiresIn:20});
function signedPath(v){
 const p=v.signedURL||v.signedUrl;assert.equal(typeof p,'string');
 // Storage API returns a relative /object/sign/... or an absolute local URL.
 const raw=p.startsWith('/object/sign/')?'/storage/v1'+p:p;
 const u=new URL(raw,origin);assert.equal(u.origin,origin);
 assert.ok(u.pathname.startsWith('/storage/v1/object/sign/request-photos/'));
 return u.pathname+u.search;
}

const json=(value)=>JSON.stringify(value);
const post=(path,actor,value)=>call(path,{method:'POST',jwt:actor?.jwt,contentType:'application/json',body:json(value)});
const rpc=(name,actor,params)=>post('/rest/v1/rpc/'+name,actor,params);
const result=async(label,op)=>(await ok(label,op)).json();
async function main(){
 step='empty native database';
 assert.equal(sql('select count(*) from auth.users'),'0');
 assert.equal(sql('select count(*) from storage.objects'),'0');
 assert.equal(sql("select to_regclass('public.service_requests') is null"),'t');
 const history=resolve(root,'tests/fixtures/hosted-history');
 const hashes=readFileSync(resolve(history,'SHA256SUMS'),'utf8').trim().split('\n');
 assert.equal(hashes.length,7);
 for(const line of hashes){
  const [expected,name]=line.trim().split(/\s+/);
  assert.match(name,/^\d{14}_[a-z_]+\.sql$/);
  assert.equal(createHash('sha256').update(readFileSync(resolve(history,name))).digest('hex'),expected);
 }
 const dirs=[resolve(root,'supabase/migrations'),history];
 const migrations=dirs.flatMap(dir=>readdirSync(dir).filter(x=>/^\d{14}_.*\.sql$/.test(x)).map(name=>({name,path:resolve(dir,name)}))).sort((a,b)=>a.name.localeCompare(b.name));
 assert.equal(migrations.length,11);
 for(const m of migrations)sql(readFileSync(m.path,'utf8'));
 pass('eleven historical migrations replayed against native Auth and Storage');
 for(const name of ['f2_backend_candidate','f3_tow_backend_candidate','f4_financial_backend_candidate','f4_double_entry_mock_candidate','f4_risk_settlement_mock_candidate','f23_historical_compatibility_candidate','f34_historical_finance_presence_candidate','f5_backend_rls_mock_candidate','f6_backend_rls_mock_candidate','f23_incidents_persistence_candidate','f23_incident_intake_candidate','f23_incident_historical_access_candidate','f456_historical_persisted_bridge_candidate','f56_authenticated_fixture_api_candidate','f7_persisted_admin_snapshot_candidate']){
  step='candidate '+name;sql(readFileSync(resolve(root,'supabase/drafts',name+'.sql'),'utf8'));
 }
 sql(readFileSync(resolve(root,'tests/fixtures/native-f56-context.sql'),'utf8'));
 assert.equal(sql('select not (select enabled from private.f2_release_gate) and not (select enabled from private.f3_release_gate) and not (select enabled from private.f4_release_gate)'),'t');
 sql("notify pgrst, 'reload schema'");
 const a=await actor('customer'),b=await actor('provider B'),c=await actor('provider C'),d=await actor('outsider');
 assert.equal(new Set([a.id,b.id,c.id,d.id]).size,4);
 const pb=uuid(),pc=uuid(),req=uuid(),photo=uuid();
 sql("insert into public.providers(id,owner_id,display_name,city,state_code,latitude,longitude,status,is_active,approved_at) values "+
 "('"+pb+"','"+b.id+"','Fixture B','Belo Horizonte','MG',-19.925,-43.939,'approved',true,now()),"+
 "('"+pc+"','"+c.id+"','Fixture C','Contagem','MG',-19.926,-43.938,'approved',true,now());"+
 "insert into public.provider_services(provider_id,category_id,is_active) select p.id,c.id,true from public.providers p cross join public.service_categories c where c.code in ('borracharia_delivery','reboque_moto');");
 // No arbitrary sleeps for schema readiness: wait for endpoint discovery.
 step='PostgREST schema cache';
 let ready=false;
 for(let i=0;i<30;i++){
  const r=await call('/rest/v1/service_requests?select=f2_mode&limit=0',{jwt:a.jwt});
  if(r.ok){ready=true;break}
  await new Promise(r=>setTimeout(r,500));
 }
 assert.ok(ready);
 const path=a.id+'/'+photo+'.jpg';
 const upload='/storage/v1/object/request-photos/'+path;
 const sign='/storage/v1/object/sign/request-photos/'+path;
 const body={id:req,request_key:photo,customer_id:a.id,category_id:2,provider_id:null,
  motorcycle_brand:'Honda',motorcycle_model:'CG 160',motorcycle_year:2024,
  service_types:['pneu_furado'],photo_path:path,latitude:-19.924,longitude:-43.938,
  problem_description:'Problema sintetico',f2_mode:'automatic'};
 await ok('native JPEG upload by owner',()=>call(upload,{method:'POST',jwt:a.jwt,contentType:'image/jpeg',body:jpg,extra:{'x-upsert':'false'}}));
 await deny('automatic request denied with closed F2 gate',()=>post('/rest/v1/service_requests',a,body));
 await deny('anonymous RPC denied',()=>rpc('f2_offer_candidates',null,{p_request_id:req,p_max_offers:3}));
 sql('update private.f2_release_gate set enabled=true; update private.f3_release_gate set enabled=true; update private.f4_release_gate set enabled=true;');
 for(const p of [b,c]){
  await ok('provider capacity native RPC',()=>rpc('f2_set_capacity',p,{p_services:['pneu_furado'],p_coverage_km:60}));
  await ok('provider presence native RPC',()=>rpc('bj_set_presence',p,{p_online:true}));
 }
 await ok('automatic request through native REST',()=>post('/rest/v1/service_requests',a,body));
 await deny('uninvited provider photo denied',()=>post(sign,b,{expiresIn:20}));
 assert.equal(await result('two invitations via native RPC',()=>rpc('f2_offer_candidates',a,{p_request_id:req,p_max_offers:3})),2);
 const offers=await result('customer lists offers',()=>call('/rest/v1/f2_request_offers?select=id,provider_id&request_id=eq.'+req,{jwt:a.jwt}));
 assert.equal(offers.length,2);
 const quoteIds=[];
 for(const [p,pid,service] of [[b,pb,23000],[c,pc,24000]]){
  const own=offers.find(x=>x.provider_id===pid);assert.ok(own);
  const signed=await result('invited provider signs private photo',()=>post(sign,p,{expiresIn:20}));
  const image=await ok('signed image returns exact bytes',()=>call(signedPath(signed)));
  assert.deepEqual(Buffer.from(await image.arrayBuffer()),jpg);
  await ok('provider acknowledges offer',()=>rpc('f2_ack_offer',p,{p_offer_id:own.id}));
  quoteIds.push(await result('itemized quote persisted',()=>rpc('f2_submit_quote',p,{p_offer_id:own.id,p_items:[{kind:'service',code:'pneu_furado',amountCents:service},{kind:'travel',code:'deslocamento',amountCents:4000}],p_details:'Fixture'})));
 }
 await deny('unrelated account cannot sign',()=>post(sign,d,{expiresIn:20}));
 const hidden=await result('outsider request query filtered',()=>call('/rest/v1/service_requests?select=id&id=eq.'+req,{jwt:d.jwt}));assert.deepEqual(hidden,[]);
 const comparison=await result('customer compares two quotes',()=>call('/rest/v1/service_quotes?select=id,status,amount_cents&request_id=eq.'+req,{jwt:a.jwt}));assert.equal(comparison.length,2);
 await deny('outsider cannot decide quote',()=>rpc('f2_decide_quote',d,{p_quote_id:quoteIds[0],p_accept:true}));
 assert.equal(await result('customer accepts itemized quote',()=>rpc('f2_decide_quote',a,{p_quote_id:quoteIds[0],p_accept:true})),'awaiting_payment');
 await deny('second acceptance denied',()=>rpc('f2_decide_quote',a,{p_quote_id:quoteIds[1],p_accept:true}));
 await deny('losing provider cannot issue new photo URL',()=>post(sign,c,{expiresIn:20}));
 await deny('exact coordinates not selectable',()=>call('/rest/v1/service_requests?select=latitude,longitude&id=eq.'+req,{jwt:b.jwt}));
 assert.deepEqual(await result('location RPC before payment empty',()=>rpc('bj_get_request_location',b,{p_request_id:req})),[]);
 await deny('chat before payment denied',()=>post('/rest/v1/request_messages',b,{request_id:req,sender_id:b.id,body:'Fixture'}));
 const preview=await result('native F4 preview 10+10',()=>rpc('f4_quote_preview',a,{p_quote_id:quoteIds[0]}));
 assert.equal(preview.customerSubtotalBeforeProcessingCents,29300);assert.equal(preview.expectedProviderCents,24700);assert.equal(preview.commissionCents,4600);assert.equal(preview.processingFeeCents,null);assert.equal(preview.paymentAuthorized,false);
 await deny('outsider financial preview denied',()=>rpc('f4_quote_preview',d,{p_quote_id:quoteIds[0]}));
 assert.equal(sql('select count(*) from public.payment_records'),'0');
 assert.equal(sql("select count(*) from public.service_quotes where status='accepted'"),'1');

 // Second journey: exclusive certified tow provider, actual local JWTs.
 const admin=await actor('admin');
 sql("insert into private.f23_mock_admins(user_id) values('"+admin.id+"');"+
 "update private.f23_mock_support_gate set enabled=true;"+
 "update private.f5_mock_release_gate set enabled=true; update private.f6_mock_release_gate set enabled=true;"+
 "update public.provider_services set is_active=false where provider_id='"+pc+"' and category_id=2;");
 await deny('native admin marker absent',()=>rpc('f7_mock_admin_snapshot',admin,{}));
 sql("insert into private.f56_native_fixture_marker(singleton,purpose) values(true,'SM_NATIVE_EPHEMERAL_CI_ONLY');");
 await ok('native tow capacity registration',()=>rpc('f3_set_tow_capacity',c,{p_equipment:'plataforma',p_max_moto_kg:220,p_coverage_km:60,p_tie_down_points:4,p_has_ramp:true,p_has_wheel_chock:true}));
 sql("update public.f3_tow_provider_capacity set verified_by_admin=true where provider_id='"+pc+"'");
 await ok('exclusive tow provider online',()=>rpc('bj_set_presence',c,{p_online:true}));
 const towKey=uuid(),towPath=a.id+'/'+towKey+'.jpg';
 await ok('tow photo native upload',()=>call('/storage/v1/object/request-photos/'+towPath,{method:'POST',jwt:a.jwt,contentType:'image/jpeg',body:jpg,extra:{'x-upsert':'false'}}));
 const towReq=await result('native tow request',()=>rpc('f3_create_tow_request',a,{
 p_request_key:towKey,p_photo_path:towPath,p_brand:'Honda',p_model:'CG 160',p_year:2024,
 p_weight_kg:140,p_service_types:['reboque_moto'],p_description:'Reboque sintetico de teste',
 p_pickup_lat:-19.924,p_pickup_lng:-43.938,p_pickup_city:'Belo Horizonte',p_pickup_state:'MG',
 p_destination_city:'Nova Lima',p_destination_state:'MG',p_destination_address:'Destino sintetico privado',
 p_estimated_km:25,p_mode:'automatic',p_selected_provider:null}));
 assert.match(towReq,/^[0-9a-f-]{36}$/i);
 assert.equal(await result('native tow candidates',()=>rpc('f3_offer_candidates',a,{p_request_id:towReq,p_max_offers:3})),1);
 const towOffers=await result('native tow offers',()=>call('/rest/v1/f2_request_offers?select=id,provider_id&request_id=eq.'+towReq,{jwt:a.jwt}));
 assert.equal(towOffers.length,1);assert.equal(towOffers[0].provider_id,pc);
 const summary=await result('invited tow summary',()=>rpc('f3_tow_summary',c,{p_request_id:towReq}));
 assert.equal(summary.destinationCity,'Nova Lima');assert.ok(!JSON.stringify(summary).includes('Destino sintetico privado'));
 await deny('outsider tow summary denied',()=>rpc('f3_tow_summary',d,{p_request_id:towReq}));
 await ok('native tow ACK',()=>rpc('f2_ack_offer',c,{p_offer_id:towOffers[0].id}));
 const towQuote=await result('native tow quote',()=>rpc('f3_submit_tow_quote',c,{p_offer_id:towOffers[0].id,p_items:[{kind:'service',code:'reboque_moto',amountCents:23000},{kind:'travel',code:'deslocamento',amountCents:4000}],p_details:'Fixture'}));
 assert.equal(await result('native tow acceptance',()=>rpc('f3_decide_tow_quote',a,{p_quote_id:towQuote,p_accept:true})),'awaiting_payment');
 // The provider is never allowed to create the payment evidence. An isolated
 // privileged fixture records an explicitly mock financial journal.
 const attempt=sql("set app.f4_test_only='local_fixture';select private.f4_prepare_mock_attempt('"+towQuote+"');");
 assert.match(attempt,/^[0-9a-f-]{36}$/i);
 const event='native_fixture_'+uuid();
 sql("set app.f4_test_only='local_fixture';select private.f4_ingest_mock_event('"+attempt+"','"+event+"','mock_payment_verified',29300);select private.f4_post_mock_double_entry(id) from private.f4_mock_webhook_receipts where mock_event_id='"+event+"';");
 const session=uuid();
 sql("insert into public.f5_mock_sessions(id,request_id,quote_id,customer_id,provider_id,provider_owner_id,mock_paid,status) values ('"+session+"','"+towReq+"','"+towQuote+"','"+a.id+"','"+pc+"','"+c.id+"',true,'ready_for_dispatch');");
 const eventParams=(action,payload={},id=uuid())=>({p_session:session,p_event:id,p_action:action,p_payload:payload});
 const invoke=(actor,action,payload={},id=uuid())=>rpc('f56_apply_fixture',actor,eventParams(action,payload,id));
 const act=async(label,actor,action,payload={},id=uuid())=>{
  const r=await result(label,()=>invoke(actor,action,payload,id));
  assert.equal(r.mockOnly,true);assert.equal(r.realPayment,false);assert.equal(r.transferAuthorized,false);return r;
 };
 await deny('anonymous operational RPC denied',()=>invoke(null,'message',{body:'Fixture'}));
 await deny('outsider operational RPC denied',()=>invoke(d,'message',{body:'Fixture'}));
 await deny('customer cannot dispatch',()=>invoke(a,'dispatch',{consent:true}));
 const msgId=uuid();
 await act('native participant message',a,'message',{body:'Mensagem sintetica'},msgId);
 assert.equal((await act('native event replay',a,'message',{body:'Mensagem sintetica'},msgId)).idempotent,true);
 await deny('native conflicting replay denied',()=>invoke(a,'message',{body:'Outro texto'},msgId));
 await act('native dispatch consent',c,'dispatch',{consent:true});
 await act('native location fixture',c,'location',{lat:-19.92,lng:-43.93,accuracy:15,sampledAt:new Date().toISOString()});
 const readGPS=p=>call('/rest/v1/f5_mock_latest_location?select=session_id,latitude,longitude&session_id=eq.'+session,{jwt:p.jwt});
 assert.equal((await result('native customer reads current GPS',()=>readGPS(a))).length,1);
 assert.deepEqual(await result('native outsider GPS filtered',()=>readGPS(d)),[]);
 await act('native arrival',c,'arrive');
 assert.deepEqual(await result('native GPS removed after arrival',()=>readGPS(a)),[]);
 assert.equal(sql("select count(*) from public.f5_mock_latest_location where session_id='"+session+"'"),'0');
 await act('native service start',c,'start');
 await act('native completion handoff',c,'handoff');
 await act('native summary',c,'summary',{body:'Resumo sintetico de atendimento'});
 await act('native provider confirmation',c,'provider_confirm');
 await deny('unrelated customer confirmation denied',()=>invoke(b,'customer_confirm',{summaryRead:true}));
 await act('native customer confirmation',a,'customer_confirm',{summaryRead:true});
 await act('native rating',a,'rating',{stars:5});
 const final=await result('native completion read',()=>call('/rest/v1/f6_mock_completions?select=status,rating_stars&session_id=eq.'+session,{jwt:a.jwt}));
 assert.deepEqual(final,[{status:'completed',rating_stars:5}]);
 const queued=JSON.parse(sql("set app.f4_test_only='local_fixture';select private.f4_queue_mock_settlement_review('"+attempt+"','settle_native_fixture',true,true);"));
 assert.equal(queued.status,'review_only');assert.equal(queued.transferAuthorized,false);
 const adminView=await result('native authorized admin snapshot',()=>rpc('f7_mock_admin_snapshot',admin,{}));
 assert.equal(adminView.reviewCandidates,1);assert.equal(adminView.providerReviewCents,24700);assert.equal(adminView.realFundsAvailable,null);
 await deny('native regular customer admin denied',()=>rpc('f7_mock_admin_snapshot',a,{}));
 await act('native late dispute',a,'dispute');
 await act('native support message',a,'support_message',{body:'Divergencia sintetica'});
 const caseKey=uuid();
 await ok('native financial incident',()=>rpc('f23_mock_submit_incident',a,{p_case_key:caseKey,p_request_key:towReq,p_category:'payment_dispute'}));
 const adminEvent=(actor,action,reason=null)=>rpc('f23_mock_apply_event',actor,{p_case_key:caseKey,p_event_key:uuid(),p_action:action,p_reason_code:reason});
 await deny('native customer cannot review incident',()=>adminEvent(a,'acknowledge'));
 for(const [action,reason] of [['acknowledge',null],['start_review',null],['resolve_review_mock','financial_reviewed_mock']])
  await ok('native audited admin '+action,()=>adminEvent(admin,action,reason));
 const held=await result('native admin hold retained',()=>rpc('f7_mock_admin_snapshot',admin,{}));
 assert.equal(held.heldReviews,1);assert.equal(held.reviewCandidates,0);assert.equal(held.providerReviewCents,0);
 assert.equal(sql('select count(*) from public.payment_records'),'0');
 // Revoke actual local Auth session; the extra guard must reject even if
 // PostgREST still recognizes the unexpired signed access token.
 sql("delete from auth.sessions where user_id='"+admin.id+"'");
 await deny('revoked native admin session denied',()=>rpc('f7_mock_admin_snapshot',admin,{}));
 sql("delete from private.f56_native_fixture_marker; update private.f5_mock_release_gate set enabled=false; update private.f6_mock_release_gate set enabled=false; update private.f23_mock_support_gate set enabled=false;");
 console.log('NATIVE_F3_F5_F6_F7=PASS REVOKED_AUTH=DENIED REVIEW_HELD=PASS REAL_PAYMENTS=NONE');

 sql('update private.f2_release_gate set enabled=false; update private.f3_release_gate set enabled=false; update private.f4_release_gate set enabled=false;');
 await deny('financial RPC closes again',()=>rpc('f4_quote_preview',a,{p_quote_id:quoteIds[0]}));
 console.log('NATIVE_HISTORY_F1_F7=PASS HTTP_CHECKS='+checks+' AUTH_NATIVE=PASS STORAGE_NATIVE=PASS REST_NATIVE=PASS HOSTED_WRITES=NONE REAL_PAYMENTS=NONE RELEASE=NO_GO');
}
main().catch(()=>{console.error('NATIVE_HISTORY=FAIL step='+step);process.exitCode=1});
