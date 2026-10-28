---
type: design
date: '2026-10-28'
tags: [design, area/portal]
---

# Portal redesign mockups (to choose from)

Home: [[00-Index]] · Why: [[AUDIT-2026-10-27]] item 8 · Rules: [[DESIGN]] · Log: [[2026-10-28]]

Three directions for the portal (landing page and "Миний бүртгэл"), built on the real tokens (`packages/tokens/css/tokens.css`) with Lora and Inter. Open an `.html` file in a browser from a repo checkout (it needs internet for the fonts). The `.jpg` files are screenshots (desktop 1440 px, phone 390 px top).

| Option                             | Look                                                                                                                                                                                      | Fits DESIGN as is                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A · Aurora (`A-aurora.html`)       | Dark forest with the app's Welcome glow and drifting covers, centered hero, facts strip, three steps, plan card, FAQ. The closest to the app.                                             | Yes                                                                                     |
| B · Showcase (`B-showcase.html`)   | Product page: split hero with the app's Нүүр in a phone frame, feature cards, a mosaic of episodes, a timeline, one centered price card, FAQ grid; the account page is a small dashboard. | Yes                                                                                     |
| C · Editorial (`C-editorial.html`) | Cream paper and forest ink like a quiet magazine: masthead, drop cap, article columns, a numbered index of episodes; the account page is a membership card.                               | No: DESIGN keeps cream to the app's browsing screens. Needs a DESIGN change and an ADR. |

All three add what the portal lacks today: the forest brand instead of near-black, real headings in Lora, a library preview, how it works, the plan with what it includes, FAQ, App Store / Google Play links (marked "Удахгүй" until the apps are live), and on "Миний бүртгэл" the access end date, days left, payment history and the app links.

## Placeholder content (not facts)

- Episode titles, numbers, categories and descriptions are samples; the real page would show the owner's episodes (the catalog needs a login today, so a public "latest episodes" list needs an API decision).
- The price is the seed plan (100,000₮ for 365 days); the real page reads the active plan.
- Copy is a first draft for the owner to approve. Lock-screen listening (B) is built but not yet checked on a phone ([[DEVICE_SMOKE]] gate B).

## Chosen

A · Aurora (2026-10-28), built in `apps/portal`: [[ADR-0058-portal-design-a-aurora|ADR-0058]]. Not built from the mockup: the payment history table (no API for it yet) and the header section links on phones.
