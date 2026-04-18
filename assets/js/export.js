// Markdown export + email sender
import { fmtDate, fmtDateTime } from './core.js';

export function playbookToMarkdown(full) {
  const p = full.playbook;
  const lines = [];
  lines.push(`# Triage Playbook: ${p.title}`);
  lines.push('');
  lines.push(`**Severity:** ${p.severity || ''}  `);
  lines.push(`**Status:** ${p.status}  `);
  lines.push(`**Created:** ${fmtDateTime(p.created_at)}  `);
  lines.push(`**Updated:** ${fmtDateTime(p.updated_at)}`);
  lines.push('');

  lines.push('## 1. Problem Definition');
  lines.push(`**Impact:** ${p.impact_summary || ''}`);
  lines.push('');
  lines.push(`- **What:** ${p.what || ''}`);
  lines.push(`- **When:** ${p.when_started ? fmtDateTime(p.when_started) : ''}`);
  lines.push(`- **Where:** ${p.where_location || ''}`);
  lines.push(`- **Who detected:** ${p.who_detected || ''}`);
  lines.push(`- **How many:** ${p.how_many || ''}`);
  lines.push(`- **How detected:** ${p.how_detected || ''}`);
  lines.push(`- **Is:** ${p.is_statement || ''}`);
  lines.push(`- **Is not:** ${p.is_not_statement || ''}`);
  lines.push('');

  lines.push('## 2. Team');
  if (!full.team.length) lines.push('_None recorded._');
  full.team.forEach(t => lines.push(`- **${t.role.replace(/_/g, ' ')}:** ${t.name}${t.email ? ' (' + t.email + ')' : ''}${t.notes ? ' - ' + t.notes : ''}`));
  lines.push('');

  lines.push('## 3. Interim Containment');
  if (!full.containment.length) lines.push('_None recorded._');
  full.containment.forEach(a => lines.push(`- [${a.status}] ${a.description} (owner: ${a.owner_name || 'unassigned'}, due: ${a.due_date || 'n/a'}, ${a.reversibility || 'reversibility unset'})`));
  lines.push('');

  lines.push('## 4. Root Cause Analysis');
  if (!full.rootCauses.length) lines.push('_None recorded._');
  const fiveWhys = full.rootCauses.filter(r => r.method === 'five_whys').sort((a,b) => a.sequence_index - b.sequence_index);
  if (fiveWhys.length) {
    lines.push('**5 Whys chain:**');
    fiveWhys.forEach((r, i) => lines.push(`${i + 1}. Why: ${r.statement}${r.evidence_confirmed ? ' [evidence confirmed]' : ' [unconfirmed]'}`));
  }
  const fishbone = full.rootCauses.filter(r => r.method === 'fishbone');
  if (fishbone.length) {
    lines.push('');
    lines.push('**Fishbone branches:**');
    fishbone.forEach(r => lines.push(`- **${r.fishbone_category}:** ${r.statement}${r.evidence_confirmed ? ' [confirmed]' : ''}`));
  }
  lines.push('');

  lines.push('## 5. Permanent Corrective Actions');
  if (!full.corrective.length) lines.push('_None recorded._');
  full.corrective.forEach(a => lines.push(`- [${a.status}] ${a.description} (owner: ${a.owner_name || 'unassigned'}, due: ${a.due_date || 'n/a'})`));
  lines.push('');

  lines.push('## 6. Preventive Actions (escape-point fixes)');
  if (!full.preventive.length) lines.push('_None recorded._');
  full.preventive.forEach(a => lines.push(`- [${a.status}] ${a.description} (owner: ${a.owner_name || 'unassigned'}, due: ${a.due_date || 'n/a'})`));
  lines.push('');

  lines.push('## 7. Governance');
  const g = full.governance || {};
  lines.push(`- **Review cadence:** ${g.review_cadence || ''}`);
  lines.push(`- **Escalation rule:** ${g.escalation_rule || ''}`);
  lines.push(`- **Standardize to:** ${g.standardize_to || ''}`);
  if (g.blameless_postmortem) { lines.push(''); lines.push('**Blameless postmortem:**'); lines.push(g.blameless_postmortem); }
  lines.push('');

  lines.push('## 8. Monitoring and Metrics');
  if (!full.metrics.length) lines.push('_None recorded._');
  full.metrics.forEach(m => {
    lines.push(`- **${m.name}** (${m.indicator_type}, unit: ${m.unit || ''}) target ${m.target_value ?? ''}, thresholds G:${m.green_threshold ?? ''} / Y:${m.yellow_threshold ?? ''} / R:${m.red_threshold ?? ''}`);
    if (m.response_plan) lines.push(`  - Response plan: ${m.response_plan}`);
  });
  lines.push('');

  lines.push('## 9. Effectiveness Verification');
  if (!full.effectiveness.length) lines.push('_No checkpoints yet._');
  full.effectiveness.forEach(e => lines.push(`- **${e.checkpoint}** on ${fmtDate(e.reviewed_at)}: ${e.verdict} -> ${e.recommended_action}${e.signed_by ? ' (signed by ' + e.signed_by + ' at ' + fmtDateTime(e.signed_at) + ')' : ''}`));
  lines.push('');

  lines.push('## 10. Loop-back Decision');
  const last = full.effectiveness[full.effectiveness.length - 1];
  if (last && last.verdict !== 'effective') {
    lines.push(`Recommended: **${last.recommended_action.replace(/_/g, ' ')}** based on last verdict of **${last.verdict}**.`);
  } else if (last) {
    lines.push(`Last verdict effective on ${fmtDate(last.reviewed_at)}. No loop-back needed.`);
  } else {
    lines.push('_Pending effectiveness review._');
  }
  lines.push('');

  lines.push('## Evidence / Attachments');
  if (!full.attachments.length) lines.push('_None._');
  full.attachments.forEach(a => lines.push(`- ${a.file_name} (${Math.round((a.size_bytes || 0) / 1024)} KB) - ${a.step_slug || 'general'}`));
  lines.push('');

  lines.push('---');
  lines.push('_Generated by Triage Playbook. Framework synthesized from 8D, A3, DMAIC, SRE, ITIL, CAPA, PDCA._');
  return lines.join('\n');
}

export function downloadMarkdown(md, filename) {
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function sendReportEmail({ to, subject, body_md, playbook_id }) {
  const res = await fetch('/.netlify/functions/send-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to, subject, body_md, playbook_id })
  });
  if (!res.ok) throw new Error('Email send failed: ' + res.status);
  return res.json();
}
