// Deployment tier manager.
// DEV: local-first, no auth, no audit chain, no validation. Current mode.
// TEAM: Supabase cloud sync, SSO optional, soft audit. Pre-production.
// ENTERPRISE: On-prem or VPC, Microsoft Entra SSO, hash-chained audit, Part 11 e-sig, DLP on AI, full CSV.

const VALID = ['DEV', 'TEAM', 'ENTERPRISE'];

export function getTier() {
  const t = localStorage.getItem('tp:tier') || 'DEV';
  return VALID.includes(t) ? t : 'DEV';
}

export function setTier(t) {
  if (!VALID.includes(t)) throw new Error('Invalid tier: ' + t);
  localStorage.setItem('tp:tier', t);
}

export const isEnterprise = () => getTier() === 'ENTERPRISE';
export const isTeam = () => getTier() === 'TEAM';
export const isDev = () => getTier() === 'DEV';

// Feature flags per tier
export const FEATURES = {
  DEV: {
    part11_esig: false, hash_chain_audit: false, data_classification_enforced: false,
    dlp_ai_redaction: true, enterprise_sso: false, lot_lookup: false,
    change_control_gate: false, deviation_classification: true, graph_api_send: false
  },
  TEAM: {
    part11_esig: true, hash_chain_audit: true, data_classification_enforced: true,
    dlp_ai_redaction: true, enterprise_sso: false, lot_lookup: false,
    change_control_gate: true, deviation_classification: true, graph_api_send: false
  },
  ENTERPRISE: {
    part11_esig: true, hash_chain_audit: true, data_classification_enforced: true,
    dlp_ai_redaction: true, enterprise_sso: true, lot_lookup: true,
    change_control_gate: true, deviation_classification: true, graph_api_send: true
  }
};

export function hasFeature(name) {
  const t = getTier();
  return !!FEATURES[t]?.[name];
}

// Data classification levels (NIST SP 800-60 / ISO 27001 aligned)
export const CLASSIFICATIONS = [
  { value: 'public', label: 'Public', color: 'gray', ai_allowed: true },
  { value: 'internal', label: 'Internal', color: 'blue', ai_allowed: true },
  { value: 'confidential', label: 'Confidential', color: 'gold', ai_allowed: true },
  { value: 'restricted', label: 'Restricted (PII, IP)', color: 'red', ai_allowed: false },
  { value: 'gmp', label: 'GMP / GxP', color: 'red', ai_allowed: false }
];

export function isAIAllowed(classification) {
  const c = CLASSIFICATIONS.find(x => x.value === classification);
  if (!c) return true;
  if (!hasFeature('dlp_ai_redaction')) return true;
  return c.ai_allowed;
}

// Tier picker UI (rendered in topnav)
export function renderTierPill() {
  const tier = getTier();
  const colors = { DEV: 'badge-gray', TEAM: 'badge-blue', ENTERPRISE: 'badge-green' };
  const html = `<button class="badge ${colors[tier]}" id="tp-tier-btn" style="cursor:pointer" title="Deployment tier">${tier}</button>`;
  return html;
}

export function bindTierPill(root = document) {
  const btn = root.querySelector('#tp-tier-btn');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', openTierDialog);
}

function openTierDialog() {
  const existing = document.getElementById('tp-tier-dlg');
  if (existing) { existing.showModal(); return; }
  const dlg = document.createElement('dialog');
  dlg.id = 'tp-tier-dlg';
  dlg.style.cssText = 'border:none;border-radius:8px;padding:0;max-width:92vw;width:520px';
  const current = getTier();
  dlg.innerHTML = `
    <form method="dialog" style="padding:24px">
      <h3>Deployment tier</h3>
      <p class="text-sm text-muted mb-2">Controls which enterprise controls are enforced. Talk to your IT or Quality team before changing.</p>
      <div style="display:flex;flex-direction:column;gap:10px">
        <label class="row" style="cursor:pointer"><input type="radio" name="tier" value="DEV" ${current==='DEV'?'checked':''} style="margin-top:4px" /><div class="row-body"><div class="row-title">DEV <span class="badge badge-gray">current for solo dev</span></div><div class="row-meta">Local IndexedDB only. No auth. No validation. No audit chain. Fastest iteration. Not for regulated use.</div></div></label>
        <label class="row" style="cursor:pointer"><input type="radio" name="tier" value="TEAM" ${current==='TEAM'?'checked':''} style="margin-top:4px" /><div class="row-body"><div class="row-title">TEAM <span class="badge badge-blue">small team pilot</span></div><div class="row-meta">Adds: 21 CFR Part 11 e-signature, hash-chained audit trail, data classification enforcement, change control gate, AI redaction on Restricted/GMP fields.</div></div></label>
        <label class="row" style="cursor:pointer"><input type="radio" name="tier" value="ENTERPRISE" ${current==='ENTERPRISE'?'checked':''} style="margin-top:4px" /><div class="row-body"><div class="row-title">ENTERPRISE <span class="badge badge-green">validated rollout</span></div><div class="row-meta">Adds to TEAM: Microsoft Entra SSO, ERP lot/serial lookup, Microsoft Graph outbound (no external webhooks), GAMP 5 Cat 4 validation pack required.</div></div></label>
      </div>
      <hr class="divider" />
      <p class="text-xs text-muted mb-2">Compliance posture: see <a href="security.html">Security and IT details</a>.</p>
      <div class="flex gap-1" style="justify-content:flex-end">
        <button type="button" id="tp-tier-cancel" class="btn btn-ghost">Cancel</button>
        <button type="submit" id="tp-tier-save" class="btn btn-primary">Save</button>
      </div>
    </form>
  `;
  document.body.appendChild(dlg);
  dlg.querySelector('#tp-tier-cancel').addEventListener('click', (e) => { e.preventDefault(); dlg.close(); });
  dlg.querySelector('#tp-tier-save').addEventListener('click', async (e) => {
    e.preventDefault();
    const picked = dlg.querySelector('input[name="tier"]:checked').value;
    setTier(picked);
    dlg.close();
    location.reload();
  });
  dlg.showModal();
}
