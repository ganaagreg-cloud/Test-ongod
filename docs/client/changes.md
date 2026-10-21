---
type: client
tags: [client, scope]
---

# Change requests

Every client request that changes scope is recorded here before any code. Template: `templates/change-request.md`.

### 2026-10-08: Google / Apple login

- **Client asked:** sign in with Google (and Apple on iOS).
- **In scope:** no; paid add-on ([[SPEC#Workflows]] C, [[ADR-0009-social-login-feature-flag|ADR-0009]])
- **Price:** ~500,000 ₮ as an add-on
- **Status:** accepted as a paid add-on (decision relayed by Ganaa on 2026-10-08; phase 2 not chosen). Written confirmation and the final price are still to be added to [[approvals]].
- **Notes:** if Google is offered on iOS, Sign in with Apple is mandatory ([[R-apple-login-services-4-8]]). [[open-questions]] #10. API built behind `SOCIAL_LOGIN` ([[ADR-0019-social-login-implementation|ADR-0019]]).

### 2026-10-08: Offline downloads

- **Client asked:** download episodes to listen offline.
- **In scope:** no ([[SPEC#Out of scope (paid add-ons)]])
- **Price:** not quoted yet
- **Status:** proposed
- **Notes:** [[open-questions]] #11.

### 2026-10-08: Payment screen moved from app to web

- **Client asked:** the concept showed a payment screen inside the app.
- **In scope:** yes, as a scope clarification: payment happens only in the web portal ([[SPEC#Surfaces]], [[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]]).
- **Price:** 0 ₮
- **Status:** proposed (awaiting the client's confirmation)
- **Notes:** required by store rules ([[R-apple-no-payment-ui]], [[R-google-play-payments]]).

### 2026-10-18: Video episodes now (not "later")

- **Client asked** (relayed by Ganaa, 2026-10-18): her episodes become montaged videos (her voice over pictures and slides); some may stay audio. Facts: (1) a mix of audio and video, most or all new episodes may be video; (2) max 720p is fine; (3) the shortest video is 40 min, 1 to 10 episodes a week; (4) one media file per episode, audio or video, never both.
- **In scope:** no. [[SPEC#Product]] says "now: audio …, 20–40 min; later: video, max 720p"; this moves video from "later" to "now", and episodes become 40 min or longer. Also conflicts with [[ADR-0011-audio-first-media-asset|ADR-0011]] (audio-first) and [[DESIGN]] ("Audio-first" principle; Player "for video assets later"). Proposed decision: [[ADR-0038-video-episodes-bunny-stream|ADR-0038]] (proposed). Impact, costs and risks: [[VIDEO-2026-10-18]].
- **Price:** proposed, **not decided**; Ganaa chooses with the client. Working:
  - Work estimate (ASSUMPTION, Ganaa to confirm): API 3–4 days (Bunny Stream upload job, status, signed HLS, tests) + admin 1.5–2 (video upload, processing status, failures) + mobile 3–4 (expo-video player, fullscreen, resume, background rules) + docs, device tests and a real cost check 1–1.5 = **8.5–11.5 days**.
  - Day rate: not in the vault. Example only: if the Google/Apple add-on (~500,000 ₮, [[open-questions]] #10) is about 4 days of work, the rate is ~125,000 ₮/day (Ganaa to confirm both numbers).
  - **Option A, full video support:** 8.5–11.5 days ≈ 1,060,000–1,440,000 ₮ → propose **1,200,000 ₮**.
  - **Option B, video MVP now:** upload, processing, in-app playback with fullscreen; video pauses when the app goes to the background; no picture-in-picture, no lock-screen controls for video. About 6–7 days ≈ **800,000 ₮**. The rest later as a small add-on (~2.5–4.5 days ≈ 300,000–550,000 ₮).
  - **Option C, no extra charge:** stay inside the 3M ₮ budget; about 9–11 days of planned work moves out of scope (the client picks what) or the schedule moves by about two weeks.
  - In every option the **Bunny bills are separate** and run on the owner's account ([[ADR-0005-bunny-dev-zone-env-switch|ADR-0005]]): delivery for 100 members watching every episode is about $12–119 a month at 1–10 videos a week, vs $0.4–3.7 for audio (TO-VERIFY, [[VIDEO-2026-10-18]]).
- **Status:** accepted: **option A, 1,200,000 ₮** (Ganaa, 2026-10-18: agreed with the client). Written confirmation still to be added to [[approvals]]. [[ADR-0038-video-episodes-bunny-stream|ADR-0038]] accepted and the SPEC / DESIGN wording applied the same day
- **Notes:** no code until the client accepts an option and Ganaa accepts ADR-0038 and the SPEC / DESIGN wording. Questions: [[open-questions]] #16–#25. The apps still show no prices ([[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]]).

Dates are when the entries were logged; the requests came from earlier planning chats.

### 2026-10-19: QPay replaces manual bank transfer (web portal)

- **Client asked** (relayed by Ganaa, 2026-10-19): pay with QPay instead of bank transfer. The QPay agreement is already made. First app-store release shows no payment of any kind in the mobile app; payment stays in the web portal.
- **In scope:** no. [[SPEC#Out of scope (paid add-ons)]] lists QPay; [[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]] chose manual bank transfer and deferred QPay as a paid add-on. This request replaces the bank-transfer flow and needs a superseding ADR before code.
- **Price:** paid by the client (Ganaa confirmed on 2026-10-19 that the payment for QPay is received). Amount and written confirmation still to be added to [[approvals]].
- **Status:** accepted as a paid add-on. Work not started. Needs first: QPay merchant credentials or sandbox access, a research note on the QPay API (`/research`) (TO-VERIFY), then an ADR.
- **Notes:** [[open-questions]] #6 (individual merchant account). Payment UI in the mobile app stays out for the first release ([[R-apple-no-payment-ui]], [[R-google-play-payments]]). Turning in-app payment on in a later update is the owner's accepted risk (store rules, guideline 3.1.1) and gets its own ADR if it is ever built.

### 2026-10-21: Content management (series, playlists, tags, admin tools) and free content

- **Client asked** (relayed by Ganaa, 2026-10-21): organise content by series, playlists and tags, feature items on Нүүр, faster admin tools (filters, bulk actions, preview, duplicate, calendar), push control per item, stats; and free items playable by everyone as a hook.
- **In scope:** no. [[SPEC#Workflows]] G and the admin surface cover only categories and a flat list; free content conflicts with "no free episodes" ([[SPEC]], CLAUDE.md).
- **Price:** set by Ganaa.
- **Status:** proposed. Phase 1 (organise, admin tools, push on publish) decided in [[ADR-0042-content-organisation-and-publish-push|ADR-0042]] (accepted).
- **Notes:** design: [[2026-10-21-content-management-design]]. Free content (phase 2) is blocked until Ganaa sets the price and edits the CLAUDE.md "no free episodes" line.
