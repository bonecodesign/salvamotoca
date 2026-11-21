// Configuração PÚBLICA do piloto Salva Motoca!: URL e publishable key.
// A chave publishable NÃO é secret/service_role; as permissões dependem do RLS.
// JAMAIS inserir senhas, service_role ou sb_secret_* neste arquivo.
window.BJ_CONFIG = {
  supabaseUrl: 'https://yivkqyjdeouxnwtwfekc.supabase.co',
  // F1 bloqueada até testes Auth/Storage reais no único Supabase e liberação específica.
  // O esquema F1 já está no banco; manter o envio desligado até a homologação.
  f1TestRequestsEnabled: false,
  // F2: backend apenas proposto/testado localmente. Não habilitar antes da F1 e backup.
  f2TestOffersEnabled: false,
  // F3 depende da F1/F2 e de backup+homologação. Nunca ativar por merge.
  f3TowEnabled: false,
  // F4: pagamentos, comissões e repasses indisponíveis até PSP, jurídico e E2E.
  f4PaymentsEnabled: false,
  // F5 é exclusivamente um simulador offline: sem backend, chat, GPS nem despacho real.
  f5OperationsEnabled: false,
  // F6: conclusão, avaliação e mediação ainda sem backend ou pagamento real.
  f6CompletionEnabled: false,
  supabasePublishableKey: 'sb_publishable_SKToaitJDdgDAYUrwChkbg__ntPtZd3'
};