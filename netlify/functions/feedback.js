// Feedback intake. Logs to a Netlify Form (via email notification) or via Resend if configured.
// Zero-config: if Resend isn't set up, still returns 200 and the client-side fallback is mailto.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@ikigaios.com';
const FEEDBACK_TO = process.env.FEEDBACK_TO || 'chris@cotoole.com';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { from, body: message, page, time, agent } = body || {};
  if (!message) return json({ error: 'Missing body' }, 400);

  const subject = `Triage Playbook feedback${from ? ' from ' + from : ''}`;
  const text = [
    `From: ${from || 'anonymous'}`,
    `Page: ${page || ''}`,
    `Time: ${time || ''}`,
    `Agent: ${agent || ''}`,
    '',
    message
  ].join('\n');

  if (RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + RESEND_API_KEY },
        body: JSON.stringify({ from: EMAIL_FROM, to: [FEEDBACK_TO], subject, text })
      });
      if (res.ok) return json({ ok: true });
    } catch (e) { /* fall through */ }
  }
  // No Resend configured: log and accept so client does not fail. User also gets mailto fallback.
  console.log('[feedback]', JSON.stringify({ subject, text }));
  return json({ ok: true, note: 'logged-only' });
};

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } }); }

export const config = { path: '/.netlify/functions/feedback' };
