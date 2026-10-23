---
id: ADR-0044
title: 'Free items (per item, login required) and an activate message for paid items in the app'
status: accepted
date: '2026-10-23'
tags: [adr, area/product, area/mobile, area/api, area/store]
---

## Context

[[ADR-0043-allow-free-users-and-free-content|ADR-0043]] allows free users and free content. Ganaa answered the open design questions on 2026-10-23: free items need a login (no logged-out access), the mark is per item, the 2-device limit stays for everyone, and a paid item in the app must tell the user to activate their package ("Онгод Premium, та багцаа идэвхжүүлнэ үү"). Ganaa also wants paid items to look blurred or locked to a user without access.

The activate message and the locked look touch three existing rules: CLAUDE.md ("the mobile apps never show prices, bank details, plans or payment buttons"), [[DESIGN]] (the no-access sheet has "Эрхээ шалгах" only, "NO payment text", "Do not use lock icons per episode") and [[SPEC]] (no payment UI, acceptance test "no payment UI in the apps"). [[R-apple-no-payment-ui]] (VERIFIED 2026-10-21): outside the US storefront Apple does not allow buy buttons or wording that sends users to another way to pay.

## Decision

- **Free user** = a logged-in user without active access. No new user state. Free items are playable for them; paid items are not.
- **Per item:** an item has `isFree`. A free item needs a login like everything else. A series or playlist is not free as a whole; the owner marks each item.
- **Devices:** the limit of 2 applies to free and paid users alike. Free plays count toward it and toward play stats.
- **Activate message:** a paid item without access shows a text message "Онгод Premium, та багцаа идэвхжүүлнэ үү" (wording to be confirmed by the owner). It is text only: no button, no link, no price, no bank details, no plan name, no mention of the website or how to pay. "Эрхээ шалгах" stays. Payment still happens only in the portal.
- **Locked look:** paid items without access show a blurred cover. No lock icon (DESIGN rule unchanged), unless Ganaa asks for one later.
- **Risk accepted by the owner:** the message may be read as encouraging a purchase and cost a store rejection; the text-only form is the smallest version of it. If a store rejects it, the message is removed or replaced by the neutral "Энэ контент эрхтэй гишүүдэд" and nothing else changes.
- **Not in this ADR:** a free preview of the first minutes (needs a separate preview file; Bunny signs path and expiry, not a time range, TO-VERIFY). A later add-on.

## Alternatives rejected

- A "buy" or "Эрх авах" button or a link to the portal: the clearest breach of Apple 3.1.1 and 3.1.3 ([[R-apple-no-payment-ui]]).
- A neutral "members only" text with no action word: the safest, kept as the fallback if a store rejects the message.
- Free for a whole series or playlist: more switches and surprises; the owner marks items by hand.
- Logged-out playback of free items: the app is used only after login or sign-up (Ganaa).
- A new "free user" state in the database: a user without active access is already that.

## Consequences

- The playback check allows `isFree` items without active access; every other rule stays. Tests for access rules cover free and paid items, a user without access, and the device limit.
- Edits to CLAUDE.md, [[SPEC]] and [[DESIGN]] (the no-access state, the "Do not" list, the acceptance test); proposed as diffs and applied after Ganaa approves them.
- Mobile: a blurred cover and the activate text on paid items for users without access; `isFree` in the catalog DTO; an admin switch per item.
- Store review: risk accepted by the owner; the demo account still needs working access.

## Evidence

- [[R-apple-no-payment-ui]] (VERIFIED 2026-10-21): no buy buttons or payment wording outside the US storefront; free tier allowed for a reader app. Whether a text-only "activate your package" is accepted is an ASSUMPTION, not verified.
- [[R-bunny-token-auth]]: signed URLs cover path and expiry, not a time range.
- [[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]], [[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]]: payment only in the portal.
