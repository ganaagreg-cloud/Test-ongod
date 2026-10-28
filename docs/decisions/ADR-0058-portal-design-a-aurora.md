---
id: ADR-0058
title: Portal design A "Aurora" for the landing page and Миний бүртгэл
status: accepted
date: '2026-10-28'
tags: [adr, area/portal, design]
---

## Context

The audit ([[AUDIT-2026-10-27]] item 8) found the portal plain: near-black, few headings, no picture of what members get. Three directions were drawn in `docs/design/portal-mockups/` (see the README there). Ganaa picked A "Aurora" on 2026-10-28 ([[2026-10-28]]). It keeps the dark forest tokens, so [[DESIGN]] needs no new colors.

## Decision

1. **Landing:** the header lies over a forest hero (aurora gradients from `brand`, `heritage` and `glow`) with a tilted wall of typographic covers behind the centered motif, label, Lora title, lead, "Бүртгүүлж эрх авах" + "Сан үзэх" and a price line (the cheapest active plan). Then:
   - a facts strip;
   - "Шинээр нэмэгдсэн" with four sample 16:9 typographic covers;
   - "Гурван алхам";
   - every active plan as a split card;
   - App Store / Google Play badges marked "Удахгүй" (not links until the apps are live);
   - questions in `<details>`.
2. **Plan card:** a forest panel with the name, the price (hero size), the length and a monthly figure for plans of 60 days or more, beside what the plan includes and the call to action. It lists however many plans `GET /v1/plans` returns.
3. **Миний бүртгэл:** greeting and title with "Гарах", then two columns that stack on narrow screens. The columns hold:
   - the access card (days-left ring, "Идэвхтэй · date хүртэл", "Эрх сунгах" / "Эрх авах" / "Үргэлжлүүлэх");
   - the last request (reference code, plan, status);
   - the app badges;
   - "Мэдээлэл" (name, @username, email with its badge, phone, "Бүртгэл устгах").
4. Gold stays on one element per region: the main button, the motif and the small section labels. Fact values and step numbers use text and heritage colors instead.
5. Layout works without media queries (`auto-fit` grids, wrapping flex), so `portal.css` keeps to token variables; the CSS test now also accepts custom properties declared in `portal.css` itself (`--portal-ring`, set from the page).
6. The landing title uses the hero text size: the portal landing is the web counterpart of the app's Welcome screen.

## Alternatives rejected

- B "Showcase" and C "Editorial" (C needed cream outside the app's browsing screens).
- A payment history table on Миний бүртгэл (as in the mockup): the API has no list of a member's own payments. It would need a new endpoint with access tests; left for a later decision.
- Hiding the header links on phones: needs a width media query with a raw size, which the CSS rules do not allow; the header wraps instead.

## Consequences

- Sample episodes, cover titles, the first two facts, the plan's "includes" list and the landing copy are placeholders marked `TODO(owner)` in `apps/portal/src/i18n/mn.ts`. A public list of real latest episodes needs an API decision (the catalog requires a login).
- The store badges become links when the apps are published.
- Monthly and yearly plans ([[changes]] 2026-10-28) need no portal change beyond plan data and wording.
