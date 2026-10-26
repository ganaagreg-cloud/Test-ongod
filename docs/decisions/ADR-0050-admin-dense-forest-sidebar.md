---
id: ADR-0050
title: Admin is dense with a forest sidebar and a slide-over detail panel
status: accepted
date: 2026-10-26
tags: [adr, area/design]
---

## Context

The admin looked unfinished: 52 pt pill controls, loose counter cards, a table squeezed beside a detail panel, a flat light sidebar. [[DESIGN#Admin screens]] asks for "light, dense, functional". Builds on [[ADR-0014-admin-light-theme|ADR-0014]] (light theme stays) and [[ADR-0029-admin-app-implementation|ADR-0029]] (no Tailwind or shadcn). 21st.dev is a pattern reference only ([[ADR-0027-design-v2-aurora-forest-motion|ADR-0027]]).

## Decision

Admin only, all in `apps/admin/src/admin.css` on existing tokens (no new token values, no new dependencies):

- Sidebar: `--color-brand` surface, `--color-on-heritage` text, active item = 14% on-heritage fill plus a 3 px `--color-accent` marker. Nav is grouped (Контент, Систем) with icons.
- Controls under `.admin-shell`: height 32 px (`--admin-control` = space-xl + space-xs), `radius-small` instead of pills; badges are shorter. The portal keeps its sizes because the override is scoped.
- Dashboard counters are one joined strip (Lora, lining tabular figures).
- Tables: tighter rows, small uppercase headers on `--color-bg`.
- The detail panel (payments) is a fixed right slide-over, so the table keeps its full width. It has no backdrop; Esc and the close button dismiss it. The 200 ms slide stops under `prefers-reduced-motion`.

## Alternatives rejected

- **Install 21st.dev / shadcn components:** needs Tailwind, which ADR-0025 and ADR-0029 reject, and a second token source.
- **Top tabs, no sidebar:** nine nav items do not fit without a dropdown.

## Consequences

- Admin controls are below the 44 pt touch target. Acceptable for a desktop tool; the app and portal keep 44 pt.
- `admin-css.test.ts` now allows custom properties defined inside admin.css.
- Not done: nav count badge, user avatars in tables, a "recent payments" block on the dashboard (needs an API change).
