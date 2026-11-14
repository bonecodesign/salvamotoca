// Configuração PÚBLICA do piloto Salva Motoca!: URL e publishable key.
// A chave publishable NÃO é secret/service_role; as permissões dependem do RLS.
// JAMAIS inserir senhas, service_role ou sb_secret_* neste arquivo.
window.BJ_CONFIG = {
  supabaseUrl: 'https://yivkqyjdeouxnwtwfekc.supabase.co',
  // F1 bloqueada até testes Auth/Storage reais no único Supabase e liberação específica.
  // O esquema F1 já está no banco; manter o envio desligado até a homologação.
  f1TestRequestsEnabled: false,
  supabasePublishableKey: 'sb_publishable_SKToaitJDdgDAYUrwChkbg__ntPtZd3'
};