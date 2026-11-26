/* F1 - Jornada da interface com DOM e Supabase simulados (nao usa banco real).
 * Rode: node --test tests/f1-app-flow.test.js
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const F1 = require("../request-f1.js");

const APP = fs.readFileSync(path.resolve(__dirname, "../live-app-current.js"), "utf8");
const CLIENT = "11111111-1111-4111-8111-111111111111";
const PROVIDER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CATEGORY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const KEY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const pic = (overrides={}) => ({
  name: "problema.jpg", type: "image/jpeg", size: 40000, lastModified: 123,
  ...overrides
});
const validFields = (overrides={}) => ({
  brand:"Honda",model:"CG 160",year:"2024",
  services:["pneu_furado","troca_camara"],
  problem:"Pneu traseiro furado",address:"Rua de Testes, 123",
  photo:pic(), ...overrides
});

async function flush() {
  for (let i=0;i<8;i++) await new Promise(resolve => setImmediate(resolve));
}

function makeHarness({ confirm=true, uploadFails=false, insertFails=false, f1Enabled=true,
  switchDuringUpload=false, duplicateAfterLostResponse=false,
  lostUploadResponse=false, conflictingUpload=false, delayedSignedUrl=false,
  navigateDuringUpload=false, gpsDuringUpload=false }={}) {
  const sent={ uploads:[], requests:[], quotes:[], errors:[], signed:[], downloads:[],
    orderSelects:[], requestFilters:[], confirmCalls:0 };
  let rejectUpload=uploadFails;
  let rejectInsert=insertFails;
  let storedDespiteLostResponse=false;
  let currentUserId=CLIENT;
  let authCallback=null;
  let pendingGps=null;
  let gpsError=null;
  const gpsCallbacks=[];
  let pendingSignedResolve=null;
  const storedPhotos=new Map();
  const docListeners={}, formListeners={}, winListeners={};
  let clock=Date.now(), timerId=0;
  const timers=new Map();
  class FakeDate extends Date { static now(){return clock;} }
  const container={
    innerHTML:"",
    addEventListener(name,fn){formListeners[name]=fn;},
    querySelector(){return null;}
  };
  const banner={innerHTML:""};
  const roleLabel={textContent:""};
  const provider={id:PROVIDER,display_name:"Prestador de testes",
    city:"Belo Horizonte",state_code:"MG",status:"approved",is_active:true};
  const categories=[{id:CATEGORY,code:"borracharia_delivery",name:"No local",paid_in_app:true}];
  const services=[{provider_id:PROVIDER,category_id:CATEGORY,is_active:true}];
  const records={providers:[provider],provider_services:services,
    service_categories:categories,service_requests:[],service_quotes:[]};
  function from(name) {
    const query={
      filters:[],
      // Thenable: Supabase query sem .limit() tambem executa quando aguardada.
      then(resolve,reject){return Promise.resolve({data:records[name]||[],error:null}).then(resolve,reject);},
      select(columns){
        if (name === "service_requests") sent.orderSelects.push(columns);
        return this;
      },
      eq(column,value){
        this.filters.push([column,value]);
        if(name==="service_requests")sent.requestFilters.push(column);
        return this;
      },
      in(){return this;},
      order(){return this;},
      limit(){return Promise.resolve({data:records[name]||[],error:null});},
      maybeSingle(){
        if(name==="service_requests"){
          const record=records.service_requests.find(row=>this.filters.every(([key,value])=>row[key]===value));
          return Promise.resolve({data:record?{id:record.id}:null,error:null});
        }
        return Promise.resolve({data:name==="app_profiles"?{
          user_id:CLIENT,display_name:"Motociclista Teste"}:null,error:null});
      },
      single(){return Promise.resolve({data:null,error:null});},
      insert(obj){
        if(name==="service_requests"){
          sent.requests.push(obj);
          if(rejectInsert){
            rejectInsert=false;
            return Promise.resolve({data:null,error:{code:"PGRST_TEST",message:"Rede interrompida no insert"}});
          }
          if(duplicateAfterLostResponse){
            if(storedDespiteLostResponse)
              return Promise.resolve({data:null,error:{code:"23505",message:"Chave duplicada"}});
            storedDespiteLostResponse=true;
            records.service_requests.push({...obj,id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              created_at:"2026-11-13T13:00:00Z"});
            return Promise.resolve({data:null,error:{code:"PGRST_TEST",message:"Resposta perdida após gravar no banco"}});
          }
          records.service_requests.push({...obj,id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            created_at:"2026-11-13T13:00:00Z"});
        }
        return Promise.resolve({error:null});
      }
    };
    return query;
  }
  const db={
    from,
    rpc(name){
      if(name==="bj_online_providers")return Promise.resolve({data:[{provider_id:PROVIDER}],error:null});
      throw new Error("RPC inesperada: "+name);
    },
    auth:{
      getSession:async()=>({data:{session:currentUserId?{access_token:"token-teste",user:{id:currentUserId}}:null},error:null}),
      getUser:async()=>({data:{user:currentUserId?{id:currentUserId,email:"teste@example.invalid",
        user_metadata:{display_name:"Teste"}}:null},error:null}),
      onAuthStateChange(callback){authCallback=callback;return {data:{subscription:{unsubscribe(){}}}};}
    },
    storage:{
      from(bucket) {
        assert.equal(bucket,"request-photos");
        return {
          async upload(name,body,options) {
            sent.uploads.push({name,body,options});
            if(gpsDuringUpload && pendingGps) {
              gpsDuringUpload=false;
              const callback=pendingGps; pendingGps=null;
              callback({coords:{latitude:-19.92,longitude:-43.94}});
            }
            if(navigateDuringUpload) {
              navigateDuringUpload=false;
              docListeners.click({target:{closest:()=>({dataset:{page:"home"}})}});
            }
            if(switchDuringUpload){
              switchDuringUpload=false;
              currentUserId="22222222-2222-4222-8222-222222222222";
              authCallback("SIGNED_IN",{user:{id:currentUserId,email:"outro@example.invalid"}});
            }
            if(rejectUpload){
              rejectUpload=false;
              return {error:{statusCode:500,message:"Falha simulada de upload"}};
            }
            if(conflictingUpload && !storedPhotos.has(name)) {
              const fakeBytes=Uint8Array.from([0xff,0xd8,0,0xd9]);
              storedPhotos.set(name,{size:fakeBytes.length, arrayBuffer:async()=>fakeBytes.buffer});
            }
            if(storedPhotos.has(name))
              return {error:{statusCode:409,message:"The resource already exists"}};
            storedPhotos.set(name,body);
            if(lostUploadResponse){
              lostUploadResponse=false;
              return {error:{statusCode:500,message:"Upload gravado, resposta perdida"}};
            }
            return {error:null,data:{path:name}};
          },
          async download(name){
            sent.downloads.push(name);
            const data=storedPhotos.get(name);
            return data?{data,error:null}:{data:null,error:{statusCode:404,message:"Not found"}};
          },
          createSignedUrl(name,seconds){
            sent.signed.push({name,seconds});
            if(delayedSignedUrl) return new Promise(resolve=>{ pendingSignedResolve=resolve; });
            return Promise.resolve({data:{signedUrl:"https://storage.invalid/teste?token=nao-real"},error:null});
          }
        };
      }
    }
  };
  const document={
    visibilityState:"visible",
    getElementById(id){return id==="app"?container:id==="role-label"?roleLabel:null;},
    querySelector(sel){return sel===".demo-banner"?banner:null;},
    querySelectorAll(){return [];},
    addEventListener(name,fn){docListeners[name]=fn;},
    createElement(name){
      if(name==="canvas") return {
        width:0,height:0,
        getContext(){return {fillStyle:"",fillRect(){},drawImage(){}};},
        toBlob(callback){
          const bytes=Uint8Array.from([0xff,0xd8,0xff,0xd9]);
          callback({type:"image/jpeg",size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(0)});
        }
      };
      return {className:"",setAttribute(){},textContent:""};
    }
  };
  const win={
    BJ_CONFIG:{supabaseUrl:"https://fake.invalid",supabasePublishableKey:"sb_publishable_test",
      f1TestRequestsEnabled:f1Enabled},
    supabase:{createClient:()=>db},SMRequestF1:F1,
    scrollTo(){},
    setInterval(){},
    addEventListener(name,fn){winListeners[name]=fn;},
    confirm(){sent.confirmCalls++;return confirm;},
    L:null
  };
  const sandbox={
    window:win,document,navigator:{
      geolocation:{
        getCurrentPosition(success,error){pendingGps=success;gpsError=error;gpsCallbacks.push({success,error});}
      }
    },console,
    crypto:{randomUUID:()=>KEY},
    FormData:class {
      constructor(form){this.values=form.fields;}
      get(name){const v=this.values[name];return Array.isArray(v)?v[0]:v??null;}
      getAll(name){const v=this.values[name];return v==null?[]:Array.isArray(v)?v:[v];}
    },
    createImageBitmap:async()=>({width:1500,height:1200,close(){}}),
    setTimeout(fn,delay=0){
      if(delay<=0){fn();return 0;}
      const id=++timerId;timers.set(id,{fn,at:clock+delay});return id;
    },
    clearTimeout(id){timers.delete(id);},
    setInterval(){},
    Date:FakeDate,URL,Promise,Set,Map,Number,Math
  };
  vm.runInNewContext(APP,sandbox,{filename:"live-app-current.js",timeout:3000});
  return {
    sent,container,docListeners,formListeners,
    async navigate(page){
      await docListeners.click({target:{closest:()=>({dataset:{page}})}});
      await flush();
    },
    async reload(){
      await docListeners.click({target:{closest:()=>({dataset:{action:"reload"}})}});
      await flush();
    },
    removeOrders(){records.service_requests=[];},
    changePhotoPath(){
      records.service_requests=records.service_requests.map(row=>({...row,photo_path:row.customer_id+"/ffffffff-ffff-4fff-8fff-ffffffffffff.jpg"}));
    },
    visibility(value){document.visibilityState=value;docListeners.visibilitychange();},
    pagehide(){winListeners.pagehide();},
    advance(ms){
      clock+=ms;
      for(const [id,timer] of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}
    },
    async switchUser(nextId){
      currentUserId=nextId;
      assert.equal(typeof authCallback,"function");
      authCallback(nextId?"SIGNED_IN":"SIGNED_OUT",
        nextId?{user:{id:nextId,email:"outro@example.invalid"}}:null);
      await flush();
    },
    async requestGps(){
      const target={dataset:{action:"gps"}};
      await docListeners.click({target:{closest:()=>target}});
    },
    openPhoto(id="dddddddd-dddd-4ddd-8ddd-dddddddddddd"){
      const target={dataset:{action:"view-photo",id}};
      return docListeners.click({target:{closest:()=>target}});
    },
    resolveSignedPhoto(){
      assert.equal(typeof pendingSignedResolve,"function");
      const resolve=pendingSignedResolve; pendingSignedResolve=null;
      resolve({data:{signedUrl:"https://storage.invalid/teste?token=NAO-REAL-PRIVADO"},error:null});
    },
    async resolveGpsAt(index,lat,lng){
      gpsCallbacks[index].success({coords:{latitude:lat,longitude:lng}}); await flush();
    },
    async rejectGps(){assert.equal(typeof gpsError,"function");gpsError({code:1});await flush();},
    async resolveGps(lat=-19.92,lng=-43.94){
      assert.equal(typeof pendingGps,"function","GPS não foi solicitado");
      const callback=pendingGps; pendingGps=null;
      callback({coords:{latitude:lat,longitude:lng}});
      await flush();
    },
    async prepare(){
      await flush();
      assert.match(container.innerHTML,/Prestadores aprovados/);
      const target={dataset:{action:"select-provider",id:PROVIDER}};
      await docListeners.click({target:{closest:()=>target}});
      await flush();
      assert.match(container.innerHTML,/name="brand"/);
      assert.match(container.innerHTML,/name="photo"/);
      assert.match(container.innerHTML,/name="services"/);
    },
    async submit(fields){
      const form={
        id:"request-form",isConnected:true,fields,
        classList:{contains(){return false;}},
        prepend(node){this.notice=node;}
      };
      formListeners.submit({preventDefault(){},target:form});
      await flush();
      return form;
    }
  };
}

test("F1: campos, foto privada e pedido de teste, sem acionar pagamento",async()=>{
  const h=makeHarness();await h.prepare();
  await h.submit(validFields());
  assert.equal(h.sent.confirmCalls,1);
  assert.equal(h.sent.uploads.length,1);
  assert.equal(h.sent.requests.length,1);
  const uploaded=h.sent.uploads[0];
  assert.equal(uploaded.name,CLIENT+"/"+KEY+".jpg");
  assert.equal(uploaded.options.contentType,"image/jpeg");
  assert.equal(uploaded.options.upsert,false);
  const r=h.sent.requests[0];
  assert.equal(r.customer_id,CLIENT);
  assert.equal(r.motorcycle_brand,"Honda");
  assert.equal(r.motorcycle_model,"CG 160");
  assert.equal(r.motorcycle_year,2024);
  assert.equal(r.status,"requested");
  assert.deepEqual(Array.from(r.service_types),["pneu_furado","troca_camara"]);
  assert.equal(r.photo_path,uploaded.name);
  assert.match(h.container.innerHTML,/Pedidos e orçamentos/);
});

test("F1: cancelar confirmação preserva dados e não gera upload nem pedido",async()=>{
  const h=makeHarness({confirm:false});await h.prepare();
  const form=await h.submit(validFields());
  assert.equal(h.sent.uploads.length,0);
  assert.equal(h.sent.requests.length,0);
  assert.equal(form.notice,undefined);
  assert.match(h.container.innerHTML,/name="brand"/);
});

test("F1: falha de upload impede pedido e permite tentar novamente",async()=>{
  const h=makeHarness({uploadFails:true});await h.prepare();
  const form=await h.submit(validFields());
  assert.equal(h.sent.uploads.length,1);
  assert.equal(h.sent.requests.length,0);
  assert.match(form.notice.textContent,/Upload privado/);
  await h.submit(validFields());
  assert.equal(h.sent.uploads.length,2);
  assert.equal(h.sent.requests.length,1);
});

test("F1: falha após upload usa mesma chave e não duplica a foto no retry",async()=>{
  const h=makeHarness({insertFails:true});await h.prepare();
  const original=validFields();
  const first=await h.submit(original);
  assert.equal(h.sent.uploads.length,1);
  assert.equal(h.sent.requests.length,1);
  assert.match(first.notice.textContent,/Rede interrompida/);
  await h.submit(original);
  assert.equal(h.sent.uploads.length,1);
  assert.equal(h.sent.requests.length,2);
  assert.equal(h.sent.requests[0].request_key,h.sent.requests[1].request_key);
});

test("F1: não aceita trocar a foto após upload já feito",async()=>{
  const h=makeHarness({insertFails:true});await h.prepare();
  await h.submit(validFields());
  const second=await h.submit(validFields({photo:pic({lastModified:124})}));
  assert.match(second.notice.textContent,/foto foi alterada/);
  assert.equal(h.sent.uploads.length,1);
  assert.equal(h.sent.requests.length,1);
});

test("F1: reboque indisponível não envia arquivos nem cria pedidos",async()=>{
  const h=makeHarness();await h.prepare();
  const form=await h.submit(validFields({services:["pneu_furado","reboque_moto"]}));
  assert.match(form.notice.textContent,/Reboque será liberado/);
  assert.equal(h.sent.uploads.length,0);
  assert.equal(h.sent.requests.length,0);
});

test("F1: trava de homologação impede pedido mesmo por submissão forçada",async()=>{
  const h=makeHarness({f1Enabled:false});await h.prepare();
  assert.match(h.container.innerHTML,/disabled aria-disabled="true"/);
  const form=await h.submit(validFields());
  assert.match(form.notice.textContent,/F1 desativada/);
  assert.equal(h.sent.uploads.length,0);
  assert.equal(h.sent.requests.length,0);
});


test("F1 desligada: painel consulta apenas colunas existentes no banco atual", async () => {
  const h = makeHarness({f1Enabled:false});
  await h.prepare();
  assert.ok(h.sent.orderSelects.length > 0);
  for(const columns of h.sent.orderSelects) {
    assert.match(columns, /problem_description/);
    assert.doesNotMatch(columns, /motorcycle_brand|motorcycle_model|motorcycle_year|service_types|photo_path/);
  }
});

test("F1 habilitada em simulacao: painel inclui apenas novos campos previstos", async () => {
  const h = makeHarness({f1Enabled:true});
  await h.prepare();
  assert.ok(h.sent.orderSelects.some(x => x.includes("photo_path")));
  assert.ok(h.sent.orderSelects.every(x => !/address_details|latitude|longitude/.test(x)));
});


test("F1: GPS da conta A não entra em pedidos criados pela conta B", async () => {
  const h=makeHarness(); await h.prepare();
  await h.requestGps(); await h.resolveGps(-19.92,-43.94);
  await h.submit(validFields());
  assert.equal(h.sent.requests.length,1);
  assert.equal(h.sent.requests[0].latitude,-19.92);
  assert.equal(h.sent.requests[0].longitude,-43.94);

  const B="22222222-2222-4222-8222-222222222222";
  await h.switchUser(B);
  await h.prepare();
  await h.submit(validFields());
  assert.equal(h.sent.requests.length,2);
  assert.equal(h.sent.requests[1].customer_id,B);
  assert.equal(h.sent.requests[1].latitude,null);
  assert.equal(h.sent.requests[1].longitude,null);
  assert.equal(h.sent.uploads[1].name.split("/")[0],B);
});

test("F1: GPS solicitado por A e respondido após troca para B é descartado", async () => {
  const h=makeHarness(); await h.prepare();
  await h.requestGps();
  const B="22222222-2222-4222-8222-222222222222";
  await h.switchUser(B);
  await h.resolveGps(-19.92,-43.94);
  await h.prepare();
  await h.submit(validFields());
  assert.equal(h.sent.requests.length,1);
  assert.equal(h.sent.requests[0].customer_id,B);
  assert.equal(h.sent.requests[0].latitude,null);
  assert.equal(h.sent.requests[0].longitude,null);
});

test("F1: mudança de conta enquanto a foto sobe bloqueia insert posterior", async () => {
  const h=makeHarness({switchDuringUpload:true}); await h.prepare();
  await h.submit(validFields());
  assert.equal(h.sent.uploads.length,1);
  assert.equal(h.sent.requests.length,0);
  const B="22222222-2222-4222-8222-222222222222";
  await h.prepare();
  await h.submit(validFields());
  assert.equal(h.sent.requests.length,1);
  assert.equal(h.sent.requests[0].customer_id,B);
  assert.equal(h.sent.uploads[1].name.split("/")[0],B);
});


test("F1: timeout após INSERT confirmado pelo servidor é recuperado sem ler request_key", async () => {
  const h=makeHarness({duplicateAfterLostResponse:true}); await h.prepare();
  const first=await h.submit(validFields());
  assert.match(first.notice.textContent,/Resposta perdida/);
  assert.equal(h.sent.uploads.length,1);
  assert.equal(h.sent.requests.length,1);
  await h.submit(validFields());
  assert.equal(h.sent.requests.length,2);
  assert.equal(h.sent.uploads.length,1);
  assert.ok(h.sent.requestFilters.includes("customer_id"));
  assert.ok(h.sent.requestFilters.includes("photo_path"));
  assert.equal(h.sent.requestFilters.includes("request_key"),false,
    "Não consultar coluna request_key que authenticated não pode ler");
  assert.match(h.container.innerHTML,/Pedidos e orçamentos/);
});


test("F1: retry com endereço alterado não reaproveita pedido/foto já enviados",async()=>{
  const h=makeHarness({insertFails:true}); await h.prepare();
  await h.submit(validFields());
  const second=await h.submit(validFields({address:"Endereço fictício diferente, 100"}));
  assert.match(second.notice.textContent,/dados do pedido mudaram/);
  assert.equal(h.sent.uploads.length,1);
  assert.equal(h.sent.requests.length,1);
});

test("F1: retry com serviços alterados não muda um pedido iniciado",async()=>{
  const h=makeHarness({insertFails:true}); await h.prepare();
  await h.submit(validFields());
  const second=await h.submit(validFields({services:["outro"]}));
  assert.match(second.notice.textContent,/dados do pedido mudaram/);
  assert.equal(h.sent.uploads.length,1);
  assert.equal(h.sent.requests.length,1);
});

test("F1: upload remoto confirmado mas resposta HTTP perdida verifica bytes ao receber 409",async()=>{
  const h=makeHarness({lostUploadResponse:true}); await h.prepare();
  const first=await h.submit(validFields());
  assert.match(first.notice.textContent,/Upload privado/);
  assert.equal(h.sent.uploads.length,1);
  assert.equal(h.sent.requests.length,0);
  await h.submit(validFields());
  assert.equal(h.sent.uploads.length,2);
  assert.equal(h.sent.downloads.length,1,"Deve verificar foto por download privado");
  assert.equal(h.sent.requests.length,1);
});

test("F1: HTTP 409 com foto diferente NÃO é tratado como upload concluído",async()=>{
  const h=makeHarness({conflictingUpload:true}); await h.prepare();
  const first=await h.submit(validFields());
  assert.match(first.notice.textContent,/foto diferente/);
  assert.equal(h.sent.downloads.length,1);
  assert.equal(h.sent.requests.length,0);
});

test("F1: URL assinada devolvida após logout não aparece na nova conta",async()=>{
  const h=makeHarness({delayedSignedUrl:true}); await h.prepare();
  await h.submit(validFields());
  const pending=h.openPhoto();
  await flush();
  assert.equal(h.sent.signed.length,1);
  await h.switchUser("22222222-2222-4222-8222-222222222222");
  h.resolveSignedPhoto();
  await pending; await flush();
  assert.doesNotMatch(h.container.innerHTML,/NAO-REAL-PRIVADO/);
});


test("F1: sair da tela durante upload impede INSERT assíncrono do pedido abandonado", async()=>{
  const h=makeHarness({navigateDuringUpload:true}); await h.prepare();
  const form=await h.submit(validFields());
  assert.equal(h.sent.uploads.length,1);
  assert.equal(h.sent.requests.length,0);
  assert.match(form.notice.textContent,/tentativa foi interrompida/);
  assert.match(h.container.innerHTML,/Explorar borracharias/);
});


test("F1: GPS recebido após confirmação não modifica local do pedido durante upload", async()=>{
  const h=makeHarness({gpsDuringUpload:true}); await h.prepare();
  await h.requestGps();
  await h.submit(validFields());
  assert.equal(h.sent.requests.length,1);
  assert.equal(h.sent.requests[0].latitude,null);
  assert.equal(h.sent.requests[0].longitude,null);
});


test("F1: foto some da interface após a validade local de 60 segundos",async()=>{
  const h=makeHarness();await h.prepare();await h.submit(validFields());await h.openPhoto();
  assert.match(h.container.innerHTML,/token=nao-real/);
  assert.equal(h.sent.signed[0].seconds,60);
  h.advance(59999);assert.match(h.container.innerHTML,/token=nao-real/);
  h.advance(1);assert.doesNotMatch(h.container.innerHTML,/token=nao-real/);
});

test("F1: resposta assinada antiga é descartada ao sair e voltar à tela",async()=>{
  const h=makeHarness({delayedSignedUrl:true});await h.prepare();await h.submit(validFields());
  const pending=h.openPhoto();await flush();assert.equal(h.sent.signed.length,1);
  await h.navigate("home");await h.navigate("orders");
  h.resolveSignedPhoto();await pending;assert.doesNotMatch(h.container.innerHTML,/NAO-REAL-PRIVADO/);
});

test("F1: resposta assinada que chega depois de 60 segundos não é exibida",async()=>{
  const h=makeHarness({delayedSignedUrl:true});await h.prepare();await h.submit(validFields());
  const pending=h.openPhoto();await flush();h.advance(60000);
  h.resolveSignedPhoto();await pending;assert.doesNotMatch(h.container.innerHTML,/NAO-REAL-PRIVADO/);
});

test("F1: atualização de pedidos descarta preview e ordem retirada pela RLS",async()=>{
  const h=makeHarness();await h.prepare();await h.submit(validFields());await h.openPhoto();
  assert.match(h.container.innerHTML,/token=nao-real/);
  h.removeOrders();await h.reload();assert.doesNotMatch(h.container.innerHTML,/token=nao-real|Ver foto do problema/);
});

test("F1: atualização com novo caminho da foto descarta link anterior",async()=>{
  const h=makeHarness();await h.prepare();await h.submit(validFields());await h.openPhoto();
  assert.match(h.container.innerHTML,/token=nao-real/);
  h.changePhotoPath();await h.reload();assert.doesNotMatch(h.container.innerHTML,/token=nao-real/);
  await h.openPhoto();assert.equal(h.sent.signed.at(-1).name,CLIENT+"/ffffffff-ffff-4fff-8fff-ffffffffffff.jpg");
});

test("F1: minimizar app invalida foto e resposta pendente",async()=>{
  const h=makeHarness();await h.prepare();await h.submit(validFields());await h.openPhoto();
  assert.match(h.container.innerHTML,/token=nao-real/);
  h.visibility("hidden");assert.doesNotMatch(h.container.innerHTML,/token=nao-real/);
  await h.openPhoto();assert.equal(h.sent.signed.length,1);
  h.visibility("visible");await h.openPhoto();assert.match(h.container.innerHTML,/token=nao-real/);
  h.pagehide();assert.doesNotMatch(h.container.innerHTML,/token=nao-real/);
});

test("F1: resposta pendente não reaparece após ocultar e retornar ao app",async()=>{
  const h=makeHarness({delayedSignedUrl:true});await h.prepare();await h.submit(validFields());
  const pending=h.openPhoto();await flush();h.visibility("hidden");h.visibility("visible");
  h.resolveSignedPhoto();await pending;assert.doesNotMatch(h.container.innerHTML,/NAO-REAL-PRIVADO/);
});

test("F1: GPS atrasado depois de sair e voltar não entra no pedido",async()=>{
  const h=makeHarness();await h.prepare();await h.requestGps();
  await h.navigate("home");await h.prepare();await h.resolveGps();
  await h.submit(validFields());
  assert.equal(h.sent.requests.length,1);
  assert.equal(h.sent.requests[0].latitude,null);
});
test("F1: GPS atrasado após ocultar a tela não entra no pedido",async()=>{
  const h=makeHarness();await h.prepare();await h.requestGps();
  h.visibility("hidden");h.visibility("visible");await h.resolveGps();
  await h.submit(validFields());
  assert.equal(h.sent.requests.length,1);
  assert.equal(h.sent.requests[0].latitude,null);
});
test("F1: apenas a leitura GPS mais recente pode definir coordenadas",async()=>{
  const h=makeHarness();await h.prepare();await h.requestGps();await h.requestGps();
  await h.resolveGpsAt(1,-19.95,-43.99);
  await h.resolveGpsAt(0,-19.12,-43.12);
  await h.submit(validFields());
  assert.equal(h.sent.requests.length,1);
  assert.equal(h.sent.requests[0].latitude,-19.95);
  assert.equal(h.sent.requests[0].longitude,-43.99);
});
test("F1: recusa de GPS novo não reaproveita coordenadas anteriores",async()=>{
  const h=makeHarness();await h.prepare();await h.requestGps();await h.resolveGps();
  await h.requestGps();await h.rejectGps();
  assert.match(h.container.innerHTML,/Não foi possível obter o GPS/);
  await h.submit(validFields());
  assert.equal(h.sent.requests.length,1);
  assert.equal(h.sent.requests[0].latitude,null);
});
test("F1: latitude fora do intervalo é recusada",async()=>{
  const h=makeHarness();await h.prepare();await h.requestGps();await h.resolveGps(99,-43);
  await h.submit(validFields());
  assert.equal(h.sent.requests.length,1);
  assert.equal(h.sent.requests[0].latitude,null);
});
