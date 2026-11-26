(() => {
  const cfg = window.BJ_CONFIG || {};
  const configured = /^https:\/\/[^\s/]+\.supabase\.co\/?$/.test(String(cfg.supabaseUrl || '').trim()) &&
    String(cfg.supabasePublishableKey || '').startsWith('sb_publishable_');
  const app = document.getElementById('app');
  let failed = false;
  function unavailable() {
    if (failed) return;
    failed = true;
    const notice = document.createElement('div');
    notice.className = 'notice bad';
    notice.setAttribute('role', 'alert');
    notice.textContent = 'Aplicativo indisponível. Nenhum atendimento foi solicitado por esta tela. Confira a conexão e tente novamente.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Tentar novamente';
    retry.addEventListener('click', () => location.reload());
    app.replaceChildren(notice, retry);
    for (const button of document.querySelectorAll('[data-page]')) button.disabled = true;
  }
  const load = (url, onload) => {
    if (failed) return;
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => { if (!failed && onload) onload(); };
    script.onerror = unavailable;
    document.body.appendChild(script);
  };
  // Register the public-only worker on both startup paths; failure must not
  // be interpreted as successful installation or as permission to use offline services.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (configured) {
    // Never substitute a fictitious demo when the configured backend cannot load.
    if (navigator.onLine === false) { unavailable(); return; }
    load('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0', () => {
      if (typeof window.supabase?.createClient !== 'function') { unavailable(); return; }
      load('./live-app-current.js');
    });
  } else if (cfg.supabaseUrl || cfg.supabasePublishableKey) {
    unavailable(); // Partial or invalid configuration is not demo mode.
  } else {
    load('./app.js'); // Explicit unconfigured local demonstration only.
  }
})();
