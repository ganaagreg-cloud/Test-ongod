---
id: ADR-0049
title: 'Player: "Next" row from the opening list, and autoplay-next for audio and video'
status: 'accepted (item 1 and 2, where "Дараагийн" sits, superseded by [[ADR-0065-player-next-at-the-bottom|ADR-0065]]; the rest stands)'
date: 2026-10-25
tags: [adr, area/mobile, area/design]
---

## Context

The Player ([[DESIGN]] "Player") ends when an episode ends. The member has to go back and pick the next one. DESIGN already has a "Дараагийн" list (later episodes of the category, plus "Дараагийн хэсэг" for series), but it sits under the description and shows several rows, so on a 360x640 phone it is below the fold.

The sleep timer and background sound for video were decided in [[ADR-0038-video-episodes-bunny-stream|ADR-0038]] (client option A, 2026-10-18); [[open-questions]] #17 stays open only for what happens when an episode ends. Ganaa asked on 2026-10-25 for autoplay-next, for audio and video, with a countdown and a Cancel button.

## Decision

1. **Layout.** Top bar (chevron-down, bookmark) with no label, the 16:9 media area for both kinds (audio shows the 16:9 picture, video plays there), title and one meta line, scrubber with times, one control row (speed, −15, play/pause, +30, sleep timer), the "Дараагийн" section, then the description. Everything down to the "Дараагийн" section fits without scrolling on 6.1" iPhones and 360x640 dp Android; only the description scrolls. The speed chip and the sleep button show a clear active state (filled `accentSoft` + `accent` border) when off their default.
2. **"Дараагийн" section.** Keeps the existing list and the "Дараагийн хэсэг" series logic. By default only the first row is shown, with a "Бүгд" link to the full list. Hidden when there is nothing next.
3. **What "next" is.** The next item in the list, series or category the member opened the episode from. The opening screen hands its ordered, loaded items to the Player (`setPlayQueue`). If the episode is not in that list (push notification, mini player, deep link), "next" is the existing API order: `nextInSeries`, then `next[0]` (later episodes of the same category).
4. **Description.** Plain text with the "Тайлбар" title, no card, collapsed to 2 lines, toggle "Цааш унших" / "Хураах".
5. **Autoplay-next.** Applies to audio and video. When an episode ends while the Player is open, a 3-second countdown with a "Болих" (Cancel) button shows, then the next episode starts. Cancel stops it for that ending only.
6. **Sleep timer.** It pauses audio and video, and it always blocks autoplay: while a timer is set, when it has fired during this episode, and when "end of episode" was chosen. The block is reset only when the member opens another episode by hand.
7. **Access.** The next episode is started through the same `startEpisode` → `POST /v1/episodes/:id/play` path as any episode, so the access, device and published/READY checks run. Nothing is prefetched and no signed URL is kept. A next item the member cannot play (paid, no access) is skipped for autoplay (no countdown); the play endpoint stays the only authority.
8. **Possible later change (not now):** a warning or default-off autoplay for video on cellular data.

## Alternatives rejected

- **Square cover for audio.** Rejected: DESIGN, the lock-screen artwork crop and the video frame are all 16:9; a different shape for audio would change the layout when the kind changes.
- **A new API parameter for the opening context** (`/episodes/:id?from=...`). Rejected: the opening screen already holds the ordered items; a server round trip adds endpoints and tests for no gain.
- **A queue screen, recommendations, "continue listening".** Out of scope.
- **Prefetching the next signed URL.** Rejected: URLs expire (4 h) and the access check must run when the episode really starts ([[ADR-0021-catalog-and-playback-rules|ADR-0021]] item 7).
- **Autoplay for audio only.** Rejected by Ganaa: video behaves the same.
- **A data warning for video on cellular.** Deferred (item 8).

## Consequences

- Autoplay runs only while the Player screen is open. With the sheet closed (mini player, locked screen) an ended episode just stops, as before. Doing it in the background needs the controller to hold the queue; a later ADR if the client asks.
- The queue holds only the pages the list had loaded. At the end of the loaded pages there is no "next" even if more pages exist on the server.
- The play queue is memory only; after a restart "next" comes from the API order (item 3).
- Closes [[open-questions]] #17 (end-of-episode behaviour for video: same as audio).
- DESIGN.md and DESIGN-v2-aurora.md are updated with this ADR; the old text (collapsible "Тайлбар" card, "Дараагийн" list always shown in full) is replaced. The "ОДОО ТОГЛУУЛЖ БАЙНА" label is removed from the mobile app and from `docs/design/ongod-figma.html`.
- New strings in `apps/mobile/src/i18n/mn.ts`; no API or schema change.

## Evidence

- [[ADR-0038-video-episodes-bunny-stream|ADR-0038]] (video, background sound, sleep timer for video), [[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]] (audio engine), [[R-expo-video-sdk57]] (expo-video behaviour at the end of a source: the `playToEnd` event).
- Ganaa's request, 2026-10-25 (this session). The 360x640 fit is a layout calculation; it is not yet measured on a device (TO-VERIFY in [[DEVICE_SMOKE]]).
