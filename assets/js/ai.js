// AI assistance client: calls Netlify Function which proxies Anthropic Claude.
// Used by: Step 4 (5 Whys + Fishbone suggestions), Step 6 (postmortem drafting), Summary (auto-report).
export async function aiCall(kind, payload) {
  const res = await fetch('/.netlify/functions/ai-assist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, payload })
  });
  if (!res.ok) throw new Error('AI call failed: ' + res.status);
  return res.json();
}

export const suggestFiveWhys = (context, priorWhys) => aiCall('five_whys', { context, priorWhys });
export const suggestFishbone = (context) => aiCall('fishbone', { context });
export const draftPostmortem = (playbook) => aiCall('postmortem', { playbook });
export const autoReport = (playbook) => aiCall('auto_report', { playbook });
export const detectDuplicates = (title, impact, existingList) => aiCall('detect_duplicates', { title, impact, existingList });
