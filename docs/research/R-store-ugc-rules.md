---
topic: Store rules for user-generated content (comments)
status: TO-VERIFY
checked: '2026-10-28'
recheck_after: '2027-01-26'
source: 'https://developer.apple.com/app-store/review/guidelines/ (Apple, read 2026-10-28); Google Play: not reached, support.google.com and play.google.com are outside the session network'
tags: [research, store/apple, store/google]
---

## Fact

**Apple (VERIFIED, Guideline 1.2 "User-Generated Content"):** an app where users create or share content must include: a method for filtering objectionable material from being posted; a mechanism to report offensive content, with timely responses to concerns; the ability to block abusive users; and published contact information so users can reach the developer. No fixed response time is given, only "timely". The text read does not name "comments", but comments are user-contributed content, so the rule applies.

**Google Play (TO-VERIFY, not read this session):** the User Generated Content policy is expected to require terms users accept, in-app reporting and blocking, and moderation and removal of objectionable content. The same four features cover it. Re-read the policy page once `support.google.com` is allowed in the session network.

## How it was checked

Apple: fetched the App Review Guidelines page and read guideline 1.2 (the last 14,000 characters of the page were not read; guideline 1.2 was in the part that was). Google: both policy hosts failed to resolve from this cloud session, so nothing was confirmed.

## Used by

- [[ADR-0061-episode-comments]]
- [[changes]] (comments request), [[open-questions]] #32
