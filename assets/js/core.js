// Core utilities: local-first mode. No Supabase auth.
// Everything works offline. Cloud sync can be added later as a pluggable adapter.

import { db, DEVICE_ID, importPlaybookFromUrl } from './data.js';

// PWA: register service worker
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
let _deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); _deferredPrompt = e;
  if (sessionStorage.getItem('tp:install-dismissed')) return;
  const el = document.createElement('div');
  el.className = 'install-banner show';
  el.innerHTML = '<div class="msg">Install Triage Playbook for fast access and offline use.</div><button class="btn btn-gold btn-sm" id="tp-install">Install</button><button class="btn btn-ghost btn-sm" id="tp-dismiss" style="color:white;border-color:rgba(255,255,255,0.3)">Not now</button>';
  document.body.appendChild(el);
  el.querySelector('#tp-install').addEventListener('click', async () => {
    if (_deferredPrompt) { _deferredPrompt.prompt(); await _deferredPrompt.userChoice; _deferredPrompt = null; }
    el.remove();
  });
  el.querySelector('#tp-dismiss').addEventListener('click', () => { sessionStorage.setItem('tp:install-dismissed', '1'); el.remove(); });
});

// Toast ------------------------------------------------------------
export function toast(msg, kind = '') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// Active playbook id via sessionStorage + URL ?pid=
export function getActivePlaybookId() {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('pid');
  if (fromUrl) { sessionStorage.setItem('tp:active', fromUrl); return fromUrl; }
  return sessionStorage.getItem('tp:active');
}
export function setActivePlaybookId(id) { sessionStorage.setItem('tp:active', id); }
export function clearActivePlaybookId() { sessionStorage.removeItem('tp:active'); }

// Auth guard is now a no-op in local-first mode. Kept so step pages don't break.
export async function requireAuth() { return { user: { id: DEVICE_ID } }; }
export const supabase = null; // legacy export, unused

// Handle ?import=<hash> on any page: imports playbook and redirects to summary
(async () => {
  const url = new URL(location.href);
  if (url.searchParams.get('import')) {
    toast('Importing shared playbook...', 'ok');
    const newId = await importPlaybookFromUrl();
    if (newId) {
      setActivePlaybookId(newId);
      toast('Imported. Opening summary.', 'ok');
      location.href = `summary.html?pid=${newId}`;
    } else {
      toast('Import failed. Link may be corrupt.', 'err');
    }
  }
})();

// Topnav fragment ---------------------------------------------------
export async function renderTopNav() {
  const nav = document.createElement('div');
  nav.className = 'topnav';
  nav.innerHTML = `
    <a href="index.html" class="topnav-brand" style="text-decoration:none">
      <span class="dot"></span><span>Triage Playbook <span class="mono" style="font-size:10px;letter-spacing:2px;color:var(--muted);margin-left:6px">BY TRIAGEOS</span></span>
    </a>
    <div class="topnav-actions">
      <a href="playbook.html" class="btn btn-ghost btn-sm">Method</a>
      <button id="tp-feedback" class="btn btn-ghost btn-sm" title="Send feedback">Feedback</button>
    </div>
  `;
  document.body.insertBefore(nav, document.body.firstChild);
  nav.querySelector('#tp-feedback').addEventListener('click', openFeedbackModal);
}

// Feedback modal for dev collab (Julia, Greg, Chris) ---------------
function openFeedbackModal() {
  const existing = document.getElementById('tp-feedback-dlg');
  if (existing) { existing.showModal(); return; }
  const dlg = document.createElement('dialog');
  dlg.id = 'tp-feedback-dlg';
  dlg.style.cssText = 'border:none;border-radius:8px;padding:0;max-width:92vw;width:460px';
  dlg.innerHTML = `
    <form method="dialog" style="padding:24px">
      <h3>Send feedback</h3>
      <p class="text-sm text-muted mb-2">Goes straight to Chris. Reply within a day.</p>
      <div class="field">
        <label for="fb-from">Your name</label>
        <input id="fb-from" class="input" placeholder="Julia, Greg, or..." />
      </div>
      <div class="field">
        <label for="fb-body">What worked, what did not, what you want</label>
        <textarea id="fb-body" class="textarea" rows="5" required placeholder="Be direct. Ugly feedback is the useful kind."></textarea>
      </div>
      <div class="flex gap-1" style="justify-content:flex-end">
        <button type="button" id="fb-cancel" class="btn btn-ghost">Cancel</button>
        <button type="submit" id="fb-send" class="btn btn-accent">Send</button>
      </div>
    </form>
  `;
  document.body.appendChild(dlg);
  dlg.querySelector('#fb-cancel').addEventListener('click', (e) => { e.preventDefault(); dlg.close(); });
  dlg.querySelector('#fb-send').addEventListener('click', async (e) => {
    e.preventDefault();
    const from = document.getElementById('fb-from').value.trim();
    const body = document.getElementById('fb-body').value.trim();
    if (!body) { toast('Write something first', 'err'); return; }
    const payload = { from, body, page: location.pathname, time: new Date().toISOString(), agent: navigator.userAgent };
    try {
      const res = await fetch('/.netlify/functions/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Send failed ' + res.status);
      toast('Thanks. Feedback sent.', 'ok');
      dlg.close();
      document.getElementById('fb-body').value = '';
    } catch (err) {
      // Fallback: open mailto so nothing is lost
      const mailto = `mailto:chris@cotoole.com?subject=Triage%20Playbook%20feedback&body=${encodeURIComponent((from ? 'From: ' + from + '\n\n' : '') + body + '\n\nPage: ' + location.href)}`;
      location.href = mailto;
    }
  });
  dlg.showModal();
}

// Wizard progress bar + bottom nav ---------------------------------
export const STEPS = [
  { n: 1, slug: 'start.html', title: 'Define the problem' },
  { n: 2, slug: 'step-2-team.html', title: 'Form the team' },
  { n: 3, slug: 'step-3-containment.html', title: 'Interim containment' },
  { n: 4, slug: 'step-4-root-cause.html', title: 'Root cause' },
  { n: 5, slug: 'step-5-action-plan.html', title: 'Action plan' },
  { n: 6, slug: 'step-6-governance.html', title: 'Governance' },
  { n: 7, slug: 'step-7-monitoring.html', title: 'Monitoring' },
  { n: 8, slug: 'step-8-effectiveness.html', title: 'Effectiveness' }
];

export function renderProgress(currentStepNum) {
  const pct = Math.round((currentStepNum / STEPS.length) * 100);
  const host = document.createElement('div');
  host.className = 'progress-wrap';
  host.innerHTML = `
    <div class="progress-meta">
      <span>Step ${currentStepNum} of ${STEPS.length}</span>
      <span>${pct}%</span>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
  `;
  const topnav = document.querySelector('.topnav');
  if (topnav) topnav.after(host); else document.body.insertBefore(host, document.body.firstChild);
}

export function renderWizardNav(currentStepNum, { onSave } = {}) {
  const prev = STEPS[currentStepNum - 2];
  const next = STEPS[currentStepNum];
  const nav = document.createElement('div');
  nav.className = 'wizard-nav';
  nav.innerHTML = `
    ${prev ? `<a class="btn btn-ghost" href="${prev.slug}">Back</a>` : `<span></span>`}
    <div class="center">${STEPS[currentStepNum - 1].title}</div>
    <div class="flex gap-1">
      <button class="btn btn-ghost" id="tp-save">Save</button>
      ${next ? `<a class="btn btn-accent" href="${next.slug}" id="tp-next">Next</a>` : `<a class="btn btn-gold" href="summary.html">Review</a>`}
    </div>
  `;
  document.body.appendChild(nav);
  nav.querySelector('#tp-save').addEventListener('click', async () => {
    try { if (onSave) await onSave(); toast('Saved', 'ok'); } catch (e) { console.error(e); toast('Save failed: ' + (e.message || e), 'err'); }
  });
}

// Utilities
export function escapeHtml(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function fmtDate(s) { if (!s) return ''; try { return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return s; } }
export function fmtDateTime(s) { if (!s) return ''; try { return new Date(s).toLocaleString(); } catch { return s; } }
export function slugify(s) { return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64) || 'triage'; }
export function randShort() { return Math.random().toString(36).slice(2, 8); }
export function confirmAction(msg) { return window.confirm(msg); }

// Legacy exports (no-ops in local-first mode)
export async function sendMagicLink() { throw new Error('Sign-in disabled in dev mode'); }
export async function signOut() { sessionStorage.clear(); localStorage.removeItem('tp:device_id'); location.href = 'index.html'; }
export async function audit() { /* handled in data.js */ }
