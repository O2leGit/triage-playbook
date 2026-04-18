# ikigaiStack Config -- Triage Playbook (TriageOS)

**Project**: Triage Playbook (brand: TriageOS)
**Path**: C:\Users\Chris\Documents\triage-playbook
**Status**: All 4 phases shipped (P1 Core, P2 AI, P3 Automation, P4 PWA + analytics)

## Tech Stack
- **Frontend**: Static HTML/CSS/vanilla JS, PWA (service worker + manifest)
- **Backend**: Netlify Functions (ai-assist, send-email, due-reminders, weekly-digest)
- **Database**: Supabase (project tfizrgevpajadduuzhdl, ikigaiOS-exec-ops)
- **AI**: Claude (5 Whys, Fishbone, postmortem, auto-report, duplicate detection)
- **Email**: Resend (optional)
- **Tables**: `tp_*` prefix to isolate from ClearOps -- tp_playbook, tp_team_member, tp_action, tp_root_cause, tp_governance, tp_metric, tp_metric_reading, tp_effectiveness, tp_attachment, tp_audit, tp_user_prefs
- **Storage**: `triage-playbook` bucket (private)

## ikigaiStack Railroad (ENABLED)
Every feature, fix, or change MUST flow through these phases in order:

1. **SCOPE** -- Define problem, success criteria, CAN DO / CANNOT DO
2. **PLAN** -- Research first, write phase plan with A+ rubric (binary pass/fail)
3. **DESIGN** -- Supabase schema change + Netlify Function contract + UX sketch before code
4. **BUILD** -- TDD where possible (schema assertions, function unit tests) -- RED, GREEN, REFACTOR
5. **REVIEW** -- Self-review against rubric, run simplify skill
6. **QA** -- Live verification on deployed Netlify URL, PWA install test, zero console errors
7. **SHIP** -- Commit + push (Netlify auto-deploy), run `deploy.ps1` if infra changes
8. **LEARN** -- Log pattern to company_learning_log.md, update audit log

Rubric reference: `~/.claude/skills/ikigaistack/RUBRIC.md`

## Enforced Rules
- **Commit format**: `[AI] feat: ...` | `[AI-REVIEWED] fix: ...` | `[HUMAN] refactor: ...`
- **Zero em dashes** anywhere (code, UI text, comments, commit messages, docs)
- **Imperative commit messages**
- **Defect log**: `.claude/defect-log.csv` for any AI-introduced bug
- **Table prefix discipline**: all new tables use `tp_` -- never touch ClearOps tables

## Deploy Targets
- **Netlify** (primary host + Functions)
- **Supabase** (shared ikigaiOS-exec-ops project)
- **Deploy script**: `deploy.ps1` is idempotent -- runs schemas, bucket create, git init + gh repo create + push, netlify site + env vars + deploy --prod, curl verify

## Critical Guardrails
- Shared Supabase project with ClearOps -- never drop or rename non-`tp_` tables
- Scheduled functions (due-reminders daily, weekly-digest Monday) must stay idempotent
- PWA service worker changes require cache bust + version bump
- No send-email without human gate on first run of any new distribution list

## Trigger
When Chris opens this repo, the ikigaiStack railroad auto-applies. Any work that skips a phase must be flagged and justified before proceeding.
