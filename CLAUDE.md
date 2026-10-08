Project: Онгод — a paid, members-only audio/video library app for a Mongolian creator. No free users, no free episodes.

Read docs/SPEC.md and docs/DESIGN.md before any task. If a request conflicts with them, stop and tell me.

Stack: Node 20 + TypeScript. API: Fastify, Prisma, MySQL 8. Admin + Portal: React + Vite. Mobile: Expo (dev build, not Expo Go) + expo-router + react-native-track-player. Shared zod schemas live in packages/shared.

Rules:

- Secrets only in env. Keep .env.example updated with placeholders. Never print or commit secrets.
- All Bunny settings come from env, so the Bunny account can be swapped by changing env only.
- One Node process serves everything: API at /v1, portal at /, admin at /admin (shared hosting, one process).
- The mobile apps (iOS AND Android) never show prices, bank details, plans or payment buttons. Payment happens only in the portal.
- Auth uses proven primitives only: argon2id, google-auth-library, jose + Apple JWKS, and opaque refresh tokens stored as SHA-256 hashes with rotation and reuse detection. No custom crypto.
- Every state change that grants or removes access runs in a DB transaction with a status precondition (idempotent).
- Slow work (Bunny upload, email, push) goes through the Job table, never inside a request.
- Portable DB code: no raw SQL except the job-claim query, no engine-specific types.
- All user-facing text is in Mongolian, kept in per-app i18n files (mn.ts).
- Every endpoint has zod validation, the consistent error shape {error: {code, message}}, and tests for access rules.
- UI must follow the docs/DESIGN.md tokens. No hardcoded colors, sizes or fonts outside packages/tokens.
