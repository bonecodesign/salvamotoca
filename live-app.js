/* Salva Motoca! Oficial — modo conectado (Supabase, piloto sem pagamento real). */
(() => {
  'use strict';
  const cfg = window.BJ_CONFIG || {};
  const app = document.getElementById('app');
  const banner = document.querySelector('.demo-banner');
  if (!window.supabase?.createClient) {
    app.innerHTML = '<div class="notice bad">Não foi possível carregar a biblioteca do Supabase. Verifique a conexão.</div>';
    return;
  }
  const db = window.supabase.createClient(cfg.supabaseUrl.replace(/\/$/,''), cfg.supabasePublishableKey, {
    auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
  });
  banner.innerHTML = '🧪 <b>Piloto conectado</b> — Sem pagamentos reais e sem atendimento de emergência. Apenas testes autorizados.';
  const st = {
    page:'home', session:null, user:null, profile:null, provider:null, directory:[], orders:[],
    admin:false, adminProviders:[], supplierLeads:[], leadsReady:false, selectedProvider:null, activeOrder:null, mode:'manual',
    geo:null, requestKey:null, filter:'all', leaflet:null, busy:false, error:'', notice:'', orderLocation:null,
    initial:true
  };
  const $ = s => document.querySelector(s);
  const e = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = cents => (Number(cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const when = s => s ? new Date(s).toLocaleString('pt-BR') : '';
  const statusLabel = {
    requested:'Aguardando orçamento',quoted:'Orçamento disponível',awaiting_payment:'Aguardando pagamento',
    paid:'Pago',en_route:'A caminho',in_service:'Em atendimento',completed:'Concluído',
    cancelled:'Cancelado',disputed:'Em análise'
  };
  const nearbyDistance = (p) => {
    if (!st.geo || p.latitude == null || p.longitude == null) return null;
    const r = x => x*Math.PI/180, la1=r(st.geo.lat), la2=r(Number(p.latitude)),
      dlat=la2-la1, dlon=r(Number(p.longitude)-st.geo.lng);
    return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.sin(dlat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dlon/2)**2)));
  };
  const allProviders = () => [...st.directory].filter(p=>st.filter!=='available'||p.available).sort((a,b) => {
    const da=nearbyDistance(a), db=nearbyDistance(b);
    return da != null && db != null ? da-db : a.business_name.localeCompare(b.business_name,'pt-BR');
  });
  const myProviderOwner = o => Boolean(st.provider && o.provider_id===st.provider.id);
  const myOrder = o => Boolean(st.user && o.customer_id===st.user.id);
  const providerById = id => st.directory.find(p=>p.id===id) || (st.provider?.id===id?st.provider:null) || st.adminProviders.find(p=>p.id===id);
  const active = () => st.orders.find(o=>o.id===st.activeOrder);
  const alertBox = () => `${st.error?`<div class="notice bad" role="alert">${e(st.error)}</div>`:''}${st.notice?`<div class="notice good" role="status">${e(st.notice)}</div>`:''}`;
  const title = (t,sub='') => `<header class="stack"><h1>${e(t)}</h1>${sub?`<p class="lead">${e(sub)}</p>`:''}</header>`;
  const back = page => `<button class="back" type="button" data-page="${page}">← Voltar</button>`;
  const requireLogin = message => `<div class="card"><p>${e(message)}</p><button class="btn full" data-page="login">Entrar ou criar conta</button></div>`;
  const working = () => st.busy ? '<div class="notice">Processando solicitação…</div>' : '';
  const isUnavailable = !st.session;

  function home(){
    return `${alertBox()}<div class="hero"><div><span class="eyebrow" style="color:#f6bf35">SALVA MOTOCA!</span><h2>Pneu furou? Encontre ajuda por perto.</h2><p>Consulte borracharias gratuitamente ou solicite atendimento no local.</p><button class="btn" data-page="request">Pedir borracheiro delivery</button></div><div class="decoration">🛵</div></div>
      <div class="section"><h2>O que você precisa?</h2></div>
      <button class="menu-card" data-page="map"><span class="emoji">📍</span><span><b>Ver borracharias no mapa</b><small>Busca grátis, sem telefone externo</small></span><span class="arrow">›</span></button>
      <button class="menu-card" data-page="request"><span class="emoji">🧰</span><span><b>Solicitar atendimento no local</b><small>Escolha manual ou busca automática</small></span><span class="arrow">›</span></button>
      <div class="section"><h2>Disponibilidade cadastrada</h2></div>
      <div class="grid2"><div class="stat"><strong>${st.directory.length}</strong><small>Prestadores verificados no piloto</small></div><div class="stat"><strong>${st.directory.filter(p=>p.available&&p.delivery_enabled).length}</strong><small>Marcados como disponíveis</small></div></div>
      <p class="footer-note">Cadastro e disponibilidade não garantem atendimento. Este ambiente ainda não processa pagamentos.</p>`;
  }
  function providerCard(p,mode='map'){
    const d=nearbyDistance(p);
    return `<article class="card"><div class="item"><div class="iconbox">🔧</div><div class="grow"><h3>${e(p.business_name)}</h3><p>${e(p.region)}${d!=null?` · ${d.toFixed(1).replace('.',',')} km em linha reta`:''}</p></div></div>
      <p class="small muted">${e(p.description||'Serviços para pneus de motocicletas.')}</p>
      <div class="actions"><span class="pill ${p.available&&p.delivery_enabled?'good':'warn'}">${p.available&&p.delivery_enabled?'Disponível para delivery':'Delivery indisponível'}</span><span class="pill">Raio declarado: ${e(p.coverage_km)} km</span></div>
      <div class="actions"><button class="btn outline sm" data-action="details" data-id="${e(p.id)}">Detalhes e rota</button>${p.available&&p.delivery_enabled?`<button class="btn sm" data-action="choose" data-id="${e(p.id)}">Solicitar delivery</button>`:''}</div></article>`;
  }
  function mapPage(){
    return `${alertBox()}${title('Borracharias no mapa','Consulta gratuita. A lista mostra apenas profissionais verificados no piloto.')}
      <div class="actions"><button class="btn outline sm" data-action="gps">📍 Usar minha localização</button><button class="btn outline sm" data-action="refresh">Atualizar lista</button></div>
      <div class="section"><h2>Mapa</h2></div><div id="map-canvas" aria-label="Mapa de borracharias verificadas"></div>
      <div class="filters"><button data-action="filter" data-value="all" class="${st.filter==='all'?'active':''}">Todos</button><button data-action="filter" data-value="available" class="${st.filter==='available'?'active':''}">Delivery disponível</button></div>
      <div class="stack">${allProviders().length?allProviders().map(p=>providerCard(p)).join(''):'<div class="notice">Nenhum prestador verificado encontrado. O mapa não apresenta cadastros fictícios.</div>'}</div>`;
  }
  function providerDetail(){
    const p=providerById(st.selectedProvider);
    if(!p)return `<div class="notice">Prestador não encontrado.</div>`;
    const link=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(p.latitude)+','+String(p.longitude))}`;
    return `${back('map')}${title(p.business_name,p.region)}<div class="card"><span class="pill good">Cadastro verificado</span><p>${e(p.description||'Serviços de borracharia para motos.')}</p><p class="small muted">Distância de cobertura declarada: ${e(p.coverage_km)} km</p><a class="btn outline" target="_blank" rel="noopener noreferrer" href="${link}">Abrir rota no mapa externo</a>${p.available?`<button class="btn full" data-action="choose" data-id="${e(p.id)}">Pedir atendimento delivery</button>`:'<p class="notice">Delivery indisponível neste momento.</p>'}<p class="small muted">Contato externo não é exibido. Pedidos delivery e pagamentos deverão ocorrer pela plataforma.</p></div>`;
  }
  function request(){
    return `${alertBox()}${title('Pedir borracheiro delivery','Selecione como deseja encontrar o profissional. Nenhuma cobrança está ativa no piloto.')}
      <div class="tabs"><button data-action="mode" data-value="manual" class="${st.mode==='manual'?'active':''}">Eu escolho</button><button data-action="mode" data-value="automatic" class="${st.mode==='automatic'?'active':''}">Encontre para mim</button></div>
      ${st.mode==='manual'?`<div class="section"><h2>Profissionais disponíveis</h2></div><div class="stack">${st.directory.filter(p=>p.available&&p.delivery_enabled).length?allProviders().filter(p=>p.available&&p.delivery_enabled).map(p=>providerCard(p,'request')).join(''):'<div class="notice">Nenhum borracheiro delivery verificado está disponível no momento.</div>'}</div>`:
      `<div class="card"><h2>Busca automática por proximidade</h2><p class="muted small">Precisamos da sua localização GPS. O servidor selecionará um profissional aprovado, disponível e dentro do raio declarado.</p><button class="btn outline full" data-action="gps">📍 Compartilhar minha localização</button><p class="small">${st.geo?'Localização autorizada nesta sessão.':'GPS ainda não autorizado.'}</p>${st.geo?'<button class="btn full" data-action="start-automatic">Continuar pedido automático</button>':''}</div>`}`;
  }
  function requestForm(){
    if(!st.user)return `${back('request')}${requireLogin('Faça login para criar uma solicitação de atendimento.')}`;
    const p=st.mode==='manual'?providerById(st.selectedProvider):null;
    return `${back('request')}${alertBox()}${title('Dados do atendimento',st.mode==='manual'?`Profissional escolhido: ${p?.business_name||'Nenhum'}`:'O sistema escolherá o prestador mais próximo que esteja disponível.')}
      ${st.mode==='automatic'&&!st.geo?'<div class="notice bad">Ative a localização na tela anterior para usar o modo automático.</div>':''}
      <form id="service-request" class="form card">
        <label class="fieldrow"><span class="label">Problema com o pneu</span><select name="problem" class="field" required><option value="Pneu furado">Pneu furado</option><option value="Pneu vazio">Pneu vazio</option><option value="Troca de câmara">Troca de câmara</option><option value="Outro reparo no pneu">Outro reparo no pneu</option></select></label>
        <label class="fieldrow"><span class="label">Moto (marca e modelo)</span><input name="motorcycle" maxlength="100" minlength="2" required class="field" placeholder="Ex.: Honda CG 160"></label>
        <label class="fieldrow"><span class="label">Bairro / região (visível antes do pagamento)</span><input name="area" maxlength="130" minlength="3" required class="field" placeholder="Ex.: Centro, próximo à praça"></label>
        <label class="fieldrow"><span class="label">Endereço exato para atendimento (restrito)</span><textarea name="exact_address" maxlength="300" minlength="6" required class="field" placeholder="Rua, número e referência. Só é liberado ao borracheiro após pagamento real confirmado."></textarea></label>
        <div class="notice">O profissional vê apenas a região e os detalhes do problema para elaborar o orçamento. O endereço exato fica protegido. Este piloto não realiza pagamentos nem confirma atendimento.</div>
        <button class="btn full" type="submit" ${st.busy?'disabled':''}>Enviar solicitação para orçamento</button>
      </form>${working()}`;
  }
  function login(){
    if(st.user)return `${title('Você já está conectado')}${profilePage()}`;
    return `${alertBox()}${title('Entrar no Salva Motoca!','Use seu e-mail e senha. O mapa pode ser consultado sem conta.')}
      <form id="login-form" class="form card">
        <label class="fieldrow"><span class="label">E-mail</span><input type="email" name="email" class="field" autocomplete="email" required></label>
        <label class="fieldrow"><span class="label">Senha</span><input type="password" name="password" class="field" autocomplete="current-password" required></label>
        <button class="btn full" type="submit">Entrar</button>
      </form><p class="small" style="margin-top:12px">Ainda não tem conta?</p><button class="btn outline full" data-page="register">Criar conta gratuita</button>${working()}`;
  }
  function register(){
    if(st.user)return profilePage();
    return `${back('login')}${alertBox()}${title('Criar conta gratuita','Seu cadastro permite solicitar atendimento e, se desejar, oferecer serviços.')}
      <form id="register-form" class="form card">
        <label class="fieldrow"><span class="label">Nome ou apelido</span><input name="display_name" class="field" minlength="2" maxlength="80" required></label>
        <label class="fieldrow"><span class="label">E-mail</span><input type="email" name="email" class="field" autocomplete="email" required></label>
        <label class="fieldrow"><span class="label">Senha (mínimo de 8 caracteres)</span><input type="password" name="password" minlength="8" class="field" autocomplete="new-password" required></label>
        <button class="btn full" type="submit">Cadastrar gratuitamente</button>
      </form><p class="footer-note">O Supabase poderá exigir confirmação do e-mail antes do primeiro login.</p>${working()}`;
  }
  function profilePage(){
    if(!st.user)return `${alertBox()}${title('Perfil')}${requireLogin('Entre para acompanhar pedidos ou cadastrar seus serviços.')}`;
    return `${alertBox()}${title('Meu perfil',st.user.email)}
      <form id="profile-form" class="form card"><label class="fieldrow"><span class="label">Como deseja ser chamado</span><input name="display_name" value="${e(st.profile?.display_name||'')}" minlength="2" maxlength="80" class="field" required></label><button class="btn outline full" type="submit">Salvar nome</button></form>
      <div class="section"><h2>Minha atividade</h2></div>
      <button class="menu-card" data-page="orders"><span class="emoji">🧾</span><span><b>Meus pedidos</b><small>Consultar orçamento e andamento</small></span><span class="arrow">›</span></button>
      <button class="menu-card" data-page="provider-dashboard"><span class="emoji">🔧</span><span><b>${st.provider?'Painel do borracheiro':'Cadastrar-me como borracheiro'}</b><small>${st.provider?(st.provider.verified?'Conta verificada':'Aguardando aprovação'):'Cadastro sujeito à aprovação'}</small></span><span class="arrow">›</span></button>
      ${st.admin?'<button class="menu-card" data-page="admin"><span class="emoji">🛡</span><span><b>Administração</b><small>Aprovar e revisar cadastros e fornecedores candidatos</small></span><span class="arrow">›</span></button>':''}
      <button class="btn outline full" data-action="logout">Sair da conta</button>`;
  }
  function ordersPage(){
    if(!st.user)return `${title('Meus pedidos')}${requireLogin('Entre para visualizar seus pedidos compartilhados entre dispositivos.')}`;
    return `${alertBox()}${title('Pedidos','Dados sincronizados pelo banco de dados. Atualize para visualizar as novidades.')}
      <button class="btn outline sm" data-action="refresh">Atualizar pedidos</button><div class="stack" style="margin-top:12px">
      ${st.orders.length?st.orders.map(o=>`<button class="menu-card" data-action="order" data-id="${e(o.id)}"><span class="emoji">🧾</span><span><b>Pedido ${e(o.id.slice(0,8).toUpperCase())}</b><small>${e(statusLabel[o.status]||o.status)} · ${e(o.area)} · ${e(when(o.created_at))}</small></span><span class="arrow">›</span></button>`).join(''):'<div class="notice">Nenhum pedido criado nesta conta.</div>'}</div>`;
  }
  function orderPage(){
    const o=active();
    if(!o)return `${back('orders')}<div class="notice">Pedido não encontrado ou acesso não autorizado.</div>`;
    const owner=myProviderOwner(o), customer=myOrder(o);
    const p=providerById(o.provider_id);
    const stLabel=statusLabel[o.status]||o.status;
    return `${back(owner?'provider-dashboard':'orders')}${alertBox()}${title('Pedido '+o.id.slice(0,8).toUpperCase(),stLabel)}
      <div class="order-layout"><div class="card">
        <p><strong>Prestador:</strong> ${e(p?.business_name||'Profissional verificado')}</p>
        <p><strong>Problema:</strong> ${e(o.problem)}</p><p><strong>Moto:</strong> ${e(o.motorcycle)}</p>
        <p><strong>Região:</strong> ${e(o.area)}</p>
        <p><strong>Solicitação:</strong> ${e(when(o.created_at))}</p>
        ${o.quoted_amount_cents != null?`<p><strong>Orçamento:</strong> <span class="price">${money(o.quoted_amount_cents)}</span></p>`:'<p class="small muted">Aguardando proposta de preço.</p>'}
        ${customer&&st.orderLocation?`<p class="small"><strong>Endereço privado:</strong> ${e(st.orderLocation.exact_address)}</p>`:''}
        ${owner&&['paid','en_route','in_service','completed','disputed'].includes(o.status)&&st.orderLocation?`<p><strong>Endereço do atendimento:</strong> ${e(st.orderLocation.exact_address)}</p>`:''}
      </div>
      ${owner&&o.status==='requested'?`<form id="quote-form" class="form card"><h3>Enviar orçamento</h3><label class="fieldrow"><span class="label">Valor total (R$)</span><input type="text" class="field" name="amount" inputmode="decimal" placeholder="Ex.: 120,00" required></label><button class="btn full" type="submit">Enviar orçamento ao cliente</button></form>`:''}
      ${customer&&o.status==='quoted'?`<div class="card"><p>Ao aceitar o orçamento, o pedido será encaminhado para a etapa de pagamento. <strong>O pagamento real não está disponível neste piloto.</strong></p><button class="btn full" data-action="accept-quote">Aceitar orçamento</button></div>`:''}
      ${o.status==='awaiting_payment'?'<div class="notice">Pagamento indisponível nesta fase. Não transfira valores diretamente ao profissional. O pedido não será confirmado nem executado por este ambiente.</div>':''}
      ${['requested','quoted','awaiting_payment'].includes(o.status)&&(customer||owner)?'<button class="btn danger full" data-action="cancel-order">Cancelar pedido sem cobrança</button>':''}
      ${['paid','en_route','in_service','completed'].includes(o.status)?'<div class="notice">Atendimento em andamento ou concluído. Esta etapa dependerá da futura integração financeira e de suporte.</div>':''}
      </div>`;
  }
  function providerDashboard(){
    if(!st.user)return `${title('Painel do borracheiro')}${requireLogin('Faça login para cadastrar sua borracharia e oferecer atendimento delivery.')}`;
    if(!st.provider)return providerForm();
    const p=st.provider;
    const orderList=st.orders.filter(o=>o.provider_id===p.id);
    return `${alertBox()}${title('Painel do borracheiro',p.business_name)}
      <div class="notice ${p.verified?'good':''}">${p.verified?'Cadastro verificado para o piloto.':'Cadastro aguardando revisão do administrador. Você ainda não aparecerá no mapa.'}</div>
      <div class="card"><label class="switch"><input type="checkbox" id="available-toggle" ${p.available?'checked':''}> Disponível para receber pedidos</label><p class="small muted">A disponibilidade só aparece no mapa após a aprovação.</p><button class="btn outline full" data-page="provider-form">Editar dados comerciais</button></div>
      <div class="section"><h2>Solicitações recebidas</h2><button class="btn outline sm" data-action="refresh">Atualizar</button></div>
      <div class="stack">${orderList.length?orderList.map(o=>`<button class="menu-card" data-action="order" data-id="${e(o.id)}"><span class="emoji">📋</span><span><b>${e(o.problem)}</b><small>${e(o.area)} · ${e(statusLabel[o.status]||o.status)}</small></span><span class="arrow">›</span></button>`).join(''):'<div class="notice">Nenhum pedido atribuído ainda.</div>'}</div>`;
  }
  function providerForm(){
    if(!st.user)return requireLogin('Faça login para cadastrar uma borracharia.');
    const p=st.provider||{};
    return `${st.provider?back('provider-dashboard'):back('profile')}${alertBox()}${title(st.provider?'Editar cadastro':'Cadastrar borracharia','As informações serão revisadas antes de aparecerem no mapa público.')}
      <form id="provider-form" class="form card">
        <label class="fieldrow"><span class="label">Nome do estabelecimento ou profissional</span><input name="business_name" minlength="3" maxlength="90" value="${e(p.business_name||'')}" required class="field"></label>
        <label class="fieldrow"><span class="label">Descrição dos serviços (sem telefone ou links)</span><textarea name="description" maxlength="350" class="field">${e(p.description||'')}</textarea></label>
        <label class="fieldrow"><span class="label">Bairro e cidade</span><input name="region" minlength="3" maxlength="100" value="${e(p.region||'')}" required class="field" placeholder="Ex.: Barreiro, Belo Horizonte"></label>
        <div class="notice">Para publicar no mapa, informe o ponto da borracharia ou uma referência central da sua área de atendimento. Confirme que tem autorização para prestar serviços no local.</div>
        <button type="button" class="btn outline full" data-action="provider-gps">📍 Preencher coordenadas com GPS</button>
        <div class="grid2"><label class="fieldrow"><span class="label">Latitude</span><input name="latitude" type="number" min="-90" max="90" step="0.000001" value="${e(p.latitude??'')}" required class="field"></label><label class="fieldrow"><span class="label">Longitude</span><input name="longitude" type="number" min="-180" max="180" step="0.000001" value="${e(p.longitude??'')}" required class="field"></label></div>
        <label class="fieldrow"><span class="label">Raio de atendimento (km, de 1 a 50)</span><input name="coverage_km" type="number" min="1" max="50" value="${e(p.coverage_km??10)}" required class="field"></label>
        <label class="switch"><input type="checkbox" name="delivery_enabled" ${p.delivery_enabled!==false?'checked':''}> Ofereço borracheiro delivery</label>
        <button class="btn full" type="submit">${st.provider?'Salvar alterações':'Enviar cadastro para aprovação'}</button>
      </form>${working()}`;
  }
  function adminPage(){
    if(!st.admin)return `${title('Administração')}<div class="notice bad">Acesso restrito ao administrador cadastrado no banco de dados.</div>`;
    const pending=st.adminProviders.filter(p=>!p.verified);
    return `${alertBox()}${title('Administração — piloto','Aprovação deve ser feita somente após verificação manual dos dados e da capacidade de atendimento.')}
      <div class="grid2"><div class="stat"><strong>${st.adminProviders.length}</strong><small>Cadastros no sistema</small></div><div class="stat"><strong>${pending.length}</strong><small>Não verificados</small></div></div>
      <button class="menu-card" data-page="supplier-leads"><span class="emoji">📋</span><span><b>Fornecedores potenciais</b><small>Lista privada: ${st.leadsReady?st.supplierLeads.length+' candidatos':'etapa de importação não ativada'}</small></span><span class="arrow">›</span></button>
      <div class="section"><h2>Prestadores</h2><button class="btn outline sm" data-action="refresh">Atualizar</button></div>
      <div class="stack">${st.adminProviders.length?st.adminProviders.map(p=>`<div class="card"><b>${e(p.business_name)}</b><p class="small muted">${e(p.region)} · ${e(p.description||'Sem descrição')}</p><span class="pill ${p.verified?'good':'warn'}">${p.verified?'Verificado':'Pendente'}</span><p class="small muted">Localização: ${e(p.latitude)}, ${e(p.longitude)} · Raio: ${e(p.coverage_km)} km</p><button class="btn ${p.verified?'danger':'outline'} sm" data-action="review" data-id="${e(p.id)}" data-approved="${p.verified?'false':'true'}">${p.verified?'Revogar aprovação':'Aprovar após verificação'}</button></div>`).join(''):'<div class="notice">Nenhum borracheiro cadastrado.</div>'}</div>`;
  }
  function supplierLeadsPage(){
    if(!st.admin)return `${title('Fornecedores potenciais')}<div class="notice bad">Acesso exclusivo da administração.</div>`;
    if(!st.leadsReady)return `${back('admin')}${title('Fornecedores potenciais')}<div class="notice">Antes de importar, execute a migração <b>supabase/02_fornecedores_potenciais.sql</b> no SQL Editor do seu Supabase e atualize esta página. Nenhum candidato será publicado automaticamente no mapa.</div><button data-action="refresh" class="btn outline full">Atualizar</button>`;
    const states={prospect:'Não contatado',contacted:'Contatado',invited:'Convidado ao cadastro',declined:'Recusou',onboarded:'Cadastrado (confirmar vínculo)'};
    return `${back('admin')}${alertBox()}${title('Fornecedores potenciais','Área privada de prospecção. Candidatos NÃO aparecem no mapa nem recebem pedidos.')}
      <div class="grid2"><div class="stat"><strong>${st.supplierLeads.length}</strong><small>Candidatos registrados</small></div><div class="stat"><strong>${st.supplierLeads.filter(x=>x.offers_delivery).length}</strong><small>Possíveis serviços delivery</small></div></div>
      <div class="section"><h2>Importar lista de fornecedores</h2></div>
      <div class="card"><p class="small muted">Baixe o modelo CSV, preencha com sua lista (até 200 por arquivo) e importe. Duplicatas por nome, bairro e cidade serão ignoradas.</p>
       <a class="btn outline" href="./fornecedores_candidatos_exemplo.csv" download>Baixar modelo CSV</a>
       <label class="fieldrow"><span class="label">Arquivo CSV (separado por ponto e vírgula ou vírgula)</span><input class="field" type="file" accept=".csv,text/csv" id="lead-csv"></label>
       <button type="button" class="btn full" data-action="import-leads">Importar candidatos</button>
       <p class="small muted">Nomes enviados no arquivo são potenciais fornecedores, não prestadores verificados. O campo contato_administrativo é privado.</p></div>
      <div class="section"><h2>Adicionar um candidato manualmente</h2></div>
      <form class="card form" id="supplier-lead-form">
        <label class="fieldrow"><span class="label">Nome comercial</span><input class="field" name="nome" minlength="3" maxlength="120" required></label>
        <div class="grid2"><label class="fieldrow"><span class="label">Bairro (se conhecido)</span><input class="field" name="bairro" maxlength="100"></label><label class="fieldrow"><span class="label">Cidade</span><input class="field" name="cidade" maxlength="100" value="Belo Horizonte" required></label></div>
        <span class="label">Categorias (pode selecionar várias)</span>
        <label class="switch"><input type="checkbox" name="borracharia"> Borracharia no estabelecimento</label>
        <label class="switch"><input type="checkbox" name="delivery"> Borracheiro delivery</label>
        <label class="switch"><input type="checkbox" name="reboque"> Reboque de motos (futuro)</label>
        <label class="fieldrow"><span class="label">Origem da informação</span><input class="field" name="origem" maxlength="250" value="Lista preliminar"></label>
        <label class="fieldrow"><span class="label">Contato para equipe administrativa (opcional, não é público)</span><input class="field" name="contato_administrativo" maxlength="250"></label>
        <label class="fieldrow"><span class="label">Observações internas</span><textarea class="field" name="observacoes" maxlength="700"></textarea></label>
        <button class="btn full" type="submit">Salvar candidato privado</button>
      </form>
      <div class="section"><h2>Lista privada</h2><button class="btn outline sm" data-action="refresh">Atualizar</button></div>
      <div class="stack">${st.supplierLeads.length?st.supplierLeads.map(x=>`<article class="card">
         <b>${e(x.business_name)}</b><p class="small muted">${e([x.neighborhood,x.city].filter(Boolean).join(' — '))}</p>
         <div class="actions">${x.offers_workshop?'<span class="pill">🔧 Borracharia</span>':''}${x.offers_delivery?'<span class="pill good">🛵 Delivery</span>':''}${x.offers_tow?'<span class="pill warn">🚚 Reboque (futuro)</span>':''}</div>
         <p class="small muted">Origem: ${e(x.source_note)}${x.notes?' · '+e(x.notes):''}</p>
         ${x.contact_private?`<p class="small muted">Contato administrativo: ${e(x.contact_private)}</p>`:''}
         <label class="fieldrow"><span class="label">Situação da prospecção</span><select class="field" id="lead-state-${e(x.id)}">${Object.entries(states).map(([k,v])=>`<option value="${k}" ${x.status===k?'selected':''}>${v}</option>`).join('')}</select></label>
         <button type="button" class="btn outline sm" data-action="lead-status" data-id="${e(x.id)}">Atualizar situação</button>
       </article>`).join(''):'<div class="notice">Nenhum candidato cadastrado. Importe sua lista usando o CSV ou o formulário acima.</div>'}</div>`;
  }
  function render(){
    if(st.leaflet){st.leaflet.remove();st.leaflet=null;}
    const pages={home,map:mapPage,request,'request-form':requestForm,login,register,profile:profilePage,
      orders:ordersPage,order:orderPage,'provider-dashboard':providerDashboard,
      'provider-form':providerForm,'provider-detail':providerDetail,admin:adminPage,'supplier-leads':supplierLeadsPage};
    app.innerHTML=st.initial?'<div class="notice">Conectando ao banco de dados…</div>':(pages[st.page]||home)();
    $('#role-label').textContent=st.user?(st.profile?.display_name||'Conta'):'Entrar';
    for(const p of ['home','map','orders','profile']){
      $(`#nav-${p}`).classList.toggle('active',st.page===p);
    }
    if(!st.initial&&st.page==='map')drawMap();
  }
  function goto(page){
    st.page=page;st.error='';st.notice='';render();window.scrollTo({top:0,behavior:'instant'});
  }
  function drawMap(){
    const el=$('#map-canvas');if(!el)return;
    if(!window.L){el.innerHTML='<div class="map-fallback">Mapa indisponível. A listagem permanece acessível.</div>';return;}
    const p=allProviders().find(p=>p.latitude!=null&&p.longitude!=null);
    const center=st.geo?[st.geo.lat,st.geo.lng]:p?[Number(p.latitude),Number(p.longitude)]:[-15.78,-47.93];
    try{
      const m=L.map(el,{scrollWheelZoom:false}).setView(center,st.geo||p?12:4); st.leaflet=m;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(m);
      if(st.geo)L.circleMarker(center,{radius:7,color:'#226cb1',fillOpacity:1}).addTo(m).bindPopup('Sua localização autorizada');
      allProviders().forEach(p=>{if(p.latitude!=null&&p.longitude!=null){
        L.marker([Number(p.latitude),Number(p.longitude)]).addTo(m).bindPopup(`<b>${e(p.business_name)}</b><br>${e(p.region)}<br>${p.available?'Disponível':'Indisponível'}`);
      }});
      setTimeout(()=>m.invalidateSize(),50);
    }catch(err){el.innerHTML='<div class="map-fallback">Não foi possível carregar o mapa. Consulte a lista.</div>';}
  }
  async function reload(){
    try{
      const {data:{session},error:authErr}=await db.auth.getSession();if(authErr)throw authErr;
      st.session=session;st.user=session?.user||null;
      const dir=await db.rpc('bj_find_providers');if(dir.error)throw dir.error; st.directory=dir.data||[];
      if(st.user){
        const [prof,provider,orders,admin]=await Promise.all([
          db.from('bj_profiles').select('id,display_name').eq('id',st.user.id).maybeSingle(),
          db.from('bj_providers').select('*').eq('owner_id',st.user.id).maybeSingle(),
          db.from('bj_orders').select('id,customer_id,provider_id,dispatch_mode,problem,motorcycle,area,status,quoted_amount_cents,created_at,updated_at').order('created_at',{ascending:false}).limit(120),
          db.from('bj_admins').select('user_id').eq('user_id',st.user.id).maybeSingle()
        ]);
        for(const x of [prof,provider,orders,admin])if(x.error)throw x.error;
        st.profile=prof.data;st.provider=provider.data;st.orders=orders.data||[];st.admin=!!admin.data;
        if(st.admin){const res=await db.from('bj_providers').select('id,business_name,description,region,latitude,longitude,coverage_km,available,verified,delivery_enabled').order('created_at',{ascending:false}).limit(150);
          if(res.error)throw res.error;st.adminProviders=res.data||[];
          const leads=await db.from('bj_supplier_leads').select('id,source_key,business_name,neighborhood,city,offers_workshop,offers_delivery,offers_tow,source_note,contact_private,notes,status').order('created_at',{ascending:false}).limit(500);
          st.leadsReady=!leads.error;
          st.supplierLeads=leads.error?[]:leads.data||[];
        }else {st.adminProviders=[];st.supplierLeads=[];st.leadsReady=false;}
      }else {st.profile=null;st.provider=null;st.orders=[];st.admin=false;st.adminProviders=[];st.supplierLeads=[];st.leadsReady=false;st.orderLocation=null;}
      if(st.activeOrder && st.user){const o=active();st.orderLocation=null;
        if(o&&(myOrder(o)||myProviderOwner(o))){
          const res=await db.from('bj_order_private_location').select('exact_address').eq('order_id',o.id).maybeSingle();
          if(res.error)throw res.error;st.orderLocation=res.data;
        }
      }
      st.error='';st.initial=false;render();
    }catch(err){st.error='Falha ao acessar os dados: '+(err.message||String(err));st.initial=false;render();}
  }
  const doAction=async (btn)=>{
    const action=btn.dataset.action, id=btn.dataset.id;
    if(action==='gps'||action==='provider-gps'){
      if(!navigator.geolocation)throw new Error('GPS não disponível neste navegador.');
      navigator.geolocation.getCurrentPosition(pos=>{
        const lat=Number(pos.coords.latitude.toFixed(6)),lng=Number(pos.coords.longitude.toFixed(6));
        if(action==='provider-gps'){
          const a=$('[name="latitude"]'),b=$('[name="longitude"]');if(a&&b){a.value=lat;b.value=lng;}
          const note = document.createElement('p');
          note.className='notice good';
          note.textContent='Coordenadas preenchidas. Confira a localização antes de salvar.';
          document.getElementById('provider-form')?.prepend(note);
        }else {
          st.geo={lat,lng};st.notice='Localização autorizada nesta sessão.';render();
        }
      },()=>{st.error='Não foi possível obter o GPS. Autorize a localização ou preencha manualmente quando possível.';render();},{timeout:12000,maximumAge:60000,enableHighAccuracy:false});
      return;
    }
    if(action==='filter'){st.filter=btn.dataset.value||'all';render();return;}
    if(action==='mode'){st.mode=btn.dataset.value;st.requestKey=null;render();return;}
    if(action==='details'){st.selectedProvider=id;goto('provider-detail');return;}
    if(action==='choose'){st.mode='manual';st.selectedProvider=id;st.requestKey=null;goto('request-form');return;}
    if(action==='start-automatic'){if(!st.geo)throw new Error('Compartilhe a localização para continuar.');st.mode='automatic';st.selectedProvider=null;st.requestKey=null;goto('request-form');return;}
    if(action==='order'){st.activeOrder=id;goto('order');await reload();return;}
    if(action==='refresh'){await reload();st.notice='Informações atualizadas.';render();return;}
    if(action==='logout'){
      if(!confirm('Sair da sua conta neste dispositivo?'))return;
      const {error}=await db.auth.signOut();if(error)throw error;
      st.user=null;st.activeOrder=null;goto('home');await reload();return;
    }
    if(action==='accept-quote'||action==='cancel-order'){
      const o=active();if(!o)throw new Error('Pedido não encontrado.');
      if(action==='cancel-order'&&!confirm('Cancelar este pedido? Não houve cobrança neste piloto.'))return;
      const res=await db.rpc(action==='accept-quote'?'bj_accept_quote':'bj_cancel_order',{p_order_id:o.id});
      if(res.error)throw res.error;await reload();st.notice=action==='accept-quote'?'Orçamento aceito. Pagamentos ainda não estão ativos.':'Pedido cancelado.';render();return;
    }
    if(action==='import-leads'){
      if(!st.admin||!st.leadsReady)throw new Error('Importação disponível somente para administradores com a migração aplicada.');
      const f=$('#lead-csv')?.files?.[0];if(!f)throw new Error('Selecione um arquivo CSV antes de importar.');
      if(f.size>160000)throw new Error('Arquivo muito grande. Importe até 200 linhas por vez.');
      if(!window.BJ_SUPPLIERS)throw new Error('Módulo de importação não carregado.');
      const leads=window.BJ_SUPPLIERS.loadCsv(await f.text());
      for(let i=0;i<leads.length;i+=50){
        const result=await db.from('bj_supplier_leads').upsert(leads.slice(i,i+50),{onConflict:'source_key',ignoreDuplicates:true});
        if(result.error)throw result.error;
      }
      await reload();st.notice='Importação concluída. Candidatos já existentes foram preservados. Nenhum deles foi publicado no mapa.';render();return;
    }
    if(action==='lead-status'){
      if(!st.admin||!st.leadsReady)throw new Error('Acesso não autorizado.');
      const status=$('#lead-state-'+id)?.value;
      if(!['prospect','contacted','invited','declined','onboarded'].includes(status))throw new Error('Situação inválida.');
      const result=await db.from('bj_supplier_leads').update({status}).eq('id',id);
      if(result.error)throw result.error;
      await reload();st.notice='Situação atualizada. Um candidato não fica público automaticamente.';render();return;
    }
    if(action==='review'){
      if(!st.admin)throw new Error('Somente o administrador pode aprovar prestadores.');
      const approved=btn.dataset.approved==='true';
      if(!confirm(approved?'Você verificou manualmente a identidade, os serviços e a localização desse profissional?':'Revogar a aprovação deste prestador?'))return;
      const res=await db.rpc('bj_review_provider',{p_provider_id:id,p_verified:approved});if(res.error)throw res.error;
      await reload();st.notice=approved?'Prestador aprovado.':'Aprovação revogada.';render();return;
    }
  };
  const onSubmit=async (form)=>{
    const d=new FormData(form);
    if(form.id==='login-form'){
      const res=await db.auth.signInWithPassword({email:String(d.get('email')).trim(),password:String(d.get('password'))});
      if(res.error)throw res.error;goto('home');await reload();st.notice='Bem-vindo ao Salva Motoca!';render();return;
    }
    if(form.id==='register-form'){
      const res=await db.auth.signUp({email:String(d.get('email')).trim(),password:String(d.get('password')),
        options:{data:{display_name:String(d.get('display_name')).trim()}}});
      if(res.error)throw res.error;goto(res.data.session?'home':'login');await reload();st.notice=res.data.session?'Cadastro concluído.':'Cadastro solicitado. Confira seu e-mail para confirmar a conta antes de entrar.';render();return;
    }
    if(!st.user)throw new Error('Faça login para continuar.');
    if(form.id==='profile-form'){
      const res=await db.from('bj_profiles').update({display_name:String(d.get('display_name')).trim()}).eq('id',st.user.id);
      if(res.error)throw res.error;await reload();st.notice='Nome atualizado.';render();return;
    }
    if(form.id==='supplier-lead-form'){
      if(!st.admin||!st.leadsReady||!window.BJ_SUPPLIERS)throw new Error('Cadastro de candidatos não disponível.');
      const raw={nome:String(d.get('nome')||''),bairro:String(d.get('bairro')||''),cidade:String(d.get('cidade')||''),
        borracharia:d.has('borracharia')?'sim':'',delivery:d.has('delivery')?'sim':'',reboque:d.has('reboque')?'sim':'',
        origem:String(d.get('origem')||''),contato_administrativo:String(d.get('contato_administrativo')||''),
        observacoes:String(d.get('observacoes')||'')};
      const entry=window.BJ_SUPPLIERS.normalize(raw);
      const result=await db.from('bj_supplier_leads').upsert(entry,{onConflict:'source_key',ignoreDuplicates:true});
      if(result.error)throw result.error;
      await reload();st.notice='Candidato registrado, ou já existente. Não será exibido no mapa antes do cadastro e aprovação.';render();return;
    }
    if(form.id==='provider-form'){
      const payload={business_name:String(d.get('business_name')).trim(),description:String(d.get('description')||'').trim(),
        region:String(d.get('region')).trim(),latitude:Number(d.get('latitude')),longitude:Number(d.get('longitude')),
        coverage_km:Number(d.get('coverage_km')),delivery_enabled:d.has('delivery_enabled')};
      if(!Number.isFinite(payload.latitude)||!Number.isFinite(payload.longitude)||!Number.isInteger(payload.coverage_km))throw new Error('Preencha latitude, longitude e raio de atendimento corretamente.');
      let res;
      if(st.provider)res=await db.from('bj_providers').update(payload).eq('id',st.provider.id);
      else res=await db.from('bj_providers').insert({...payload,owner_id:st.user.id,available:false,verified:false});
      if(res.error)throw res.error;goto('provider-dashboard');await reload();st.notice=st.provider?.verified?'Dados atualizados.':'Cadastro registrado. Aguarde a revisão do administrador.';render();return;
    }
    if(form.id==='service-request'){
      if(!st.requestKey)st.requestKey=crypto.randomUUID();
      const args={p_request_key:st.requestKey,p_mode:st.mode,p_provider_id:st.mode==='manual'?st.selectedProvider:null,
        p_problem:String(d.get('problem')),p_motorcycle:String(d.get('motorcycle')).trim(),
        p_area:String(d.get('area')).trim(),p_exact_address:String(d.get('exact_address')).trim(),
        p_lat:st.geo?.lat??null,p_lng:st.geo?.lng??null};
      if(st.mode==='automatic'&&!st.geo)throw new Error('A busca automática exige GPS autorizado.');
      const res=await db.rpc('bj_request_service',args);if(res.error)throw res.error;
      st.activeOrder=res.data;st.requestKey=null;goto('order');await reload();st.notice='Solicitação registrada no banco. Aguarde o orçamento.';render();return;
    }
    if(form.id==='quote-form'){
      const o=active();if(!o)throw new Error('Pedido não encontrado.');
      const value=Number(String(d.get('amount')).trim().replace(',','.'));
      if(!Number.isFinite(value)||value<1||value>5000)throw new Error('Informe um orçamento válido entre R$ 1 e R$ 5.000.');
      const res=await db.rpc('bj_offer_quote',{p_order_id:o.id,p_amount_cents:Math.round(value*100)});
      if(res.error)throw res.error;await reload();st.notice='Orçamento enviado ao cliente.';render();return;
    }
  };
  app.addEventListener('click',async evt=>{
    const btn=evt.target.closest('button');if(!btn||st.busy)return;
    if(btn.dataset.page){goto(btn.dataset.page);return;}
    if(!btn.dataset.action)return;
    st.busy=true;st.error='';st.notice='';
    try{await doAction(btn);}catch(err){st.error=err.message||'Não foi possível concluir a operação.';render();}
    finally{st.busy=false;}
  });
  app.addEventListener('change',async evt=>{
    if(evt.target.id!=='available-toggle'||!st.provider)return;
    const next=evt.target.checked;
    const res=await db.from('bj_providers').update({available:next}).eq('id',st.provider.id);
    if(res.error){st.error=res.error.message;render();return;}
    await reload();st.notice=next?'Disponibilidade ativada.':'Disponibilidade desativada.';render();
  });
  app.addEventListener('submit',async evt=>{
    evt.preventDefault();if(st.busy)return;st.busy=true;st.error='';st.notice='';
    try{await onSubmit(evt.target);}catch(err){st.error=err.message||'Não foi possível salvar.';render();}
    finally{st.busy=false;}
  });
  document.querySelectorAll('.topbar,.bottom-nav').forEach(el=>el.addEventListener('click',evt=>{
    const btn=evt.target.closest('[data-page]');if(btn)goto(btn.dataset.page);
  }));
  db.auth.onAuthStateChange((event) => {
    if(['SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED'].includes(event))setTimeout(()=>reload(),0);
  });
  if('serviceWorker' in navigator && (location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname)))
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  render();reload();
  window.addEventListener('focus',()=>{if(st.user&&['orders','order','provider-dashboard','supplier-leads','admin'].includes(st.page))reload();});
})();
