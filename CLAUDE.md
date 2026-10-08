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

## Project memory (docs/ is an Obsidian vault)

Home: docs/00-Index.md.

- Before researching ANY external fact (prices, store rules, library APIs, platform limits), search docs/research and docs/decisions first. If a note exists and its recheck_after is in the future, use it and cite it as [[R-...]]. Do not search the web for it again.
- Never state a price, store rule or platform limit without a research note marked VERIFIED (with source and date), or clearly say it is an ASSUMPTION / TO-VERIFY.
- Any new technical decision, or a change to an existing one, gets an ADR in docs/decisions. Accepted ADRs are never edited; they are superseded by a new ADR.
- If a task conflicts with SPEC.md, DESIGN.md or an accepted ADR, stop and tell me before writing code.
- At the end of every task or session, update today's log in docs/log (use /log). Include commit hashes and test results.
- Client requests that change scope go to docs/client/changes.md with in-scope yes/no and a price, never straight into code.
- Never put secrets, passwords, tokens or personal customer data in docs/. Use placeholders.
- Use [[wikilinks]] between notes; keep notes short and factual.
