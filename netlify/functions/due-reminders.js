// Scheduled: daily due-date sweep. Emails owners whose actions are due within 2 days or overdue.
// Uses Supabase service role to read across users.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@ikigaios.com';

export default async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ skipped: true, reason: 'supabase not configured' });
  const today = new Date(); const horizon = new Date(); horizon.setDate(today.getDate() + 2);
  const dueBefore = horizon.toISOString().slice(0,10);

  const rows = await sb(`tp_action?select=id,description,due_date,status,owner_name,owner_email,playbook_id&status=neq.done&due_date=not.is.null&due_date=lte.${dueBefore}&owner_email=not.is.null`);
  const buckets = new Map();
  for (const r of rows || []) {
    if (!r.owner_email) continue;
    const key = r.owner_email.toLowerCase();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }

  let sent = 0;
  for (const [email, items] of buckets) {
    if (!RESEND_API_KEY) break;
    const subject = `Triage Playbook: ${items.length} action${items.length>1?'s':''} due or overdue`;
    const body = items.map(i => `- ${i.description} (due ${i.due_date}, status ${i.status})`).join('\n');
    const html = `<div style="font-family:sans-serif"><h3>Upcoming or overdue triage actions</h3><pre style="font:inherit">${escapeHtml(body)}</pre><p>Open <a href="https://${process.env.NETLIFY_URL || 'triage-playbook.netlify.app'}">Triage Playbook</a> to update.</p></div>`;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + RESEND_API_KEY },
        body: JSON.stringify({ from: EMAIL_FROM, to: [email], subject, html, text: body })
      });
      if (res.ok) sent++;
    } catch (e) { /* continue */ }
  }

  return json({ ok: true, owners_emailed: sent, total_actions: rows?.length || 0 });
};

async function sb(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
      accept: 'application/json'
    }
  });
  if (!res.ok) throw new Error('Supabase ' + res.status + ' on ' + path);
  return res.json();
}
function json(o, s=200){ return new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } }); }
function escapeHtml(s){ return (s??'').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export const config = { path: '/.netlify/functions/due-reminders', schedule: '0 13 * * *' };
