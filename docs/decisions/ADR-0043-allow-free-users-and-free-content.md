---
id: ADR-0043
title: 'Allow free users and free content'
status: accepted
date: '2026-10-23'
tags: [adr, area/product, area/api, area/mobile, area/portal]
---

## Context

CLAUDE.md line 1 says "No free users, no free episodes", [[SPEC]] lists "free episodes" as out of scope and says playback requires active access. That is too strict for what the owner wants to publish: one-time or sample content that anyone can open, and users who have not paid. [[ADR-0042-content-organisation-and-publish-push|ADR-0042]] left this to phase 2 ("free content, logged-out access") and said it waits for Ganaa to edit CLAUDE.md. Ganaa decided on 2026-10-23 to lift the restriction.

## Decision

- Free users and free content are allowed. The product is no longer "members only, nothing free".
- A free item can be any item the owner marks free (including one-time content), not only an episode.
- Paid content stays as it is: playback needs active access ([[ADR-0007-access-model-reference-codes|ADR-0007]]). The rule "the mobile apps never show prices, bank details, plans or payment buttons" ([[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]], [[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]]) is unchanged.
- This ADR only lifts the restriction. The design is decided in the phase 2 plan and its own ADRs: whether free content needs a login, whether the mark is per item, series or playlist, mobile behavior, stats and the device limit, and the price in [[changes]].
- CLAUDE.md line 1 and [[SPEC]] (intro, out-of-scope list, workflows, data model) are edited when the phase 2 plan is written, after Ganaa approves the diff.

## Alternatives rejected

- Keep "no free content": blocks one-time and sample content the owner wants.
- Free content only for logged-in users, decided here: that is a design detail with store and abuse consequences; left to the phase 2 plan.
- Free means a separate free app or site: duplicates the catalog and splits the audience.

## Consequences

- A free episode must be playable without active access, so the access check, the signed-URL rules ([[ADR-0004-media-bunny-token-auth|ADR-0004]]) and the no-access state change in phase 2. Tests for access rules must cover free and paid items.
- The "no free episodes" lines in CLAUDE.md and SPEC become wrong and must be edited, or they will conflict with the code.
- The content-management change in [[changes]] (2026-10-21) now includes free content; its price is still set by Ganaa.
- Bunny cost and abuse risk rise if free items need no login ([[R-bunny-pricing]]; TO-VERIFY in the phase 2 plan).

## Evidence

- [[R-apple-no-payment-ui]] (VERIFIED 2026-10-21): free content or a free tier is allowed in a reader app; no prices or payment wording in the app.
- [[ADR-0042-content-organisation-and-publish-push|ADR-0042]]: phase 2 was reserved for free content.
