// Send report email via Resend. Logs to audit table through service role.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@ikigaios.com';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY not configured' }, 500);

  let body; try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { to, subject, body_md, playbook_id } = body || {};
  if (!to || !subject || !body_md) return json({ error: 'Missing to/subject/body_md' }, 400);

  const recipients = String(to).split(',').map(s => s.trim()).filter(Boolean);
  const html = mdToHtml(body_md);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + RESEND_API_KEY },
    body: JSON.stringify({ from: EMAIL_FROM, to: recipients, subject, html, text: body_md })
  });
  if (!res.ok) {
    const t = await res.text();
    return json({ error: 'Resend error ' + res.status + ': ' + t.slice(0, 300) }, 502);
  }
  const data = await res.json();

  // Audit log (best effort)
  if (playbook_id && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await fetch(SUPABASE_URL + '/rest/v1/tp_audit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
          prefer: 'return=minimal'
        },
        body: JSON.stringify({ playbook_id, event_type: 'email_sent', event_data: { to: recipients, subject, resend_id: data.id } })
      });
    } catch (e) { /* non-blocking */ }
  }

  return json({ ok: true, id: data.id });
};

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } }); }

function escapeHtml(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Minimal markdown to HTML (headings, bullets, bold, italic, line breaks)
function mdToHtml(md) {
  const esc = escapeHtml(md);
  const lines = esc.split('\n');
  let out = []; let inList = false;
  for (const line of lines) {
    if (/^# (.*)/.test(line)) { if (inList) { out.push('</ul>'); inList = false; } out.push('<h1 style="font-family:Georgia,serif;color:#0f1e35">' + line.replace(/^# /, '') + '</h1>'); continue; }
    if (/^## (.*)/.test(line)) { if (inList) { out.push('</ul>'); inList = false; } out.push('<h2 style="font-family:Georgia,serif;color:#0f1e35">' + line.replace(/^## /, '') + '</h2>'); continue; }
    if (/^### (.*)/.test(line)) { if (inList) { out.push('</ul>'); inList = false; } out.push('<h3 style="font-family:Georgia,serif;color:#0f1e35">' + line.replace(/^### /, '') + '</h3>'); continue; }
    if (/^- (.*)/.test(line)) { if (!inList) { out.push('<ul>'); inList = true; } out.push('<li>' + renderInline(line.replace(/^- /, '')) + '</li>'); continue; }
    if (/^---/.test(line)) { if (inList) { out.push('</ul>'); inList = false; } out.push('<hr/>'); continue; }
    if (!line.trim()) { if (inList) { out.push('</ul>'); inList = false; } out.push('<br/>'); continue; }
    if (inList) { out.push('</ul>'); inList = false; }
    out.push('<p>' + renderInline(line) + '</p>');
  }
  if (inList) out.push('</ul>');
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;color:#1a1a1a;max-width:720px;margin:0 auto;padding:20px">${out.join('\n')}</div>`;
}
function renderInline(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)_(.+?)_(\s|$)/g, '$1<i>$2</i>$3');
}

export const config = { path: '/.netlify/functions/send-email' };
