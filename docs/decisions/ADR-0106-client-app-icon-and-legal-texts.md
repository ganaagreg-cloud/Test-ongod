---
id: ADR-0106
title: "The client's logo is the app icon; the client's privacy policy and terms replace the placeholders"
status: accepted
date: '2026-11-16'
tags: [adr, area/mobile, area/portal, area/store]
---

## Context

Ganaa sent (2026-11-16) the client's logo image, the client's privacy policy and terms of service as Word files. Until now the app used the default Expo icon and the portal showed placeholder legal texts ([[AUDIT-2026-11-12]] B2).

## Decision

1. **Icon.** `apps/mobile/assets/icon.png` (1024 × 1024, opaque, no rounded corners) is the logo centred on the picture's own dark edge. `assets/adaptive-icon.png` is the same logo smaller, inside the Android safe zone, on `backgroundColor #000000`. Both are set in `app.config.ts`. The same `icon.png` is uploaded as the App Store icon. The source was a JPEG screenshot (about 1069 px); a vector or a larger original from the client would be sharper.
2. **Terms** (`/terms`, `/app/terms`): the client's 11 sections and contact line, word for word. Sections 4 to 6 (price, renewal, refunds) carry `payment: true`, so the app copy leaves them out ([[ADR-0053-app-only-legal-pages|ADR-0053]]). Only two plain typos were fixed ("байна. байна.", "аудил").
3. **Privacy** (`/privacy`, `/app/privacy`): the client's text, word for word, plus a contact line with the support e-mail already used in the terms. Section numbers follow the client's file (it has no section 3).
4. The yellow TODO box and "Сүүлд шинэчилсэн: TODO" stay until the owner approves the final text.

## Open in the client's texts (not changed by us)

Terms: 3.2 still has `[нас]` and `[холбоос]`; 5.1 and 5.2 are missing; 3.4 promises one video stream at a time (check it is enforced). Privacy: section 3 is missing; section 4 ends without a verb; it does not name Google or Apple sign-in, push tokens, the video host, error reporting, or the right and way to delete an account, which both stores expect in a policy.

## Consequences

- The icon needs a new native build (an icon is not delivered over the air).
- Store listing: use the same `icon.png`; the privacy and support URLs are the portal pages.
