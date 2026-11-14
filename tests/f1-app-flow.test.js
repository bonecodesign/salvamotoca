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

function makeHarness({ confirm=true, uploadFails=false, insertFails=false, f1Enabled=true, switchDuringUpload=false }={}) {
  const sent={ uploads:[], requests:[], quotes:[], errors:[], signed:[], orderSelects:[], confirmCalls:0 };
  let rejectUpload=uploadFails;
  let rejectInsert=insertFails;
  let currentUserId=CLIENT;
  let authCallback=null;
  let pendingGps=null;
  const docListeners={}, formListeners={};
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
      // Thenable: Supabase query sem .limit() tambem executa quando aguardada.
      then(resolve,reject){return Promise.resolve({data:records[name]||[],error:null}).then(resolve,reject);},
      select(columns){
        if (name === "service_requests") sent.orderSelects.push(columns);
        return this;
      },
      eq(){return this;},
      in(){return this;},
      order(){return this;},
      limit(){return Promise.resolve({data:records[name]||[],error:null});},
      maybeSingle(){return Promise.resolve({data:name==="app_profiles"?{
        user_id:CLIENT,display_name:"Motociclista Teste"}:null,error:null});},
      single(){return Promise.resolve({data:null,error:null});},
      insert(obj){
        if(name==="service_requests"){
          sent.requests.push(obj);
          if(rejectInsert){
            rejectInsert=false;
            return Promise.resolve({data:null,error:{code:"PGRST_TEST",message:"Rede interrompida no insert"}});
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
            if(switchDuringUpload){
              switchDuringUpload=false;
              currentUserId="22222222-2222-4222-8222-222222222222";
              authCallback("SIGNED_IN",{user:{id:currentUserId,email:"outro@example.invalid"}});
            }
            if(rejectUpload){
              rejectUpload=false;
              return {error:{statusCode:500,message:"Falha simulada de upload"}};
            }
            return {error:null,data:{path:name}};
          },
          async createSignedUrl(name,seconds){
            sent.signed.push({name,seconds});
            return {data:{signedUrl:"https://storage.invalid/teste?token=nao-real"},error:null};
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
        toBlob(callback){callback({type:"image/jpeg",size:30000});}
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
    confirm(){sent.confirmCalls++;return confirm;},
    L:null
  };
  const sandbox={
    window:win,document,navigator:{
      geolocation:{
        getCurrentPosition(success){pendingGps=success;}
      }
    },console,
    crypto:{randomUUID:()=>KEY},
    FormData:class {
      constructor(form){this.values=form.fields;}
      get(name){const v=this.values[name];return Array.isArray(v)?v[0]:v??null;}
      getAll(name){const v=this.values[name];return v==null?[]:Array.isArray(v)?v:[v];}
    },
    createImageBitmap:async()=>({width:1500,height:1200,close(){}}),
    setTimeout(fn){fn();},
    setInterval(){},
    Date,URL,Promise,Set,Map,Number,Math
  };
  vm.runInNewContext(APP,sandbox,{filename:"live-app-current.js",timeout:3000});
  return {
    sent,container,docListeners,formListeners,
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
