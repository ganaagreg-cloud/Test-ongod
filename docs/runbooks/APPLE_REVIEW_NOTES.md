---
type: runbook
tags: [runbook, store/apple]
---

# App Review notes (for the build without payment code, ADR-0109; the earlier wording that mentions a server setting applies only to a build that still contains it) (paste into App Store Connect > App Review Information > Notes)

Answer to Apple's "Guideline 2.1 - Information Needed" (2026-11-17). No credentials here: the demo account goes in the Sign-in fields only ([[STORE]]).

## Notes text

```
1. SCREEN RECORDING
A screen recording from a physical iPhone (latest iOS) is attached. It starts with launching the app and shows: registration (3 steps and an e-mail code), login, browsing, playing, saving an episode, commenting, reporting a comment, blocking a user, the blocked-users list, and account deletion. To protect the creator's content the app pauses playback while the screen is being recorded or mirrored (Android and iOS). So the recording shows that message at the player; playback itself works normally without recording. A short second video, filmed with another device, shows an episode playing. [ATTACH OR REMOVE THIS SENTENCE]

2. PURPOSE AND AUDIENCE
"Зөв үү? Тав уу?" is a members-only audio and video library by a Mongolian creator. Members listen to and watch episodes (talks and lessons on personal development) in Mongolian. It solves the problem of having the creator's content in one private place that works on a phone, with saved episodes, progress and comments. The audience is Mongolian-speaking adults and teenagers aged 14 and over (the terms set a minimum age of 14).

3. HOW TO ACCESS THE MAIN FEATURES
Sign in with the demo account in the Sign-in fields. It has active access. Tabs: Нүүр (home, new episodes), Сан (library, search and filters), Хадгалсан (saved), Профайл (access, settings, devices, blocked users, terms, privacy, log out). Open any episode to play it (audio or video). A member can save an episode, and comment under it. Delete account: Профайл > Тохиргоо > Бүртгэл устгах. A new account can be created in the app (name, e-mail and phone, password; then a 6-digit code sent by e-mail). The app contains no payment feature and no in-app purchase. Access to paid episodes is arranged on our website and granted to the account. A user without access sees a plain message to activate their package.

4. EXTERNAL SERVICES
- Bunny.net: storage and delivery of the audio and video files.
- A transactional e-mail provider: sign-up codes, password reset. [NAME IT]
- Apple Push Notification service through Expo push: notifications about new episodes (optional, asked once).
- Sign in with Apple and Google sign-in: optional. [REMOVE IF OFF]
- QPay (through the Wire gateway): used by our website for payments. It is not part of the app.
- Our own server (Node.js and MySQL) for accounts, access and comments.

5. REGIONS
The app is in Mongolian and aimed at Mongolia. It works the same in every region. There are no regional differences in features or content.

6. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Not a regulated industry. All audio, video and pictures are the creator's own work, published with the creator's permission. Contact: zuwuutawuu@gmail.com
```

## Recording checklist (on a real iPhone, latest iOS)

1. Control Center > Screen Recording > start (microphone off). Then open the app from the home screen.
2. Register a **throwaway** account (use a mailbox you control), type the e-mail code, sign in.
3. Browse Нүүр and Сан, open an episode, save it, add a comment, report a comment, block a user, open Профайл > Хаасан хэрэглэгчид.
4. **Delete that throwaway account** (Профайл > Тохиргоо > Бүртгэл устгах). Never delete the demo account.
5. Log in with the demo account and show a paid episode opening. Playback is paused during recording by design.
6. Film a short clip of an episode playing, with another phone.

## Not verified here

Whether Sign in with Apple and Google sign-in are switched on in production, and the name of the e-mail provider: fill in or remove in the text above.
