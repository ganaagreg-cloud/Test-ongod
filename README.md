# Test-ongod

Express health-check app used to test Node.js hosting on iTools.

## Endpoints
- `GET /health` – uptime and process start time
- `GET /health/db` – `SELECT 1` (`DB_CLIENT=mysql|postgres`)
- `GET /health/outbound` – HTTPS to sg.storage.bunnycdn.com and fcm.googleapis.com
- `GET /cron-test` – requires header `x-cron-secret` equal to `CRON_SECRET`

## Config
Environment variables only. See `.env.example` for placeholders.

## Deploy
1. Push to `main` (auto-deploys to `/test-api.dearlove.mn`).
2. Run `npm install` only when `package.json` changes.
3. Click **Restart App**.

## Deploy test
Auto-deploy marker: test 2 (second push, 2026-10-06). If this line shows up in README.md on the server, Git auto-deploy works.
