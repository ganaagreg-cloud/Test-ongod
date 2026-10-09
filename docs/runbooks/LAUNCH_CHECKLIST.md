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
- [ ] Owner approves or replaces every `TODO(owner)` text in the portal: landing copy, the 3 sample covers, privacy policy, terms, contact address on the delete-account page (`apps/portal/src/i18n/mn.ts`, `public/` images)
- [ ] Portal build made with the real `VITE_PUBLIC_URL`; `og.png` and `favicon.svg` regenerated if the brand changes (`pnpm --filter @ongod/portal assets`); Lighthouse re-run on the live site ([[lighthouse-portal]])
- [ ] The privacy and delete-account page addresses are entered in the Play and App Store listings ([[STORE]])
- [ ] **Reachable privacy link (stores need it before submission):** the final domain is decided ([[open-questions]] #9) and `{domain}/privacy` and `{domain}/terms` open without logging in. `EXPO_PUBLIC_PORTAL_URL` is set to that https address in the EAS `production` (and `preview`) environment ([[MOBILE_BUILD]]), so the Welcome terms line and the Profile "Үйлчилгээний нөхцөл" / "Нууцлалын бодлого" links appear (they are hidden while it is empty). Open them from a release build on a phone
