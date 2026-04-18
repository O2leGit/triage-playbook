// Data access layer: all Supabase reads + writes for Triage Playbook
import { supabase, audit } from './core.js';

// Playbook ---------------------------------------------------------
export async function createPlaybook({ title, severity = 'P3', impact_summary = '' }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const share_slug = (title || 'triage').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Math.random().toString(36).slice(2, 8);
  const { data, error } = await supabase.from('tp_playbook').insert({
    owner_user_id: user.id, title, severity, impact_summary, share_slug, status: 'active'
  }).select().single();
  if (error) throw error;
  await audit(data.id, 'playbook_created', { title, severity });
  return data;
}

export async function listPlaybooks() {
  const { data, error } = await supabase.from('tp_playbook').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getPlaybook(id) {
  const { data, error } = await supabase.from('tp_playbook').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function updatePlaybook(id, patch) {
  const { data, error } = await supabase.from('tp_playbook').update(patch).eq('id', id).select().single();
  if (error) throw error;
  await audit(id, 'playbook_updated', { fields: Object.keys(patch) });
  return data;
}

export async function deletePlaybook(id) {
  const { error } = await supabase.from('tp_playbook').delete().eq('id', id);
  if (error) throw error;
  await audit(null, 'playbook_deleted', { playbook_id: id });
}

// Team -------------------------------------------------------------
export async function listTeam(pid) {
  const { data, error } = await supabase.from('tp_team_member').select('*').eq('playbook_id', pid).order('created_at');
  if (error) throw error; return data || [];
}
export async function addTeam(pid, row) {
  const { data, error } = await supabase.from('tp_team_member').insert({ playbook_id: pid, ...row }).select().single();
  if (error) throw error; await audit(pid, 'team_added', row); return data;
}
export async function deleteTeam(id, pid) {
  const { error } = await supabase.from('tp_team_member').delete().eq('id', id);
  if (error) throw error; await audit(pid, 'team_removed', { id });
}

// Actions (containment, corrective, preventive) --------------------
export async function listActions(pid, action_type = null) {
  let q = supabase.from('tp_action').select('*').eq('playbook_id', pid).order('created_at');
  if (action_type) q = q.eq('action_type', action_type);
  const { data, error } = await q; if (error) throw error; return data || [];
}
export async function addAction(pid, row) {
  const { data, error } = await supabase.from('tp_action').insert({ playbook_id: pid, ...row }).select().single();
  if (error) throw error; await audit(pid, 'action_added', row); return data;
}
export async function updateAction(id, patch, pid) {
  const { data, error } = await supabase.from('tp_action').update(patch).eq('id', id).select().single();
  if (error) throw error; await audit(pid, 'action_updated', { id, ...patch }); return data;
}
export async function deleteAction(id, pid) {
  const { error } = await supabase.from('tp_action').delete().eq('id', id);
  if (error) throw error; await audit(pid, 'action_deleted', { id });
}

// Root causes ------------------------------------------------------
export async function listRootCauses(pid) {
  const { data, error } = await supabase.from('tp_root_cause').select('*').eq('playbook_id', pid).order('sequence_index');
  if (error) throw error; return data || [];
}
export async function addRootCause(pid, row) {
  const { data, error } = await supabase.from('tp_root_cause').insert({ playbook_id: pid, ...row }).select().single();
  if (error) throw error; await audit(pid, 'root_cause_added', row); return data;
}
export async function updateRootCause(id, patch, pid) {
  const { data, error } = await supabase.from('tp_root_cause').update(patch).eq('id', id).select().single();
  if (error) throw error; await audit(pid, 'root_cause_updated', { id, ...patch }); return data;
}
export async function deleteRootCause(id, pid) {
  const { error } = await supabase.from('tp_root_cause').delete().eq('id', id);
  if (error) throw error; await audit(pid, 'root_cause_deleted', { id });
}

// Governance -------------------------------------------------------
export async function getGovernance(pid) {
  const { data, error } = await supabase.from('tp_governance').select('*').eq('playbook_id', pid).maybeSingle();
  if (error) throw error; return data;
}
export async function upsertGovernance(pid, row) {
  const { data, error } = await supabase.from('tp_governance').upsert({ playbook_id: pid, ...row }).select().single();
  if (error) throw error; await audit(pid, 'governance_updated', { fields: Object.keys(row) }); return data;
}

// Metrics ----------------------------------------------------------
export async function listMetrics(pid) {
  const { data, error } = await supabase.from('tp_metric').select('*').eq('playbook_id', pid).order('created_at');
  if (error) throw error; return data || [];
}
export async function addMetric(pid, row) {
  const { data, error } = await supabase.from('tp_metric').insert({ playbook_id: pid, ...row }).select().single();
  if (error) throw error; await audit(pid, 'metric_added', row); return data;
}
export async function deleteMetric(id, pid) {
  const { error } = await supabase.from('tp_metric').delete().eq('id', id);
  if (error) throw error; await audit(pid, 'metric_deleted', { id });
}
export async function addReading(metric_id, reading_at, value, status, notes, pid) {
  const { data, error } = await supabase.from('tp_metric_reading').insert({ metric_id, reading_at, value, status, notes }).select().single();
  if (error) throw error; await audit(pid, 'metric_reading_added', { metric_id, value, status }); return data;
}
export async function listReadings(metric_id) {
  const { data, error } = await supabase.from('tp_metric_reading').select('*').eq('metric_id', metric_id).order('reading_at');
  if (error) throw error; return data || [];
}

// Effectiveness checks --------------------------------------------
export async function listEffectiveness(pid) {
  const { data, error } = await supabase.from('tp_effectiveness').select('*').eq('playbook_id', pid).order('reviewed_at');
  if (error) throw error; return data || [];
}
export async function addEffectiveness(pid, row) {
  const { data, error } = await supabase.from('tp_effectiveness').insert({ playbook_id: pid, ...row }).select().single();
  if (error) throw error; await audit(pid, 'effectiveness_added', row); return data;
}

// Attachments -----------------------------------------------------
export async function uploadAttachment(pid, file, step_slug = '', related_id = null) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const path = `${user.id}/${pid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const bucket = window.TP_CONFIG.STORAGE_BUCKET;
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw upErr;
  const { data, error } = await supabase.from('tp_attachment').insert({
    playbook_id: pid, step_slug, related_id,
    file_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size,
    uploaded_by: user.id
  }).select().single();
  if (error) throw error;
  await audit(pid, 'attachment_uploaded', { file_name: file.name, step_slug });
  return data;
}
export async function listAttachments(pid, step_slug = null) {
  let q = supabase.from('tp_attachment').select('*').eq('playbook_id', pid).order('uploaded_at', { ascending: false });
  if (step_slug) q = q.eq('step_slug', step_slug);
  const { data, error } = await q; if (error) throw error; return data || [];
}
export async function getAttachmentUrl(file_path) {
  const bucket = window.TP_CONFIG.STORAGE_BUCKET;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(file_path, 60 * 10);
  if (error) throw error; return data.signedUrl;
}
export async function deleteAttachment(att) {
  const bucket = window.TP_CONFIG.STORAGE_BUCKET;
  await supabase.storage.from(bucket).remove([att.file_path]);
  await supabase.from('tp_attachment').delete().eq('id', att.id);
  await audit(att.playbook_id, 'attachment_deleted', { file_name: att.file_name });
}

// Bulk load for summary page
export async function loadFullPlaybook(pid) {
  const [pb, team, containment, corrective, preventive, rcs, gov, metrics, eff, atts] = await Promise.all([
    getPlaybook(pid),
    listTeam(pid),
    listActions(pid, 'interim_containment'),
    listActions(pid, 'corrective'),
    listActions(pid, 'preventive'),
    listRootCauses(pid),
    getGovernance(pid),
    listMetrics(pid),
    listEffectiveness(pid),
    listAttachments(pid)
  ]);
  return { playbook: pb, team, containment, corrective, preventive, rootCauses: rcs, governance: gov, metrics, effectiveness: eff, attachments: atts };
}
