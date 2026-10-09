---
type: index
updated: 2026-10-09
tags: [index]
---

# Онгод: project home

**Phase:** Build, before the 30% demo
**Next milestone:** 30% milestone, the week-4 Android demo: login, episode list, locked-screen playback, admin upload + approve ([[approvals]]). Gate: native smoke test on a real Android device ([[ADR-0015-local-first-android-smoke-test|ADR-0015]]).

## Specs

- [[SPEC]]: product, workflows, data model, acceptance tests
- [[DESIGN]]: tokens, components, screens (v2) · [[DESIGN-v2-aurora]] · mockups `docs/design/v2-screens/` · screenshots `docs/screens/`
- [[glossary]]
- [[open-questions]]
- Client: [[changes]] · [[approvals]] · [[messages]] (project brief: `client/project-brief.md`, added by Ganaa)

## Decisions

| ID       | Note                                                 | Status   |
| -------- | ---------------------------------------------------- | -------- |
| ADR-0001 | [[ADR-0001-mobile-react-native-expo]]                | accepted |
| ADR-0002 | [[ADR-0002-api-fastify-prisma-mysql-single-process]] | accepted |
| ADR-0003 | [[ADR-0003-hosting-itools-node]]                     | accepted |
| ADR-0004 | [[ADR-0004-media-bunny-token-auth]]                  | accepted |
| ADR-0005 | [[ADR-0005-bunny-dev-zone-env-switch]]               | accepted |
| ADR-0006 | [[ADR-0006-manual-bank-transfer-web-only-payments]]  | accepted |
| ADR-0007 | [[ADR-0007-access-model-reference-codes]]            | accepted |
| ADR-0008 | [[ADR-0008-auth-primitives-two-devices]]             | accepted |
| ADR-0009 | [[ADR-0009-social-login-feature-flag]]               | accepted |
| ADR-0010 | [[ADR-0010-reliability-jobs-cron-idempotency]]       | accepted |
| ADR-0011 | [[ADR-0011-audio-first-media-asset]]                 | accepted |
| ADR-0012 | [[ADR-0012-design-dark-theme-inspiration-only]]      | accepted |
| ADR-0013 | [[ADR-0013-fonts-lora-inter]]                        | accepted |
| ADR-0014 | [[ADR-0014-admin-light-theme]]                       | accepted |
| ADR-0015 | [[ADR-0015-local-first-android-smoke-test]]          | accepted |
| ADR-0016 | [[ADR-0016-monitoring-logs-alert-emails]]            | accepted |
| ADR-0017 | [[ADR-0017-toolchain-version-pins]]                  | accepted |
| ADR-0018 | [[ADR-0018-auth-implementation-details]]             | accepted |
| ADR-0019 | [[ADR-0019-social-login-implementation]]             | accepted |
| ADR-0020 | [[ADR-0020-bunny-signed-urls-hs256-no-ip]]           | accepted |
| ADR-0021 | [[ADR-0021-catalog-and-playback-rules]]              | accepted |
| ADR-0022 | [[ADR-0022-admin-totp-session-proof]]                | accepted |
| ADR-0023 | [[ADR-0023-subscription-workflows-implementation]]   | accepted |
| ADR-0024 | [[ADR-0024-dev-preview-tooling]]                     | accepted |
| ADR-0025 | [[ADR-0025-ui-component-set]]                        | accepted |
| ADR-0026 | [[ADR-0026-web-session-cookie-and-portal]]           | accepted |
| ADR-0027 | [[ADR-0027-design-v2-aurora-forest-motion]]          | accepted |
| ADR-0028 | [[ADR-0028-cream-library-and-16x9-artwork]]          | accepted |
| ADR-0029 | [[ADR-0029-admin-app-implementation]]                | accepted |
| ADR-0030 | [[ADR-0030-mobile-app-foundation]]                   | accepted |
| ADR-0031 | [[ADR-0031-mobile-ui-kit-v2-implementation]]         | accepted |
| ADR-0032 | [[ADR-0032-audio-expo-audio-instead-of-track-player]] | accepted |

## Research

| Note                               | Status     | Recheck after |
| ---------------------------------- | ---------- | ------------- |
| [[R-account-deletion-stores]]      | TO-VERIFY  | —             |
| [[R-admin-light-contrast]]         | VERIFIED   | —             |
| [[R-apple-login-services-4-8]]     | VERIFIED   | 2027-01-06    |
| [[R-apple-id-token-verification]]  | VERIFIED   | 2027-01-06    |
| [[R-apple-no-payment-ui]]          | ASSUMPTION | —             |
| [[R-audio-bitrate]]                | ASSUMPTION | —             |
| [[R-bunny-pricing]]                | VERIFIED   | 2027-01-06    |
| [[R-bunny-token-auth]]             | VERIFIED   | 2027-01-06    |
| [[R-claude-code-commands]]         | VERIFIED   | 2026-12-07    |
| [[R-eas-free-tier]]                | TO-VERIFY  | —             |
| [[R-eas-json-profiles]]            | VERIFIED   | 2026-12-08    |
| [[R-expo-apple-authentication]]    | TO-VERIFY  | 2026-11-08    |
| [[R-expo-audio-sdk57]]             | VERIFIED   | 2026-12-08    |
| [[R-expo-push-api]]                | VERIFIED   | 2026-12-07    |
| [[R-expo-sdk-57-versions]]         | VERIFIED   | 2026-12-07    |
| [[R-fonts-mongolian-cyrillic]]     | VERIFIED   | —             |
| [[R-fontsource-subset-css]]        | VERIFIED   | 2026-12-07    |
| [[R-google-id-token-verification]] | TO-VERIFY  | 2026-12-07    |
| [[R-google-signin-v16]]            | VERIFIED   | 2026-12-08    |
| [[R-google-play-closed-test]]      | VERIFIED   | 2027-01-06    |
| [[R-google-play-payments]]         | TO-VERIFY  | —             |
| [[R-hosting-limits]]               | TO-VERIFY  | —             |
| [[R-motion-libs-sdk-57]]           | VERIFIED   | 2026-12-08    |
| [[R-mysql-skip-locked-claim]]      | VERIFIED   | —             |
| [[R-otplib-13-totp]]               | VERIFIED   | 2026-12-07    |
| [[R-prisma-7-agent-guard]]         | VERIFIED   | 2026-12-07    |
| [[R-sentry-react-native-expo]]     | VERIFIED   | 2026-12-08    |
| [[R-track-player-new-arch]]        | VERIFIED   | —             |
| [[R-tanstack-table-v9]]            | VERIFIED   | 2026-12-08    |
| [[R-tus-js-client-4]]              | VERIFIED   | 2026-12-08    |
| [[R-typescript-eslint-ts-support]] | VERIFIED   | 2026-12-07    |

## Latest logs

- [[2026-10-09]]
- [[2026-10-08]]
- [[2026-10-05]]

## Runbooks

- [[DEPLOY]] · [[BUNNY_SWITCH]] · [[MOBILE_BUILD]] · [[DEVICE_SMOKE]] · [[SECRETS]] · [[STORE]] · [[LAUNCH_CHECKLIST]] (all drafts)
