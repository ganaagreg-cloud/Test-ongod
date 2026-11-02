---
type: runbook
status: draft
updated: 2026-11-02
tags: [runbook, area/hosting, area/devops]
---

# Deploy (own VPS)

Draft. Hosting is one VPS of our own ([[ADR-0075-hosting-own-vps|ADR-0075]], replaces [[ADR-0003-hosting-itools-node|ADR-0003]]). **None of the commands below has been run on a real server yet**; the first run is the test. Provider, plan and region are not chosen. Ubuntu 24.04 LTS is assumed.

Rules for working on the server:

- Take a provider **snapshot** before the hardening steps and before every risky change.
- Keep a **second SSH window open** while changing SSH or firewall settings; know where the provider's web console is.
- Never paste secrets, `.env` contents or private keys into a chat or into git. Type them on the server.
- Claude Code may help from your own computer through `ssh <alias> "<command>"` with each command approved, as a limited user. It is not installed on the server.

## 1. Server (once)

1. Create the VPS (Ubuntu 24.04 LTS). Add your SSH public key in the provider panel. Note the IP; point the domain's `A` record at it ([[open-questions]] #9 for the final domain).
2. As root, once: create a user `deploy` with `sudo`, copy the authorized key to it, then in `/etc/ssh/sshd_config.d/` set `PermitRootLogin no` and `PasswordAuthentication no`; reload `ssh`. **Test a new SSH session as `deploy` before closing the root one.**
3. Firewall: `ufw default deny incoming`, allow `OpenSSH`, `80/tcp`, `443/tcp`, then `ufw enable`.
4. `apt install fail2ban unattended-upgrades`, enable the automatic security updates. Reboot once after the first full upgrade.
5. Create the service user and folders: a system user `ongod` (no login shell), `/srv/ongod` (the app), `/etc/ongod` (mode 750, owner `root:ongod`) for the env file, `/var/backups/ongod` (mode 700).

## 2. Runtime

- **Node:** the newest Node 22 LTS, at least 22.23.4 ([[R-node-cve-2026-111497]], TO-VERIFY). Install from a maintained repository (for example NodeSource `setup_22.x`) or a version manager, then check `node -v`. Enable `pnpm` with `corepack enable`. The API needs 22.13 or newer ([[ADR-0064-api-on-node-22|ADR-0064]]).
- **MySQL:** we test on 8.4. ASSUMPTION: Ubuntu 24.04's own `mysql-server` is 8.0; check with `apt policy mysql-server`, and install 8.4 from the MySQL APT repository (or decide on 8.0 in an ADR). Keep it on localhost (`bind-address = 127.0.0.1`), run `mysql_secure_installation`, then as MySQL root create the database and a limited user:

  ```sql
  CREATE DATABASE ongod CHARACTER SET utf8mb4;
  CREATE USER 'ongod'@'localhost' IDENTIFIED BY '<long random password>';
  GRANT ALL PRIVILEGES ON ongod.* TO 'ongod'@'localhost';
  ```

  The app's `DATABASE_URL` uses this user, never MySQL root. `ALL` on its own database is needed for `db:deploy` migrations.

- **Caddy** (reverse proxy and automatic HTTPS): install from Caddy's apt repository. `/etc/caddy/Caddyfile`:

  ```
  <domain> {
      encode zstd gzip
      reverse_proxy 127.0.0.1:3000
  }
  ```

  Caddy streams request bodies and sets no body-size limit by default, which the tus video uploads need. Check the real behaviour with the first large upload ([[open-questions]] #23).

## 3. Environment (`/etc/ongod/ongod.env`, mode 640, owner `root:ongod`, never in git)

All keys are listed in `.env.example`; who generates each one, what a leak or a rotation does, and the handover rules are in [[SECRETS]]. Production specifics:

- `NODE_ENV=production`, `SERVE_STATIC=true`, `PORT=3000`, `HOST=127.0.0.1` (only Caddy talks to the app), `TRUST_PROXY=true`. `TRUST_PROXY=true` trusts every hop of `X-Forwarded-For`: after the first start, send a request with a fake `X-Forwarded-For` and check the IP the app logs. If a client can pick its own IP, the per-IP and identifier+IP rate limits can be dodged and only `AUTH_RATE_LIMIT_IDENTIFIER_CEILING` holds ([[ADR-0045-audit-hardening-limits-refresh-jobs-payments|ADR-0045]])
- Known limit: two portal tabs refreshing at the same moment can leave the cookie holding a revoked refresh token, so the member must log in again (the same as before ADR-0045)
- `DATABASE_URL` (the `ongod` MySQL user above), `CRON_SECRET` (32+ random characters)
- SMTP provider values (`SMTP_*`, `MAIL_FROM`)
- Monitoring: `LOG_FILE` (a path the `ongod` user can write, for example `/var/log/ongod/app.log`), `ALERT_EMAILS` ([[ADR-0016-monitoring-logs-alert-emails|ADR-0016]])
- Bunny: owner's account values ([[BUNNY_SWITCH]])
- Payments ([[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]]): `WIRE_API_KEY` (`sk_live_...`), `WIRE_WEBHOOK_SECRET`, `WIRE_ALLOWED_OPERATORS` (the live operator id, e.g. `qpay`); leave `ALLOW_MOCK_PAYMENTS` unset (set in production, the API refuses to start). **Without the Wire keys payments are off** ([[ADR-0072-payments-off-until-launch|ADR-0072]]): the portal shows the plans with "Удахгүй нээгдэнэ" and no buy or gift buttons, the API answers 503 to a payment request. This is how the first deploy for store review runs; adding the keys later and restarting opens payments. Add the endpoint `<PUBLIC_BASE_URL>/v1/webhooks/wire` in the Wire dashboard for `payment_intent.succeeded`, `payment_intent.canceled` and `payment_intent.payment_failed`. **Before launch: one small real payment, and check the exact amount charged on the bank statement** ([[R-wire-qpay-gateway]]). Optional: `EXPO_ACCESS_TOKEN`
- Added by [[ADR-0045-audit-hardening-limits-refresh-jobs-payments|ADR-0045]] (defaults are fine, set only to change them): `JOB_LOCK_TIMEOUT_MS` (7200000, 2 h: longer than the slowest video upload), `AUTH_RATE_LIMIT_IDENTIFIER_CEILING` (100 attempts per identifier per window, from any IP), `REFRESH_GRACE_SECONDS` (10)
- Added by [[ADR-0054-refresh-limit-per-device|ADR-0054]] (default is fine): `AUTH_REFRESH_DEVICE_MAX` (60 token refreshes per device per `AUTH_RATE_LIMIT_WINDOW_SECONDS`; no per-IP count)
- Added by [[ADR-0047-wire-payment-sync-window|ADR-0047]] (default is fine): `WIRE_SYNC_BUDGET_MS` (20000: time the cron tick may spend asking Wire about waiting payments)
- Admin login is password only ([[ADR-0040-admin-password-only-no-totp|ADR-0040]]): set a long, unique `SEED_OWNER_PASSWORD` before the first deploy

## 4. Deploy

Put each release in its own folder so a bad one can be undone: `/srv/ongod/releases/<git short hash>/`, with `/srv/ongod/current` a symlink to the active one. As `deploy`:

1. `git clone` (or `git fetch`) the tagged release into a new release folder.
2. `pnpm install --frozen-lockfile` (also generates the Prisma client).
3. `pnpm build`: tokens CSS, API bundle, portal and admin static builds. Set `VITE_PUBLIC_URL` (the real https address, no trailing slash) in the environment for this step, and leave `NODE_ENV` unset or `production`: the portal build refuses to run in development mode ([[ADR-0026-web-session-cookie-and-portal|ADR-0026]]). The portal build also writes `.br` and `.gz` copies that the API serves.
4. **Back up the database first** (see section 6), then `pnpm --filter @ongod/api db:deploy` with the env loaded: applies migrations (never `migrate dev` or `reset` in production). Migration `20261023090000_drop_totp_columns` drops columns the OLD build still selects: restart the app immediately after `db:deploy`, because sign-in and refresh fail between the migration and the restart.
5. Switch the `current` symlink to the new release and `sudo systemctl restart ongod`.
6. Smoke test: `https://<domain>/health` returns `{"status":"ok"}`; sign in to the portal and the admin; open one episode.

`/etc/systemd/system/ongod.service`:

```
[Unit]
Description=Ongod API, portal and admin
After=network.target mysql.service

[Service]
User=ongod
WorkingDirectory=/srv/ongod/current
EnvironmentFile=/etc/ongod/ongod.env
ExecStart=/usr/bin/node apps/api/dist/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

The app must be able to write its upload folder and `LOG_FILE`; check the exact paths on the first start and adjust `ReadWritePaths`/folders (uploads are temporary: media lives in Bunny).

## 5. Cron and monitoring

- **Cron tick:** a `systemd` timer (every 5 minutes) runs `curl -fsS --max-time 120 -X POST -H "X-Cron-Secret: $CRON_SECRET" http://127.0.0.1:3000/v1/cron/tick`, reading the secret from the env file. A tick can take about 50 s: payment sync budget 20 s plus one 10 s Wire call, then the job drain.
- **Uptime monitor** on `https://<domain>/health` (a free external service), alerting by email or SMS.
- **Logs:** `journalctl -u ongod` plus the rotating `LOG_FILE`; limit the journal size so the disk cannot fill. Add a disk-space alert at 80 %.

## 6. Backups

- Nightly (cron or timer, as a user that can read the database): `mysqldump --single-transaction --routines` for the `ongod` database, compressed, into `/var/backups/ongod`; keep 14 days.
- Copy each dump **off the server** (for example to Bunny Storage or another provider; the destination is not chosen). A dump that lives only on the VPS is lost with the VPS.
- Provider snapshots before risky changes.
- **A restore on a clean database is a launch acceptance test** ([[LAUNCH_CHECKLIST]]): restore the latest dump into a scratch database, start the app against it, sign in.

## 7. Rollback

- Code only (the migration was backward compatible): point `current` back at the previous release and restart.
- A migration that cannot be undone by the old build: restore the dump taken in step 4 of the deploy, then switch the release back. Migrations are forward-only; say so in the release notes of any change that is not backward compatible.

## 8. Updates routine (monthly, and on any Node security release)

1. Snapshot, then `apt update && apt upgrade`; reboot if the kernel changed.
2. Check `node -v` against the newest Node 22 release notes ([[R-node-cve-2026-111497]] for the current minimum); update Node, then **restart the service** (an updated binary does not help a running process).
3. Smoke test (section 4, step 6), check the uptime monitor and `journalctl -u ongod -n 100`.

## Pre-deploy checks (existing data only)

- On a database that already had data (not a fresh VPS): before deploying [[ADR-0046-remove-bank-transfer-path|ADR-0046]] run `SELECT COUNT(*) FROM Subscription WHERE status = 'PAYMENT_SUBMITTED'`; it must be 0, because such a request could no longer be decided. Delete the seeded `saraa` request from any old test database before it is used for real data. The old `RECEIPTS_DIR` folder is no longer read, and `RECEIPTS_DIR` and `BANK_*` can be removed from the `.env` (unknown keys are ignored).
