// AI assistance client: calls Netlify Function which proxies Anthropic Claude.
// Applies data-classification redaction before any payload leaves the browser.
import { hasFeature, isAIAllowed } from './tier.js';

const SENSITIVE_STRINGS_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,                          // US SSN
  /\b\d{13,19}\b/g,                                  // credit card-ish long digits
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,     // email
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g // US phone
];

function redactString(s) {
  if (typeof s !== 'string') return s;
  let out = s;
  for (const re of SENSITIVE_STRINGS_PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}

function redactPayload(obj, classification) {
  if (!hasFeature('dlp_ai_redaction')) return obj;
  if (isAIAllowed(classification)) {
    // still run pattern-based PII redaction as defence in depth
    return JSON.parse(JSON.stringify(obj), (_, v) => typeof v === 'string' ? redactString(v) : v);
  }
  // Class is Restricted or GMP. Scrub free-text fields to headings only.
  const keep = new Set(['id', 'severity', 'status', 'action_type', 'method', 'fishbone_category', 'checkpoint', 'verdict', 'indicator_type', 'reviewed_at', 'due_date', 'created_at', 'updated_at']);
  return JSON.parse(JSON.stringify(obj), (key, value) => {
    if (typeof value !== 'string') return value;
    if (keep.has(key)) return value;
    return '[REDACTED by DLP, classification=' + classification + ']';
  });
}

export async function aiCall(kind, payload, classification = 'internal') {
  const redacted = redactPayload(payload, classification);
  const res = await fetch('/.netlify/functions/ai-assist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, payload: redacted, classification })
  });
  if (!res.ok) throw new Error('AI call failed: ' + res.status);
  return res.json();
}

function classOf(pb) { return pb?.data_classification || pb?.playbook?.data_classification || 'internal'; }
export const suggestFiveWhys = (context, priorWhys) => aiCall('five_whys', { context, priorWhys }, classOf(context));
export const suggestFishbone = (context) => aiCall('fishbone', { context }, classOf(context));
export const draftPostmortem = (playbook) => aiCall('postmortem', { playbook }, classOf(playbook));
export const autoReport = (playbook) => aiCall('auto_report', { playbook }, classOf(playbook));
export const detectDuplicates = (title, impact, existingList) => aiCall('detect_duplicates', { title, impact, existingList });
