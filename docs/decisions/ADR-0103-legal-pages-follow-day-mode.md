---
id: ADR-0103
title: 'The terms and privacy pages opened from the app are white in day mode'
status: accepted
date: '2026-11-13'
tags: [adr, area/mobile, area/portal]
---

## Context

The app opens `/app/terms` and `/app/privacy` of the portal in an in-app browser ([[ADR-0093-legal-pages-inside-the-app-logout-on-profile|ADR-0093]]). The portal is dark, so in day mode ([[ADR-0102-day-night-login-portrait-white-admin|ADR-0102]]) the member left a white app for a dark page. Ganaa asked for it to be white in day mode (2026-11-13).

## Decision

1. The app adds `?theme=day` to those links when the member is in day mode (`portalLink(base, path, mode)`); night adds `?theme=night`.
2. `AppLayout` (the `/app/*` pages only) sets `data-theme="light"` while `theme=day` is present. Without the parameter the pages stay as before. The rest of the portal is unchanged.

## Consequences

- No new text, no payment words. Works with the existing in-app browser; needs a new app build and a portal deploy.
- The in-app browser's toolbar colour is still the dark one; changing it is a separate small step.
