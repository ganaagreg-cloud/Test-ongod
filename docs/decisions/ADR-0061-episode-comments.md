---
id: ADR-0061
title: Comments on episodes: text only, filtered, reportable, blockable, moderated in the admin
status: accepted
date: '2026-10-28'
tags: [adr, area/backend, area/mobile, area/admin]
---

## Context

Comments on episodes were accepted as a paid add-on on 2026-10-28 ([[changes]], [[SPEC]] L). They are user-generated content, so the stores set rules. Apple Guideline 1.2 requires a way to filter objectionable material, a report mechanism with timely responses, the ability to block abusive users, and published contact information (VERIFIED, [[R-store-ugc-rules]]). Google Play's UGC policy is expected to ask for the same (TO-VERIFY, same note). [[open-questions]] #31 (who may comment, approval first or not, which name) is still open, so this ADR picks defaults marked ASSUMPTION.

## Decision

1. **What a comment is:** plain text, 1 to 1000 characters, on one published episode. No replies, likes, images or feed ([[SPEC]] still lists a social feed as out of scope). A `Comment` row: author, episode, body, status `VISIBLE | HIDDEN | DELETED`, `editedAt`, timestamps.
2. **Who (ASSUMPTION for #31):** every signed-in user can read the comments of a published episode. Posting needs what playing needs: active access, or the episode is free ([[ADR-0043-allow-free-users-and-free-content|ADR-0043]]). A member without access sees the comments and no input box, and no text about why: the apps show no payment wording ([[ADR-0044-free-items-and-activate-message-in-app|ADR-0044]]). Only the app shows and posts comments; the portal has no comments.
3. **Name (ASSUMPTION):** first name and the first letter of the last name ("Бат Э."). Never the username (it can be the email) or any contact detail.
4. **Shown at once, moderated after:** a comment is `VISIBLE` when posted, after the filter (item 5). The owner removes bad ones. Approval-first is a switch the owner can ask for later.
5. **Filter (Apple's "method for filtering"):** a post is refused (`COMMENT_REJECTED`) if it contains a link (`http`, `www.`, or a domain-like word, the usual spam), or a word from `COMMENT_BANNED_WORDS` (comma-separated env, matched ignoring case; empty by default; the owner fills it). Rate limit: 5 comments a minute and 40 a day per user. A comment with 3 reports from 3 different users is hidden automatically until an admin looks (`HIDDEN`).
6. **Report:** any user can report another user's visible comment once, with a reason (`SPAM | ABUSE | OTHER`). The admin sees reported comments first.
7. **Block:** a user can block the author of a comment. The blocked user's comments disappear from the blocker's lists (reading only: nothing is sent to the blocked user). The user can see and undo blocks on Профайл. Blocking yourself is refused.
8. **Own comments:** edit (sets `editedAt`) and delete (status `DELETED`, text kept for the audit). When an account is deleted ([[SPEC]] H) its comments stay, shown under the name "Устгагдсан хэрэглэгч".
9. **Admin ("Сэтгэгдэл"):** a list with filter Reported / Hidden / All / Deleted and search; actions Hide, Restore, Delete (with the audit row each). And "Хориглох": an admin can mute a user from commenting (`User.commentMutedAt`); a muted user cannot post and sees the same box without an error explanation beyond "Та сэтгэгдэл бичих боломжгүй". Timely response (ASSUMPTION): the owner looks at the reported list at least every few days; three reports hide a comment before that.
10. **Contact (Apple's "published contact information"):** `SUPPORT_EMAIL` in env, returned by `GET /v1/app-config` as `supportEmail` (nullable) and shown under the comments and on Профайл. It is a plain address, not a payment link. **The app shows the comments section only when `supportEmail` is set**, so a build can never reach the stores with comments and no contact; until the owner answers [[open-questions]] #26 the field stays empty in production.
11. **Push and email:** none for comments. No replies means nothing to notify.
12. **Apps:** the mobile Player gets a "Сэтгэгдэл" section ([[DESIGN]]): list with "more" (cursor), the input (when allowed), an action sheet per comment (Report, Block, or Edit, Delete for your own). All text in `mn.ts`, tokens only.

## Alternatives rejected

- Approval before showing: the owner would have to work every day; it also makes the app feel dead. Report-and-hide covers Apple's rule.
- Replies, likes, mentions: more moderation, and it becomes the feed that is out of scope.
- Show the username: it may be the email address.
- Third-party moderation service: new cost and a new data processor for a small feature.

## Consequences

- A store submission needs `SUPPORT_EMAIL` set, and the Google rule text read ([[R-store-ugc-rules]] to VERIFIED) before release. Listed in [[LAUNCH_CHECKLIST]].
- The moderation work is ongoing for the owner (a few minutes a day at the start).
- Comments on deleted or archived episodes are kept but never returned.
- Tests: access rules for reading and posting, the filter, rate limit, report and auto-hide, block, own edit and delete, admin actions and the mute, and that a no-access user cannot post.
