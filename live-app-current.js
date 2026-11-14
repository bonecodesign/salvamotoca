/* Salva Motoca! — integração piloto com o esquema real do Supabase.
 * NÃO recebe pagamentos, NÃO despacha socorro real e NÃO expõe contatos externos.
 */
(() => {
  "use strict";
  const config = window.BJ_CONFIG || {};
  const F1 = window.SMRequestF1;
  const container = document.getElementById("app");
  const banner = document.querySelector(".demo-banner");
  if (!window.supabase || !window.supabase.createClient) {
    container.textContent = "Não foi possível carregar a conexão do Supabase.";
    return;
  }
  const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const state = {
    page: "home", user: null, profile: null, ownProvider: null, directory: [],
    services: [], categories: [], onlineIds: new Set(), ownPresence: null, orders: [], quotes: [], selected: null,
    mode: "manual", location: null, map: null, loading: false, requestKey: null,
    message: "", error: "", uploadedPhotoKey: null, uploadedPhotoSignature: null, photoPreview: {}
  };
  // Alteração de identidade invalida GPS, fotos assinadas, pedidos e uploads pendentes.
  // O marcador de geração protege tarefas assíncronas iniciadas por outra conta.
  let identityGeneration = 0;
  function transitionAccount(nextUser) {
    const currentId = state.user?.id || null;
    const nextId = nextUser?.id || null;
    if (currentId === nextId) return false;
    identityGeneration++;
    state.user = nextUser || null;
    state.profile = null; state.ownProvider = null; state.ownPresence = null;
    state.orders = []; state.quotes = []; state.photoPreview = {};
    state.requestKey = null; state.uploadedPhotoKey = null; state.uploadedPhotoSignature = null;
    state.location = null; state.selected = null; state.mode = "manual";
    state.message = ""; state.error = ""; state.page = "home";
    return true;
  }
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const amount = cents => (Number(cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const statusName = value => ({
    requested: "Aguardando orçamento", quoted: "Orçamento recebido", awaiting_payment: "Orçamento aceito — aguardando pagamento", no_provider: "Sem próximo prestador online", accepted: "Aceito",
    in_progress: "Em atendimento", completed: "Concluído", cancelled: "Cancelado"
  })[value] || "Em análise";
  const quoteStatusLabel = (item, allQuotes) => {
    if (item.status === "declined") {
      const number = allQuotes.slice(0, allQuotes.indexOf(item) + 1)
        .filter(prev => prev.status === "declined" && prev.provider_id === item.provider_id).length;
      return "Recusa " + number + "/2 nesta solicitação";
    }
    return ({ proposed: "Aguardando sua decisão", accepted: "Aceito", expired: "Expirado" })[item.status] || item.status;
  };
  const deliveryCategory = () => state.categories.find(row => row.code === "borracharia_delivery");
  const deliveryIds = () => {
    const category = deliveryCategory();
    return new Set(state.services.filter(row =>
      row.is_active && category && row.category_id === category.id).map(row => row.provider_id));
  };
  const available = () => state.directory.filter(row => deliveryIds().has(row.id) && state.onlineIds.has(row.id));
  const safeNotice = () =>
    (state.error ? '<div class="notice bad" role="alert">' + esc(state.error) + "</div>" : "") +
    (state.message ? '<div class="notice good" role="status">' + esc(state.message) + "</div>" : "");
  const header = (title, desc) =>
    '<header class="stack"><h1>' + esc(title) + '</h1><p class="lead">' + esc(desc || "") + "</p></header>";
  const label = (name, type, field, placeholder, required) =>
    '<label class="fieldrow"><span class="label">' + esc(name) + '</span><input class="field" name="' +
    esc(field) + '" type="' + esc(type) + '" placeholder="' + esc(placeholder || "") + '" ' +
    (required ? "required" : "") + "></label>";
  const nav = page => {
    // Nao manter URLs assinadas de fotos ao sair da tela de pedidos.
    if (page !== "orders") state.photoPreview = {};
    state.page = page;
    state.error = ""; state.message = "";
    render();
    window.scrollTo(0, 0);
    // Cada sessão obtém as informações atuais ao entrar em Pedidos.
    if (page === "orders" && state.user) {
      refreshIdentity()
        .then(() => { if (state.page === "orders") render(); })
        .catch(err => {
          if (state.page === "orders") {
            state.error = errorText(err);
            render();
          }
        });
    }
    if (page === "map" || page === "request") {
      refreshDirectory()
        .then(() => { if (state.page === page) render(); })
        .catch(err => {
          if (state.page === page) { state.error = errorText(err); render(); }
        });
    }
  };
  const owns = order => state.user && order.customer_id === state.user.id;
  const providerOwns = order => state.ownProvider && order.provider_id === state.ownProvider.id;
  const setBusy = active => { state.loading = active; };
  const errorText = error => String(error && (error.message || error.details || error) || "Erro inesperado.");
  function haversine(lat1, lon1, lat2, lon2) {
    const a = Math.PI / 180, dLat = (lat2 - lat1) * a, dLng = (lon2 - lon1) * a;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1,
      Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * a) * Math.cos(lat2 * a) * Math.sin(dLng / 2) ** 2)));
  }
  function distance(p) {
    if (!state.location || p.latitude == null || p.longitude == null) return Infinity;
    return haversine(state.location.lat, state.location.lng, Number(p.latitude), Number(p.longitude));
  }
  function providerCard(p) {
    const d = distance(p);
    const isOnline = deliveryIds().has(p.id) && state.onlineIds.has(p.id);
    return '<article class="card"><h3>' + esc(p.display_name) + '</h3><p class="small muted">' +
      esc(p.city) + ", " + esc(p.state_code) +
      (Number.isFinite(d) ? " · " + d.toFixed(1).replace(".", ",") + " km em linha reta" : "") +
      '</p><p>' + esc(p.description || "Prestador de serviços para motos.") + '</p>' +
      '<p class="small muted">' + (isOnline ? '🟢 Online para pedidos delivery' : '⚪ Não está recebendo pedidos delivery') + '</p>' +
      '<div class="actions"><button class="btn outline sm" data-action="detail" data-id="' + esc(p.id) +
      '">Ver detalhes</button>' +
      (isOnline ? '<button class="btn sm" data-action="select-provider" data-id="' +
        esc(p.id) + '">Solicitar orçamento delivery</button>' : "") + "</div></article>";
  }
  function renderHome() {
    return '<div class="hero"><div><span class="eyebrow" style="color:#f6bf35">BORRACHAJÁ!</span>' +
      '<h2>Sua borracharia a um toque de distância.</h2>' +
      '<p>Encontre uma borracharia gratuitamente ou solicite um orçamento de atendimento no local.</p>' +
      '<button class="btn" data-page="map">Explorar borracharias</button></div><div class="decoration">🛵</div></div>' +
      '<div class="section"><h2>O que você precisa?</h2></div>' +
      '<button class="menu-card" data-page="map"><span class="emoji">📍</span><span><b>Mapa gratuito</b>' +
      '<small>Somente profissionais aprovados</small></span><span class="arrow">›</span></button>' +
      '<button class="menu-card" data-page="request"><span class="emoji">🧰</span><span><b>Borracheiro no local</b>' +
      '<small>Escolha ou busca automática, sem pagamento real nesta etapa</small></span><span class="arrow">›</span></button>' +
      '<div class="grid2"><div class="stat"><strong>' + state.directory.length +
      '</strong><small>Prestadores aprovados e ativos</small></div><div class="stat"><strong>' + available().length +
      '</strong><small>Online para receber pedidos delivery</small></div></div>';
  }
  function renderMap() {
    return header("Mapa de borracharias", "Consulta gratuita. Só aparecem profissionais aprovados e com serviços ativos.") +
      '<div class="actions"><button class="btn outline sm" data-action="gps">📍 Minha localização</button>' +
      '<button class="btn outline sm" data-action="reload">Atualizar</button></div>' +
      '<div id="map-canvas" aria-label="Mapa dos prestadores verificados"></div>' +
      (state.directory.length ? '<div class="stack">' + state.directory.map(providerCard).join("") +
       '</div>' : '<div class="notice">Ainda não há borracharias aprovadas para exibir. Candidatos em prospecção não são prestadores ativos.</div>');
  }
  function renderDetail() {
    const p = state.directory.find(row => row.id === state.selected);
    if (!p) return '<div class="notice">Prestador indisponível no mapa.</div>';
    const coords = p.latitude != null && p.longitude != null ?
      encodeURIComponent(String(p.latitude) + "," + String(p.longitude)) : null;
    return header(p.display_name, p.city + " — " + p.state_code) +
      '<div class="card"><p>' + esc(p.description || "") + '</p>' +
      (p.street_address ? '<p class="small">' + esc(p.street_address) + '</p>' : "") +
      (coords ? '<a class="btn outline" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=' + coords + '">Traçar rota</a>' : "") +
      (state.onlineIds.has(p.id) && deliveryIds().has(p.id) ? '<button class="btn full" data-action="select-provider" data-id="' + esc(p.id) + '">Solicitar orçamento delivery</button>' : "") +
      '<p class="small muted">Não exibimos telefones nem WhatsApp.</p></div>';
  }
  function renderRequest() {
    const list = available().slice().sort((a, b) => distance(a) - distance(b));
    return header("Atendimento no local", "Somente prestadores homologados, online e conectados recentemente recebem solicitações de TESTE.") +
      '<button class="btn outline sm" data-action="reload">Atualizar disponíveis</button>' +
      '<div class="tabs"><button data-action="mode" data-mode="manual" class="' +
      (state.mode === "manual" ? "active" : "") + '">Eu escolho</button>' +
      '<button data-action="mode" data-mode="automatic" class="' + (state.mode === "automatic" ? "active" : "") +
      '">Encontre para mim</button></div>' +
      (state.mode === "automatic" ? '<div class="card"><p>Localizaremos um profissional com serviço delivery ativo, pela distância em linha reta. A seleção não garante disponibilidade.</p>' +
      '<button class="btn outline full" data-action="gps">📍 Compartilhar localização</button>' +
      (state.location ? '<button class="btn full" data-action="automatic">Continuar busca</button>' :
        '<p class="muted small">A busca automática precisa do GPS.</p>') + '</div>' :
      (list.length ? '<div class="stack">' + list.map(providerCard).join("") + '</div>' :
       '<div class="notice">Não há borracheiro delivery aprovado neste momento.</div>'));
  }
  function renderOrderForm() {
    if (!state.user) return '<div class="card">Entre na sua conta para criar um pedido de teste.' +
      '<button class="btn full" data-page="login">Entrar ou cadastrar</button></div>';
    const p = state.directory.find(row => row.id === state.selected);
    if (!p || !deliveryIds().has(p.id) || !state.onlineIds.has(p.id)) return '<div class="notice">O prestador está offline ou indisponível para novos pedidos. Atualize a lista.</div>';
    const f1Enabled = config.f1TestRequestsEnabled === true;
    const options = Object.entries(F1.SERVICE_TYPES).map(([code, title]) =>
      '<label class="fieldrow"><input type="checkbox" name="services" value="' + esc(code) + '">' +
      esc(title) + (code === "reboque_moto" ? ' — integração em desenvolvimento (não envia)' : '') + '</label>').join('');
    return header("Solicitar orçamento", p.display_name + " — ambiente de testes, sem atendimento real") +
      (!f1Enabled ? '<div class="notice" role="status">F1 em revisão: o envio de fotos e pedidos está desativado até a homologação da migração e da segurança em ambiente separado.</div>' : '') +
      '<form id="request-form" class="card form">' +
      '<fieldset><legend><b>Qual serviço você precisa?</b> (selecione um ou mais)</legend>' + options + '</fieldset>' +
      '<label class="fieldrow"><span class="label">Marca da moto</span><input class="field" type="text" name="brand" maxlength="70" placeholder="Ex.: Honda" required></label>' +
      '<label class="fieldrow"><span class="label">Modelo da moto</span><input class="field" type="text" name="model" maxlength="90" placeholder="Ex.: CG 160" required></label>' +
      '<label class="fieldrow"><span class="label">Ano da moto</span><input class="field" type="number" name="year" min="1950" max="' + (new Date().getFullYear()+1) + '" step="1" placeholder="Ex.: 2024" required></label>' +
      '<label class="fieldrow"><span class="label">Foto do problema (obrigatória)</span>' +
      '<input class="field" type="file" name="photo" accept="image/jpeg,image/png,image/webp" required>' +
      '<small>JPG, PNG ou WebP de até 8 MB. A imagem será reduzida e convertida em JPG sem metadados EXIF antes do upload privado.</small></label>' +
      '<label class="fieldrow"><span class="label">Descreva o problema</span>' +
      '<textarea name="problem" minlength="5" maxlength="1900" required class="field" placeholder="Explique o problema"></textarea></label>' +
      '<label class="fieldrow"><span class="label">Endereço do atendimento (restrito)</span>' +
      '<textarea name="address" minlength="6" maxlength="280" required class="field" placeholder="Rua, número e referência"></textarea></label>' +
      '<p class="notice">Somente TESTES: não envie dados ou localizações reais nesta fase. A foto poderá ser vista pelo prestador designado para preparar o orçamento; endereço exato continua restrito antes do pagamento. Nenhum socorro ou pagamento é ativado.</p>' +
      '<button class="btn full" type="submit"' + (f1Enabled ? '' : ' disabled aria-disabled="true"') + '>Revisar e criar pedido de teste</button></form>';
  }
  function renderLogin() {
    return header("Entrar", "A conta é necessária para cadastros e solicitações de teste.") +
      '<form id="login-form" class="form card">' +
      label("E-mail", "email", "email", "voce@exemplo.com", true) +
      label("Senha", "password", "password", "Sua senha", true) +
      '<button class="btn full" type="submit">Entrar</button></form>' +
      '<button class="btn outline full" data-page="register">Criar cadastro gratuito</button>';
  }
  function renderRegister() {
    return header("Criar conta", "Cadastro gratuito para motociclistas e profissionais.") +
      '<form id="register-form" class="form card">' +
      label("Seu nome", "text", "name", "Como deseja ser chamado", true) +
      label("E-mail", "email", "email", "voce@exemplo.com", true) +
      label("Senha (mínimo 6 caracteres)", "password", "password", "Crie uma senha", true) +
      '<button class="btn full" type="submit">Cadastrar</button></form>';
  }
  function renderProviderForm() {
    return header("Cadastrar borracharia", "O cadastro passará por homologação antes de aparecer no mapa.") +
      '<form id="provider-form" class="form card">' +
      label("Nome comercial", "text", "name", "Ex.: Borracharia do Centro", true) +
      '<label class="fieldrow"><span class="label">Descrição dos serviços (sem telefone ou link)</span>' +
      '<textarea class="field" name="description" maxlength="300" placeholder="Reparos de pneus de motocicletas"></textarea></label>' +
      label("Endereço do estabelecimento", "text", "address", "Rua e número", false) +
      '<label class="fieldrow"><input type="checkbox" name="offer_map" checked> Atendimento no estabelecimento</label>' +
      '<label class="fieldrow"><input type="checkbox" name="offer_delivery"> Atendimento delivery no local da moto</label>' +
      '<p class="small muted">Cidade piloto: Belo Horizonte, MG. Os serviços começam desativados até verificação administrativa.</p>' +
      '<button class="btn full" type="submit">Solicitar cadastro</button></form>';
  }
  function renderProfile() {
    if (!state.user) return header("Minha conta", "Entre para acompanhar pedidos e cadastrar sua borracharia.") +
      '<button class="btn full" data-page="login">Entrar</button><button class="btn outline full" data-page="register">Criar conta</button>';
    const own = state.ownProvider;
    return header("Minha conta", state.profile?.display_name || state.user.email || "") +
      '<div class="card"><p>Conta: ' + esc(state.user.email || "") + '</p>' +
      (own ? '<p><b>Meu estabelecimento:</b> ' + esc(own.display_name) +
        '</p><p><b>Homologação:</b> ' + esc(own.status) + (own.is_active ? " · habilitado" : " · não habilitado") + '</p>' +
        (own.status === "approved" && own.is_active ?
          '<p><b>Disponibilidade para novos pedidos:</b> ' +
          (state.ownPresence?.online_requested && state.onlineIds.has(own.id) ? '🟢 Online' : '⚪ Offline') + '</p>' +
          '<button class="btn full" data-action="toggle-presence" data-online="' +
          (state.ownPresence?.online_requested ? 'false' : 'true') + '">' +
          (state.ownPresence?.online_requested ? 'Ficar offline — parar novos chamados' : 'Ficar online — receber chamados') +
          '</button><p class="small muted">Requer internet e app aberto. Sem contato com o servidor por cerca de 90 segundos, você deixa de aparecer como online.</p>'
          : '<div class="notice">Disponibilidade será liberada após aprovação e habilitação do serviço delivery.</div>') :
       '<button class="btn full" data-page="provider-form">Cadastrar minha borracharia</button>') +
      '<button class="btn outline full" data-action="logout">Sair da conta</button></div>';
  }
  function renderOrders() {
    if (!state.user) return header("Meus pedidos", "Entre para ver seus pedidos de teste.") +
      '<button class="btn" data-page="login">Entrar</button>';
    return header("Pedidos e orçamentos", "Ambiente de testes. Nenhuma cobrança ou atendimento real está ativo.") +
      '<button class="btn outline sm" data-action="reload">Atualizar pedidos</button>' +
      (state.orders.length ? state.orders.map(o => {
        const q = state.quotes.filter(x => x.request_id === o.id).sort((a,b) => String(a.created_at).localeCompare(String(b.created_at)));
        const activeQuote = q.find(item => item.status === "proposed" && item.provider_id === o.provider_id);
        const provider = state.directory.find(p => p.id === o.provider_id) || state.ownProvider;
        return '<div class="card"><p><b>' + esc(o.problem_description) + '</b></p><p class="small muted">' +
          esc(statusName(o.status)) + ' · ' + new Date(o.created_at).toLocaleString("pt-BR") + '</p>' +
          '<p>Prestador: ' + esc(provider?.display_name || "Em triagem") + '</p>' +
           (o.motorcycle_brand ? '<p><b>Moto:</b> ' + esc(o.motorcycle_brand) + ' ' + esc(o.motorcycle_model) + ' (' + esc(o.motorcycle_year) + ')</p>' : '') +
           (o.service_types?.length ? '<p><b>Serviços:</b> ' + o.service_types.map(code => esc(F1.SERVICE_TYPES[code] || code)).join(', ') + '</p>' : '') +
           (o.photo_path && (owns(o) || providerOwns(o)) ? '<button class="btn outline sm" data-action="view-photo" data-id="' + esc(o.id) + '">Ver foto do problema</button>' +
             (state.photoPreview[o.id] ? '<p><img style="max-width:100%;border-radius:8px" referrerpolicy="no-referrer" alt="Foto do problema enviada pelo cliente" src="' + esc(state.photoPreview[o.id]) + '"></p>' : '') : '') +
          (q.length ? q.map(item => '<p><b>Orçamento de ' +
              esc(state.directory.find(p => p.id === item.provider_id)?.display_name || "prestador anterior") +
              ':</b> ' + amount(item.amount_cents) +
              ' · ' + esc(item.details || "") + ' · ' + esc(quoteStatusLabel(item, q)) + '</p>').join("") :
            '<p class="small muted">Orçamento ainda não recebido.</p>') +
          (providerOwns(o) && !activeQuote && o.status === "requested" ?
            '<form class="quote-form form" data-id="' + esc(o.id) + '">' +
            label("Preço do serviço (R$)", "number", "amount", "Ex.: 100.00", true) +
            label("Detalhes", "text", "details", "Materiais e deslocamento incluídos?", false) +
            '<button class="btn full" type="submit">Enviar orçamento de teste</button></form>' : "") +
          (owns(o) && activeQuote && o.status === "quoted" ?
            '<div class="actions"><button class="btn sm" data-action="answer-quote" data-id="' +
            esc(activeQuote.id) + '" data-accept="true">Aceitar orçamento</button>' +
            '<button class="btn outline sm" data-action="answer-quote" data-id="' + esc(activeQuote.id) +
            '" data-accept="false">Recusar e buscar próximo online</button></div>' : "") +
          (owns(o) && o.status === "awaiting_payment" ? '<div class="notice">Orçamento aceito. Pagamentos ainda não habilitados; nenhum atendimento foi confirmado.</div>' : "") +
          (owns(o) && o.status === "no_provider" ? '<div class="notice">Nenhum outro prestador online elegível agora. O profissional só sai desta rodada após duas recusas.</div>' : "") +
          (owns(o) && ["requested","quoted","no_provider","awaiting_payment"].includes(o.status) ?
            '<button class="btn outline full" data-action="finish-request" data-id="' +
            esc(o.id) + '">Encerrar esta solicitação de teste</button>' : "") +
          (owns(o) && o.status === "cancelled" ?
            '<div class="notice">Solicitação encerrada. A contagem de recusas recomeça em um novo pedido.</div>' +
            '<button class="btn full" data-page="request">Criar nova solicitação</button>' : "") +
          '</div>';
      }).join("") : '<div class="notice">Você ainda não tem pedidos cadastrados.</div>');
  }
  function render() {
    if (state.map) { state.map.remove(); state.map = null; }
    document.getElementById("role-label").textContent = state.ownProvider ? "Prestador" : (state.user ? "Cliente" : "Visitante");
    banner.innerHTML = '🧪 <b>Piloto conectado ao banco</b> — sem cobrança real, sem despacho e sem assistência emergencial.';
    const screens = {
      home: renderHome, map: renderMap, detail: renderDetail, request: renderRequest,
      "request-form": renderOrderForm, login: renderLogin, register: renderRegister,
      orders: renderOrders, profile: renderProfile, "provider-form": renderProviderForm
    };
    const view = screens[state.page] || screens.home;
    container.innerHTML = safeNotice() + (state.loading ? '<div class="notice">Carregando…</div>' : "") + view();
    document.querySelectorAll(".bottom-nav [data-page]").forEach(button => {
      button.setAttribute("aria-current", button.dataset.page === state.page ? "page" : "false");
    });
    if (state.page === "map") setTimeout(drawMap, 0);
  }
  function drawMap() {
    if (state.page !== "map" || !window.L || !document.getElementById("map-canvas")) return;
    const center = state.location ? [state.location.lat, state.location.lng] : [-19.924, -43.938];
    state.map = window.L.map("map-canvas").setView(center, 12);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(state.map);
    state.directory.forEach(p => {
      if (p.latitude == null || p.longitude == null) return;
      window.L.marker([Number(p.latitude), Number(p.longitude)]).addTo(state.map)
        .bindPopup(esc(p.display_name));
    });
  }
  async function refreshDirectory() {
    const [providers, services, categories, online] = await Promise.all([
      db.from("providers").select("id,display_name,description,street_address,city,state_code,latitude,longitude,status,is_active")
        .eq("status", "approved").eq("is_active", true).limit(200),
      db.from("provider_services").select("provider_id,category_id,is_active").eq("is_active", true).limit(400),
      db.from("service_categories").select("id,code,name,paid_in_app,commission_percent"),
      db.rpc("bj_online_providers")
    ]);
    for (const response of [providers, services, categories, online]) if (response.error) throw response.error;
    state.services = services.data || []; state.categories = categories.data || [];
    state.onlineIds = new Set((online.data || []).map(row => row.provider_id));
    const relevantCategories = new Set(state.categories.filter(row => row.code === 'map_borracharia' || row.code === 'borracharia_delivery').map(row => row.id));
    const activeIds = new Set(state.services.filter(row => relevantCategories.has(row.category_id)).map(row => row.provider_id));
    state.directory = (providers.data || []).filter(row => activeIds.has(row.id));
  }
  async function refreshIdentity() {
    const startedGeneration = identityGeneration;
    const sessionResult = await db.auth.getSession();
    if (identityGeneration !== startedGeneration) return;
    if (sessionResult.error) throw sessionResult.error;
    if (!sessionResult.data?.session) {
      transitionAccount(null);
      return;
    }
    const { data, error } = await db.auth.getUser();
    if (identityGeneration !== startedGeneration) return;
    if (error) throw error;
    transitionAccount(data?.user || null);
    if (!state.user) return;
    state.profile = null; state.ownProvider = null; state.ownPresence = null;
    const activeGeneration = identityGeneration;
    const activeUserId = state.user.id;
    const [profile, provider] = await Promise.all([
      db.from("app_profiles").select("user_id,display_name").eq("user_id", state.user.id).maybeSingle(),
      db.from("providers").select("id,display_name,status,is_active,owner_id,city").eq("owner_id", state.user.id).maybeSingle()
    ]);
    if (identityGeneration !== activeGeneration || state.user?.id !== activeUserId) return;
    if (profile.error) throw profile.error;
    if (provider.error) throw provider.error;
    state.profile = profile.data; state.ownProvider = provider.data;
    if (state.ownProvider) {
      const presence = await db.from("bj_provider_presence")
        .select("provider_id,online_requested,last_seen_at")
        .eq("provider_id",state.ownProvider.id).maybeSingle();
      if (identityGeneration !== activeGeneration || state.user?.id !== activeUserId) return;
      if (presence.error) throw presence.error;
      state.ownPresence = presence.data || {provider_id:state.ownProvider.id,online_requested:false,last_seen_at:null};
    }
    if (!state.profile) {
      const proposed = String(state.user.user_metadata?.display_name || state.user.email?.split("@")[0] || "Motociclista").trim().slice(0, 100);
      const validName = proposed.length >= 2 ? proposed : "Motociclista";
      const created = await db.from("app_profiles").insert({ user_id: activeUserId, display_name: validName });
      if (identityGeneration !== activeGeneration || state.user?.id !== activeUserId) return;
      if (created.error) throw created.error;
      state.profile = { user_id: state.user.id, display_name: validName };
    }
    // So consultar colunas F1 depois da homologacao e ativacao explicita.
    // O banco antigo nao contem esses campos; o painel legado deve continuar funcionando.
    const legacyColumns = "id,customer_id,category_id,provider_id,problem_description,status,created_at,updated_at";
    const f1Columns = "motorcycle_brand,motorcycle_model,motorcycle_year,service_types,photo_path";
    const selectColumns = config.f1TestRequestsEnabled === true
      ? legacyColumns + "," + f1Columns : legacyColumns;
    const { data: orders, error: ordersError } = await db.from("service_requests")
      .select(selectColumns)
      .order("created_at", { ascending: false }).limit(50);
    if (identityGeneration !== activeGeneration || state.user?.id !== activeUserId) return;
    if (ordersError) throw ordersError;
    state.orders = orders || [];
    if (state.orders.length) {
      const ids = state.orders.map(o => o.id);
      const res = await db.from("service_quotes")
        .select("id,request_id,provider_id,amount_cents,details,status,created_at")
        .in("request_id", ids).limit(100);
      if (identityGeneration !== activeGeneration || state.user?.id !== activeUserId) return;
      if (res.error) throw res.error;
      state.quotes = res.data || [];
    } else state.quotes = [];
  }
  async function allRefresh() {
    try { await refreshDirectory(); await refreshIdentity(); state.error = ""; }
    catch (err) { state.error = errorText(err); }
    render();
  }
  function locate() {
    if (!navigator.geolocation) { state.error = "Este dispositivo não oferece geolocalização."; render(); return; }
    const startedGeneration = identityGeneration;
    navigator.geolocation.getCurrentPosition(
      position => {
        if (identityGeneration !== startedGeneration) return;
        state.location = { lat: position.coords.latitude, lng: position.coords.longitude };
        state.message = "Localização autorizada nesta sessão."; state.error = ""; render();
      },
      () => {
        if (identityGeneration !== startedGeneration) return;
        state.error = "Não foi possível obter o GPS. Você pode escolher um profissional manualmente."; render();
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 12000 }
    );
  }
  async function submitForm(form, fn) {
    if (state.loading) return;
    state.loading = true;
    try { await fn(new FormData(form)); state.error = ""; }
    catch (error) { state.error = errorText(error); }
    finally {
      state.loading = false;
      // Erros na F1 nao apagam a foto e todos os dados que a pessoa ja digitou.
      if (form.id === "request-form" && !state.error && form.isConnected) {
        // Pessoa desistiu na revisao: conservar campos preenchidos.
        return;
      }
      if (form.id === "request-form" && state.error && form.isConnected) {
        let notice = container.querySelector(".f1-form-error");
        if (!notice) {
          notice = document.createElement("div");
          notice.className = "notice bad f1-form-error";
          notice.setAttribute("role", "alert");
          form.prepend(notice);
        }
        notice.textContent = state.error;
      } else render();
    }
  }
  async function preparePrivatePhoto(file) {
    return F1.preparePrivatePhoto(file, {
      createImageBitmap: typeof createImageBitmap === "function" ? createImageBitmap : null,
      document, URL, Image: typeof Image === "function" ? Image : null
    });
  }
  document.addEventListener("click", async event => {
    const target = event.target.closest("[data-page], [data-action]");
    if (!target) return;
    if (target.dataset.page) { nav(target.dataset.page); return; }
    const action = target.dataset.action, id = target.dataset.id;
    if (action === "gps") { locate(); return; }
    if (action === "reload") { await allRefresh(); return; }
    if (action === "toggle-presence") {
      if (state.loading || !state.user || !state.ownProvider) return;
      state.loading = true;
      try {
        const desired = target.dataset.online === "true";
        const out = await db.rpc("bj_set_presence",{p_online:desired});
        if (out.error) throw out.error;
        await refreshDirectory(); await refreshIdentity();
        state.error = ""; state.message = desired ? "Você está online e pode receber novos chamados de teste." : "Você está offline para novos chamados.";
      } catch (err) { state.error = errorText(err); }
      finally { state.loading = false; render(); }
      return;
    }
    if (action === "answer-quote") {
      if (state.loading || !state.user) return;
      state.loading = true;
      try {
        const accepted = target.dataset.accept === "true";
        const out = await db.rpc("bj_answer_quote",{p_quote_id:id,p_accept:accepted});
        if (out.error) throw out.error;
        await refreshDirectory(); await refreshIdentity();
        state.error = "";
        state.message = out.data === "awaiting_payment" ?
          "Orçamento aceito. Aguardando pagamento (ainda desativado)." :
          out.data === "next_provider" ?
          "Orçamento recusado. O pedido seguiu para o próximo prestador online." :
          "Orçamento recusado. Não há outro prestador online disponível neste momento.";
      } catch (err) { state.error = errorText(err); }
      finally { state.loading = false; render(); }
      return;
    }
    if (action === "view-photo") {
      const order = state.orders.find(o => o.id === id);
      if (!order || !order.photo_path || !(owns(order) || providerOwns(order))) return;
      const signed = await db.storage.from("request-photos").createSignedUrl(order.photo_path, 60);
      if (signed.error || !signed.data?.signedUrl) {
        state.error = "Foto privada indisponível: " + errorText(signed.error);
      } else {
        state.photoPreview[id] = signed.data.signedUrl;
        state.error = "";
      }
      render();
      return;
    }
    if (action === "finish-request") {
      if (state.loading || !state.user) return;
      state.loading = true;
      try {
        const result = await db.rpc("bj_finish_request", {p_request_id:id});
        if (result.error) throw result.error;
        await refreshIdentity();
        state.error = "";
        state.requestKey = null;
        state.message = "Solicitação encerrada. Em um novo pedido, todos os prestadores online voltam à fila com zero recusas.";
      } catch (err) { state.error = errorText(err); }
      finally { state.loading = false; render(); }
      return;
    }
    if (action === "detail") { state.selected = id; nav("detail"); return; }
    if (action === "select-provider") { state.requestKey = null; state.uploadedPhotoKey = null; state.uploadedPhotoSignature = null; state.selected = id; state.mode = "manual"; nav("request-form"); return; }
    if (action === "mode") { state.mode = target.dataset.mode; render(); return; }
    if (action === "automatic") {
      const list = available().filter(p => Number.isFinite(distance(p))).sort((a, b) => distance(a) - distance(b));
      if (!list.length) { state.error = "Não há prestadores delivery com coordenadas verificadas próximos para esta simulação."; render(); return; }
      state.requestKey = null; state.uploadedPhotoKey = null; state.uploadedPhotoSignature = null; state.selected = list[0].id; nav("request-form"); return;
    }
    if (action === "logout") {
      const { error } = await db.auth.signOut();
      if (error) state.error = errorText(error);
      else { await refreshIdentity(); nav("home"); }
    }
  });
  container.addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    if (form.id === "login-form") submitForm(form, async data => {
      const result = await db.auth.signInWithPassword({
        email: String(data.get("email") || "").trim(),
        password: String(data.get("password") || "")
      });
      if (result.error) throw result.error;
      await refreshIdentity(); nav("profile"); state.message = "Acesso realizado.";
    });
    if (form.id === "register-form") submitForm(form, async data => {
      const name = String(data.get("name") || "").trim();
      const email = String(data.get("email") || "").trim();
      const password = String(data.get("password") || "");
      if (name.length < 2 || password.length < 6) throw new Error("Preencha nome e senha de pelo menos 6 caracteres.");
      const res = await db.auth.signUp({ email, password, options: { data: { display_name: name } } });
      if (res.error) throw res.error;
      if (res.data.session && res.data.user) {
        const created = await db.from("app_profiles").upsert({ user_id: res.data.user.id, display_name: name }, { onConflict: "user_id" });
        if (created.error) throw created.error;
        await refreshIdentity(); nav("profile"); state.message = "Conta criada com sucesso.";
      } else { nav("login"); state.message = "Confira o e-mail para confirmar sua conta antes de entrar."; }
    });
    if (form.id === "provider-form") submitForm(form, async data => {
      if (!state.user) throw new Error("Entre na conta antes de cadastrar um prestador.");
      const name = String(data.get("name") || "").trim();
      const description = String(data.get("description") || "").trim();
      const address = String(data.get("address") || "").trim();
      if (name.length < 2 || /https?:|www\.|whats.?app|wa\.me|\b\d[\d\s().-]{8,}\b/i.test(name + " " + description))
        throw new Error("Insira nome comercial válido, sem telefone ou links externos.");
      const selectedCodes = [];
      if (data.get("offer_map")) selectedCodes.push("map_borracharia");
      if (data.get("offer_delivery")) selectedCodes.push("borracharia_delivery");
      if (!selectedCodes.length) throw new Error("Selecione ao menos um tipo de atendimento.");
      const provider = await db.from("providers").insert({
        owner_id: state.user.id, display_name: name, description, street_address: address || null,
        city: "Belo Horizonte", state_code: "MG", status: "pending", is_active: false
      }).select("id").single();
      if (provider.error) throw provider.error;
      const selectedCategories = state.categories.filter(category => selectedCodes.includes(category.code));
      if (selectedCategories.length !== selectedCodes.length) throw new Error("Categoria de serviço não encontrada.");
      const services = await db.from("provider_services").insert(selectedCategories.map(category => ({
        provider_id: provider.data.id, category_id: category.id, is_active: false
      })));
      if (services.error) throw services.error;
      await refreshIdentity(); nav("profile"); state.message = "Cadastro e serviços enviados. Aguarde homologação.";
    });
    if (form.id === "request-form") submitForm(form, async data => {
      if (config.f1TestRequestsEnabled !== true)
        throw new Error("F1 desativada até a homologação do ambiente de testes.");
      if (!state.user || !F1) throw new Error("Faça login para criar o pedido.");
      const requestGeneration = identityGeneration;
      const requestUserId = state.user.id;
      const ensureSession = () => {
        if (identityGeneration !== requestGeneration || state.user?.id !== requestUserId)
          throw new Error("A conta mudou durante a solicitação. Entre novamente e crie um novo pedido.");
      };
      const provider = state.directory.find(p => p.id === state.selected);
      const category = deliveryCategory();
      if (!provider || !category || !deliveryIds().has(provider.id) || !state.onlineIds.has(provider.id))
        throw new Error("Prestador delivery não está online.");
      const photo = data.get("photo");
      const payload = F1.validateRequest({
        brand: data.get("brand"), model: data.get("model"), year: data.get("year"),
        services: data.getAll("services"), problem: data.get("problem"),
        address: data.get("address"), photo
      });
      const confirmation = [
        "PEDIDO DE TESTE — sem atendimento real",
        "Moto: " + payload.brand + " " + payload.model + " (" + payload.year + ")",
        "Serviços: " + payload.services.map(code => F1.SERVICE_TYPES[code]).join(", "),
        "Problema: " + payload.problem,
        "Endereço restrito: " + payload.address,
        "Foto será enviada a armazenamento privado e acessível ao prestador designado para orçar.",
        "Confirmar envio?"
      ].join("\n");
      if (!window.confirm(confirmation)) return;
      ensureSession();
      if (!state.requestKey) {
        if (!globalThis.crypto?.randomUUID) throw new Error("Use HTTPS ou localhost para registrar o pedido.");
        state.requestKey = globalThis.crypto.randomUUID();
      }
      const path = F1.makePhotoPath(requestUserId, state.requestKey);
      const photoSignature = [photo.name, photo.size, photo.lastModified, photo.type].join("|");
      if (state.uploadedPhotoKey === state.requestKey &&
          state.uploadedPhotoSignature !== photoSignature) {
        throw new Error("A foto foi alterada após o envio. Reabra a solicitação para iniciar um novo upload.");
      }
      if (state.uploadedPhotoKey !== state.requestKey) {
        const jpeg = await preparePrivatePhoto(photo);
        ensureSession();
        const uploaded = await db.storage.from("request-photos").upload(path, jpeg, {
          contentType: "image/jpeg", upsert: false, cacheControl: "3600"
        });
        ensureSession();
        if (uploaded.error) {
          const statusCode = Number(uploaded.error.statusCode || uploaded.error.status);
          const duplicate = statusCode === 409 || /already exists|duplicate|já existe/i.test(errorText(uploaded.error));
          if (!duplicate) throw new Error("Upload privado não concluído: " + errorText(uploaded.error));
          // A resposta HTTP pode ter falhado depois da gravacao: confirma no servidor.
          const recovered = await db.storage.from("request-photos").createSignedUrl(path, 30);
          ensureSession();
          if (recovered.error || !recovered.data?.signedUrl)
            throw new Error("Não foi possível confirmar o upload. Reabra a solicitação.");
        }
        state.uploadedPhotoKey = state.requestKey;
        state.uploadedPhotoSignature = photoSignature;
      }
      ensureSession();
      const inserted = await db.from("service_requests").insert({
        request_key: state.requestKey, customer_id: requestUserId,
        category_id: category.id, provider_id: provider.id,
        problem_description: payload.problem, address_details: payload.address,
        latitude: state.location?.lat ?? null, longitude: state.location?.lng ?? null,
        motorcycle_brand: payload.brand, motorcycle_model: payload.model, motorcycle_year: payload.year,
        service_types: payload.services, photo_path: path, status: "requested"
      });
      ensureSession();
      if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
      if (inserted.error) {
        // request_key não tem privilégio SELECT para authenticated; foto privada
        // é vinculada à chave única do pedido e já permite filtro sob RLS.
        const already = await db.from("service_requests").select("id")
          .eq("customer_id", requestUserId).eq("photo_path", path).maybeSingle();
        ensureSession();
        if (already.error || !already.data) throw new Error("Não foi possível confirmar o pedido repetido. Verifique Meus pedidos.");
      }
      state.requestKey = null; state.uploadedPhotoKey = null; state.uploadedPhotoSignature = null;
      await refreshIdentity(); nav("orders");
      state.message = "Pedido completo de TESTE registrado. Nenhum pagamento ou despacho foi realizado.";
    });
    if (form.classList.contains("quote-form")) submitForm(form, async data => {
      const orderId = form.dataset.id;
      const price = Number(String(data.get("amount") || "").replace(",", "."));
      if (!Number.isFinite(price) || price < 1 || price > 5000) throw new Error("Orçamento deve estar entre R$ 1 e R$ 5.000.");
      const res = await db.rpc("bj_submit_quote",{
        p_request_id: orderId, p_amount_cents: Math.round(price * 100),
        p_details: String(data.get("details") || "").trim()
      });
      if (res.error) throw res.error;
      await refreshIdentity(); state.message = "Orçamento de teste registrado.";
    });
  });
  let presencePingInFlight = false;
  async function sendPresenceHeartbeat() {
    if (presencePingInFlight || !state.user || !state.ownProvider ||
      !state.ownPresence?.online_requested || document.visibilityState === "hidden") return;
    presencePingInFlight = true;
    try {
      const result = await db.rpc("bj_ping_presence");
      if (result.error) throw result.error;
      if (result.data === false) {
        state.ownPresence.online_requested = false;
        state.error = "Sua disponibilidade foi interrompida. Verifique o cadastro.";
        render();
      }
    } catch (err) {
      // A presença vence automaticamente no banco sem novos pings.
      state.error = "Falha de conexão: seu status online poderá expirar. " + errorText(err);
      if (state.page === "profile") render();
    } finally { presencePingInFlight = false; }
  }
  window.setInterval(sendPresenceHeartbeat,30000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") sendPresenceHeartbeat();
  });
  db.auth.onAuthStateChange((_event, session) => {
    // Apenas limpar memória dentro do callback de Auth; chamadas ao Supabase depois.
    if (transitionAccount(session?.user || null)) {
      render();
      setTimeout(() => { void allRefresh(); }, 0);
    }
  });
  allRefresh();
})();