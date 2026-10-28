---
id: ADR-0062
title: Comments are shown without a support contact; the contact line appears when one is set
status: accepted
date: '2026-10-28'
tags: [adr, area/mobile, area/backend]
---

## Context

[[ADR-0061-episode-comments|ADR-0061]] item 10 hid the comments card in the app until `SUPPORT_EMAIL` was set, because the stores want published contact information for user content ([[R-store-ugc-rules]]: Apple Guideline 1.2 VERIFIED, Google TO-VERIFY). There is no support contact yet ([[open-questions]] #26) and Ganaa wants comments switched on now, for testing on phones, on 2026-10-28.

## Decision

1. This supersedes item 10 of ADR-0061 only. Everything else in ADR-0061 stands.
2. The mobile app always shows the "Сэтгэгдэл" card and the "Хаасан хэрэглэгчид" row. The contact line under the comments is shown only when `supportEmail` from `GET /v1/app-config` is set. `SUPPORT_EMAIL` stays optional.
3. **A store build needs the contact.** It is a launch gate, not a code gate: [[LAUNCH_CHECKLIST]] says `SUPPORT_EMAIL` must be set (or another published contact added) before any store submission. A build submitted without it can be rejected by Apple.

## Alternatives rejected

- Keep the hiding gate: blocks testing of comments on phones until a contact exists.
- A placeholder address: it would be public and wrong.

## Consequences

- Nothing stops a store build without a contact except the checklist; whoever submits must check it.
- A contact other than email (a Facebook page, a phone number) needs a small change, because the setting and the text are an email address today.
