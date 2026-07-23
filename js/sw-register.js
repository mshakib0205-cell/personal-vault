// Study Vault — Service Worker Registration (sw-register.js)

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New content available
            showUpdateBanner();
          }
        });
      });

      console.log('[SW] Registered:', reg.scope);
    } catch (err) {
      console.warn('[SW] Registration failed:', err);
    }
  });
}

function showUpdateBanner() {
  const banner = document.createElement('div');
  banner.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:#6366f1;color:white;padding:12px 20px;border-radius:12px;
    font-size:14px;font-weight:500;z-index:9999;display:flex;gap:12px;
    align-items:center;box-shadow:0 4px 16px rgba(0,0,0,0.3);
  `;
  banner.innerHTML = `<span>Update available</span>
    <button onclick="location.reload()" style="background:rgba(255,255,255,0.2);border:none;color:white;
    padding:6px 12px;border-radius:8px;cursor:pointer;font-weight:600;">Reload</button>`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 10000);
}

// ---- PWA Install Prompt ----
let _deferredInstall = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstall = e;
  showInstallBadge();
});

function showInstallBadge() {
  const btn = document.getElementById('install-btn');
  if (btn) {
    btn.classList.remove('hidden');
    btn.addEventListener('click', async () => {
      if (!_deferredInstall) return;
      _deferredInstall.prompt();
      const { outcome } = await _deferredInstall.userChoice;
      if (outcome === 'accepted') btn.remove();
      _deferredInstall = null;
    });
  }
}

window.addEventListener('appinstalled', () => {
  _deferredInstall = null;
  document.getElementById('install-btn')?.remove();
});
