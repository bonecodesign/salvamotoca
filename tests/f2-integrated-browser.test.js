/* Chrome com a interface REAL e um mock Supabase 100% local (sem HTTP). */
"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright-core");
const executablePath=process.env.CHROME_BIN||[
  "/usr/bin/google-chrome","/usr/bin/chromium","/usr/bin/chromium-browser"
].find(p=>fs.existsSync(p));

async function app(role="customer",f2=true){
  assert.ok(executablePath,"Chrome ausente");
  const browser=await chromium.launch({executablePath,headless:true,
    args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage({viewport:{width:375,height:812}});
  const external=[];
  page.on("request",r=>{if(/^https?:/i.test(r.url()))external.push(r.url())});
  page.on("pageerror",e=>external.push("JS:"+e.message));
  await page.route(/^https?:\/\//,route=>route.abort());
  await page.setContent('<!doctype html><html lang="pt-BR"><body>'+
    '<div id="role-label"></div><div class="demo-banner"></div><main id="app"></main>'+
    '<div class="bottom-nav"><button data-page="orders">Pedidos</button>'+
    '<button data-page="profile">Perfil</button></div></body></html>');
  await page.evaluate(({role,f2})=>{
    const uid=role==="provider"?"33333333-3333-4333-8333-333333333333":
      "11111111-1111-4111-8111-111111111111";
    const pid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const rid="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const model={
      user:{id:uid,email:"teste@example.invalid",user_metadata:{display_name:"Teste"}},
      profile:{user_id:uid,display_name:"Teste"},
      own:role==="provider"?{id:pid,owner_id:uid,display_name:"Oficina Beta",
        status:"approved",is_active:true,city:"Belo Horizonte"}:null,
      providers:[{id:pid,owner_id:"33333333-3333-4333-8333-333333333333",
        display_name:"Oficina Beta",description:"Borracharia",street_address:null,
        city:"Belo Horizonte",state_code:"MG",latitude:-19.925,longitude:-43.938,
        status:"approved",is_active:true}],
      services:[{provider_id:pid,category_id:2,is_active:true}],
      categories:[{id:2,code:"borracharia_delivery",name:"Delivery",paid_in_app:true}],
      orders:[{id:rid,customer_id:"11111111-1111-4111-8111-111111111111",
        provider_id:null,category_id:2,problem_description:"Pneu de teste furado",
        service_types:["pneu_furado","troca_camara"],motorcycle_brand:"Honda",
        motorcycle_model:"CG 160",motorcycle_year:2024,photo_path:null,
        status:"requested",created_at:new Date().toISOString()}],
      offers:role==="provider"?[{
        id:"offer-test",request_id:rid,provider_id:pid,round_number:1,
        status:"delivered",delivered_at:new Date().toISOString(),
        offered_at:new Date().toISOString(),quote_id:null
      }]:[],
      quotes:[],quoteItems:[],calls:[],queries:[],
    };
    window.__mock=model;
    window.BJ_CONFIG={f1TestRequestsEnabled:f2,f2TestOffersEnabled:f2};
    window.confirm=()=>true;
    window.scrollTo=()=>{};
    const result=(table,filters)=>{
      if(table.startsWith("f2_")) model.queries.push(table);
      let items=table==="providers"?(filters.owner_id?(model.own?[model.own]:[]):model.providers):
        table==="app_profiles"?[model.profile]:
        table==="provider_services"?model.services:
        table==="service_categories"?model.categories:
        table==="bj_provider_presence"?[{provider_id:pid,online_requested:true}]:
        table==="service_requests"?model.orders:
        table==="service_quotes"?model.quotes:
        table==="f2_request_offers"?model.offers:
        table==="f2_quote_items"?model.quoteItems:[];
      for(const [key,value] of Object.entries(filters)){
        if(table==="providers"&&key==="owner_id")continue;
        items=items.filter(x=>x[key]===value);
      }
      return {data:items,error:null};
    };
    window.supabase={createClient:()=>({
      auth:{
        getSession:async()=>({data:{session:{user:model.user}},error:null}),
        getUser:async()=>({data:{user:model.user},error:null}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
      },
      from:table=>{
        const filters={};
        const q={select(){return this},eq(k,v){filters[k]=v;return this},
          in(){return this},order(){return this},limit(){return this},
          maybeSingle(){const x=result(table,filters);
            return Promise.resolve({data:x.data[0]||null,error:null})},
          then(resolve,reject){return Promise.resolve(result(table,filters)).then(resolve,reject)}
        };
        return q;
      },
      rpc:async(name,args={})=>{
        model.calls.push({name,args});
        if(name==="bj_online_providers")return {data:[{provider_id:pid}],error:null};
        if(name==="f2_offer_candidates"){
          model.offers.push({id:"offer-test",request_id:rid,provider_id:pid,
            round_number:1,status:"offered",offered_at:new Date().toISOString(),quote_id:null});
          return {data:1,error:null};
        }
        if(name==="f2_submit_quote"){
          model.quotes.push({id:"quote-new",request_id:rid,provider_id:pid,
            status:"proposed",amount_cents:17500,created_at:new Date().toISOString()});
          return {data:"quote-new",error:null};
        }
        return {data:null,error:null};
      },
      storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{message:"sem imagem"}})})}
    })};
  },{role,f2});
  for(const js of ["request-f1.js","f2-flow.js","live-app-current.js"])
    await page.addScriptTag({path:path.join(__dirname,"..",js)});
  await page.waitForFunction(()=>document.querySelector("#app")?.innerHTML.length>20);
  await page.locator(".bottom-nav [data-page=orders]").click();
  await page.waitForFunction(()=>document.querySelector("#app")?.textContent.includes("Pedidos e orçamentos"));
  return {browser,page,external};
}

test("App real: flags desligadas não consultam tabelas F2 nem expõem convites",async()=>{
  const {browser,page,external}=await app("customer",false);
  try{
    await page.waitForTimeout(50);
    assert.equal(await page.locator('[data-action="f2-distribute"]').count(),0);
    assert.deepEqual(await page.evaluate(()=>window.__mock.queries),[]);
    assert.deepEqual(external,[]);
  }finally{await browser.close()}
});
test("App real: cliente inicia convite somente em teste com ambas flags ligadas",async()=>{
  const {browser,page,external}=await app("customer",true);
  try{
    await page.locator('[data-action="f2-distribute"]').click();
    await page.waitForFunction(()=>window.__mock.calls.some(x=>x.name==="f2_offer_candidates"));
    const call=await page.evaluate(()=>window.__mock.calls.find(x=>x.name==="f2_offer_candidates"));
    assert.equal(call.args.p_max_offers,3);
    assert.deepEqual(external,[]);
  }finally{await browser.close()}
});
test("App real: orçamento de prestador preserva centavos e não aciona serviço externo",async()=>{
  const {browser,page,external}=await app("provider",true);
  try{
    await page.locator('[name="service_pneu_furado"]').fill("80.50");
    await page.locator('[name="service_troca_camara"]').fill("35.00");
    await page.locator('[name="travel"]').fill("15.00");
    await page.locator('[name="part_name"]').fill("Câmara 17");
    await page.locator('[name="part_price"]').fill("45.25");
    await page.locator('.f2-quote-form button[type="submit"]').click();
    await page.waitForFunction(()=>window.__mock.calls.some(x=>x.name==="f2_submit_quote"));
    const data=await page.evaluate(()=>window.__mock.calls.find(x=>x.name==="f2_submit_quote"));
    assert.deepEqual(data.args.p_items.map(x=>x.amountCents),[8050,3500,1500,4525]);
    assert.deepEqual(external,[]);
  }finally{await browser.close()}
});
