-- Triage Playbook schema v2 (additive)
-- Run AFTER schema.sql. Adds per-project stakeholder distribution list and analytics helpers.

-- Per-playbook stakeholder email list (comma-separated for simplicity, validated at app layer)
alter table tp_playbook add column if not exists stakeholder_emails text;
alter table tp_playbook add column if not exists exec_recipient text;
alter table tp_playbook add column if not exists project_code text;
alter table tp_playbook add column if not exists description text;

-- Weekly digest preferences per user
create table if not exists tp_user_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_digest_enabled boolean not null default true,
  weekly_digest_day int not null default 1 check (weekly_digest_day between 0 and 6),
  digest_email text,
  updated_at timestamptz not null default now()
);
alter table tp_user_prefs enable row level security;
drop policy if exists tp_prefs_self on tp_user_prefs;
create policy tp_prefs_self on tp_user_prefs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Analytics view: MTTR per playbook (hours from created_at to closed_at)
create or replace view tp_playbook_analytics as
select
  id, owner_user_id, title, severity, status, project_code,
  created_at, closed_at,
  case when closed_at is not null
    then extract(epoch from (closed_at - created_at)) / 3600.0
    else null end as mttr_hours,
  (select count(*) from tp_effectiveness e where e.playbook_id = p.id) as effectiveness_checkpoints,
  (select count(*) from tp_action a where a.playbook_id = p.id and a.status = 'done') as actions_done,
  (select count(*) from tp_action a where a.playbook_id = p.id) as actions_total
from tp_playbook p;

-- Aggregate per owner
create or replace view tp_owner_kpis as
select
  owner_user_id,
  count(*) filter (where status in ('active','verifying','reopened')) as open_playbooks,
  count(*) filter (where status = 'closed') as closed_playbooks,
  avg(case when status = 'closed' then extract(epoch from (closed_at - created_at)) / 3600.0 end) as avg_mttr_hours,
  max(updated_at) as last_activity
from tp_playbook
group by owner_user_id;
