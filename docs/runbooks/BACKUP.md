---
type: runbook
status: draft, restore NOT yet tested
updated: 2026-10-09
tags: [runbook, area/hosting, launch]
---

# Backup and restore

Draft from the audit of 2026-10-09 (F-01). **A restore has never been run.** The launch acceptance test "a backup was restored once on a clean server" ([[LAUNCH_CHECKLIST]]) stays unticked until the table at the bottom is filled in. What the host (iTools) offers for backups is UNVERIFIED ([[R-hosting-limits]]).

## What must be in the backup

| What               | Where                                           | If lost                                                                                            |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The MySQL database | `DATABASE_URL`                                  | Everything: users, access, payments, audit log, episodes                                           |
| Receipt images     | `RECEIPTS_DIR` (absolute path, persistent disk) | The proof of every payment; they exist only here ([[ADR-0023-subscription-workflows-implementation | ADR-0023]]) |
| The env values     | host panel + shared vault ([[SECRETS]])         | The app cannot start; `JWT_ACCESS_SECRET` and the Bunny keys must be the same or regenerated       |
| `UPLOADS_DIR`      | working folder                                  | Only unfinished uploads; audio already sent to Bunny is safe. Not needed in the backup             |
| Media files        | Bunny storage zone                              | Has its own redundancy; keep the originals with the creator                                        |

## Back up (every night)

1. Database dump, on a machine that can reach the database:
   `mysqldump --single-transaction --routines --default-character-set=utf8mb4 -h <host> -u <user> -p <database> | gzip > ongod-YYYY-MM-DD.sql.gz`
   (the password is typed or read from a protected option file, never put on the command line in a script that is logged).
2. Copy `RECEIPTS_DIR` to the same place: `tar czf receipts-YYYY-MM-DD.tar.gz <RECEIPTS_DIR>`.
3. Copy both files **off the server** (another provider or the owner's storage). A backup on the same disk is not a backup.
4. Keep 14 daily and 6 monthly copies. Receipts hold personal data: encrypt the off-site copy and restrict who can open it.
5. Check that the file exists and is not empty after each run (a monitor email on failure).

## Restore (clean server)

1. Install Node 20, pnpm, and clone the repository at the release that matches the dump (`git checkout <tag>`).
2. Create an empty MySQL 8 database with `utf8mb4` and the `utf8mb4_unicode_ci` collation.
3. `gunzip -c ongod-YYYY-MM-DD.sql.gz | mysql -h <host> -u <user> -p <database>`
4. Unpack the receipts into the new `RECEIPTS_DIR`.
5. Set the env from the vault. Do **not** run `db:seed` or `ops:bootstrap` (the data is already there). Run `pnpm --filter @ongod/api db:deploy` to apply any newer migrations.
6. `pnpm install && pnpm build`, start, and check `/health`.
7. Check: the OWNER can sign in to `/admin` (TOTP seed is in the database), the payments queue shows the old requests, a receipt image opens, a member with active access can play an episode.

## Restore test log

| Date | Who | Source backup | Clean server | Result   |
| ---- | --- | ------------- | ------------ | -------- |
|      |     |               |              | not done |
