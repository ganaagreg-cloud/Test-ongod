---
id: ADR-0053
title: The apps open app-only legal pages (/app/terms, /app/privacy) with no navigation and no payment section
status: accepted
date: '2026-10-27'
tags: [adr, area/portal, area/mobile, store/apple]
---

## Context

Welcome and Профайл open the portal's `/terms` and `/privacy`. Those pages sit in the normal portal layout: the header links to "Эрх авах" (plans with prices), "Бүртгүүлэх" and the account, and the terms have a section on how to pay. CLAUDE.md forbids links to pay in the apps, and Apple 3.1.3 forbids encouraging another purchase method outside the US storefront ([[R-apple-no-payment-ui]]). Found in [[AUDIT-2026-10-27]] item 1; the same fix was built on the branch `audit-fixes-2026-10-09` (`ef6353d`) and never merged.

## Decision

1. The portal serves `/app/terms` and `/app/privacy` in a bare layout: the brand (not a link), the page, nothing else. No navigation, no footer, no links. Marked `noindex`.
2. A legal section can be flagged `payment: true`; the app copy leaves it out. The terms section "Эрх ба төлбөр" is flagged. The public `/terms` and `/privacy` are unchanged.
3. The apps link only to `/app/terms` and `/app/privacy`.

## Alternatives rejected

- Hide the nav on `/terms` when opened from the app (a query flag): anyone can drop the flag, and the reviewer sees the same URL with the nav.
- Show the legal text inside the app: the owner edits it in one place (the portal), and the stores want a web URL anyway.
- Keep the payment section in the app copy: it tells the reader how to pay, which is the wording Apple forbids.

## Consequences

- Two more portal routes; the legal texts still live once in `apps/portal/src/i18n/mn.ts`.
- New legal sections that talk about paying need `payment: true`. A test checks the app layout has no links and the terms payment section is flagged.
- The store listings keep the public URLs (`/privacy`, `/terms`, `/delete-account`).

## Evidence

- [[R-apple-no-payment-ui]] (VERIFIED 2026-10-21): 3.1.1, 3.1.3, 3.1.3(a).
- [[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]], [[ADR-0044-free-items-and-activate-message-in-app|ADR-0044]]: no payment UI in the apps.
