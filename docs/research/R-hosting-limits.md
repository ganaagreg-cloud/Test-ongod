---
topic: iTools Node.js hosting limits
status: TO-VERIFY
checked:
recheck_after:
source: 'none yet (iTools plan pages / support)'
tags: [research, area/hosting]
---

## Fact

To verify with iTools:

- database engine and version (MySQL 8 vs PostgreSQL)
- cron support (needed for `/v1/cron/tick`)
- process and memory limits
- request upload size and timeout (receipts up to 5 MB, tus chunks)
- whether the Node process is put to sleep when idle

## How it was checked

Not checked yet.

## Used by

- [[ADR-0002-api-fastify-prisma-mysql-single-process|ADR-0002]]
- [[ADR-0003-hosting-itools-node|ADR-0003]]
- [[DEPLOY]]
