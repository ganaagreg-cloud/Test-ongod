---
type: runbook
status: draft
updated: 2026-10-08
tags: [runbook, area/hosting]
---

# Deploy

Draft. Host details are not confirmed yet ([[R-hosting-limits]], [[ADR-0003-hosting-itools-node|ADR-0003]]).

## Environment (set in the host panel, never in git)

All keys are listed in `.env.example`; who generates each one, what a leak or a rotation does, and the handover rules are in [[SECRETS]]. Production specifics:

- `NODE_ENV=production`, `SERVE_STATIC=true`, `TRUST_PROXY=true` (behind the host's proxy)
- `DATABASE_URL` (production MySQL), `CRON_SECRET` (32+ random characters)
- SMTP provider values (`SMTP_*`, `MAIL_FROM`)
- Monitoring: `LOG_FILE`, `ALERT_EMAILS` ([[ADR-0016-monitoring-logs-alert-emails|ADR-0016]])
- Bunny: owner's account values ([[BUNNY_SWITCH]])
- Payments: `BANK_NAME`, `BANK_ACCOUNT`, `BANK_ACCOUNT_HOLDER` (the API refuses to start in production without them); `RECEIPTS_DIR` on persistent disk and **in the backup** (receipt images are only there, [[ADR-0023-subscription-workflows-implementation|ADR-0023]]); optional `EXPO_ACCESS_TOKEN`
- Admin 2FA: `TOTP_ISSUER`. After the first deploy the OWNER logs in once and sets up the authenticator before anyone else can ([[ADR-0022-admin-totp-session-proof|ADR-0022]])

## Steps

1. `pnpm install` (also generates the Prisma client)
2. `pnpm build`: tokens CSS, API bundle, portal and admin static builds. Set `VITE_PUBLIC_URL` (the real https address, no trailing slash) in the environment for this step, and leave `NODE_ENV` unset or `production`: the portal build refuses to run in development mode ([[ADR-0026-web-session-cookie-and-portal|ADR-0026]]). The portal build also writes `.br` and `.gz` copies that the API serves
3. `pnpm --filter @ongod/api db:deploy`: apply migrations (never `migrate dev` or `reset` in production)
   3b. First deploy only: `pnpm --filter @ongod/api ops:bootstrap` creates the OWNER, the Plan and the minimum app versions if they are missing (it never overwrites). Pass the values in the environment of that one command (`BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_PASSWORD` of at least 12 characters, `BOOTSTRAP_OWNER_FIRST_NAME`, `BOOTSTRAP_OWNER_LAST_NAME`, `BOOTSTRAP_OWNER_PHONE`, `BOOTSTRAP_PLAN_NAME`, `BOOTSTRAP_PLAN_DAYS`, `BOOTSTRAP_PLAN_PRICE_MNT`). The price is the client's decision, there is no default. Never run `db:seed` against production: it refuses. Then log in to `/admin` and set up the authenticator at once ([[ADR-0022-admin-totp-session-proof|ADR-0022]]).
4. Start: `node apps/api/dist/server.js` (`pnpm start`)
5. Check `https://<domain>/health` returns `{"status":"ok"}`
6. Cron every 5 minutes: `curl -fsS -X POST -H "X-Cron-Secret: $CRON_SECRET" https://<domain>/v1/cron/tick`
7. Uptime monitor on `/health`

## Rollback

Previous build artifact (keep the last two `dist` folders) plus a database restore from the latest backup ([[BACKUP]]). A backup restore on a clean server is a launch acceptance test ([[LAUNCH_CHECKLIST]]); it has not been done yet.
