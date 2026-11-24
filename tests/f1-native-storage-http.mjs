// Full HTTP test on disposable Supabase Native only. Never use hosted credentials.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(process.argv[3]||'.');
const fixture=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(process.env.F1_NATIVE_FIXTURE_ONLY,'yes');
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
async function deny(label,op){step=label;const r=await op();assert.ok(r.status>=400&&r.status<500,label+' HTTP '+r.status);pass(label);return r}
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
async function main(){
 step='empty local fixture';
 assert.equal(sql("SELECT count(*) FROM auth.users"),'0');
 assert.equal(sql("SELECT count(*) FROM storage.objects"),'0');
 assert.equal(sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='service_requests'"),'0');
 sql(`CREATE TABLE public.providers(id uuid PRIMARY KEY,owner_id uuid NOT NULL);
 CREATE TABLE public.service_requests(id uuid PRIMARY KEY,request_key uuid NOT NULL UNIQUE,customer_id uuid NOT NULL,provider_id uuid,address_details text,latitude numeric,longitude numeric);
 ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
 ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
 CREATE POLICY fixture_providers_read ON public.providers FOR SELECT TO authenticated USING(true);
 CREATE POLICY fixture_request_insert ON public.service_requests FOR INSERT TO authenticated WITH CHECK(customer_id=(SELECT auth.uid()));
 CREATE POLICY fixture_request_read ON public.service_requests FOR SELECT TO authenticated USING(customer_id=(SELECT auth.uid()) OR EXISTS(SELECT 1 FROM public.providers p WHERE p.id=provider_id AND p.owner_id=(SELECT auth.uid())));
 REVOKE ALL ON public.service_requests,public.providers FROM anon,authenticated;
 GRANT SELECT ON public.providers TO authenticated;
 GRANT SELECT(id,customer_id,provider_id),INSERT ON public.service_requests TO authenticated;`);
 sql(readFileSync(resolve(root,'supabase/migrations/20261114020317_f1_solicitacao_dados_foto_privada.sql'),'utf8'));
 sql("NOTIFY pgrst, 'reload schema'");
 pass('real F1 migration over disposable fixture');
 const a=await actor('A'),b=await actor('B'),c=await actor('C');
 assert.equal(new Set([a.id,b.id,c.id]).size,3);
 const pb=uuid(),pc=uuid(),req=uuid(),photo=uuid();
 sql(`INSERT INTO public.providers VALUES ('${pb}','${b.id}'),('${pc}','${c.id}')`);
 const key=a.id+'/'+photo+'.jpg';
 const route='/storage/v1/object/request-photos/'+key;
 const auth='/storage/v1/object/authenticated/request-photos/'+key;
 const sign='/storage/v1/object/sign/request-photos/'+key;
 const pub='/storage/v1/object/public/request-photos/'+key;
 const upload=(p)=>call(p,{method:'POST',jwt:a.jwt,contentType:'image/jpeg',body:jpg,extra:{'x-upsert':'false','cache-control':'no-store'}});
 const signAs=(actor)=>call(sign,{method:'POST',jwt:actor.jwt,contentType:'application/json',body:signBody});
 const remove=(p)=>call('/storage/v1/object/request-photos',{method:'DELETE',jwt:a.jwt,contentType:'application/json',body:JSON.stringify({prefixes:[p]})});
 await ok('author uploads JPEG',()=>upload(route));
 await deny('other namespace upload rejected',()=>upload('/storage/v1/object/request-photos/'+b.id+'/'+uuid()+'.jpg'));
 await deny('anonymous public URL rejected',()=>call(pub));
 await deny('unassigned B cannot sign',()=>signAs(b));
 await deny('outsider C cannot sign',()=>signAs(c));
 const owned=await ok('author signs',()=>signAs(a));
 const aPath=signedPath(await owned.json());
 const fetched=await ok('signed URL returns bytes without JWT',()=>call(aPath));
 assert.deepEqual(Buffer.from(await fetched.arrayBuffer()),jpg);pass('signed bytes equal');
 await ok('create synthetic request via REST',()=>call('/rest/v1/service_requests',{method:'POST',jwt:a.jwt,contentType:'application/json',body:JSON.stringify({id:req,request_key:photo,customer_id:a.id,provider_id:pb,motorcycle_brand:'Honda',motorcycle_model:'CG 160',motorcycle_year:2024,service_types:['pneu_furado'],photo_path:key})}));
 const signed=await ok('assigned B signs',()=>signAs(b));
 const bPath=signedPath(await signed.json()),issued=Date.now();
 const before=await ok('assigned B signed bytes available',()=>call(bPath));assert.deepEqual(Buffer.from(await before.arrayBuffer()),jpg);
 await deny('outsider C still cannot sign',()=>signAs(c));
 // Assignment change only in the isolated fixture, not a business operation.
 sql(`UPDATE public.service_requests SET provider_id='${pc}' WHERE id='${req}'`);
 await deny('old B cannot obtain new URL',()=>signAs(b));
 await deny('old B direct authenticated access revoked',()=>call(auth,{jwt:b.jwt}));
 await ok('new C may sign',()=>signAs(c));
 step='old signed URL grace';
 const grace=await call(bPath);
 if(grace.ok){assert.deepEqual(Buffer.from(await grace.arrayBuffer()),jpg);console.log('OBS previous signed URL remains valid until expiry')}
 else {assert.ok(grace.status>=400&&grace.status<500);console.log('OBS previous signed URL revoked early')}
 pass('previous signed URL behavior measured');
 // Even if DELETE returns 2xx with an empty result, the linked file must survive.
 step='linked deletion blocked';const deletion=await remove(key);assert.ok(deletion.ok||(deletion.status>=400&&deletion.status<500));
 const linked=await ok('linked photo remains after attempted deletion',()=>call(auth,{jwt:a.jwt}));assert.deepEqual(Buffer.from(await linked.arrayBuffer()),jpg);
 const orphan=a.id+'/'+uuid()+'.jpg';
 await ok('upload orphan JPEG',()=>upload('/storage/v1/object/request-photos/'+orphan));
 await ok('delete orphan via Storage API',()=>remove(orphan));
 await deny('deleted orphan cannot be fetched',()=>call('/storage/v1/object/authenticated/request-photos/'+orphan,{jwt:a.jwt}));
 await new Promise(r=>setTimeout(r,Math.max(0,issued+23000-Date.now())));
 await deny('previous signed URL expires',()=>call(bPath));
 step='storage inventory';assert.equal(sql('SELECT count(*) FROM storage.objects'),'1');pass('only linked fixture remains');
 console.log('F1_NATIVE_HTTP_CHECKS='+checks);console.log('F1_NATIVE_SIGNED_STORAGE=PASS');console.log('HOSTED_PROJECT_TOUCHED=FALSE');console.log('RELEASE=NO_GO');
}
main().catch(()=>{console.error('F1_NATIVE_HTTP=FAIL step='+step);process.exitCode=1});
