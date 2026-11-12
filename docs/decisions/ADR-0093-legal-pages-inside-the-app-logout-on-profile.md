---
id: ADR-0093
title: 'Terms and privacy open inside the app; "Гарах" sits on Профайл under the notification switch'
status: accepted
date: '2026-11-12'
tags: [adr, area/mobile, area/portal, area/design]
---

## Context

Client, 2026-11-12: (1) and (5) the terms and privacy pages jump to Safari, there is no way back and the member gets lost; can they show inside the app. (4) "Гарах" should be on the profile page, below the notification row. Today the app calls `Linking.openURL` on `/app/terms` and `/app/privacy` ([[ADR-0053-app-only-legal-pages|ADR-0053]]), and "Гарах" is on Тохиргоо (DESIGN).

## Decision

1. The app opens the same `/app/terms` and `/app/privacy` pages in an **in-app browser sheet** (`expo-web-browser` `~58.0.6`, page-sheet style, app colours, a close button). The member never leaves the app and closes the sheet to return. The texts still live once, in the portal (ADR-0053 is unchanged).
2. A build without the native part (made before this ADR) and any failure to open the sheet fall back to the phone's browser, so an over-the-air update cannot break old builds.
3. The **public** portal pages `/terms` and `/privacy` get a "Буцах" button above the title (history back, or the start page when opened directly). The app copies stay without links or buttons (ADR-0053).
4. **"Гарах" moves to Профайл**, a button right under the menu card that ends with the notification switch, with a confirmation sheet ("Гарах уу?"). It is removed from Тохиргоо, which keeps "Бүртгэл устгах".

## Alternatives rejected

- Render the legal text natively: the text would have to move into a shared package or an API call, against "the owner edits it in one place" (ADR-0053).
- `react-native-webview` screen: a heavier native dependency for the same result.
- A PDF: a second copy of the text to keep in step, and worse on small screens.
- A "back to the app" link on `/app/*`: ADR-0053 forbids links there, and a test enforces it.
- Logout without confirmation on a main tab: one stray tap signs the member out.

## Consequences

- New native dependency: a **new build** is needed before members see the sheet.
- DESIGN "Профайл" and "Тохиргоо" lines need the logout move (edit waits for Ganaa's approval).

## Evidence

- `expo-web-browser` version from `bundledNativeModules.json` of expo 58.0.19 ([[R-expo-sdk-58-versions]]).
- Mobile tests 251/251; portal tests pass. Not run on a device.
