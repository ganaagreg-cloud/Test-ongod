---
id: ADR-0056
title: The admin dashboard shows money, recent payments, scheduled items, file problems and ending access
status: accepted
date: '2026-10-28'
tags: [adr, area/admin, area/backend, area/design]
---

## Context

The dashboard was four numbers on an empty page ([[AUDIT-2026-10-27]] item 4). The owner opens the admin to answer a few questions: did money come in, is anything broken, what goes out next, who is about to leave. Builds on [[ADR-0050-admin-dense-forest-sidebar|ADR-0050]].

## Decision

1. `GET /v1/admin/dashboard` keeps its four counts and adds, in one call:
   - `revenue`: the sum of COMPLETED QPay (and old bank-transfer) payments created this month and last month in Ulaanbaatar time, and this month's count. Manual grants and refunded payments are left out.
   - `recentPayments`: the newest 5 COMPLETED payments that carry money, with the member and the reference code.
   - `upcoming`: the next 5 SCHEDULED episodes by `scheduledFor`.
   - `mediaProblems`: counts of FAILED media and of uploads stuck in UPLOADING for more than 15 minutes (the Контент list rule), and up to 5 of them, newest first.
   - `expiringSoon`: the 5 members whose access ends first within 30 days.
2. ADMIN and OWNER see the same dashboard (both already see every payment on the Төлбөр page).
3. Layout: page actions "Шинэ бичлэг" and "Хэрэглэгчид"; the joined counter strip with the month's income first (and the change from last month); then cards in an auto-fit grid: Сүүлийн төлбөр, Удахгүй нийтлэгдэх, Файлын асуудал, Эрх нь дуусах гишүүд. Each row links to its item; each card links to its page. Empty cards say so in one line.
4. The counter "Төлбөр хүлээж буй" opens Төлбөр filtered to waiting requests; Төлбөр reads `?status=` for that.

## Alternatives rejected

- Charts of income over time: one month's number and the change say enough for a few hundred members; a chart library is a new dependency.
- Separate endpoints per card: more requests for one screen the owner opens often; the queries are small and indexed.
- Revenue for the OWNER only: ADMINs already see every amount and the CSV export.

## Consequences

- `dashboardResponseSchema` grows; the old four fields keep their meaning.
- The stuck-upload threshold (15 minutes) moves to `packages/shared` so the API and the admin use one value.
- DESIGN "Admin screens" names the dashboard cards.

## Evidence

- [[SPEC]] E (payments list), G (media status, scheduled items), F (access ending).
