/* Salva Motoca! — F2: lógica DETERMINÍSTICA de simulação.
 * NÃO é autorizador de servidor. Não envia chamados, pagamentos ou notificações.
 * Integração real exige RPC transacional, RLS, notificações entregues e homologação.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.SMF2Flow = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  const RESPONSE_MS = 5 * 60 * 1000;
  const QUOTE_MS = 5 * 60 * 1000;
  const PRESENCE_MS = 90 * 1000;
  const ABSENCE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const ABSENCE_REVIEW_THRESHOLD = 10;
  const REMINDERS_MS = Object.freeze([2 * 60 * 1000, 4.5 * 60 * 1000]);
  const CODES = Object.freeze(["pneu_furado", "troca_camara", "troca_pneu", "calibragem_valvula", "outro"]);
  const BLOCKED_CODES = Object.freeze(["reboque_moto"]);

  function invariant(condition, message) {
    if (!condition) throw new Error(message);
  }
  function toTime(value, name) {
    const time = typeof value === "number" ? value : Date.parse(value);
    invariant(Number.isFinite(time), name + " deve ser data/hora válida.");
    return time;
  }
  function asCents(value, name, positive = false) {
    invariant(Number.isSafeInteger(value) && value >= (positive ? 1 : 0) && value <= 500000,
      name + " precisa ser número inteiro de centavos entre " + (positive ? 1 : 0) + " e 500000.");
    return value;
  }
  function cleanString(value) { return String(value || "").trim(); }
  function serviceTypes(values) {
    invariant(Array.isArray(values) && values.length > 0 && values.length <= CODES.length,
      "Selecione de 1 a 5 serviços.");
    const unique = new Set(values);
    invariant(unique.size === values.length, "Não repita serviços selecionados.");
    invariant(values.every(v => CODES.includes(v)), "Serviço indisponível na F2; reboque permanece reservado para F3.");
    return [...values];
  }
  function coords(value) {
    return value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng)) &&
      value.lat !== null && value.lng !== null &&
      Number(value.lat) >= -90 && Number(value.lat) <= 90 &&
      Number(value.lng) >= -180 && Number(value.lng) <= 180;
  }
  function distanceKm(a, b) {
    if (!coords(a) || !coords(b)) return Infinity;
    const toRad = v => Number(v) * Math.PI / 180;
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const dlat = lat2 - lat1, dlon = toRad(b.lng) - toRad(a.lng);
    const sinLat = Math.sin(dlat / 2), sinLon = Math.sin(dlon / 2);
    const h = sinLat ** 2 + Math.cos(lat1) * Math.cos(lat2) * sinLon ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }
  function normalizePlace(v) {
    return cleanString(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }
  function validRings(radii) {
    invariant(Array.isArray(radii) && radii.length > 0 && radii.length <= 10, "Defina áreas progressivas de teste.");
    for (let i = 0; i < radii.length; i++) {
      invariant(Number.isFinite(radii[i]) && radii[i] > 0 && radii[i] <= 150 &&
        (i === 0 || radii[i] > radii[i - 1]),
        "Etapas de distância devem ser positivas, crescentes e limitadas.");
    }
    return [...radii];
  }
  function providerEligibility(p, request, now) {
    if (!p || !p.id || !p.approved || !p.active || !p.deliveryEnabled || !p.serviceActive)
      return { ok: false, reason: "Prestador sem homologação ou serviço habilitado" };
    if (!p.onlineRequested || !Number.isFinite(toTimeSafe(p.lastSeenAt)) ||
        toTimeSafe(p.lastSeenAt) > now || now - toTimeSafe(p.lastSeenAt) > PRESENCE_MS)
      return { ok: false, reason: "Prestador offline ou sem sinal recente" };
    if (normalizePlace(p.city) !== normalizePlace(request.city) ||
        normalizePlace(p.stateCode) !== normalizePlace(request.stateCode))
      return { ok: false, reason: "Fora da praça piloto" };
    if (!Array.isArray(p.serviceTypes) || !request.serviceTypes.every(v => p.serviceTypes.includes(v)))
      return { ok: false, reason: "Não atende a todos os serviços pedidos" };
    const lastRefusals = Number(p.rejectionCount || 0);
    if (!Number.isInteger(lastRefusals) || lastRefusals < 0 || lastRefusals > 2)
      return { ok: false, reason: "Histórico de recusa inválido" };
    if (lastRefusals >= 2 || p.id === request.justDeclinedProviderId)
      return { ok: false, reason: "Duas recusas nesta rodada ou recusa imediata" };
    if (!coords(request.location) || !coords(p.location) || !Number.isFinite(p.coverageKm) || p.coverageKm <= 0)
      return { ok: false, reason: "GPS/área de atendimento não comprovados" };
    const distance = distanceKm(request.location, p.location);
    if (distance > p.coverageKm)
      return { ok: false, reason: "Fora da área declarada pelo prestador" };
    return { ok: true, distanceKm: distance, rejectionCount: lastRefusals };
  }
  function toTimeSafe(v) {
    if (v == null || v === "") return NaN;
    return typeof v === "number" ? v : Date.parse(v);
  }
  function roundRobinKey(id, seed) {
    // Tie break determinístico, não uma avaliação/reputação. Rotacionar seed por pedido/rodada.
    const s = String(id || "") + "|" + String(seed || "");
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function distribute({ providers, request, radiiKm, now, rotationSeed = "" }) {
    invariant(Array.isArray(providers), "Lista de prestadores inválida.");
    invariant(request && typeof request === "object", "Solicitação ausente.");
    const services = serviceTypes(request.serviceTypes);
    const radii = validRings(radiiKm);
    const t = toTime(now, "Horário da rodada");
    const source = { ...request, serviceTypes: services };
    const excluded = [];
    const eligible = [];
    for (const p of providers) {
      const result = providerEligibility(p, source, t);
      if (result.ok) eligible.push({ ...result, provider: p });
      else excluded.push({ id: p?.id || null, reason: result.reason });
    }
    const windows = radii.map((radiusKm, stage) => ({
      stage: stage + 1, radiusKm,
      candidates: eligible.filter(x => x.distanceKm <= radiusKm).length
    }));
    const first = windows.find(w => w.candidates > 0);
    if (!first) return { stage: null, radiusKm: null, candidates: [], excluded, windows, status: "no_provider" };
    const near = eligible.filter(x => x.distanceKm <= first.radiusKm);
    near.sort((a, b) => {
      if (a.rejectionCount !== b.rejectionCount) return a.rejectionCount - b.rejectionCount;
      if (Math.abs(a.distanceKm - b.distanceKm) > 0.1) return a.distanceKm - b.distanceKm;
      const d = roundRobinKey(a.provider.id, rotationSeed) - roundRobinKey(b.provider.id, rotationSeed);
      return d || String(a.provider.id).localeCompare(String(b.provider.id));
    });
    return { stage: first.stage, radiusKm: first.radiusKm, status: "candidates",
      candidates: near.map(x => ({ id: x.provider.id, name: x.provider.name,
        distanceKm: Math.round(x.distanceKm * 100) / 100, rejectionCount: x.rejectionCount })),
      excluded, windows };
  }
  function notificationDecision({ offeredAt, now, deliveredAt, responseAt }) {
    const start = toTime(offeredAt, "Oferta");
    const current = toTime(now, "Horário atual");
    invariant(current >= start, "Horário não pode anteceder oferta.");
    const delivered = deliveredAt != null && Number.isFinite(toTimeSafe(deliveredAt));
    if (responseAt != null) {
      const r = toTime(responseAt, "Resposta");
      invariant(r >= start, "Resposta anterior à oferta.");
      const deadlineStart = delivered && toTimeSafe(deliveredAt) >= start
        ? toTimeSafe(deliveredAt) : start;
      return { status: r <= deadlineStart + RESPONSE_MS ? "responded" : "late_response",
        canCountAbsence: false, remindersDue: [] };
    }
    if (!delivered || toTimeSafe(deliveredAt) < start || toTimeSafe(deliveredAt) > current)
      return { status: "delivery_unverified", canCountAbsence: false, remindersDue: [] };
    // O relógio só começa quando a entrega é confirmada. Se o aviso chegou
    // atrasado, não penalizar o profissional por tempo que ele não teve.
    const elapsed = current - toTimeSafe(deliveredAt);
    if (elapsed >= RESPONSE_MS)
      return { status: "timeout", canCountAbsence: true, remindersDue: [] };
    return { status: "waiting", canCountAbsence: false,
      remindersDue: REMINDERS_MS.map((delay, i) => ({ number: i + 1,
        at: toTimeSafe(deliveredAt) + delay }))
        .filter(x => elapsed >= x.at - toTimeSafe(deliveredAt)) };
  }
  function absenceReview(events, now) {
    invariant(Array.isArray(events), "Histórico de ausências inválido.");
    const t = toTime(now, "Horário da revisão");
    const counted = events.filter(item => {
      const at = toTimeSafe(item.at);
      return item.kind === "no_response" && item.deliveryVerified === true &&
        Number.isFinite(at) && at <= t && t - at < ABSENCE_WINDOW_MS;
    });
    return { count: counted.length, reviewRequired: counted.length >= ABSENCE_REVIEW_THRESHOLD,
      automaticSuspension: false };
  }
  function quoteBreakdown({ serviceTypes: selected, services, travelCents, parts = [] }) {
    const chosen = serviceTypes(selected);
    invariant(Array.isArray(services) && services.length === chosen.length,
      "Discrimine exatamente cada serviço solicitado.");
    invariant(Array.isArray(parts) && parts.length === 0, "Materiais já estão incluídos no preço do serviço; não cobrar peças separadamente.");
    const used = new Set(), rows = [];
    for (const s of services) {
      invariant(s && chosen.includes(s.code) && !used.has(s.code), "Serviço duplicado ou diferente do pedido.");
      used.add(s.code);
      rows.push({ type: "service", code: s.code, amountCents: asCents(s.amountCents, "Serviço " + s.code, true) });
    }
    invariant(chosen.every(s => used.has(s)), "Serviços sem preço.");
    rows.push({ type: "travel", code: "deslocamento", amountCents: asCents(travelCents, "Deslocamento") });
    const totalCents = rows.reduce((sum, r) => sum + r.amountCents, 0);
    invariant(totalCents >= 100 && totalCents <= 500000,
      "Total deve estar entre R$ 1,00 e R$ 5.000,00 no simulador.");
    return { rows, totalCents, currency: "BRL", materialsIncludedInService: true, paymentAllowed: false,
      needsNewAcceptanceForChanges: true };
  }
  function quoteDecision({ quote, now, actingUserId, customerId, accept }) {
    invariant(actingUserId && customerId && actingUserId === customerId, "Somente o cliente titular decide.");
    invariant(quote && quote.status === "proposed", "Proposta indisponível.");
    const start = toTime(quote.createdAt, "Orçamento");
    const t = toTime(now, "Horário atual");
    invariant(t >= start, "Horário inconsistente.");
    if (t - start >= QUOTE_MS)
      return { status: "expired", next: "redistribute", paymentAllowed: false, chatAllowed: false };
    invariant(typeof accept === "boolean", "Decisão obrigatória.");
    return accept
      ? { status: "accepted", next: "awaiting_payment", paymentAllowed: false, chatAllowed: false }
      : { status: "declined", next: "redistribute", paymentAllowed: false, chatAllowed: false };
  }
  function selectWinningQuote({ quotes, quoteId, customerId, actingUserId, now }) {
    invariant(actingUserId && customerId && actingUserId === customerId,
      "Somente o motociclista titular escolhe.");
    invariant(Array.isArray(quotes) && quotes.length > 0 && quotes.length <= 20,
      "Lista de propostas inválida.");
    invariant(quotes.every(q => q && q.id && q.providerId && q.requestId && q.status),
      "Propostas incompletas.");
    const ids = new Set(quotes.map(q => q.id));
    invariant(ids.size === quotes.length, "Proposta duplicada.");
    const reqs = new Set(quotes.map(q => q.requestId));
    invariant(reqs.size === 1, "Propostas pertencem a solicitações diferentes.");
    invariant(!quotes.some(q => q.status === "accepted"),
      "Já existe um orçamento aceito neste pedido.");
    const winner = quotes.find(q => q.id === quoteId);
    invariant(winner && winner.status === "proposed", "Orçamento selecionado indisponível.");
    const choice = quoteDecision({ quote: winner, now, actingUserId, customerId, accept: true });
    invariant(choice.status !== "expired", "O orçamento selecionado já expirou.");
    asCents(winner.totalCents, "Total", true);
    return {
      requestId: winner.requestId, winningQuoteId: winner.id, providerId: winner.providerId,
      totalCents: winner.totalCents, status: "awaiting_payment",
      quotes: quotes.map(q => ({...q,status:q.id === winner.id ? "accepted" :
        q.status === "proposed" ? "not_selected" : q.status})),
      paymentAllowed: false, chatAllowed: false, dispatchAllowed: false
    };
  }
  return Object.freeze({
    RESPONSE_MS, QUOTE_MS, PRESENCE_MS, REMINDERS_MS, ABSENCE_WINDOW_MS,
    ABSENCE_REVIEW_THRESHOLD, CODES, BLOCKED_CODES,
    serviceTypes, distanceKm, distribute, providerEligibility, notificationDecision,
    absenceReview, quoteBreakdown, quoteDecision, selectWinningQuote, validRings
  });
});
