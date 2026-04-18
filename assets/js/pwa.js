// PWA registration + install prompt. Include on every page.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallBanner();
});

function showInstallBanner() {
  if (sessionStorage.getItem('tp:install-dismissed')) return;
  let el = document.querySelector('.install-banner');
  if (!el) {
    el = document.createElement('div');
    el.className = 'install-banner';
    el.innerHTML = '<div class="msg">Install Triage Playbook for fast access and offline use.</div><button class="btn btn-gold btn-sm" id="tp-install">Install</button><button class="btn btn-ghost btn-sm" id="tp-dismiss" style="color:white;border-color:rgba(255,255,255,0.3)">Not now</button>';
    document.body.appendChild(el);
    el.querySelector('#tp-install').addEventListener('click', async () => {
      if (!deferredPrompt) { el.classList.remove('show'); return; }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      el.classList.remove('show');
    });
    el.querySelector('#tp-dismiss').addEventListener('click', () => { sessionStorage.setItem('tp:install-dismissed', '1'); el.classList.remove('show'); });
  }
  el.classList.add('show');
}
