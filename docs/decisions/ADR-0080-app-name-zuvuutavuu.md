---
id: ADR-0080
title: The product is named "Зөв үү? Тав уу?"; technical names use zuvuutavuu
status: 'accepted (item 4 and the open domain superseded by [[ADR-0081-store-name-without-question-marks-domain|ADR-0081]])'
date: '2026-11-03'
supersedes: []
tags: [adr, area/brand, area/mobile]
---

## Context

The client wants the product renamed from "Онгод" ([[changes]], [[open-questions]] #34). A name with spaces and question marks cannot be used in domains, app ids, URL schemes or file names. Ganaa decided on 2026-11-03: users and screens see "Зөв үү? Тав уу?"; everything technical and external uses `zuvuutavuu`; nothing else changes.

## Decision

1. **Visible name** "Зөв үү? Тав уу?": app display name, app and portal texts, page titles, share image, email subjects and signature, payment descriptions. Texts that used Mongolian endings on the name (Онгодын, Онгодод, Онгод аппаар) were reworded so the name is not inflected ("Бүртгэлдээ нэвтэрнэ үү", "Аппаар нэвтэрч…").
2. **Technical and external names** `zuvuutavuu`: Expo `slug` and link `scheme`, iOS `bundleIdentifier` and Android `package` (`mn.zuvuutavuu.app`), and the domain (to be chosen, [[open-questions]] #9). These are permanent after the first store publication.
3. **Not renamed:** `@ongod/*` packages, folders, env keys, cookie and storage keys (`ongod_rt`, `ongod:device`, …), the database and server user names, test fixtures. They are not visible to users and renaming them would sign everybody out for no gain.
4. **Store title:** try "Зөв үү? Тав уу?"; if a store refuses the question marks, use "Зөв үү Тав уу" (store rules ASSUMPTION / TO-VERIFY, not read). The label under the phone icon may be cut off; check on a device.

## Consequences

- A new app id means a **new dev build**: the old `mn.ongod.app` build on a phone is a different app. Expo/EAS project, Firebase and Google/Apple sign-in entries must be created with the new id; push credentials are per app id. Nothing was registered under the old id yet ([[open-questions]] #1).
- Old docs and logs keep saying "Онгод"; they are history. SPEC, DESIGN and CLAUDE.md carry a note.
- `seed.ts` and the mobile test fixtures still say "Онгод" as an artist name: sample data only.
- Wire's payment description now contains question marks; check on the first sandbox payment that the provider accepts it ([[R-wire-qpay-gateway]]).
