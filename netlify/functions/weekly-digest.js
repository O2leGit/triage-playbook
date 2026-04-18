// Scheduled weekly: emails each playbook's exec_recipient + stakeholder_emails a 7-day rollup.
// Groups by playbook so each project stays with its own distribution list.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@ikigaios.com';
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://triage-playbook.netlify.app';

export default async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ skipped: true });
  if (!RESEND_API_KEY) return json({ skipped: true, reason: 'no resend key' });

  const sinceIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const playbooks = await sb(`tp_playbook?select=id,title,severity,status,project_code,exec_recipient,stakeholder_emails,created_at,updated_at,closed_at&updated_at=gte.${sinceIso}`);

  let sent = 0; const errors = [];
  for (const p of playbooks || []) {
    const recipients = [];
    if (p.exec_recipient) recipients.push(p.exec_recipient);
    if (p.stakeholder_emails) p.stakeholder_emails.split(',').forEach(e => { const t = e.trim(); if (t) recipients.push(t); });
    if (!recipients.length) continue;

    const [actions, effs, audit] = await Promise.all([
      sb(`tp_action?select=description,status,action_type,due_date,owner_name&playbook_id=eq.${p.id}`),
      sb(`tp_effectiveness?select=checkpoint,verdict,recommended_action,reviewed_at&playbook_id=eq.${p.id}&reviewed_at=gte.${sinceIso.slice(0,10)}`),
      sb(`tp_audit?select=event_type,created_at&playbook_id=eq.${p.id}&created_at=gte.${sinceIso}&order=created_at.desc&limit=15`)
    ]);

    const openActions = (actions || []).filter(a => a.status !== 'done');
    const doneActions = (actions || []).filter(a => a.status === 'done');
    const subject = `Triage weekly: ${p.title}${p.project_code ? ' (' + p.project_code + ')' : ''}`;
    const body = [
      `## ${p.title}`,
      `Status: ${p.status} | Severity: ${p.severity || ''} | Project: ${p.project_code || '-'}`,
      '',
      `**Actions:** ${doneActions.length} done, ${openActions.length} open`,
      ...openActions.slice(0, 6).map(a => `- [${a.action_type}] ${a.description} (owner: ${a.owner_name || 'unassigned'}, due ${a.due_date || 'n/a'})`),
      '',
      `**Effectiveness checkpoints this week:** ${effs?.length || 0}`,
      ...(effs || []).map(e => `- ${e.checkpoint}: ${e.verdict} -> ${e.recommended_action}`),
      '',
      `Open the playbook: ${PUBLIC_URL}/summary.html?pid=${p.id}`
    ].join('\n');

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + RESEND_API_KEY },
        body: JSON.stringify({ from: EMAIL_FROM, to: recipients, subject, text: body, html: mdToHtml(body) })
      });
      if (res.ok) { sent++; await logAudit(p.id, 'weekly_digest_sent', { recipients, week: sinceIso.slice(0,10) }); }
      else errors.push(p.id + ': ' + res.status);
    } catch (e) { errors.push(p.id + ': ' + e.message); }
  }
  return json({ ok: true, playbooks_considered: playbooks?.length || 0, emails_sent: sent, errors });
};

async function sb(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY, accept: 'application/json' }
  });
  if (!res.ok) return [];
  return res.json();
}
async function logAudit(playbook_id, event_type, event_data) {
  try {
    await fetch(SUPABASE_URL + '/rest/v1/tp_audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY, prefer: 'return=minimal' },
      body: JSON.stringify({ playbook_id, event_type, event_data })
    });
  } catch {}
}
function json(o, s=200){ return new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } }); }
function escapeHtml(s){ return (s??'').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function mdToHtml(md){
  return '<div style="font-family:sans-serif;max-width:720px;margin:0 auto;padding:20px">' +
    escapeHtml(md).split('\n').map(l => l.startsWith('## ') ? '<h2>'+l.slice(3)+'</h2>' : (l.startsWith('- ') ? '<li>'+l.slice(2)+'</li>' : '<p>'+l+'</p>')).join('') +
    '</div>';
}

export const config = { path: '/.netlify/functions/weekly-digest', schedule: '0 14 * * 1' };
