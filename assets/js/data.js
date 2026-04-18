// Data layer: local-first via Dexie (IndexedDB). No auth, no cloud.
// Same public function signatures as the old Supabase version so step pages need no changes.
// Cloud sync via Supabase can be toggled on later by importing a sync adapter.

import Dexie from 'https://esm.sh/dexie@4.0.8';

// Device identity (stable UUID per browser, not an auth identity)
function getDeviceId() {
  let id = localStorage.getItem('tp:device_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('tp:device_id', id); }
  return id;
}
export const DEVICE_ID = getDeviceId();

// Dexie schema
export const db = new Dexie('triage_playbook');
db.version(1).stores({
  playbook: 'id, status, created_at, updated_at, project_code',
  team: '++id, playbook_id',
  action: '++id, playbook_id, action_type, status, due_date',
  root_cause: '++id, playbook_id, method, sequence_index',
  governance: 'playbook_id',
  metric: '++id, playbook_id, indicator_type',
  metric_reading: '++id, metric_id, reading_at',
  effectiveness: '++id, playbook_id, reviewed_at',
  attachment: '++id, playbook_id, step_slug',
  audit: '++id, playbook_id, created_at'
});

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

// Audit (fire and forget)
export async function audit(playbook_id, event_type, event_data = {}) {
  try { await db.audit.add({ playbook_id, event_type, event_data, created_at: now() }); } catch {}
}

// Playbook ---------------------------------------------------------
export async function createPlaybook({ title, severity = 'P3', impact_summary = '' }) {
  const id = uid();
  const share_slug = (title || 'triage').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Math.random().toString(36).slice(2, 8);
  const row = {
    id, title, severity, impact_summary, share_slug,
    status: 'active',
    owner_user_id: DEVICE_ID,
    created_at: now(), updated_at: now()
  };
  await db.playbook.add(row);
  audit(id, 'playbook_created', { title, severity });
  return row;
}
export async function listPlaybooks() {
  return db.playbook.orderBy('updated_at').reverse().toArray();
}
export async function getPlaybook(id) {
  const r = await db.playbook.get(id);
  if (!r) throw new Error('Playbook not found');
  return r;
}
export async function updatePlaybook(id, patch) {
  patch.updated_at = now();
  await db.playbook.update(id, patch);
  audit(id, 'playbook_updated', { fields: Object.keys(patch) });
  return db.playbook.get(id);
}
export async function deletePlaybook(id) {
  await Promise.all([
    db.team.where({ playbook_id: id }).delete(),
    db.action.where({ playbook_id: id }).delete(),
    db.root_cause.where({ playbook_id: id }).delete(),
    db.governance.where({ playbook_id: id }).delete(),
    db.metric.where({ playbook_id: id }).delete(),
    db.effectiveness.where({ playbook_id: id }).delete(),
    db.attachment.where({ playbook_id: id }).delete()
  ]);
  await db.playbook.delete(id);
  audit(null, 'playbook_deleted', { playbook_id: id });
}

// Team -------------------------------------------------------------
export async function listTeam(pid) { return db.team.where({ playbook_id: pid }).toArray(); }
export async function addTeam(pid, row) {
  const record = { ...row, playbook_id: pid, created_at: now() };
  const id = await db.team.add(record);
  audit(pid, 'team_added', row);
  return { id, ...record };
}
export async function deleteTeam(id, pid) { await db.team.delete(id); audit(pid, 'team_removed', { id }); }

// Actions ----------------------------------------------------------
export async function listActions(pid, action_type = null) {
  let q = db.action.where({ playbook_id: pid });
  const rows = await q.toArray();
  return action_type ? rows.filter(r => r.action_type === action_type) : rows;
}
export async function addAction(pid, row) {
  const record = { ...row, playbook_id: pid, created_at: now() };
  const id = await db.action.add(record);
  audit(pid, 'action_added', row);
  return { id, ...record };
}
export async function updateAction(id, patch, pid) {
  await db.action.update(id, patch);
  audit(pid, 'action_updated', { id, ...patch });
  return db.action.get(id);
}
export async function deleteAction(id, pid) { await db.action.delete(id); audit(pid, 'action_deleted', { id }); }

// Root causes ------------------------------------------------------
export async function listRootCauses(pid) {
  return db.root_cause.where({ playbook_id: pid }).sortBy('sequence_index');
}
export async function addRootCause(pid, row) {
  const record = { ...row, playbook_id: pid, created_at: now() };
  const id = await db.root_cause.add(record);
  audit(pid, 'root_cause_added', row);
  return { id, ...record };
}
export async function updateRootCause(id, patch, pid) {
  await db.root_cause.update(id, patch);
  audit(pid, 'root_cause_updated', { id, ...patch });
  return db.root_cause.get(id);
}
export async function deleteRootCause(id, pid) { await db.root_cause.delete(id); audit(pid, 'root_cause_deleted', { id }); }

// Governance -------------------------------------------------------
export async function getGovernance(pid) { return db.governance.get(pid); }
export async function upsertGovernance(pid, row) {
  const record = { ...row, playbook_id: pid, updated_at: now() };
  await db.governance.put(record);
  audit(pid, 'governance_updated', { fields: Object.keys(row) });
  return record;
}

// Metrics ----------------------------------------------------------
export async function listMetrics(pid) { return db.metric.where({ playbook_id: pid }).toArray(); }
export async function addMetric(pid, row) {
  const record = { ...row, playbook_id: pid, created_at: now() };
  const id = await db.metric.add(record);
  audit(pid, 'metric_added', row);
  return { id, ...record };
}
export async function deleteMetric(id, pid) {
  await db.metric_reading.where({ metric_id: id }).delete();
  await db.metric.delete(id);
  audit(pid, 'metric_deleted', { id });
}
export async function addReading(metric_id, reading_at, value, status, notes, pid) {
  const record = { metric_id, reading_at, value, status, notes, created_at: now() };
  const id = await db.metric_reading.add(record);
  audit(pid, 'metric_reading_added', { metric_id, value, status });
  return { id, ...record };
}
export async function listReadings(metric_id) {
  return db.metric_reading.where({ metric_id }).sortBy('reading_at');
}

// Effectiveness ---------------------------------------------------
export async function listEffectiveness(pid) {
  return db.effectiveness.where({ playbook_id: pid }).sortBy('reviewed_at');
}
export async function addEffectiveness(pid, row) {
  const record = { ...row, playbook_id: pid, created_at: now() };
  const id = await db.effectiveness.add(record);
  audit(pid, 'effectiveness_added', row);
  return { id, ...record };
}

// Attachments (stored as base64 blobs in IndexedDB) ---------------
export async function uploadAttachment(pid, file, step_slug = '', related_id = null) {
  const file_data = await new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file);
  });
  const record = {
    playbook_id: pid, step_slug, related_id,
    file_path: 'local:' + Date.now() + ':' + file.name,
    file_name: file.name, mime_type: file.type, size_bytes: file.size,
    file_data, uploaded_at: now()
  };
  const id = await db.attachment.add(record);
  audit(pid, 'attachment_uploaded', { file_name: file.name, step_slug });
  return { id, ...record };
}
export async function listAttachments(pid, step_slug = null) {
  const rows = await db.attachment.where({ playbook_id: pid }).toArray();
  return step_slug ? rows.filter(a => a.step_slug === step_slug) : rows;
}
export async function getAttachmentUrl(file_path_or_att) {
  // accepts either a record or a file_path string; returns a data URL for display
  if (typeof file_path_or_att === 'string') {
    const row = await db.attachment.where('file_path').equals(file_path_or_att).first();
    return row?.file_data || null;
  }
  return file_path_or_att.file_data || null;
}
export async function deleteAttachment(att) {
  const id = typeof att === 'object' ? att.id : att;
  const pid = typeof att === 'object' ? att.playbook_id : null;
  await db.attachment.delete(id);
  if (pid) audit(pid, 'attachment_deleted', { id });
}

// Bulk load for summary page
export async function loadFullPlaybook(pid) {
  const [pb, team, containment, corrective, preventive, rcs, gov, metrics, eff, atts] = await Promise.all([
    getPlaybook(pid), listTeam(pid),
    listActions(pid, 'interim_containment'), listActions(pid, 'corrective'), listActions(pid, 'preventive'),
    listRootCauses(pid), getGovernance(pid),
    listMetrics(pid), listEffectiveness(pid), listAttachments(pid)
  ]);
  return { playbook: pb, team, containment, corrective, preventive, rootCauses: rcs, governance: gov, metrics, effectiveness: eff, attachments: atts };
}

// -----------------------------------------------------------------
// Playbook sharing via URL (dev collab with Julia + Greg)
// -----------------------------------------------------------------
export async function exportPlaybookAsUrl(pid, baseUrl = location.origin) {
  const full = await loadFullPlaybook(pid);
  // strip blob data to keep URLs under 2000 chars when possible. Attachments ref only filenames.
  const slim = {
    ...full,
    attachments: (full.attachments || []).map(a => ({ file_name: a.file_name, mime_type: a.mime_type, size_bytes: a.size_bytes, step_slug: a.step_slug }))
  };
  const json = JSON.stringify(slim);
  const compressed = await compress(json);
  const hash = 'tp1:' + compressed;
  return `${baseUrl}/summary.html?import=${encodeURIComponent(hash)}`;
}

export async function importPlaybookFromUrl() {
  const url = new URL(location.href);
  const raw = url.searchParams.get('import');
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  if (!decoded.startsWith('tp1:')) return null;
  try {
    const json = await decompress(decoded.slice(4));
    const full = JSON.parse(json);
    const newId = uid();
    const pb = { ...full.playbook, id: newId, created_at: now(), updated_at: now(), share_slug: full.playbook.share_slug + '-imported', status: full.playbook.status || 'active', owner_user_id: DEVICE_ID };
    await db.playbook.add(pb);
    const rewire = (arr, field = 'playbook_id') => arr.map(r => { const { id, ...rest } = r; return { ...rest, [field]: newId }; });
    if (full.team?.length) await db.team.bulkAdd(rewire(full.team));
    if (full.containment?.length) await db.action.bulkAdd(rewire(full.containment));
    if (full.corrective?.length) await db.action.bulkAdd(rewire(full.corrective));
    if (full.preventive?.length) await db.action.bulkAdd(rewire(full.preventive));
    if (full.rootCauses?.length) await db.root_cause.bulkAdd(rewire(full.rootCauses));
    if (full.governance) await db.governance.put({ ...full.governance, playbook_id: newId });
    if (full.metrics?.length) {
      for (const m of full.metrics) {
        const { id, ...rest } = m;
        await db.metric.add({ ...rest, playbook_id: newId });
      }
    }
    if (full.effectiveness?.length) await db.effectiveness.bulkAdd(rewire(full.effectiveness));
    audit(newId, 'playbook_imported_from_url', { origin: document.referrer });
    return newId;
  } catch (e) { console.error('Import failed', e); return null; }
}

// Compression helpers using CompressionStream (built-in in modern browsers)
async function compress(str) {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(str)); writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  return b64urlEncode(new Uint8Array(buf));
}
async function decompress(b64) {
  const bytes = b64urlDecode(b64);
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes); writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(buf);
}
function b64urlEncode(bytes) {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
