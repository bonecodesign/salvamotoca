/* Salva Motoca! — F5: motor de atendimento APENAS OFFLINE.
 * Não é API, não verifica pagamento nem autoriza dispatch/chat/GPS reais.
 * O mock usa recibo deliberadamente inválido para PSP e NÃO altera Supabase.
 */
(function(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.SMF5Offline = api;
})(typeof window !== "undefined" ? window : null, function() {
  "use strict";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const EVENT_ID = /^[a-z0-9_-]{8,80}$/i;
  const ACTIVE = ["ready_for_dispatch","en_route","arrived","in_service"];
  const MAX_MESSAGE = 2000;
  function requireOk(ok, reason) { if (!ok) throw new Error(reason); }
  function identifier(v, field) {
    requireOk(typeof v === "string" && UUID.test(v), field + " inválido.");
    return v.toLowerCase();
  }
  function timestamp(v, field) {
    requireOk(Number.isSafeInteger(v) && v > 0, field + " inválido.");
    return v;
  }
  function createOfflineSession({requestId, quoteId, customerId, providerId, createdAt}) {
    const request = identifier(requestId, "Pedido");
    const quote = identifier(quoteId, "Orçamento");
    const customer = identifier(customerId, "Cliente");
    const provider = identifier(providerId, "Prestador");
    requireOk(customer !== provider, "Cliente e prestador devem ser distintos.");
    return {
      engine: "f5-offline-mock-only", requestId: request, quoteId: quote,
      customerId: customer, providerId: provider,
      createdAt: timestamp(createdAt, "Criação"), lastEventAt: createdAt, status: "awaiting_payment",
      mockPaid: false, providerTrackingConsent: false,
      lastLocation: null, arrivedAt: null, messages: [], supportMessages: [],
      processed: [], version: 0,
      // Estes campos NUNCA se tornam true no simulador.
      realChatAuthorized: false, realTrackingAuthorized: false,
      realDispatchAuthorized: false, realPaymentVerified: false
    };
  }
  function actorRole(session, actorId) {
    if (actorId === session.customerId) return "customer";
    if (actorId === session.providerId) return "provider";
    return "outsider";
  }
  function normalizeEvent(session, input) {
    requireOk(input && typeof input === "object" && !Array.isArray(input),
      "Evento ausente.");
    requireOk(EVENT_ID.test(input.id || ""), "ID de evento inválido.");
    const at = timestamp(input.at, "Horário");
    requireOk(at >= session.createdAt, "Evento anterior ao pedido.");
    requireOk(typeof input.kind === "string" && input.kind.length <= 40,
      "Tipo de evento inválido.");
    const actor = input.actorId === "offline_fixture" ? "offline_fixture" :
      identifier(input.actorId, "Ator");
    return {...input, actorId: actor, at};
  }
  function locationSample(event) {
    const {lat, lng, accuracyMeters, sampledAt} = event;
    requireOk(Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
      Number.isFinite(lng) && lng >= -180 && lng <= 180,
      "Coordenada inválida.");
    requireOk(Number.isFinite(accuracyMeters) && accuracyMeters >= 0 &&
      accuracyMeters <= 500, "Precisão insuficiente.");
    timestamp(sampledAt, "Horário do GPS");
    requireOk(sampledAt <= event.at && event.at - sampledAt <= 120000,
      "Localização antiga ou futura.");
    return {lat, lng, accuracyMeters, sampledAt};
  }
  function applyOfflineEvent(session, input) {
    requireOk(session && session.engine === "f5-offline-mock-only",
      "Motor F5 exclusivo de simulação.");
    const event = normalizeEvent(session, input);
    const serialized = JSON.stringify(event); // somente memória local, nunca audit log
    const prior = session.processed.find(x => x.id === event.id);
    if (prior) {
      requireOk(prior.serialized === serialized,
        "Colisão de evento: mesmo ID com conteúdo divergente.");
      return {state: session, duplicate: true};
    }
    requireOk(event.at >= session.lastEventAt, "Evento anterior ao último evento processado.");
    // Não aceitar payload bruto de dinheiro, token, senha ou URL assinada.
    requireOk(!("paymentStatus" in event) && !("paymentToken" in event) &&
      !("secret" in event) && !("signedPhotoUrl" in event),
      "Evento contém campo reservado.");
    const next = {...session, messages: [...session.messages],
      supportMessages: [...session.supportMessages],
      processed: [...session.processed], lastLocation: session.lastLocation};
    const role = actorRole(session, event.actorId);
    if (event.kind === "mock_payment_confirmed") {
      requireOk(role === "outsider" && event.actorId === "offline_fixture" &&
        event.fixtureReceipt === "F5_LOCAL_FIXTURE_NOT_PSP" &&
        event.requestId === session.requestId &&
        event.quoteId === session.quoteId &&
        session.status === "awaiting_payment",
        "Somente fixture local válida pode simular confirmação.");
      next.mockPaid = true;
      next.status = "ready_for_dispatch";
    } else {
      requireOk(session.mockPaid === true &&
        session.status !== "awaiting_payment",
        "Sem confirmação fictícia no simulador: chat e deslocamento fechados.");
      if (event.kind === "chat_message") {
        requireOk(role !== "outsider" && ACTIVE.includes(session.status),
          "Chat somente para participantes durante atendimento.");
        requireOk(typeof event.text === "string" &&
          event.text.trim().length >= 1 && event.text.length <= MAX_MESSAGE,
          "Mensagem vazia ou excessiva.");
        next.messages.push({id: event.id, actorId: event.actorId,
          at: event.at, text: event.text.trim()});
      } else if (event.kind === "dispatch") {
        requireOk(role === "provider" && session.status === "ready_for_dispatch" &&
          event.shareLocationConsent === true,
          "Deslocamento exige prestador, pagamento mock e GPS consentido.");
        next.providerTrackingConsent = true;
        next.status = "en_route";
      } else if (event.kind === "provider_location") {
        requireOk(role === "provider" && session.status === "en_route" &&
          session.providerTrackingConsent === true,
          "GPS disponível apenas durante deslocamento consentido.");
        const sample = locationSample(event);
        if (session.lastLocation)
          requireOk(sample.sampledAt > session.lastLocation.sampledAt,
            "Localização repetida ou fora de ordem.");
        next.lastLocation = sample; // somente último ponto; não guardar trajeto
      } else if (event.kind === "provider_arrived") {
        requireOk(role === "provider" && session.status === "en_route",
          "Chegada só pode ser registrada pelo prestador em deslocamento.");
        next.status = "arrived"; next.arrivedAt = event.at;
        next.lastLocation = null; next.providerTrackingConsent = false;
      } else if (event.kind === "service_started") {
        requireOk(role === "provider" && session.status === "arrived",
          "Início exige chegada confirmada.");
        next.status = "in_service";
      } else if (event.kind === "handoff_f6") {
        requireOk(role === "provider" && session.status === "in_service",
          "Encaminhamento F6 exige atendimento iniciado.");
        next.status = "handoff_f6";
      } else if (event.kind === "request_support") {
        requireOk(role !== "outsider" && session.status !== "handoff_f6",
          "Suporte somente para participante com atendimento pendente.");
        next.status = "support_review";
        next.lastLocation = null; next.providerTrackingConsent = false;
      } else if (event.kind === "support_message") {
        requireOk(role !== "outsider" && session.status === "support_review" &&
          typeof event.text === "string" &&
          event.text.trim().length >= 1 && event.text.length <= MAX_MESSAGE,
          "Mensagem de suporte inválida.");
        next.supportMessages.push({id:event.id,actorId:event.actorId,
          at:event.at,text:event.text.trim()});
      } else {
        throw new Error("Evento operacional desconhecido.");
      }
    }
    next.processed.push({id:event.id,serialized});
    next.version++; next.lastEventAt=event.at;
    return {state: next, duplicate:false};
  }
  function viewFor(session, viewerId, now=session?.lastEventAt) {
    requireOk(session && session.engine === "f5-offline-mock-only", "Sessão inválida.");
    const role = actorRole(session, viewerId);
    if (role === "outsider")
      return Object.freeze({access:"denied",status:"private",mockOnly:true});
    requireOk(Number.isSafeInteger(now) && now >= session.lastEventAt,"Relógio de visualização inválido.");
    const enRoute = session.mockPaid && session.status === "en_route" && session.providerTrackingConsent;
    const fresh = enRoute && session.lastLocation && now-session.lastLocation.sampledAt<=120000;
    return {
      access:"participant",role, status:session.status,
      mockOnly:true, paymentIsReal:false,
      chatMockOpen:session.mockPaid && ACTIVE.includes(session.status),
      displacementMockActive:enRoute,
      lastLocation:fresh ? {...session.lastLocation} : null,
      arrivalNotice:session.arrivedAt !== null,
      chatMessages:session.mockPaid ? session.messages.map(m=>({...m})) : [],
      supportMessages:session.status === "support_review" ?
        session.supportMessages.map(m=>({...m})) : [],
      // Nunca expor endereço exato, foto privada ou permissão real por modelo local.
      exactAddress:null,realChatAuthorized:false,
      realTrackingAuthorized:false,realDispatchAuthorized:false
    };
  }
  function realReleaseGate(_flags, _receipt) {
    return Object.freeze({authorized:false,reason:
      "F5 exige backend autenticado, F1-F4 homologadas, PSP reconciliado e aprovação humana; mock nunca libera serviço."});
  }
  return Object.freeze({createOfflineSession,applyOfflineEvent,viewFor,
    realReleaseGate,locationSample,MAX_MESSAGE});
});
