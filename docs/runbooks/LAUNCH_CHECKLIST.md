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
- [ ] A nightly backup runs, a copy is kept off the server, and one was restored into a scratch database and the app signed in against it ([[DEPLOY]])
- [ ] Store review: the demo account works, no payment UI in the apps ([[STORE]])
- [ ] **Node on the VPS:** the newest Node 22 LTS, at least 22.23.4 (`node -v` on the server, the service restarted after every update; [[R-node-cve-2026-111497]] is TO-VERIFY against nodejs.org). The API is built for Node 22 ([[ADR-0064-api-on-node-22|ADR-0064]])
- [ ] **Server baseline ([[ADR-0075-hosting-own-vps|ADR-0075]], [[DEPLOY]]):** non-root `deploy` user, SSH keys only, root login off, firewall on (22, 80, 443), `fail2ban` and automatic security updates on, MySQL on localhost only with a limited app user, `.env` mode 640 outside git, a provider snapshot taken
- [ ] **Reverse proxy:** `https://<domain>` works with a valid certificate, the fake `X-Forwarded-For` test shows the real client IP, and a large (about 1 GB) video upload goes through ([[open-questions]] #23)
- [ ] **Cron timer** calls `/v1/cron/tick` every 5 minutes (check a tick in the logs), and the service restarts itself after `kill` and after a reboot
- [ ] **Plans (SPEC K):** the owner creates the three plans in Багц with the real prices: 1 сар (30 days), 1 жил (365) and 2 жил (730); the seeded yearly plan is edited or switched off ([[open-questions]] #30)
- [ ] **Support contact:** the owner gives it before launch ([[open-questions]] #26); set `SUPPORT_EMAIL` and the portal contact texts
- [ ] **Comments (SPEC L):** `SUPPORT_EMAIL` is set in production (comments are shown without it, so this is a manual gate before any store submission, [[ADR-0062-comments-without-contact-gate|ADR-0062]]), `COMMENT_BANNED_WORDS` is filled by the owner, the Google Play user-content rules are read and [[R-store-ugc-rules]] is VERIFIED, and the owner knows to check Сэтгэгдэл ▸ Гомдолтой every few days ([[ADR-0061-episode-comments|ADR-0061]])

## Before go-live

- [ ] Bunny switched to the owner's account ([[BUNNY_SWITCH]])
- [ ] First live video without a cover: Bunny's picture appears as the cover within a minute of READY ([[ADR-0069-cover-from-video-picture|ADR-0069]]; the thumbnail URL is TO-VERIFY in [[R-bunny-stream]])
- [ ] `ALERT_EMAILS`, `LOG_FILE` and an uptime monitor configured ([[ADR-0016-monitoring-logs-alert-emails|ADR-0016]])
- [ ] Google Play closed test finished ([[R-google-play-closed-test]])
- [ ] All TO-VERIFY research notes resolved (`/recheck`)
- [ ] Owner approves or replaces every `TODO(owner)` text in the portal: landing copy, the 3 sample covers, privacy policy, terms, contact address on the delete-account page (`apps/portal/src/i18n/mn.ts`, `public/` images)
- [ ] Portal build made with the real `VITE_PUBLIC_URL`; `og.png` and `favicon.svg` regenerated if the brand changes (`pnpm --filter @ongod/portal assets`); Lighthouse re-run on the live site ([[lighthouse-portal]])
- [ ] The privacy and delete-account page addresses are entered in the Play and App Store listings ([[STORE]])
- [ ] **Reachable privacy link (stores need it before submission):** the final domain is decided ([[open-questions]] #9) and `{domain}/privacy` and `{domain}/terms` open without logging in. `EXPO_PUBLIC_PORTAL_URL` is set to that https address in the EAS `production` (and `preview`) environment ([[MOBILE_BUILD]]), so the Welcome terms line and the Profile "Үйлчилгээний нөхцөл" / "Нууцлалын бодлого" links appear (they are hidden while it is empty). Open them from a release build on a phone
