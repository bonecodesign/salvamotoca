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
    message: "", error: "", uploadedPhotoKey: null, uploadedPhotoSignature: null,
    requestSignature: null, photoPreview: {},
    f2Offers: [], f2QuoteItems: [], f2Capacity: null,
    f2AlertsEnabled: false, f2SeenOffers: new Set(),
    f3Capacity: null, f3TowDetails: [], f3Summaries: {}, f3Eligible: []
  };
  // Alteração de identidade invalida GPS, fotos assinadas, pedidos e uploads pendentes.
  // O marcador de geração protege tarefas assíncronas iniciadas por outra conta.
  let identityGeneration = 0;
  let requestContextVersion = 0;
  // A URL emitida não pode ser revogada pelo cliente. O preview é efêmero,
  // nunca persistido, e sua validade local começa ANTES da chamada ao Storage.
  const PHOTO_TTL_SECONDS = 60;
  let photoContextVersion = 0;
  let photoExpiryTimer = null;
  let photoRefreshes = 0;
  function clearPhotoPreviews() {
    photoContextVersion++;
    const hadPreview = Object.keys(state.photoPreview).length > 0;
    state.photoPreview = {};
    if (photoExpiryTimer !== null) {
      clearTimeout(photoExpiryTimer);
      photoExpiryTimer = null;
    }
    return hadPreview;
  }
  function invalidatePhotoScreen() {
    const hadPreview = clearPhotoPreviews();
    if (hadPreview && state.page === "orders") render();
  }
  function transitionAccount(nextUser) {
    const currentId = state.user?.id || null;
    const nextId = nextUser?.id || null;
    if (currentId === nextId) return false;
    identityGeneration++;
    state.user = nextUser || null;
    state.profile = null; state.ownProvider = null; state.ownPresence = null;
    state.orders = []; state.quotes = []; clearPhotoPreviews();
    state.f2Offers = []; state.f2QuoteItems = []; state.f2Capacity = null;
    state.f2AlertsEnabled = false; state.f2SeenOffers = new Set();
    state.f3Capacity = null; state.f3TowDetails = []; state.f3Summaries = {}; state.f3Eligible = [];
    state.requestKey = null; state.uploadedPhotoKey = null; state.uploadedPhotoSignature = null;
    state.requestSignature = null;
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
    (type === "number" ? 'min="0" step="0.01" ' : "") +
    (required ? "required" : "") + "></label>";
  const nav = page => {
    // Um pedido pendente não pode continuar se o usuário abandonou o formulário.
    if (["request-form", "f3-tow"].includes(state.page) && page !== state.page)
      requestContextVersion++;
    // Nao manter URLs assinadas de fotos ao sair da tela de pedidos.
    if (page !== state.page || page !== "orders") clearPhotoPreviews();
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
  const f2Active = () => config.f1TestRequestsEnabled === true &&
    config.f2TestOffersEnabled === true && Boolean(window.SMF2Flow);
  const f3Active = () => f2Active() && config.f3TowEnabled === true &&
    Boolean(window.SMF3Tow);
  const f2InviteFor = order => f2Active() && state.ownProvider &&
    state.f2Offers.find(o => o.request_id === order.id &&
      o.provider_id === state.ownProvider.id &&
      ["offered", "delivered", "quoted"].includes(o.status));
  const canViewOrderPhoto = order => owns(order) || providerOwns(order) || Boolean(f2InviteFor(order));
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
    return '<div class="hero"><div><span class="eyebrow" style="color:#f6bf35">Salva Motoca!</span>' +
      '<h2>Sua borracharia a um toque de distância.</h2>' +
      '<p>Encontre uma borracharia gratuitamente ou solicite um orçamento de atendimento no local.</p>' +
      '<button class="btn" data-page="map">Explorar borracharias</button></div><div class="decoration">🛵</div></div>' +
      '<div class="section"><h2>O que você precisa?</h2></div>' +
      '<button class="menu-card" data-page="map"><span class="emoji">📍</span><span><b>Mapa gratuito</b>' +
      '<small>Somente profissionais aprovados</small></span><span class="arrow">›</span></button>' +
      '<button class="menu-card" data-page="request"><span class="emoji">🧰</span><span><b>Borracheiro no local</b>' +
      '<small>Escolha ou busca automática, sem pagamento real nesta etapa</small></span><span class="arrow">›</span></button>' +
      (f3Active() ? '<button class="menu-card" data-page="f3-tow"><span class="emoji">🚚</span>' +
        '<span><b>Reboque de moto (teste)</b><small>Equipamentos homologados, sem despacho ou pagamento</small></span>' +
        '<span class="arrow">›</span></button>' : '') +
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
      (!f1Enabled ? '<div class="notice" role="status">F1 em revisão: o envio de fotos e pedidos está desativado até a homologação de autenticação, fotos privadas e segurança no Supabase existente.</div>' : '') +
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
  function renderF3Request() {
    if (!f3Active())
      return header("Reboque de motos", "F3 desativada. Nenhum pedido pode ser criado.");
    if (!state.user)
      return header("Solicitar reboque", "Entre na conta para acessar a demonstração protegida.") +
        '<button class="btn full" data-page="login">Entrar</button>';
    return header("Reboque de motocicleta (teste)",
      "Transporte com profissional homologado. Sem cobrança, notificações externas ou despacho.") +
      '<div class="notice">O endereço completo do destino é privado. Até o pagamento legítimo, ' +
      'o prestador vê somente município, peso da moto e distância aproximada.</div>' +
      '<div class="actions"><button class="btn outline" type="button" data-action="gps">Compartilhar GPS para testar</button></div>' +
      (state.location ?
        '<p class="small muted">Localização de origem capturada nesta sessão. Não será enviada antes da confirmação.</p>' :
        '<p class="small muted">Localização é obrigatória para buscar prestadores por proximidade.</p>') +
      '<form id="f3-request-form" class="card form">' +
      label("Marca", "text", "brand", "Ex.: Honda", true) +
      label("Modelo", "text", "model", "Ex.: CG 160", true) +
      label("Ano", "number", "year", "2024", true) +
      label("Peso estimado da motocicleta (kg)", "number", "weight", "140", true) +
      '<fieldset><legend>Serviço</legend><p>🚚 Reboque da motocicleta</p>' +
      Object.entries(F1.SERVICE_TYPES).filter(([code]) => code !== "reboque_moto")
        .map(([code,name]) => '<label class="fieldrow"><input name="extras" type="checkbox" value="' +
          esc(code) + '"> ' + esc(name) + ' (opcional)</label>').join("") +
      '</fieldset>' +
      label("Município de destino", "text", "destination_city", "Contagem", true) +
      label("UF do destino", "text", "destination_state", "MG", true) +
      label("Endereço exato de destino (privado)", "text", "destination_address", "Rua, número e referência", true) +
      label("Distância estimada do transporte (km)", "number", "route_km", "20", true) +
      '<label class="fieldrow"><span class="label">Descreva o problema</span>' +
      '<textarea class="field" name="problem" minlength="10" maxlength="500" required></textarea></label>' +
      '<label class="fieldrow"><span class="label">Foto do problema (JPG/PNG/WebP)</span>' +
      '<input class="field" type="file" name="photo" accept="image/jpeg,image/png,image/webp" required></label>' +
      '<p class="small muted">A fotografia é convertida para JPG sem EXIF e armazenada no bucket privado da F1.</p>' +
      '<button class="btn full" type="submit"' + (state.location ? '' : ' disabled') +
      '>Revisar e criar pedido fictício de reboque</button></form>';
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
      (f3Active() ? '<label class="fieldrow"><input type="checkbox" name="offer_reboque"> Reboque de motocicletas (exige equipamento homologado)</label>' : '') +
      '<p class="small muted">Cidade piloto: Belo Horizonte, MG. Os serviços começam desativados até verificação administrativa.</p>' +
      '<button class="btn full" type="submit">Solicitar cadastro</button></form>';
  }
  // A F2 é uma interface experimental sobre RPCs autorizadas. Com ambas as
  // flags desligadas nenhum dado ou RPC F2 é carregado no Supabase existente.
  function renderF2Capacity() {
    if (!f2Active() || !state.ownProvider) return "";
    const codes = window.SMF2Flow.CODES;
    const chosen = new Set(state.f2Capacity?.service_types || []);
    return '<form id="f2-capacity-form" class="card form"><h3>F2 · Serviços e cobertura (teste)</h3>' +
      '<p class="small muted">Cadastrar capacidades não concede homologação; só a administração habilita um prestador.</p>' +
      codes.map(code => '<label class="fieldrow"><input type="checkbox" name="services" value="' +
        esc(code) + '"' + (chosen.has(code) ? ' checked' : '') + '> ' +
        esc(F1.SERVICE_TYPES[code] || code) + '</label>').join("") +
      label("Raio máximo que você atende (km)", "number", "coverage", "Ex.: 10", true) +
      '<button class="btn full" type="submit">Salvar capacidades F2</button></form>' +
      '<button class="btn outline full" data-action="f2-toggle-alerts">' +
      (state.f2AlertsEnabled ? 'Desativar avisos F2 na tela' : 'Ativar avisos F2 na tela') +
      '</button><p class="small muted">Somente no app aberto. Não envia push externo e não confirma entrega automaticamente.</p>';
  }
  function renderF2Order(order, quotes) {
    if (f3Active() && order.service_types?.includes("reboque_moto"))
      return renderF3Order(order,quotes);
    if (!f2Active() || !order.service_types?.length) return "";
    const offers = state.f2Offers.filter(offer => offer.request_id === order.id);
    const pending = offers.some(offer => ["offered", "delivered", "quoted"].includes(offer.status));
    let content = '<div class="card"><h3>F2 · Propostas de teste</h3>' +
      '<p class="small muted">Nenhum envio de notificação, pagamento, chat ou despacho real.</p>';
    if (owns(order)) {
      content += offers.map(offer => '<p class="small">Convite para ' +
        esc(state.directory.find(p => p.id === offer.provider_id)?.display_name || "prestador") +
        ' · ' + esc(offer.status) + '</p>').join("");
      if (order.status === "requested" && !pending) {
        content += '<button class="btn outline" data-action="f2-distribute" data-id="' +
          esc(order.id) + '">Buscar prestadores compatíveis para teste</button>';
      }
      if (order.status === "requested" && pending)
        content += '<button class="btn outline sm" data-action="f2-expire" data-id="' +
          esc(order.id) + '">Verificar vencimentos no servidor</button>';
      content += quotes.filter(q => offers.some(offer => offer.quote_id === q.id)).map(q => {
        const items = state.f2QuoteItems.filter(item => item.quote_id === q.id);
        return '<div class="card"><p><b>Proposta: ' +
          esc(state.directory.find(p => p.id === q.provider_id)?.display_name || "prestador") +
          '</b> · ' + amount(q.amount_cents) + '</p>' +
          items.map(item => '<p class="small">' + esc(item.code) + ': ' + amount(item.amount_cents) + '</p>').join("") +
          (order.status === "requested" && q.status === "proposed" ?
            '<div class="actions"><button class="btn sm" data-action="f2-decide" data-id="' + esc(q.id) +
            '" data-accept="true">Aceitar este orçamento</button>' +
            '<button class="btn outline sm" data-action="f2-decide" data-id="' + esc(q.id) +
            '" data-accept="false">Recusar este orçamento</button></div>' : '') +
          '</div>';
      }).join("");
    }
    const invite = f2InviteFor(order);
    if (invite && order.status === "requested") {
      if (invite.status === "offered")
        content += '<button class="btn full" data-action="f2-ack" data-id="' + esc(invite.id) +
          '">Abrir convite F2 e confirmar recebimento</button>';
      if (invite.status === "delivered") {
        content += '<form class="f2-quote-form form" data-offer="' + esc(invite.id) +
          '" data-request="' + esc(order.id) + '"><h4>Orçamento discriminado</h4>' +
          order.service_types.map(code => label("Serviço: " + (F1.SERVICE_TYPES[code] || code) +
            " (R$)", "number", "service_" + code, "Ex.: 60.00", true)).join("") +
          label("Deslocamento obrigatório (R$)", "number", "travel", "Ex.: 15.00", true) +
          label("Peça ou material (opcional)", "text", "part_name", "Ex.: Câmara 17", false) +
          label("Valor da peça (R$; opcional)", "number", "part_price", "Ex.: 45.00", false) +
          label("Descrição adicional (sem contatos)", "text", "details", "Resumo do orçamento", false) +
          '<button class="btn full" type="submit">Enviar orçamento F2 de teste</button></form>';
      }
      if (["offered", "delivered"].includes(invite.status)) {
        content += '<button class="btn outline sm" data-action="f2-decline" data-id="' +
          esc(invite.id) + '">Não posso atender · recusar convite</button>';
      }
      if (invite.status === "quoted")
        content += '<p class="small muted">Orçamento enviado. Aguarde escolha do motociclista.</p>';
    }
    return content + '</div>';
  }
  function renderF3Capacity() {
    if (!f3Active() || !state.ownProvider) return "";
    const cap=state.f3Capacity;
    const equipment=cap?.equipment||"plataforma";
    return '<form id="f3-capacity-form" class="card form">' +
      '<h3>F3 · Equipamento para reboque (teste)</h3>' +
      '<p class="small muted">Sua declaração não habilita atendimento. A certificação é administrativa e qualquer alteração exige nova revisão.</p>' +
      '<label class="fieldrow"><span class="label">Equipamento</span><select class="field" name="equipment">' +
      window.SMF3Tow.EQUIPMENT.map(v=>'<option value="'+esc(v)+'"'+
        (v===equipment?' selected':'')+'>'+esc(v.replaceAll("_"," "))+'</option>').join("") +
      '</select></label>' +
      label("Carga máxima por moto (kg)", "number", "max_moto_kg", "250", true) +
      label("Raio de cobertura declarado (km)", "number", "coverage_km", "25", true) +
      label("Pontos de amarração", "number", "tie_down_points", "4", true) +
      '<label class="fieldrow"><input type="checkbox" name="has_ramp" required> Possuo rampa apropriada</label>' +
      '<label class="fieldrow"><input type="checkbox" name="has_wheel_chock" required> Possuo suporte de roda adequado</label>' +
      '<p class="small muted">Homologação de equipamento: '+
        (cap?.verified_by_admin?'aprovada anteriormente':'aguardando revisão humana')+'</p>' +
      '<button class="btn full" type="submit">Enviar capacidade para análise</button></form>';
  }
  function renderF3Order(order,quotes) {
    if (!f3Active() || !order.service_types?.includes("reboque_moto")) return "";
    const offers=state.f2Offers.filter(x=>x.request_id===order.id);
    const pending=offers.some(o=>["offered","delivered","quoted"].includes(o.status));
    const detail=state.f3TowDetails.find(x=>x.request_id===order.id);
    const summary=state.f3Summaries[order.id];
    let out='<div class="card"><h3>F3 · Reboque de moto (teste)</h3>' +
      '<p class="small muted">Nenhuma cobrança, chat, transporte ou deslocamento real.</p>';
    if (owns(order)) {
      if (detail) out+='<p><b>Destino:</b> '+esc(detail.destination_city)+', '+
        esc(detail.destination_state_code)+' · '+esc(detail.estimated_route_km)+
        ' km estimados</p><p><b>Endereço privado, visível só ao cliente:</b> '+
        esc(detail.destination_address)+'</p><p><b>Peso estimado:</b> '+
        esc(detail.motorcycle_weight_kg)+' kg</p>';
      if (order.status==="requested" && !pending)
        out+='<button class="btn full" data-action="f3-distribute" data-id="'+esc(order.id)+
          '">Buscar reboques homologados (teste)</button>';
      if (order.status==="requested" && pending)
        out+='<button class="btn outline sm" data-action="f2-expire" data-id="'+esc(order.id)+
          '">Verificar vencimentos F3</button>';
      out+=offers.map(o=>'<p class="small">Convite '+esc(o.provider_id)+
        ' · '+esc(o.status)+'</p>').join("");
      out+=quotes.filter(q=>offers.some(o=>o.quote_id===q.id)).map(q=>{
        const items=state.f2QuoteItems.filter(item=>item.quote_id===q.id);
        return '<div class="card"><p><b>Orçamento de reboque:</b> '+
          amount(q.amount_cents)+' · '+esc(q.status)+'</p>' +
          items.map(item=>'<p class="small">'+esc(item.code)+': '+
            amount(item.amount_cents)+'</p>').join("") +
          (order.status==="requested" && q.status==="proposed" ?
            '<div class="actions"><button class="btn sm" data-action="f3-decide" data-id="'+
              esc(q.id)+'" data-accept="true">Escolher orçamento F3</button>' +
            '<button class="btn outline sm" data-action="f3-decide" data-id="'+
              esc(q.id)+'" data-accept="false">Recusar proposta</button></div>' : '') +
          '</div>';
      }).join("");
    }
    const invite=f2InviteFor(order);
    if(invite && order.status==="requested"){
      if(summary)
        out+='<p><b>Moto:</b> '+esc(summary.motorcycleBrand)+' '+
          esc(summary.motorcycleModel)+' · '+esc(summary.motorcycleWeightKg)+
          ' kg</p><p><b>Origem:</b> '+esc(summary.pickupCity)+
          ' · <b>Destino aproximado:</b> '+esc(summary.destinationCity)+
          ' · ~'+esc(summary.estimatedRouteKm)+' km</p>';
      if(invite.status==="offered")
        out+='<button class="btn full" data-action="f2-ack" data-id="'+esc(invite.id)+
          '">Abrir convite F3 e iniciar prazo</button>';
      if(invite.status==="delivered")
        out+='<form class="f3-quote-form form" data-offer="'+esc(invite.id)+
          '" data-request="'+esc(order.id)+'"><h4>Proposta de reboque discriminada</h4>'+
          order.service_types.map(code=>label("Serviço: "+(F1.SERVICE_TYPES[code]||code)+
            " (R$)","number","service_"+code,"Ex.: 230.00",true)).join("")+
          label("Deslocamento (R$)","number","travel","Ex.: 40.00",true)+
          label("Material (opcional)","text","part_name","Cinta de segurança",false)+
          label("Preço do material (R$)","number","part_price","Ex.: 10.00",false)+
          label("Observações sem contato externo","text","details","Descrição breve",false)+
          '<button class="btn full" type="submit">Enviar proposta F3 de teste</button></form>';
      if(["offered","delivered"].includes(invite.status))
        out+='<button class="btn outline sm" data-action="f2-decline" data-id="'+
          esc(invite.id)+'">Não posso transportar esta moto</button>';
      if(invite.status==="quoted")out+='<p class="small muted">Proposta enviada. Aguardando cliente.</p>';
    }
    return out+'</div>';
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
      '<button class="btn outline full" data-action="logout">Sair da conta</button></div>' +
      renderF2Capacity() + renderF3Capacity();
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
           (o.photo_path && canViewOrderPhoto(o) ? '<button class="btn outline sm" data-action="view-photo" data-id="' + esc(o.id) + '">Ver foto do problema</button>' +
             (state.photoPreview[o.id]?.path === o.photo_path && Date.now() < state.photoPreview[o.id].expiresAt ? '<p><img style="max-width:100%;border-radius:8px" referrerpolicy="no-referrer" alt="Foto do problema enviada pelo cliente" src="' + esc(state.photoPreview[o.id].url) + '"></p>' : '') : '') +
          (q.length ? q.map(item => '<p><b>Orçamento de ' +
              esc(state.directory.find(p => p.id === item.provider_id)?.display_name || "prestador anterior") +
              ':</b> ' + amount(item.amount_cents) +
              ' · ' + esc(item.details || "") + ' · ' + esc(quoteStatusLabel(item, q)) + '</p>').join("") :
            '<p class="small muted">Orçamento ainda não recebido.</p>') +
          (!f2Active() && providerOwns(o) && !activeQuote && o.status === "requested" ?
            '<form class="quote-form form" data-id="' + esc(o.id) + '">' +
            label("Preço do serviço (R$)", "number", "amount", "Ex.: 100.00", true) +
            label("Detalhes", "text", "details", "Materiais e deslocamento incluídos?", false) +
            '<button class="btn full" type="submit">Enviar orçamento de teste</button></form>' : "") +
          (!f2Active() && owns(o) && activeQuote && o.status === "quoted" ?
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
          renderF2Order(o,q) +
          '</div>';
      }).join("") : '<div class="notice">Você ainda não tem pedidos cadastrados.</div>');
  }
  function render() {
    if (state.map) { state.map.remove(); state.map = null; }
    document.getElementById("role-label").textContent = state.ownProvider ? "Prestador" : (state.user ? "Cliente" : "Visitante");
    banner.innerHTML = '🧪 <b>Piloto conectado ao banco</b> — sem cobrança real, sem despacho e sem assistência emergencial.';
    const screens = {
      home: renderHome, map: renderMap, detail: renderDetail, request: renderRequest,
      "request-form": renderOrderForm, "f3-tow": renderF3Request,
      login: renderLogin, register: renderRegister,
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
  // Revalidar a autorização implica descartar links antigos, inclusive quando
  // a consulta falha ou o pedido deixa de aparecer sob RLS.
  async function refreshIdentity() {
    photoRefreshes++;
    invalidatePhotoScreen();
    try {
      return await refreshIdentityData();
    } finally {
      photoRefreshes--;
      invalidatePhotoScreen();
    }
  }
  async function refreshIdentityData() {
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
    // Consultas F2 só existem no cliente após duas autorizações de liberação,
    // e apenas quando suas tabelas/RPCs foram previamente homologadas.
    state.f2Offers = []; state.f2QuoteItems = []; state.f2Capacity = null;
    if (f2Active()) {
      const [offers, capacity] = await Promise.all([
        db.from("f2_request_offers")
          .select("id,request_id,provider_id,round_number,status,offered_at,delivered_at,quote_id")
          .order("offered_at", { ascending: false }).limit(100),
        state.ownProvider
          ? db.from("f2_provider_capacity")
              .select("provider_id,service_types,coverage_km")
              .eq("provider_id", state.ownProvider.id).maybeSingle()
          : Promise.resolve({ data: null, error: null })
      ]);
      if (identityGeneration !== activeGeneration || state.user?.id !== activeUserId) return;
      if (offers.error) throw offers.error;
      if (capacity.error) throw capacity.error;
      state.f2Offers = offers.data || [];
      state.f2Capacity = capacity.data;
      // Aviso in-app opt-in. Um alerta visível NÃO comprova entrega no servidor:
      // o ACK autenticado só ocorre quando o prestador abre o convite.
      const unseen = state.ownProvider ? state.f2Offers.filter(o =>
        o.provider_id === state.ownProvider.id && o.status === "offered" &&
        !state.f2SeenOffers.has(o.id)) : [];
      if (state.f2AlertsEnabled && unseen.length && document.visibilityState !== "hidden") {
        for (const offer of unseen) state.f2SeenOffers.add(offer.id);
        state.message = unseen.length === 1
          ? "Você recebeu um convite F2 de teste. Abra Pedidos para responder."
          : "Você recebeu " + unseen.length + " convites F2 de teste. Abra Pedidos.";
        if (typeof navigator.vibrate === "function") {
          try { navigator.vibrate(120); } catch (_err) { /* Permissão/dispositivo podem negar. */ }
        }
      }
      const f2QuoteIds = state.f2Offers.map(o => o.quote_id).filter(Boolean);
      if (f2QuoteIds.length) {
        const items = await db.from("f2_quote_items")
          .select("quote_id,line_no,kind,code,amount_cents")
          .in("quote_id", f2QuoteIds).order("line_no", { ascending: true }).limit(250);
        if (identityGeneration !== activeGeneration || state.user?.id !== activeUserId) return;
        if (items.error) throw items.error;
        state.f2QuoteItems = items.data || [];
      }
    }
    state.f3Capacity=null;state.f3TowDetails=[];state.f3Summaries={};
    if (f3Active()) {
      const [capacity,towDetails] = await Promise.all([
        state.ownProvider ? db.from("f3_tow_provider_capacity")
          .select("provider_id,equipment,max_moto_kg,coverage_km,tie_down_points,has_ramp,has_wheel_chock,verified_by_admin")
          .eq("provider_id",state.ownProvider.id).maybeSingle() :
          Promise.resolve({data:null,error:null}),
        db.from("f3_tow_requests")
          .select("request_id,motorcycle_weight_kg,pickup_city,pickup_state_code,destination_city,destination_state_code,destination_address,estimated_route_km")
          .limit(50)
      ]);
      if (identityGeneration !== activeGeneration || state.user?.id !== activeUserId) return;
      if (capacity.error) throw capacity.error;
      if (towDetails.error) throw towDetails.error;
      state.f3Capacity=capacity.data;
      state.f3TowDetails=towDetails.data||[];
      const visibleTow=state.orders.filter(o=>
        o.service_types?.includes("reboque_moto") &&
        (owns(o)||Boolean(f2InviteFor(o)))).slice(0,20);
      for (const order of visibleTow) {
        const response=await db.rpc("f3_tow_summary",{p_request_id:order.id});
        if (identityGeneration !== activeGeneration || state.user?.id !== activeUserId) return;
        if (!response.error && response.data)
          state.f3Summaries[order.id]=response.data;
      }
    }
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
  function f2AmountCents(value, allowZero = false) {
    const raw = String(value ?? "").trim().replace(",", ".");
    if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(raw))
      throw new Error("Informe valores em reais com até duas casas decimais.");
    const [whole,decimal = ""] = raw.split(".");
    const cents = Number(whole) * 100 + Number((decimal + "00").slice(0,2));
    if (!Number.isSafeInteger(cents) || cents < (allowZero ? 0 : 1))
      throw new Error("Valor do serviço precisa ser positivo.");
    return cents;
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
    if (action === "f2-toggle-alerts") {
      if (!f2Active() || !state.user || !state.ownProvider) return;
      state.f2AlertsEnabled = !state.f2AlertsEnabled;
      state.message = state.f2AlertsEnabled ?
        "Avisos de convite ativos somente enquanto o aplicativo estiver aberto." :
        "Avisos de convite desativados nesta sessão.";
      render();
      return;
    }
    if (["f3-distribute","f3-decide"].includes(action)) {
      if (!f3Active() || !state.user || state.loading) return;
      const uid=state.user.id,generation=identityGeneration;
      let rpc,args,success;
      if (action==="f3-distribute") {
        if (!state.orders.some(o=>o.id===id && owns(o) &&
          o.status==="requested" && o.service_types?.includes("reboque_moto"))) return;
        if (!window.confirm("Convidar reboques fictícios elegíveis? Não são enviadas notificações reais."))return;
        rpc="f3_offer_candidates";args={p_request_id:id,p_max_offers:3};
        success="A busca de reboque de teste foi registrada sem despacho real.";
      }else{
        const quote=state.quotes.find(q=>q.id===id && q.status==="proposed");
        if(!quote || !state.orders.some(o=>o.id===quote.request_id && owns(o) &&
          o.service_types?.includes("reboque_moto")))return;
        const accept=target.dataset.accept==="true";
        if(accept&&!window.confirm("Escolher este reboque apenas para teste, sem pagamento?"))return;
        rpc="f3_decide_tow_quote";args={p_quote_id:id,p_accept:accept};
        success=accept?"Proposta de reboque escolhida. Aguardando pagamento não habilitado.":
          "Proposta de reboque recusada.";
      }
      state.loading=true;
      try{
        const result=await db.rpc(rpc,args);
        if(identityGeneration!==generation||state.user?.id!==uid)return;
        if(result.error)throw result.error;
        await refreshIdentity();
        if(identityGeneration!==generation||state.user?.id!==uid)return;
        state.error="";
        state.message=action==="f3-distribute" && Number(result.data)===0 ?
          "Nenhum equipamento homologado compatível nesta rodada." : success;
      }catch(error){
        if(identityGeneration===generation&&state.user?.id===uid)
          state.error=errorText(error);
      }finally{state.loading=false;render()}
      return;
    }
    if (["f2-distribute","f2-ack","f2-decline","f2-decide","f2-expire"].includes(action)) {
      if (!f2Active()) return;
      if (state.loading || !state.user) return;
      const userAtStart = state.user.id, generation = identityGeneration;
      let rpc, args, success;
      if (action === "f2-distribute") {
        if (!state.orders.some(o => o.id === id && owns(o) && o.status === "requested")) return;
        if (!window.confirm("Convidar prestadores fictícios para testar orçamentos, sem notificações ou atendimento real?")) return;
        rpc = "f2_offer_candidates"; args = { p_request_id: id, p_max_offers: 3 };
        success = "Convites de teste registrados. Nenhum prestador foi notificado externamente.";
      } else if (action === "f2-expire") {
        if (!state.orders.some(o => o.id === id && owns(o))) return;
        rpc = "f2_expire_offers"; args = { p_request_id: id };
        success = "Prazos das propostas F2 conferidos pelo servidor.";
      } else if (action === "f2-ack") {
        if (!state.f2Offers.some(o => o.id === id && o.provider_id === state.ownProvider?.id && o.status === "offered")) return;
        rpc = "f2_ack_offer"; args = { p_offer_id: id };
        success = "Convite aberto. Seu prazo para enviar orçamento começa agora.";
      } else if (action === "f2-decline") {
        if (!state.f2Offers.some(o => o.id === id && o.provider_id === state.ownProvider?.id &&
          ["offered", "delivered"].includes(o.status))) return;
        if (!window.confirm("Recusar este convite de teste? A recusa voluntária não conta como ausência.")) return;
        rpc = "f2_decline_offer"; args = { p_offer_id: id };
        success = "Convite recusado. Esta resposta não será contabilizada como ausência.";
      } else {
        if (!state.quotes.some(q => q.id === id && q.status === "proposed" &&
          state.orders.some(o => o.id === q.request_id && owns(o)))) return;
        const accept = target.dataset.accept === "true";
        if (accept && !window.confirm("Selecionar este orçamento para teste? Não haverá pagamento real.")) return;
        rpc = "f2_decide_quote"; args = { p_quote_id: id, p_accept: accept };
        success = accept ? "Proposta selecionada. Pagamento e chat continuam bloqueados." :
          "Proposta recusada. Outros prestadores poderão ser convidados.";
      }
      state.loading = true;
      try {
        const result = await db.rpc(rpc, args);
        if (identityGeneration !== generation || state.user?.id !== userAtStart) return;
        if (result.error) throw result.error;
        await refreshIdentity();
        if (identityGeneration !== generation || state.user?.id !== userAtStart) return;
        state.error = "";
        state.message = action === "f2-distribute" && Number(result.data) === 0
          ? "Nenhum prestador compatível e disponível nesta simulação."
          : success;
      } catch (err) {
        if (identityGeneration === generation && state.user?.id === userAtStart)
          state.error = errorText(err);
      } finally { state.loading = false; render(); }
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
      if (!order || !order.photo_path || !canViewOrderPhoto(order) ||
          state.page !== "orders" || document.visibilityState === "hidden" ||
          photoRefreshes > 0) return;
      invalidatePhotoScreen();
      const photoGeneration = identityGeneration;
      const photoContext = photoContextVersion;
      const photoPath = order.photo_path;
      const expiresAt = Date.now() + PHOTO_TTL_SECONDS * 1000;
      const stillCurrent = () => photoGeneration === identityGeneration &&
        photoContext === photoContextVersion && state.page === "orders" &&
        document.visibilityState !== "hidden" && photoRefreshes === 0 &&
        Date.now() < expiresAt;
      try {
        const signed = await db.storage.from("request-photos").createSignedUrl(photoPath, PHOTO_TTL_SECONDS);
        // Evita que uma resposta antiga exponha um link assinado a outra conta ou tela.
        if (!stillCurrent()) return;
        const currentOrder = state.orders.find(o => o.id === id && o.photo_path === photoPath);
        if (!currentOrder || !canViewOrderPhoto(currentOrder)) return;
        if (signed.error || !signed.data?.signedUrl) {
          state.error = "Foto privada indisponível: " + errorText(signed.error);
        } else {
          state.photoPreview[id] = { url: signed.data.signedUrl, path: photoPath, expiresAt };
          photoExpiryTimer = setTimeout(() => {
            if (photoContext === photoContextVersion) invalidatePhotoScreen();
          }, Math.max(0, expiresAt - Date.now()));
          state.error = "";
        }
      } catch (_error) {
        if (!stillCurrent()) return;
        state.error = "Não foi possível carregar a foto privada. Tente novamente.";
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
    if (action === "select-provider") { requestContextVersion++; state.requestKey = null; state.uploadedPhotoKey = null; state.uploadedPhotoSignature = null; state.requestSignature = null; state.selected = id; state.mode = "manual"; nav("request-form"); return; }
    if (action === "mode") { state.mode = target.dataset.mode; render(); return; }
    if (action === "automatic") {
      const list = available().filter(p => Number.isFinite(distance(p))).sort((a, b) => distance(a) - distance(b));
      if (!list.length) { state.error = "Não há prestadores delivery com coordenadas verificadas próximos para esta simulação."; render(); return; }
      requestContextVersion++;
      state.requestKey = null; state.uploadedPhotoKey = null; state.uploadedPhotoSignature = null; state.requestSignature = null; state.selected = list[0].id; nav("request-form"); return;
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
      if (f3Active() && data.get("offer_reboque")) selectedCodes.push("reboque_moto");
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
    if (form.id === "f3-request-form") submitForm(form, async data => {
      if (!f3Active() || !state.user || !window.SMRequestF1)
        throw new Error("Reboque não está homologado para envio.");
      const uid = state.user.id, generation = identityGeneration;
      const context = requestContextVersion;
      const ensureSession = () => {
        if (identityGeneration !== generation || state.user?.id !== uid ||
            requestContextVersion !== context || state.page !== "f3-tow")
          throw new Error("Sessão ou formulário mudou durante o pedido de reboque. Reinicie a solicitação.");
      };
      const file = data.get("photo");
      F1.validatePhoto(file);
      const problem = String(data.get("problem") || "").trim();
      if (problem.length < 10 || problem.length > 500)
        throw new Error("A descrição do reboque deve ter entre 10 e 500 caracteres.");
      const request = window.SMF3Tow.validateTowRequest({
        serviceTypes:["reboque_moto",...data.getAll("extras")],
        motorcycleBrand:data.get("brand"),motorcycleModel:data.get("model"),
        motorcycleYear:Number(data.get("year")),
        motorcycleWeightKg:Number(data.get("weight")),
        pickupCity:"Belo Horizonte",pickupStateCode:"MG",
        pickupLocation:state.location,
        destinationCity:data.get("destination_city"),
        destinationStateCode:String(data.get("destination_state")||"").trim().toUpperCase(),
        destinationAddress:data.get("destination_address"),
        estimatedRouteKm:Number(data.get("route_km"))
      });
      const summary = window.SMF3Tow.publicSummary(request);
      const confirmation = [
        "PEDIDO DE REBOQUE — SOMENTE TESTE",
        "Moto: "+summary.motorcycle.brand+" "+summary.motorcycle.model+
          " / "+summary.motorcycle.weightKg+" kg",
        "Origem: "+summary.pickup.city+"; destino: "+summary.destination.city,
        "Endereço de destino será armazenado em tabela privada.",
        "Nenhum reboque, chat, pagamento ou despacho será ativado.",
        "Confirmar cadastro de teste?"
      ].join("\n");
      if (!window.confirm(confirmation)) return;
      ensureSession();
      const lat = request.pickupLocation.lat, lng = request.pickupLocation.lng;
      const signature = [file.name,file.size,file.lastModified,file.type].join("|");
      const draftSignature = JSON.stringify([uid,request.serviceTypes,
        request.motorcycle,request.pickup,request.destination,request.estimatedRouteKm,
        request.private.destinationAddress,problem,lat,lng,signature]);
      if (!state.requestKey) {
        if (!globalThis.crypto?.randomUUID) throw new Error("É necessário HTTPS ou localhost.");
        state.requestKey = globalThis.crypto.randomUUID();
        state.requestSignature = draftSignature;
      }
      if (state.requestSignature !== draftSignature ||
        (state.uploadedPhotoKey === state.requestKey &&
         state.uploadedPhotoSignature !== signature))
        throw new Error("Os dados ou a foto mudaram após o envio. Reinicie o formulário.");
      const photoPath = F1.makePhotoPath(uid,state.requestKey);
      if (state.uploadedPhotoKey !== state.requestKey) {
        const jpeg = await preparePrivatePhoto(file);
        ensureSession();
        const uploaded = await db.storage.from("request-photos").upload(photoPath,jpeg,{
          contentType:"image/jpeg",upsert:false,cacheControl:"3600"
        });
        ensureSession();
        if (uploaded.error) {
          const code = Number(uploaded.error.statusCode || uploaded.error.status);
          if (code !== 409 && !/duplicate|already exists|já existe/i.test(errorText(uploaded.error)))
            throw new Error("Falha no upload privado: "+errorText(uploaded.error));
          const restored = await db.storage.from("request-photos").download(photoPath);
          ensureSession();
          if (restored.error || !restored.data || !(await F1.samePhotoBytes(jpeg,restored.data)))
            throw new Error("Não foi possível verificar a foto privada. Reinicie o pedido.");
          ensureSession();
        }
        state.uploadedPhotoKey = state.requestKey;
        state.uploadedPhotoSignature = signature;
      }
      ensureSession();
      const result = await db.rpc("f3_create_tow_request",{
        p_request_key:state.requestKey,p_photo_path:photoPath,
        p_brand:request.motorcycle.brand,p_model:request.motorcycle.model,
        p_year:request.motorcycle.year,p_weight_kg:request.motorcycle.weightKg,
        p_service_types:request.serviceTypes,p_description:problem,
        p_pickup_lat:lat,p_pickup_lng:lng,p_pickup_city:request.pickup.city,
        p_pickup_state:request.pickup.stateCode,
        p_destination_city:request.destination.city,
        p_destination_state:request.destination.stateCode,
        p_destination_address:request.private.destinationAddress,
        p_estimated_km:request.estimatedRouteKm,
        p_mode:"automatic",p_selected_provider:null
      });
      ensureSession();
      if (result.error) throw result.error;
      state.requestKey=null;state.requestSignature=null;
      state.uploadedPhotoKey=null;state.uploadedPhotoSignature=null;
      await refreshIdentity();
      ensureSession();
      nav("orders");
      state.message = "Pedido de reboque de TESTE registrado. Nenhum transporte real foi acionado.";
    });
    if (form.id === "f3-capacity-form") submitForm(form, async data => {
      if (!f3Active() || !state.user || !state.ownProvider)
        throw new Error("Cadastro F3 desativado.");
      const uid=state.user.id,generation=identityGeneration;
      const proposed=window.SMF3Tow.validateProviderCapacity({
        equipment:data.get("equipment"),
        maxMotoKg:Number(data.get("max_moto_kg")),
        coverageKm:Number(data.get("coverage_km")),
        tieDownPoints:Number(data.get("tie_down_points")),
        hasRamp:Boolean(data.get("has_ramp")),hasWheelChock:Boolean(data.get("has_wheel_chock")),
        verifiedByAdmin:false
      });
      const result=await db.rpc("f3_set_tow_capacity",{
        p_equipment:proposed.equipment,p_max_moto_kg:proposed.maxMotoKg,
        p_coverage_km:proposed.coverageKm,
        p_tie_down_points:proposed.tieDownPoints,
        p_has_ramp:proposed.hasRamp,p_has_wheel_chock:proposed.hasWheelChock
      });
      if (identityGeneration !== generation || state.user?.id !== uid) return;
      if (result.error) throw result.error;
      await refreshIdentity();
      if (identityGeneration !== generation || state.user?.id !== uid) return;
      state.message="Equipamento de reboque declarado. Aguarde homologação humana antes de novos convites.";
    });
    if (form.classList.contains("f3-quote-form")) submitForm(form, async data => {
      if (!f3Active() || !state.user || !state.ownProvider)
        throw new Error("Orçamento F3 indisponível.");
      const offerId=form.dataset.offer,requestId=form.dataset.request;
      const offer=state.f2Offers.find(o=>o.id===offerId && o.request_id===requestId &&
        o.provider_id===state.ownProvider.id && o.status==="delivered");
      const order=state.orders.find(o=>o.id===requestId);
      if (!offer || !order || order.status!=="requested" ||
          !order.service_types?.includes("reboque_moto"))
        throw new Error("Convite de reboque inexistente ou encerrado.");
      const amounts={};
      for(const code of order.service_types)
        amounts[code]=f2AmountCents(data.get("service_"+code));
      const travel=f2AmountCents(data.get("travel"),true);
      const partName=String(data.get("part_name")||"").trim();
      const partRaw=String(data.get("part_price")||"").trim();
      if (Boolean(partName)!==Boolean(partRaw))
        throw new Error("Preencha material e respectivo valor, ou deixe ambos em branco.");
      const parts=partName?[{name:partName,amountCents:f2AmountCents(partRaw)}]:[];
      const priced=window.SMF3Tow.quoteTow({
        serviceTypes:order.service_types,serviceCents:amounts,travelCents:travel,parts
      });
      const lines=priced.rows.map(row=>({
        kind:row.kind,code:row.code,amountCents:row.amountCents
      }));
      const details=String(data.get("details")||"").trim();
      if(/https?:\/\/|www\.|wa\.me|whats.?app|pix|@[-\w.]+/i.test(details))
        throw new Error("Não compartilhe contatos, links ou chaves de pagamento.");
      const uid=state.user.id,generation=identityGeneration;
      const result=await db.rpc("f3_submit_tow_quote",{
        p_offer_id:offerId,p_items:lines,p_details:details
      });
      if (identityGeneration !== generation || state.user?.id !== uid) return;
      if (result.error) throw result.error;
      await refreshIdentity();
      if (identityGeneration !== generation || state.user?.id !== uid) return;
      state.message="Orçamento de reboque enviado para teste. Nenhum pagamento ou despacho iniciado.";
    });
    if (form.id === "f2-capacity-form") submitForm(form, async data => {
      if (!f2Active() || !state.user || !state.ownProvider)
        throw new Error("Configuração F2 indisponível.");
      const generation = identityGeneration, uid = state.user.id;
      const services = window.SMF2Flow.serviceTypes(data.getAll("services"));
      const coverage = Number(String(data.get("coverage") || "").replace(",", "."));
      if (!Number.isFinite(coverage) || coverage < 0.1 || coverage > 30)
        throw new Error("Raio de cobertura precisa ficar entre 0,1 e 30 km.");
      const result = await db.rpc("f2_set_capacity", {
        p_services: services, p_coverage_km: coverage
      });
      if (identityGeneration !== generation || state.user?.id !== uid) return;
      if (result.error) throw result.error;
      await refreshIdentity();
      if (identityGeneration !== generation || state.user?.id !== uid) return;
      state.message = "Capacidades registradas para testes. O cadastro ainda exige homologação.";
    });
    if (form.classList.contains("f2-quote-form")) submitForm(form, async data => {
      if (!f2Active() || !state.user || !state.ownProvider)
        throw new Error("Envio F2 ainda indisponível.");
      const offerId = form.dataset.offer, requestId = form.dataset.request;
      const offer = state.f2Offers.find(item => item.id === offerId &&
        item.request_id === requestId && item.provider_id === state.ownProvider.id &&
        item.status === "delivered");
      const order = state.orders.find(item => item.id === requestId);
      if (!offer || !order || order.status !== "requested")
        throw new Error("O convite não está mais disponível.");
      const services = window.SMF2Flow.serviceTypes(order.service_types);
      const amounts = services.map(code => ({
        code, amountCents: f2AmountCents(data.get("service_" + code))
      }));
      const travelCents = f2AmountCents(data.get("travel"), true);
      const partName = String(data.get("part_name") || "").trim();
      const partPrice = String(data.get("part_price") || "").trim();
      if ((partName && !partPrice) || (!partName && partPrice))
        throw new Error("Preencha nome e valor do material, ou deixe ambos vazios.");
      const parts = partName
        ? [{name:partName,amountCents:f2AmountCents(partPrice)}] : [];
      window.SMF2Flow.quoteBreakdown({
        serviceTypes: services, services: amounts, travelCents, parts
      });
      const lines = amounts.map(item => ({
        kind: "service", code: item.code, amountCents: item.amountCents
      }));
      lines.push({kind:"travel",code:"deslocamento",amountCents:travelCents});
      for (const part of parts)
        lines.push({kind:"part",code:part.name,amountCents:part.amountCents});
      const generation = identityGeneration, uid = state.user.id;
      const result = await db.rpc("f2_submit_quote", {
        p_offer_id: offerId, p_items: lines,
        p_details: String(data.get("details") || "").trim()
      });
      if (identityGeneration !== generation || state.user?.id !== uid) return;
      if (result.error) throw result.error;
      await refreshIdentity();
      if (identityGeneration !== generation || state.user?.id !== uid) return;
      state.message = "Proposta F2 itemizada enviada para teste, sem pagamento.";
    });
    if (form.id === "request-form") submitForm(form, async data => {
      if (config.f1TestRequestsEnabled !== true)
        throw new Error("F1 desativada até a homologação do ambiente de testes.");
      if (!state.user || !F1) throw new Error("Faça login para criar o pedido.");
      const requestGeneration = identityGeneration;
      const requestVersion = requestContextVersion;
      const requestSelectedProvider = state.selected;
      const requestUserId = state.user.id;
      const ensureSession = () => {
        if (identityGeneration !== requestGeneration || state.user?.id !== requestUserId)
          throw new Error("A conta mudou durante a solicitação. Entre novamente e crie um novo pedido.");
        if (requestContextVersion !== requestVersion || state.page !== "request-form" ||
            state.selected !== requestSelectedProvider)
          throw new Error("Esta tentativa foi interrompida porque você saiu do pedido ou mudou o prestador. Inicie uma nova solicitação.");
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
      // O GPS é capturado no momento da confirmação; respostas tardias não
      // alteram a localização de um pedido já submetido.
      const requestLatitude = state.location?.lat ?? null;
      const requestLongitude = state.location?.lng ?? null;
      const photoSignature = [photo.name, photo.size, photo.lastModified, photo.type].join("|");
      const draftSignature = JSON.stringify([
        requestUserId, provider.id, category.id,
        payload.brand, payload.model, payload.year, payload.services,
        payload.problem, payload.address, photoSignature,
        requestLatitude, requestLongitude
      ]);
      if (!state.requestKey) {
        if (!globalThis.crypto?.randomUUID) throw new Error("Use HTTPS ou localhost para registrar o pedido.");
        state.requestKey = globalThis.crypto.randomUUID();
        state.requestSignature = draftSignature;
      }
      if (state.uploadedPhotoKey === state.requestKey &&
          state.uploadedPhotoSignature !== photoSignature) {
        throw new Error("A foto foi alterada após o envio. Volte à lista e selecione o prestador novamente para um novo pedido.");
      }
      if (state.requestSignature !== draftSignature)
        throw new Error("Os dados do pedido mudaram durante uma tentativa anterior. Volte à lista e selecione o prestador novamente."); 
      const path = F1.makePhotoPath(requestUserId, state.requestKey);
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
          // Um 409 não prova que a imagem armazenada corresponde à seleção atual.
          // Baixar apenas neste caso e comparar o JPEG real antes de continuar.
          const recovered = await db.storage.from("request-photos").download(path);
          ensureSession();
          if (recovered.error || !recovered.data)
            throw new Error("Não foi possível confirmar o upload privado. Volte à lista e selecione o prestador novamente.");
          const matches = await F1.samePhotoBytes(jpeg, recovered.data);
          ensureSession();
          if (!matches)
            throw new Error("Uma foto diferente já ocupa este pedido. Volte à lista e selecione o prestador novamente.");
        }
        state.uploadedPhotoKey = state.requestKey;
        state.uploadedPhotoSignature = photoSignature;
      }
      ensureSession();
      const requestInsert = {
        request_key: state.requestKey, customer_id: requestUserId,
        category_id: category.id, provider_id: provider.id,
        problem_description: payload.problem, address_details: payload.address,
        latitude: requestLatitude, longitude: requestLongitude,
        motorcycle_brand: payload.brand, motorcycle_model: payload.model, motorcycle_year: payload.year,
        service_types: payload.services, photo_path: path, status: "requested"
      };
      // Coluna F2 só deve ser enviada depois de schema e flags homologados.
      if (f2Active()) requestInsert.f2_mode =
        state.mode === "automatic" ? "automatic" : "manual";
      const inserted = await db.from("service_requests").insert(requestInsert);
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
      state.requestKey = null; state.uploadedPhotoKey = null; state.uploadedPhotoSignature = null; state.requestSignature = null;
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
      } else if (f2Active() && state.page === "orders") {
        await refreshIdentity();
        if (state.page === "orders") render();
      }
    } catch (err) {
      // A presença vence automaticamente no banco sem novos pings.
      state.error = "Falha de conexão: seu status online poderá expirar. " + errorText(err);
      if (state.page === "profile") render();
    } finally { presencePingInFlight = false; }
  }
  window.setInterval(sendPresenceHeartbeat,30000);
  document.addEventListener("visibilitychange", () => {
    invalidatePhotoScreen();
    if (document.visibilityState !== "hidden") sendPresenceHeartbeat();
  });
  window.addEventListener?.("pagehide", invalidatePhotoScreen);
  db.auth.onAuthStateChange((_event, session) => {
    // Apenas limpar memória dentro do callback de Auth; chamadas ao Supabase depois.
    if (transitionAccount(session?.user || null)) {
      render();
      setTimeout(() => { void allRefresh(); }, 0);
    }
  });
  allRefresh();
})();