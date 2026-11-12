---
id: ADR-0099
title: "The bell on Нүүр shows the member's notifications; Тусламж on Профайл"
status: accepted
date: '2026-11-12'
tags: [adr, area/mobile, area/backend]
---

## Context

[[DESIGN]] describes a bell on Нүүр and "Тусламж" in the Профайл menu; neither was built ([[open-questions]] #27). The `Notification` table existed but nothing wrote to it. Ganaa, 2026-11-12: build them.

## Decision

1. **Every push is also kept.** `enqueuePush` writes a `Notification` row (title, body, data) in the same writer as the push job, so both happen or neither. The list therefore works without the system permission and shows what was missed. Texts are the server's own, as pushed.
2. **API:** `GET /v1/me/notifications` (the member's own, newest 50, with the unread count) and `POST /v1/me/notifications/read` (all read; running it twice changes nothing). A cron task deletes notifications older than 90 days.
3. **App:** a bell at the top right of Нүүр with a gold dot while something is unread (asked again each time Нүүр comes into view, at most every 30 s). It opens "Мэдэгдэл": rows with a dot for the unread ones; opening the list marks all read, the dots stay until the list is left; a "new episode" row opens the Player.
4. **Тусламж** (`/help`, a row on Профайл before the legal pages): four short answers (code not arriving, devices, an episode not playing, deleting the account) and, when the server publishes `SUPPORT_EMAIL`, a block with the address and "Имэйл бичих" (a `mailto:` link). No payment words ([[ADR-0044-free-items-and-activate-message-in-app|ADR-0044]]; the guard test covers the screen).

## Alternatives rejected

- A list built from the push provider's history: Expo does not keep one per member.
- Broadcast rows (`userId` null) shared by everyone: one row per member is what the existing push fan-out already iterates, and a read flag needs a row per member.
- Opening the help text from the portal: the same answers are short and belong inside the app ([[ADR-0093-legal-pages-inside-the-app-logout-on-profile|ADR-0093]]).

## Consequences

- One more row per push per member (a few hundred members, 1 to 10 episodes a week).
- Notifications made before this ADR do not exist; the list starts empty for everyone.
- The help answers are a first draft for the owner to approve.

## Evidence

- Tests: `push.test.ts` (kept per member, another member's untouched, read twice, 90-day cleanup), `screens.test.ts` (the two calls). Seen in a browser with sample data.
