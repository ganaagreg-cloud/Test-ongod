---
type: runbook
status: draft
updated: 2026-10-08
tags: [runbook, launch]
---

# Launch checklist

From [[SPEC#Acceptance tests (must pass before launch)]]. Tick each item with the date and evidence (log note or commit).

- [ ] A new episode is playable within minutes and never blocks others
- [ ] Playback starts in < 3 s on mobile data
- [ ] 100 concurrent streams without buffering, server CPU < 70%
- [ ] An upload interrupted at 80% resumes
- [ ] Failed processing shows the reason + retry
- [ ] A link without access or token is refused
- [ ] The 3rd device is refused
- [ ] Expired access stops playback
- [ ] A backup was restored once on a clean server ([[DEPLOY]])
- [ ] Store review: the demo account works, no payment UI in the apps ([[STORE]])

## Before go-live

- [ ] Bunny switched to the owner's account ([[BUNNY_SWITCH]])
- [ ] `ALERT_EMAILS`, `LOG_FILE` and an uptime monitor configured ([[ADR-0016-monitoring-logs-alert-emails|ADR-0016]])
- [ ] Google Play closed test finished ([[R-google-play-closed-test]])
- [ ] All TO-VERIFY research notes resolved (`/recheck`)
