# Triage Playbook

World-class operational triage and stability web app. Walks any operator through a 10-step framework covering triage, containment, root cause, long-term action plan, governance, monitoring, effectiveness verification, and loop-back if metrics do not move.

## The 10-Step Framework

Synthesized from 7 world-class standards: 8D (Ford/automotive), A3 (Toyota), DMAIC (Six Sigma), Google SRE, ITIL 4, CAPA (FDA 21 CFR 820.100 / ISO 9001), PDCA (Deming).

1. **Define the problem** - severity, impact, is/is-not, 5W2H
2. **Form the team** - incident commander, analyst, ops, comms
3. **Interim containment** - stop the bleeding, reversible, timestamped
4. **Data-driven root cause** - 5 Whys + Fishbone, confirm with evidence
5. **Permanent corrective actions** - one per root cause, owner, due date
6. **Preventive actions** - escape-point fix
7. **Governance** - RACI, escalation, blameless postmortem, standardize
8. **Monitoring and metrics** - leading + lagging, red/yellow/green, response plan
9. **Effectiveness verification** - 30/60/90 day, close only with evidence
10. **Loop-back** - was root cause wrong, countermeasure weak, or execution failed?

## Stack

- **Frontend:** Static HTML/CSS/vanilla JS, mobile-first, PWA
- **Hosting:** GitHub to Netlify (auto-deploy)
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime)
- **AI:** Anthropic Claude (5 Whys suggestions, Fishbone, postmortem drafting)
- **Email:** Resend via Netlify Functions
- **Scheduled jobs:** Netlify scheduled functions (due-date reminders, weekly exec digest)

## Local Development

1. Copy `.env.example` to `.env` and fill in keys
2. Open `index.html` in Chrome (no build step required)
3. For Netlify Functions, run `netlify dev`

## Deployment

Push to `main`. Netlify auto-deploys.

## The 8 Pillars of World-Class (2026 standard)

1. Cloud persistence + multi-user (Supabase Auth + RLS + Realtime)
2. File and evidence storage (Supabase Storage, forced upload on key steps)
3. Automation and notifications (Netlify scheduled functions + Resend)
4. Reporting and dashboards (AI-generated reports, weekly exec digest)
5. AI assistance (Claude for 5 Whys, Fishbone, postmortem drafting)
6. Cross-playbook analytics (MTTR trends, repeat-issue detection)
7. PWA and offline sync (service worker, install to home screen)
8. Governance and closure rigor (e-signature, forced evidence, blameless postmortem)

## Expert Sources

See [`playbook.html`](playbook.html) for full source list with URLs.
