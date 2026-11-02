---
topic: iTools Node.js hosting limits (no longer used)
status: SUPERSEDED
checked:
recheck_after:
source: 'none; the questions were never answered'
tags: [research, area/hosting]
---

## Fact

Not used any more. Ganaa decided on 2026-11-02 to host on our own VPS ([[ADR-0075-hosting-own-vps|ADR-0075]]), so the iTools questions below were dropped without an answer:

- database engine and version, cron support, process and memory limits, upload size and timeout, idle sleeping, the Node version the host can run.

For the VPS the equivalent checks are done on the real server, listed in [[DEPLOY]] and [[LAUNCH_CHECKLIST]].

## How it was checked

Not checked. Kept for history.

## Used by

- [[ADR-0002-api-fastify-prisma-mysql-single-process|ADR-0002]]
- [[ADR-0003-hosting-itools-node|ADR-0003]] (superseded)
- [[DEPLOY]]
