---
type: glossary
tags: [glossary]
---

# Glossary

- **Онгод:** the app and brand.
- **Owner / client:** the Mongolian creator who owns the content (QPay payments are granted automatically).
- **Portal:** the member website (sign up, plans, QPay checkout, status). The only place with payment UI ([[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]]).
- **Admin:** the owner's web tool at `/admin` (payments list, users, episodes), light theme ([[ADR-0014-admin-light-theme|ADR-0014]]).
- **Төлсөн:** the old bank-transfer "Paid" button, removed by [[ADR-0046-remove-bank-transfer-path|ADR-0046]]; PAYMENT_SUBMITTED is left only on old rows.
- **Reference code:** `ONG-XXXXX`, identifies a request in the portal and admin (once written in the bank transfer description) ([[ADR-0007-access-model-reference-codes|ADR-0007]]).
- **accessUntil:** cached end of the user's current access period.
- **PENDING_PAYMENT / PAYMENT_SUBMITTED / ACTIVE / EXPIRED:** subscription statuses ([[SPEC#Data model (Prisma)]]).
- **MANUAL_GRANT:** access given without payment (gift, store reviewer demo).
- **Storage Zone / Pull Zone:** Bunny file storage and the CDN in front of it ([[ADR-0004-media-bunny-token-auth|ADR-0004]]).
- **Token Authentication:** Bunny signed, expiring media URLs ([[R-bunny-token-auth]]).
- **Dev build:** an Expo app build that includes native modules; Expo Go cannot run them ([[ADR-0001-mobile-react-native-expo|ADR-0001]]).
- **EAS:** Expo's cloud build service ([[R-eas-free-tier]]).
- **Job:** a row in the `Job` table for slow work (email, upload processing, push), run by the worker.
- **SKIP LOCKED:** MySQL locking option that lets several workers claim different jobs safely ([[R-mysql-skip-locked-claim]]).
- **Cron tick:** `POST /v1/cron/tick`, called by the host every few minutes to run idempotent scheduled tasks.
- **Idempotent:** running it twice has the same effect as once.
- **ADR:** Architecture Decision Record, a note in `decisions/`.
- **Research note:** one verified (or to-verify) external fact, in `research/`.
