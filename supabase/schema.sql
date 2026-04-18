-- Triage Playbook schema
-- Run this in Supabase SQL editor against your existing project
-- All tables prefixed tp_ to avoid collision with ClearOps tables

create extension if not exists "pgcrypto";

-- Playbook: one row per triage event
create table if not exists tp_playbook (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  share_slug text unique,
  status text not null default 'active' check (status in ('active','verifying','closed','reopened')),
  title text not null,
  severity text check (severity in ('P1','P2','P3','P4')),
  impact_summary text,
  is_statement text,
  is_not_statement text,
  what text, when_started timestamptz, where_location text, who_detected text, how_many text, how_detected text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closure_evidence_required boolean not null default true
);
create index if not exists tp_playbook_owner_idx on tp_playbook(owner_user_id);
create index if not exists tp_playbook_status_idx on tp_playbook(status);

-- Team members (Step 2)
create table if not exists tp_team_member (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references tp_playbook(id) on delete cascade,
  role text not null check (role in ('incident_commander','analyst','ops_lead','quality','comms','stakeholder','other')),
  name text not null,
  email text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists tp_team_playbook_idx on tp_team_member(playbook_id);

-- Containment actions (Step 3), Corrective (Step 5), Preventive (Step 6). Unified table with action_type.
create table if not exists tp_action (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references tp_playbook(id) on delete cascade,
  action_type text not null check (action_type in ('interim_containment','corrective','preventive')),
  description text not null,
  owner_name text,
  owner_email text,
  due_date date,
  status text not null default 'open' check (status in ('open','in_progress','done','blocked')),
  reversibility text check (reversibility in ('reversible','irreversible')),
  completed_at timestamptz,
  completed_by text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists tp_action_playbook_idx on tp_action(playbook_id);
create index if not exists tp_action_due_idx on tp_action(due_date) where status != 'done';

-- Root cause chain (Step 4): 5 Whys + Fishbone branches
create table if not exists tp_root_cause (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references tp_playbook(id) on delete cascade,
  method text not null check (method in ('five_whys','fishbone','fmea')),
  fishbone_category text check (fishbone_category in ('manpower','method','machine','material','measurement','environment')),
  sequence_index int not null default 0,
  statement text not null,
  evidence_confirmed boolean not null default false,
  evidence_notes text,
  created_at timestamptz not null default now()
);
create index if not exists tp_rc_playbook_idx on tp_root_cause(playbook_id);

-- Governance: RACI, escalation rules, postmortem
create table if not exists tp_governance (
  playbook_id uuid primary key references tp_playbook(id) on delete cascade,
  raci_json jsonb,
  escalation_rule text,
  review_cadence text,
  blameless_postmortem text,
  standardize_to text,
  updated_at timestamptz not null default now()
);

-- Metrics (Step 8)
create table if not exists tp_metric (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references tp_playbook(id) on delete cascade,
  name text not null,
  indicator_type text not null check (indicator_type in ('leading','lagging')),
  unit text,
  target_value numeric,
  green_threshold numeric,
  yellow_threshold numeric,
  red_threshold numeric,
  response_plan text,
  data_source text,
  created_at timestamptz not null default now()
);
create index if not exists tp_metric_playbook_idx on tp_metric(playbook_id);

-- Metric readings (effectiveness verification)
create table if not exists tp_metric_reading (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references tp_metric(id) on delete cascade,
  reading_at date not null default current_date,
  value numeric not null,
  status text check (status in ('green','yellow','red')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists tp_reading_metric_idx on tp_metric_reading(metric_id);

-- Effectiveness check (Step 9): 30/60/90 day reviews
create table if not exists tp_effectiveness (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references tp_playbook(id) on delete cascade,
  checkpoint text not null check (checkpoint in ('30_day','60_day','90_day','ad_hoc')),
  reviewed_at date not null,
  verdict text not null check (verdict in ('effective','partial','not_effective')),
  evidence_summary text,
  recommended_action text check (recommended_action in ('close','continue_monitoring','re_triage','re_plan_long_term')),
  signed_by text,
  signed_at timestamptz,
  signer_ip text,
  created_at timestamptz not null default now()
);
create index if not exists tp_eff_playbook_idx on tp_effectiveness(playbook_id);

-- Attachments (per playbook and optionally per step/action/root-cause/effectiveness)
create table if not exists tp_attachment (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references tp_playbook(id) on delete cascade,
  step_slug text,
  related_id uuid,
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);
create index if not exists tp_att_playbook_idx on tp_attachment(playbook_id);

-- Audit log: immutable trail of every state change
create table if not exists tp_audit (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid references tp_playbook(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  actor_email text,
  event_type text not null,
  event_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tp_audit_playbook_idx on tp_audit(playbook_id);

-- Updated_at triggers
create or replace function tp_touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists tp_playbook_touch on tp_playbook;
create trigger tp_playbook_touch before update on tp_playbook
for each row execute function tp_touch_updated_at();

drop trigger if exists tp_gov_touch on tp_governance;
create trigger tp_gov_touch before update on tp_governance
for each row execute function tp_touch_updated_at();

-- Row Level Security
alter table tp_playbook enable row level security;
alter table tp_team_member enable row level security;
alter table tp_action enable row level security;
alter table tp_root_cause enable row level security;
alter table tp_governance enable row level security;
alter table tp_metric enable row level security;
alter table tp_metric_reading enable row level security;
alter table tp_effectiveness enable row level security;
alter table tp_attachment enable row level security;
alter table tp_audit enable row level security;

-- Owner-only policies (v1). Shareable read via share_slug checked at app layer.
drop policy if exists tp_playbook_owner_all on tp_playbook;
create policy tp_playbook_owner_all on tp_playbook
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- Child tables: owner-via-parent policy
do $$ declare t text; begin
  for t in select unnest(array['tp_team_member','tp_action','tp_root_cause','tp_governance','tp_metric','tp_effectiveness','tp_attachment']) loop
    execute format('drop policy if exists %I_owner_all on %I', t, t);
    execute format($f$create policy %I_owner_all on %I for all using (exists (select 1 from tp_playbook p where p.id = %I.playbook_id and p.owner_user_id = auth.uid())) with check (exists (select 1 from tp_playbook p where p.id = %I.playbook_id and p.owner_user_id = auth.uid()))$f$, t, t, t, t);
  end loop;
end $$;

-- Metric reading policy via metric -> playbook
drop policy if exists tp_reading_owner_all on tp_metric_reading;
create policy tp_reading_owner_all on tp_metric_reading
  for all using (exists (select 1 from tp_metric m join tp_playbook p on p.id = m.playbook_id where m.id = tp_metric_reading.metric_id and p.owner_user_id = auth.uid()))
  with check (exists (select 1 from tp_metric m join tp_playbook p on p.id = m.playbook_id where m.id = tp_metric_reading.metric_id and p.owner_user_id = auth.uid()));

-- Audit: insert by authenticated, read by owner
drop policy if exists tp_audit_insert on tp_audit;
create policy tp_audit_insert on tp_audit for insert to authenticated with check (true);
drop policy if exists tp_audit_read_owner on tp_audit;
create policy tp_audit_read_owner on tp_audit for select using (
  playbook_id is null or exists (select 1 from tp_playbook p where p.id = tp_audit.playbook_id and p.owner_user_id = auth.uid())
);

-- Storage bucket (run separately in dashboard or via API)
-- insert into storage.buckets (id, name, public) values ('triage-playbook', 'triage-playbook', false) on conflict do nothing;
-- Storage RLS policy: owner-only read/write (configure in Storage UI or with supabase policies)
