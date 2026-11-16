---
id: ADR-0107
title: 'We filled the gaps in the client legal texts, from what the product does'
status: accepted
date: '2026-11-16'
tags: [adr, area/portal, area/store]
---

## Context

[[ADR-0106-client-app-icon-and-legal-texts|ADR-0106]] put the client's texts in word for word and listed their gaps. Ganaa asked us to fill them ("can u just do it for me", 2026-11-16).

## Decision

Terms (portal `mn.ts`):

1. **3.2** the placeholders are replaced by an age of **16** with a legal-representative rule. This is **our assumption, not a decision of the owner**: the project records no age limit, and it must equal the App Store and Google Play age answers. One number to change.
2. **3.4** the promise of one video at a time is removed: the product limits only the signed-in devices (2, [[ADR-0018-auth-implementation-details|ADR-0018]]), it does not limit simultaneous playback.
3. **5.1 and 5.2** added from [[SPEC]] K: renewal is a manual payment, nothing is charged automatically, access ends when the period ends.

Privacy:

4. **Section 3** (was missing): Google and Apple sign-in, push tokens (a switch on Профайл, notifications kept 90 days). **Section 4** completed and its provider kinds named (video and audio delivery, e-mail, Apple and Google push, QPay). **Section 7** added: how to delete an account (same text as the delete page) and how to ask for a correction or a copy.
5. The wording is ours, based on [[SPEC]] and the delete page; the client's own sentences stay as they were.

## Consequences

Still for the owner and a lawyer: the age limit, the legal check of every added sentence, the error-reporting service (not named: it is optional), the end of the TODO box and the date. Needs a portal deploy.
