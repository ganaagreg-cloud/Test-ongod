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

- `NODE_ENV=production`, `SERVE_STATIC=true`, `TRUST_PROXY=true` (behind the host's proxy). `TRUST_PROXY=true` trusts every hop of `X-Forwarded-For`: on the host, verify that the proxy overwrites that header (send a request with a fake `X-Forwarded-For` and check the logged IP). If it does not, a client can pick its own IP, the per-IP and identifier+IP rate limits can be dodged, and only `AUTH_RATE_LIMIT_IDENTIFIER_CEILING` holds ([[ADR-0045-audit-hardening-limits-refresh-jobs-payments|ADR-0045]])
- Known limit: two portal tabs refreshing at the same moment can leave the cookie holding a revoked refresh token, so the member must log in again (the same as before ADR-0045)
- `DATABASE_URL` (production MySQL), `CRON_SECRET` (32+ random characters)
- SMTP provider values (`SMTP_*`, `MAIL_FROM`)
- Monitoring: `LOG_FILE`, `ALERT_EMAILS` ([[ADR-0016-monitoring-logs-alert-emails|ADR-0016]])
- Bunny: owner's account values ([[BUNNY_SWITCH]])
- Payments ([[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]]): `WIRE_API_KEY` (`sk_live_...`), `WIRE_WEBHOOK_SECRET`, `WIRE_ALLOWED_OPERATORS` (the live operator id, e.g. `qpay`); leave `ALLOW_MOCK_PAYMENTS` unset. Without the Wire keys production answers 503 on "choose a plan" (there is no mock). Add the endpoint `<PUBLIC_BASE_URL>/v1/webhooks/wire` in the Wire dashboard for `payment_intent.succeeded`, `payment_intent.canceled` and `payment_intent.payment_failed`. **Before launch: one small real payment, and check the exact amount charged on the bank statement** ([[R-wire-qpay-gateway]]). Optional: `EXPO_ACCESS_TOKEN`
- Added by [[ADR-0045-audit-hardening-limits-refresh-jobs-payments|ADR-0045]] (defaults are fine, set only to change them): `JOB_LOCK_TIMEOUT_MS` (7200000, 2 h: longer than the slowest video upload), `AUTH_RATE_LIMIT_IDENTIFIER_CEILING` (100 attempts per identifier per window, from any IP), `REFRESH_GRACE_SECONDS` (10)
- Added by [[ADR-0054-refresh-limit-per-device|ADR-0054]] (default is fine): `AUTH_REFRESH_DEVICE_MAX` (60 token refreshes per device per `AUTH_RATE_LIMIT_WINDOW_SECONDS`; no per-IP count)
- Added by [[ADR-0047-wire-payment-sync-window|ADR-0047]] (default is fine): `WIRE_SYNC_BUDGET_MS` (20000: time the cron tick may spend asking Wire about waiting payments)
- Admin login is password only ([[ADR-0040-admin-password-only-no-totp|ADR-0040]]): set a long, unique `SEED_OWNER_PASSWORD` before the first deploy

## Pre-deploy checks

- Before deploying [[ADR-0046-remove-bank-transfer-path|ADR-0046]] run `SELECT COUNT(*) FROM Subscription WHERE status = 'PAYMENT_SUBMITTED'`; it must be 0, because such a request could no longer be decided (there is no admin screen for it any more). If it is not 0, decide each such request by hand before deploying, or ask Ganaa. The iTools TEST database probably still has the seeded `saraa` request: delete that seed row there first. The old `RECEIPTS_DIR` folder is no longer read; keep it with the last backup until the owner deletes it. `RECEIPTS_DIR` and `BANK_*` can be removed from the production `.env` (unknown keys are ignored)

## Steps

1. `pnpm install` (also generates the Prisma client)
2. `pnpm build`: tokens CSS, API bundle, portal and admin static builds. Set `VITE_PUBLIC_URL` (the real https address, no trailing slash) in the environment for this step, and leave `NODE_ENV` unset or `production`: the portal build refuses to run in development mode ([[ADR-0026-web-session-cookie-and-portal|ADR-0026]]). The portal build also writes `.br` and `.gz` copies that the API serves
3. `pnpm --filter @ongod/api db:deploy`: apply migrations (never `migrate dev` or `reset` in production). Migration `20261023090000_drop_totp_columns` drops columns the OLD build still selects: restart the app immediately after `db:deploy`, because sign-in and refresh fail between the migration and the restart
4. Start: `node apps/api/dist/server.js` (`pnpm start`)
5. Check `https://<domain>/health` returns `{"status":"ok"}`
6. Cron every 5 minutes: `curl -fsS --max-time 120 -X POST -H "X-Cron-Secret: $CRON_SECRET" https://<domain>/v1/cron/tick` (a tick can take about 50 s: payment sync budget 20 s plus one 10 s Wire call, then the job drain)
7. Uptime monitor on `/health`

## Rollback

To be written: previous build artifact plus a database backup restore. A backup restore on a clean server is a launch acceptance test ([[LAUNCH_CHECKLIST]]).
