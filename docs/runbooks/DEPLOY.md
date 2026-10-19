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
- Payments ([[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]]): `WIRE_API_KEY` (`sk_live_...`), `WIRE_WEBHOOK_SECRET`, `WIRE_ALLOWED_OPERATORS` (the live operator id, e.g. `qpay`); leave `ALLOW_MOCK_PAYMENTS` unset. Without the Wire keys production answers 503 on "choose a plan" (there is no mock). Add the endpoint `<PUBLIC_BASE_URL>/v1/webhooks/wire` in the Wire dashboard for `payment_intent.succeeded`, `payment_intent.canceled` and `payment_intent.payment_failed`. **Before launch: one small real payment, and check the exact amount charged on the bank statement** ([[R-wire-qpay-gateway]]). `RECEIPTS_DIR` stays on persistent disk and in the backup (old bank-transfer receipts, [[ADR-0023-subscription-workflows-implementation|ADR-0023]]); optional `EXPO_ACCESS_TOKEN`
- Admin login is password only ([[ADR-0040-admin-password-only-no-totp|ADR-0040]]): set a long, unique `SEED_OWNER_PASSWORD` before the first deploy

## Steps

1. `pnpm install` (also generates the Prisma client)
2. `pnpm build`: tokens CSS, API bundle, portal and admin static builds. Set `VITE_PUBLIC_URL` (the real https address, no trailing slash) in the environment for this step, and leave `NODE_ENV` unset or `production`: the portal build refuses to run in development mode ([[ADR-0026-web-session-cookie-and-portal|ADR-0026]]). The portal build also writes `.br` and `.gz` copies that the API serves
3. `pnpm --filter @ongod/api db:deploy`: apply migrations (never `migrate dev` or `reset` in production)
4. Start: `node apps/api/dist/server.js` (`pnpm start`)
5. Check `https://<domain>/health` returns `{"status":"ok"}`
6. Cron every 5 minutes: `curl -fsS -X POST -H "X-Cron-Secret: $CRON_SECRET" https://<domain>/v1/cron/tick`
7. Uptime monitor on `/health`

## Rollback

To be written: previous build artifact plus a database backup restore. A backup restore on a clean server is a launch acceptance test ([[LAUNCH_CHECKLIST]]).
