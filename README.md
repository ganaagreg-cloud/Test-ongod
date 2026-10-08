# Онгод

Paid, members-only audio/video library. pnpm monorepo.

Read [CLAUDE.md](CLAUDE.md), [docs/SPEC.md](docs/SPEC.md) and [docs/DESIGN.md](docs/DESIGN.md) first.

## Layout

| Path              | What                                                                             |
| ----------------- | -------------------------------------------------------------------------------- |
| `apps/api`        | Fastify API at `/v1`; in production also serves portal at `/`, admin at `/admin` |
| `apps/admin`      | Admin web (React + Vite, base `/admin/`)                                         |
| `apps/portal`     | Member portal web (React + Vite)                                                 |
| `apps/mobile`     | Expo app (dev build) with expo-router                                            |
| `packages/shared` | Shared TS types + zod schemas                                                    |
| `packages/tokens` | Design tokens: TS for React Native, `tokens.css` for web                         |

## Requirements

- Node 20.19+ (see `.nvmrc`)
- pnpm 10 (`corepack enable`, version pinned in `package.json`)
- Docker (local MySQL 8 + Mailpit)

## Setup

```sh
pnpm install                 # also generates the Prisma client
cp .env.example .env         # fill in values; never commit .env
docker compose up -d         # MySQL on :3306, Mailpit SMTP :1025, UI http://localhost:8025
pnpm --filter @ongod/api db:deploy   # apply migrations
pnpm --filter @ongod/api db:seed     # demo data (passwords from SEED_* in .env)
```

The MySQL init script (`docker/mysql/init`) runs only when the `mysql-data` volume is first created. It creates `ongod_test` and lets the app user create Prisma's shadow database.

## Run

```sh
pnpm dev:api       # API on http://localhost:3000 (GET /health, GET /v1/app-config)
pnpm dev:portal    # portal on http://localhost:5173, proxies /v1 to the API
pnpm dev:admin     # admin on http://localhost:5174/admin/, proxies /v1 to the API
pnpm dev:mobile    # Expo dev server (needs a dev build, not Expo Go)
```

Emails sent in development land in Mailpit: http://localhost:8025.

Mobile dev build (first time, or after adding native modules):

```sh
pnpm --filter @ongod/mobile android
pnpm --filter @ongod/mobile ios     # macOS only
```

## Database

```sh
pnpm --filter @ongod/api db:migrate   # after editing prisma/schema.prisma: create + apply a migration
pnpm --filter @ongod/api db:deploy    # apply existing migrations (production too)
pnpm --filter @ongod/api db:seed      # idempotent demo data
pnpm --filter @ongod/api db:studio    # browse data
```

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm format:check   # pnpm format to fix
pnpm test           # unit + API tests (API tests need docker compose up)
pnpm test:e2e       # Playwright (first time: pnpm --filter @ongod/portal test:e2e:install)
```

API tests use `TEST_DATABASE_URL` (its name must end in `_test`). Migrations are applied once per run, and every table is emptied before each test. If the test schema drifts (for example after editing an existing migration), reset it yourself: `DATABASE_URL=<TEST_DATABASE_URL> pnpm --filter @ongod/api db:reset`. This drops all data in that database.

`pnpm test:e2e` opens the dev-only page `/dev/ui` in the portal, checks that Lora and Inter render Mongolian Ө/Ү, and saves `docs/screens/font-check-web.png`.

## Jobs and cron

Slow work (email, later Bunny uploads and push) is queued in the `Job` table and run by an in-process worker (`JOB_WORKER_ENABLED`). Schedule this every 5 minutes on the host:

```sh
curl -fsS -X POST -H "X-Cron-Secret: $CRON_SECRET" https://<domain>/v1/cron/tick
```

It runs the scheduled tasks (all idempotent) and also drains due jobs, so jobs still run if the host idles the Node process.

## Monitoring

- **Logs:** JSON lines on stdout (shown by Plesk). Set `LOG_FILE` (e.g. `/var/www/vhosts/<domain>/logs/ongod/api.log`) to also write `api.YYYY-MM-DD.N.log`, rotated daily or at `LOG_FILE_MAX_SIZE`, keeping the newest `LOG_FILE_COUNT`. Each request line has a `reqId`, also returned to clients as `X-Request-Id`.
- **Alert emails:** set `ALERT_EMAILS` and the owner/admins get an email for every unexpected server error (5xx) and every job that fails permanently. Each email includes the request ID to search the log file with. The same error is sent at most once per `ALERT_THROTTLE_MINUTES`. Alerts go through the job queue; a failed alert never triggers another alert.
- **Uptime:** point a free uptime checker (UptimeRobot, Plesk monitoring) at `https://<domain>/health`; it returns 503 when the database is unreachable. This also covers "database down", when alert emails cannot be queued.
- **Sentry (optional):** set `SENTRY_DSN` to also send errors to Sentry.

## Build and start (production)

```sh
pnpm build                          # tokens css, api bundle, admin + portal static builds
pnpm --filter @ongod/api db:deploy  # apply migrations
pnpm start                          # node apps/api/dist/server.js
```

In production, set `SERVE_STATIC=true` so the one Node process serves the API at `/v1`, the portal at `/` and the admin at `/admin`. Env comes from the host (Plesk). To try a production build locally: `cd apps/api && node --env-file=../../.env dist/server.js`.

## Design tokens

Edit `packages/tokens/src/index.ts`, then run `pnpm --filter @ongod/tokens build` to regenerate `packages/tokens/css/tokens.css` and `packages/tokens/css/fonts.css`.

Fonts: mobile loads Lora/Inter from `@expo-google-fonts` (one family name per weight, see `nativeFontFamily`). Web self-hosts them from Fontsource via the generated `fonts.css` (latin, cyrillic and cyrillic-ext subsets; Mongolian Ө/Ү are only in cyrillic-ext).
