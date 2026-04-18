// Core utilities: Supabase client, auth guard, active playbook id, toast, common fragments
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// PWA: register service worker + install banner (one-shot per app load)
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

const cfg = window.TP_CONFIG;
export const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
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

// Active playbook id lives in sessionStorage (cleared on close) + URL ?pid=
export function getActivePlaybookId() {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('pid');
  if (fromUrl) { sessionStorage.setItem('tp:active', fromUrl); return fromUrl; }
  return sessionStorage.getItem('tp:active');
}
export function setActivePlaybookId(id) { sessionStorage.setItem('tp:active', id); }
export function clearActivePlaybookId() { sessionStorage.removeItem('tp:active'); }

// Auth guard: redirects to index.html login if no session (skip on index and playbook.html)
export async function requireAuth(redirectIfNone = true) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session && redirectIfNone) { location.href = 'index.html'; return null; }
  return session;
}

export async function signOut() {
  await supabase.auth.signOut();
  clearActivePlaybookId();
  location.href = 'index.html';
}

export async function sendMagicLink(email) {
  const redirect = new URL(location.href).origin + '/index.html';
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
  if (error) throw error;
}

// Topnav fragment ---------------------------------------------------
export async function renderTopNav(currentPage = '') {
  const session = (await supabase.auth.getSession()).data.session;
  const email = session?.user?.email || '';
  const nav = document.createElement('div');
  nav.className = 'topnav';
  nav.innerHTML = `
    <a href="index.html" class="topnav-brand" style="text-decoration:none">
      <span class="dot"></span><span>Triage Playbook <span class="mono" style="font-size:10px;letter-spacing:2px;color:var(--muted);margin-left:6px">BY TRIAGEOS</span></span>
    </a>
    <div class="topnav-actions">
      <span class="topnav-email">${email ? escapeHtml(email) : ''}</span>
      <a href="playbook.html" class="btn btn-ghost btn-sm">Method</a>
      ${session ? `<button id="tp-signout" class="btn btn-ghost btn-sm">Sign out</button>` : ''}
    </div>
  `;
  document.body.insertBefore(nav, document.body.firstChild);
  const so = nav.querySelector('#tp-signout');
  if (so) so.addEventListener('click', signOut);
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

// Audit log helper (fire and forget)
export async function audit(playbookId, event_type, event_data = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('tp_audit').insert({
      playbook_id: playbookId || null,
      actor_user_id: user?.id || null,
      actor_email: user?.email || null,
      event_type,
      event_data
    });
  } catch (e) { /* non-blocking */ }
}

// Utilities
export function escapeHtml(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function fmtDate(s) { if (!s) return ''; try { return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return s; } }
export function fmtDateTime(s) { if (!s) return ''; try { return new Date(s).toLocaleString(); } catch { return s; } }
export function slugify(s) { return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64) || 'triage'; }
export function randShort() { return Math.random().toString(36).slice(2, 8); }

// Confirm helper (per Chris's "confirm before deleting" rule)
export function confirmAction(msg) { return window.confirm(msg); }
