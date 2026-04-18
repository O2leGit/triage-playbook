// Proxy to Anthropic Claude. Called from client for 5 Whys, Fishbone, Postmortem, Auto-report.
// Uses prompt caching where possible on the system block.

const MODEL = 'claude-sonnet-4-6';
const API_KEY = process.env.ANTHROPIC_API_KEY;

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { kind, payload } = body || {};

  try {
    switch (kind) {
      case 'five_whys': return json(await fiveWhys(payload));
      case 'fishbone': return json(await fishbone(payload));
      case 'postmortem': return json(await postmortem(payload));
      case 'auto_report': return json(await autoReport(payload));
      case 'detect_duplicates': return json(await detectDuplicates(payload));
      default: return json({ error: 'Unknown kind: ' + kind }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: e.message || 'AI error' }, 500);
  }
};

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } }); }

const SYSTEM_BASE = `You are an expert operational troubleshooter trained on 8D, A3, DMAIC, ITIL, CAPA, and Google SRE practices.
You help operators triage operational problems and drive to confirmed root cause.
Rules:
- Never use em dashes. Use periods or commas.
- Be concrete and grounded in the context provided.
- Challenge assumptions. Ask for evidence.
- Prefer actionable, testable statements over vague ones.`;

async function callClaude({ system, user, max_tokens = 1200, temperature = 0.5 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens,
      temperature,
      system: [
        { type: 'text', text: system, cache_control: { type: 'ephemeral' } }
      ],
      messages: [{ role: 'user', content: user }]
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Claude API ' + res.status + ': ' + t.slice(0, 200));
  }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  return { text, raw: data };
}

async function fiveWhys({ context, priorWhys }) {
  const user = `Context:
${JSON.stringify(context, null, 2)}

Prior whys so far (chain, most recent last):
${(priorWhys || []).map((w, i) => `${i + 1}. ${w}`).join('\n') || '[none]'}

Task: Suggest the NEXT "why" in the chain. Return ONLY the statement, no numbering, no preamble.
It should deepen the causal chain toward an actionable root cause.
If the last statement is already a confirmed root cause, say: ROOT_CAUSE_REACHED.`;

  const { text } = await callClaude({ system: SYSTEM_BASE, user, max_tokens: 200, temperature: 0.4 });
  if (/ROOT_CAUSE_REACHED/i.test(text)) return { suggestion: '', text, done: true };
  return { suggestion: text.replace(/^[\s\d.\-)]+/, '').trim(), text };
}

async function fishbone({ context }) {
  const user = `Context:
${JSON.stringify(context, null, 2)}

Task: Propose 4 to 6 fishbone (Ishikawa) contributing factors across different categories.
Return STRICT JSON with the shape:
{ "branches": [ { "category": "manpower|method|machine|material|measurement|environment", "statement": "..." } ] }
No prose. JSON only.`;

  const { text } = await callClaude({ system: SYSTEM_BASE, user, max_tokens: 600, temperature: 0.6 });
  const json = extractJson(text);
  return { branches: Array.isArray(json?.branches) ? json.branches.filter(b => b.category && b.statement) : [] };
}

async function postmortem({ playbook }) {
  const user = `Playbook data:
${safeStringify(playbook)}

Task: Draft a blameless postmortem using the following sections:
1. Summary (2-3 sentences)
2. Timeline (bulleted, concrete timestamps where available)
3. Contributing factors (systems, not individuals)
4. What went well
5. What could improve
6. Action items (link to step 5 corrective actions where relevant)

Keep it under 500 words. Use plain markdown. Do not use em dashes.`;

  const { text } = await callClaude({ system: SYSTEM_BASE, user, max_tokens: 1500, temperature: 0.3 });
  return { draft: text };
}

async function autoReport({ playbook }) {
  const user = `Playbook data:
${safeStringify(playbook)}

Task: Draft a one-page executive report with these sections:
- Headline (one sentence: what happened, what we did, current state)
- Impact ($, units, time)
- Containment: what stopped the bleeding
- Root cause: the one confirmed cause most responsible
- Corrective + preventive plan: owners and due dates
- Metrics moved so far (or what we are watching)
- Effectiveness verdict if logged
- Recommended next action

Tone: direct, no fluff, no em dashes. Under 400 words. Plain markdown.`;

  const { text } = await callClaude({ system: SYSTEM_BASE, user, max_tokens: 1400, temperature: 0.3 });
  return { report: text };
}

async function detectDuplicates({ title, impact, existingList }) {
  const user = `New triage:
Title: ${title}
Impact: ${impact}

Existing playbooks:
${(existingList || []).map(e => `- ${e.id}: ${e.title} (${e.impact_summary || ''})`).join('\n')}

Task: Are any of the existing playbooks likely duplicates or related root-cause recurrences of the new one?
Return STRICT JSON: { "matches": [ { "id": "...", "confidence": 0-1, "reason": "..." } ] }
Only include items with confidence >= 0.6.`;

  const { text } = await callClaude({ system: SYSTEM_BASE, user, max_tokens: 600, temperature: 0.2 });
  const j = extractJson(text);
  return { matches: Array.isArray(j?.matches) ? j.matches : [] };
}

function extractJson(t) {
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

function safeStringify(o) {
  try { return JSON.stringify(o, null, 2).slice(0, 18000); } catch { return String(o).slice(0, 18000); }
}

export const config = { path: '/.netlify/functions/ai-assist' };
