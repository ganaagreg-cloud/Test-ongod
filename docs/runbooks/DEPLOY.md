---
type: runbook
status: draft
updated: 2026-10-08
tags: [runbook, area/hosting]
---

# Deploy

Draft. Host details are not confirmed yet ([[R-hosting-limits]], [[ADR-0003-hosting-itools-node|ADR-0003]]).

## Environment (set in the host panel, never in git)

All keys are listed in `.env.example`. Production specifics:

- `NODE_ENV=production`, `SERVE_STATIC=true`, `TRUST_PROXY=true` (behind the host's proxy)
- `DATABASE_URL` (production MySQL), `CRON_SECRET` (32+ random characters)
- SMTP provider values (`SMTP_*`, `MAIL_FROM`)
- Monitoring: `LOG_FILE`, `ALERT_EMAILS` ([[ADR-0016-monitoring-logs-alert-emails|ADR-0016]])
- Bunny: owner's account values ([[BUNNY_SWITCH]])

## Steps

1. `pnpm install` (also generates the Prisma client)
2. `pnpm build`: tokens CSS, API bundle, portal and admin static builds
3. `pnpm --filter @ongod/api db:deploy`: apply migrations (never `migrate dev` or `reset` in production)
4. Start: `node apps/api/dist/server.js` (`pnpm start`)
5. Check `https://<domain>/health` returns `{"status":"ok"}`
6. Cron every 5 minutes: `curl -fsS -X POST -H "X-Cron-Secret: $CRON_SECRET" https://<domain>/v1/cron/tick`
7. Uptime monitor on `/health`

## Rollback

To be written: previous build artifact plus a database backup restore. A backup restore on a clean server is a launch acceptance test ([[LAUNCH_CHECKLIST]]).
