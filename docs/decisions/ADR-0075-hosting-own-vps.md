---
id: ADR-0075
title: Hosting = our own VPS, not iTools shared hosting
status: accepted
date: '2026-11-02'
supersedes: [ADR-0003, ADR-0064 (only items 2 and 3, the iTools Node gate)]
tags: [adr, area/hosting, area/devops]
---

## Context

[[ADR-0003-hosting-itools-node|ADR-0003]] chose iTools Node.js hosting, with a VPS only as a fallback. Its open questions (DB engine, process limits, upload size, the Node version) were never answered ([[R-hosting-limits]]). Ganaa decided on 2026-11-02 to use a VPS from the start. The architecture does not change: one Node process serves the API, portal and admin ([[ADR-0002-api-fastify-prisma-mysql-single-process|ADR-0002]]); it stays because it is simple, not because a host forces it.

## Decision

1. **One VPS** (provider, plan and size not chosen yet; Ubuntu 24.04 LTS assumed) runs everything: the Node process, MySQL 8.4 and a reverse proxy. MySQL listens on localhost only.
2. **Node:** at least 22.23.4 (the Brotli decoder fix, [[R-node-cve-2026-111497]], TO-VERIFY) instead of the old 22.13. `engines` stays `>=22.13.0` until the pin is verified; the server runs the newest Node 22 LTS.
3. **Process:** a `systemd` service that restarts on failure, running as a non-root user with `.env` readable only by that user (mode 600) in `/etc/ongod/`.
4. **Edge:** Caddy (automatic HTTPS) as the reverse proxy; `TRUST_PROXY=true` stays, with the same fake `X-Forwarded-For` test as before.
5. **Cron:** a `systemd` timer calls `POST /v1/cron/tick` on localhost every 5 minutes with the `X-Cron-Secret` header. The endpoint and the in-process job worker are unchanged ([[ADR-0010-reliability-jobs-cron-idempotency|ADR-0010]]).
6. **Safety baseline:** a non-root deploy user with SSH keys only, a firewall (22, 80, 443), `fail2ban`, automatic security updates, a nightly database dump kept off the server, a provider snapshot before risky changes, an uptime monitor on `/health`. Steps are in [[DEPLOY]].
7. **Secrets:** unchanged ([[SECRETS]]), except that the database user and password are now created by us on the VPS, and the app uses a limited user, never MySQL root.

## Alternatives rejected

- **iTools shared Node hosting:** unanswered limits (Node version, upload size, process limits, idle sleeping) and no control of the Node security updates.
- **A managed platform (Vercel + Supabase etc.):** the earlier rejection in ADR-0003 still holds (upload size, cost).

## Consequences

- We now own OS and Node updates, backups, the firewall and uptime. The runbook and [[LAUNCH_CHECKLIST]] carry these as items.
- The "host must run Node 22" launch gate of [[ADR-0064-api-on-node-22|ADR-0064]] becomes a setup step we control. Open questions #2, #5 and #23 are replaced by checks on the real server (see [[open-questions]]).
- Large uploads (tus, 0.5–1.5 GB) need disk space for the temporary file and a proxy that does not buffer or cap request bodies; the first live upload test covers it.
- Provider, plan, region and monthly price are unknown: not stated here until a research note exists.
