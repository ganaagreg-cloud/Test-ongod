# Онгод

Paid, members-only audio/video library. pnpm monorepo.

Read [CLAUDE.md](CLAUDE.md), [docs/SPEC.md](docs/SPEC.md) and [docs/DESIGN.md](docs/DESIGN.md) first.

## Layout

| Path              | What                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| `apps/api`        | Fastify API at `/v1` (will also serve portal at `/` and admin at `/admin`) |
| `apps/admin`      | Admin web (React + Vite, base `/admin/`)                                   |
| `apps/portal`     | Member portal web (React + Vite)                                           |
| `apps/mobile`     | Expo app (dev build) with expo-router                                      |
| `packages/shared` | Shared TS types + zod schemas                                              |
| `packages/tokens` | Design tokens: TS for React Native, `tokens.css` for web                   |

## Requirements

- Node 20.19+ (see `.nvmrc`)
- pnpm 10 (`corepack enable`, version pinned in `package.json`)

## Setup

```sh
pnpm install
cp .env.example .env   # fill in values; never commit .env
```

## Run

```sh
pnpm dev:api       # API on http://localhost:3000 (GET /v1/health)
pnpm dev:portal    # portal on http://localhost:5173, proxies /v1 to the API
pnpm dev:admin     # admin on http://localhost:5174/admin/, proxies /v1 to the API
pnpm dev:mobile    # Expo dev server (needs a dev build, not Expo Go)
```

Mobile dev build (first time, or after adding native modules):

```sh
pnpm --filter @ongod/mobile android
pnpm --filter @ongod/mobile ios     # macOS only
```

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm format:check   # pnpm format to fix
```

## Build and start (production)

```sh
pnpm build   # tokens css, api bundle, admin + portal static builds
pnpm start   # node apps/api/dist/server.js
```

## Design tokens

Edit `packages/tokens/src/index.ts`, then run `pnpm --filter @ongod/tokens build` to regenerate `packages/tokens/css/tokens.css`.
