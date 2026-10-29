---
type: index
updated: 2026-10-30
tags: [index]
---

# Онгод: project home

**Phase:** Build, before the 30% demo
**Next milestone:** 30% milestone, the week-4 Android demo: login, episode list, locked-screen playback, admin upload + approve ([[approvals]]). Gate: iPhone first at zero cost ([[ADR-0034-ios-first-zero-cost-device-gate|ADR-0034]]): gate A in Expo Go runs in parallel with phase 3 ([[ADR-0039-phase-3-before-gate-a|ADR-0039]]); gate B (native build: locked-screen audio) before the demo.

## Specs

- [[SPEC]]: product, workflows, data model, acceptance tests
- Latest audit: [[AUDIT-2026-10-27]] (admin, portal, app after the redesign merge) · [[AUDIT-2026-10-17]]
- [[DESIGN]]: tokens, components, screens (v2) · [[DESIGN-v2-aurora]] · mockups `docs/design/v2-screens/` · screenshots `docs/screens/`
- [[glossary]]
- [[open-questions]]
- Client: [[changes]] · [[approvals]] · [[messages]] (project brief: `client/project-brief.md`, added by Ganaa)

## Decisions

| ID       | Note                                                      | Status                                                    |
| -------- | --------------------------------------------------------- | --------------------------------------------------------- |
| ADR-0001 | [[ADR-0001-mobile-react-native-expo]]                     | accepted                                                  |
| ADR-0002 | [[ADR-0002-api-fastify-prisma-mysql-single-process]]      | accepted                                                  |
| ADR-0003 | [[ADR-0003-hosting-itools-node]]                          | accepted                                                  |
| ADR-0004 | [[ADR-0004-media-bunny-token-auth]]                       | accepted                                                  |
| ADR-0005 | [[ADR-0005-bunny-dev-zone-env-switch]]                    | accepted                                                  |
| ADR-0006 | [[ADR-0006-manual-bank-transfer-web-only-payments]]       | accepted (bank part amended by ADR-0041, ADR-0046)        |
| ADR-0007 | [[ADR-0007-access-model-reference-codes]]                 | accepted                                                  |
| ADR-0008 | [[ADR-0008-auth-primitives-two-devices]]                  | accepted                                                  |
| ADR-0009 | [[ADR-0009-social-login-feature-flag]]                    | accepted                                                  |
| ADR-0010 | [[ADR-0010-reliability-jobs-cron-idempotency]]            | accepted (job lock rule amended by ADR-0045)              |
| ADR-0011 | [[ADR-0011-audio-first-media-asset]]                      | superseded by ADR-0038                                    |
| ADR-0012 | [[ADR-0012-design-dark-theme-inspiration-only]]           | accepted                                                  |
| ADR-0013 | [[ADR-0013-fonts-lora-inter]]                             | accepted                                                  |
| ADR-0014 | [[ADR-0014-admin-light-theme]]                            | accepted                                                  |
| ADR-0015 | [[ADR-0015-local-first-android-smoke-test]]               | superseded by ADR-0034                                    |
| ADR-0016 | [[ADR-0016-monitoring-logs-alert-emails]]                 | accepted                                                  |
| ADR-0017 | [[ADR-0017-toolchain-version-pins]]                       | accepted (React pin amended by ADR-0048)                  |
| ADR-0018 | [[ADR-0018-auth-implementation-details]]                  | accepted (items 5, 8 amended by ADR-0045)                 |
| ADR-0019 | [[ADR-0019-social-login-implementation]]                  | accepted                                                  |
| ADR-0020 | [[ADR-0020-bunny-signed-urls-hs256-no-ip]]                | accepted                                                  |
| ADR-0021 | [[ADR-0021-catalog-and-playback-rules]]                   | accepted                                                  |
| ADR-0022 | [[ADR-0022-admin-totp-session-proof]]                     | superseded by ADR-0040                                    |
| ADR-0023 | [[ADR-0023-subscription-workflows-implementation]]        | accepted                                                  |
| ADR-0024 | [[ADR-0024-dev-preview-tooling]]                          | accepted                                                  |
| ADR-0025 | [[ADR-0025-ui-component-set]]                             | accepted                                                  |
| ADR-0026 | [[ADR-0026-web-session-cookie-and-portal]]                | accepted                                                  |
| ADR-0027 | [[ADR-0027-design-v2-aurora-forest-motion]]               | accepted                                                  |
| ADR-0028 | [[ADR-0028-cream-library-and-16x9-artwork]]               | accepted                                                  |
| ADR-0029 | [[ADR-0029-admin-app-implementation]]                     | accepted                                                  |
| ADR-0030 | [[ADR-0030-mobile-app-foundation]]                        | accepted                                                  |
| ADR-0031 | [[ADR-0031-mobile-ui-kit-v2-implementation]]              | accepted                                                  |
| ADR-0032 | [[ADR-0032-audio-expo-audio-instead-of-track-player]]     | accepted                                                  |
| ADR-0033 | [[ADR-0033-expo-go-preview-only]]                         | accepted (SDK premise amended by ADR-0048)                |
| ADR-0034 | [[ADR-0034-ios-first-zero-cost-device-gate]]              | accepted (SDK premise amended by ADR-0048)                |
| ADR-0035 | [[ADR-0035-episode-pictures-16x9-files]]                  | accepted                                                  |
| ADR-0036 | [[ADR-0036-ci-github-actions]]                            | accepted                                                  |
| ADR-0037 | [[ADR-0037-unverified-signup-can-be-replaced]]            | accepted                                                  |
| ADR-0038 | [[ADR-0038-video-episodes-bunny-stream]]                  | accepted                                                  |
| ADR-0039 | [[ADR-0039-phase-3-before-gate-a]]                        | accepted                                                  |
| ADR-0040 | [[ADR-0040-admin-password-only-no-totp]]                  | accepted                                                  |
| ADR-0041 | [[ADR-0041-qpay-via-wire-replaces-bank-transfer]]         | accepted (old bank requests amended by ADR-0046)          |
| ADR-0042 | [[ADR-0042-content-organisation-and-publish-push]]        | accepted                                                  |
| ADR-0043 | [[ADR-0043-allow-free-users-and-free-content]]            | accepted                                                  |
| ADR-0044 | [[ADR-0044-free-items-and-activate-message-in-app]]       | accepted                                                  |
| ADR-0045 | [[ADR-0045-audit-hardening-limits-refresh-jobs-payments]] | accepted (item 3 by ADR-0047, item 1 refresh by ADR-0054) |
| ADR-0046 | [[ADR-0046-remove-bank-transfer-path]]                    | accepted                                                  |
| ADR-0047 | [[ADR-0047-wire-payment-sync-window]]                     | accepted                                                  |
| ADR-0048 | [[ADR-0048-upgrade-to-expo-sdk-58]]                       | accepted                                                  |
| ADR-0049 | [[ADR-0049-player-next-episode-and-autoplay]]             | accepted                                                  |
| ADR-0050 | [[ADR-0050-admin-dense-forest-sidebar]]                   | accepted                                                  |
| ADR-0051 | [[ADR-0051-admin-content-list-redesign]]                  | accepted                                                  |
| ADR-0052 | [[ADR-0052-episode-one-page-editor]]                      | accepted                                                  |
| ADR-0053 | [[ADR-0053-app-only-legal-pages]]                         | accepted                                                  |
| ADR-0054 | [[ADR-0054-refresh-limit-per-device]]                     | accepted                                                  |
| ADR-0055 | [[ADR-0055-push-token-registration]]                      | accepted                                                  |
| ADR-0056 | [[ADR-0056-admin-dashboard-overview]]                     | accepted                                                  |
| ADR-0057 | [[ADR-0057-global-rate-limit-api-only]]                   | accepted                                                  |
| ADR-0058 | [[ADR-0058-portal-design-a-aurora]]                       | accepted                                                  |
| ADR-0059 | [[ADR-0059-admin-plan-editor]]                            | accepted                                                  |
| ADR-0060 | [[ADR-0060-gift-access]]                                  | accepted                                                  |
| ADR-0061 | [[ADR-0061-episode-comments]]                             | accepted                                                  |
| ADR-0062 | [[ADR-0062-comments-without-contact-gate]]                | accepted                                                  |
| ADR-0063 | [[ADR-0063-node-22-toolchain]]                            | accepted                                                  |
| ADR-0064 | [[ADR-0064-api-on-node-22]]                               | accepted                                                  |
| ADR-0065 | [[ADR-0065-player-next-at-the-bottom]]                    | accepted                                                  |
| ADR-0066 | [[ADR-0066-comments-flat-in-player]]                      | accepted                                                  |
| ADR-0067 | [[ADR-0067-player-scrolls-with-mini-bar]]                 | accepted                                                  |
| ADR-0068 | [[ADR-0068-admin-upload-flow-like-creator-platforms]]     | accepted                                                  |
| ADR-0069 | [[ADR-0069-cover-from-video-picture]]                     | accepted                                                  |
| ADR-0070 | [[ADR-0070-admin-several-files-at-once]]                  | accepted                                                  |
| ADR-0071 | [[ADR-0071-audit-2026-10-29-fixes]]                       | accepted                                                  |
| ADR-0072 | [[ADR-0072-payments-off-until-launch]]                    | accepted                                                  |
| ADR-0073 | [[ADR-0073-free-bunny-encoding-show-wait]]                | accepted                                                  |

## Research

| Note                               | Status     | Recheck after |
| ---------------------------------- | ---------- | ------------- |
| [[R-account-deletion-stores]]      | TO-VERIFY  | —             |
| [[R-store-ugc-rules]]              | TO-VERIFY  | 2027-01-26    |
| [[R-admin-light-contrast]]         | VERIFIED   | —             |
| [[R-apple-login-services-4-8]]     | VERIFIED   | 2027-01-06    |
| [[R-apple-id-token-verification]]  | VERIFIED   | 2027-01-06    |
| [[R-apple-no-payment-ui]]          | ASSUMPTION | —             |
| [[R-audio-bitrate]]                | ASSUMPTION | —             |
| [[R-bunny-pricing]]                | VERIFIED   | 2027-01-06    |
| [[R-bunny-free-encoding-queue]]    | VERIFIED   | 2027-01-27    |
| [[R-bunny-stream]]                 | TO-VERIFY  | 2027-01-16    |
| [[R-wire-qpay-gateway]]            | TO-VERIFY  | 2026-11-19    |
| [[R-bunny-token-auth]]             | VERIFIED   | 2027-01-06    |
| [[R-claude-code-commands]]         | VERIFIED   | 2026-12-07    |
| [[R-eas-free-tier]]                | TO-VERIFY  | —             |
| [[R-eas-json-profiles]]            | VERIFIED   | 2026-12-08    |
| [[R-expo-apple-authentication]]    | TO-VERIFY  | 2026-11-08    |
| [[R-expo-audio-sdk57]]             | VERIFIED   | 2026-12-08    |
| [[R-expo-push-api]]                | VERIFIED   | 2026-12-07    |
| [[R-expo-notifications-sdk57]]     | VERIFIED   | 2026-12-27    |
| [[R-expo-sdk-57-versions]]         | VERIFIED   | 2026-12-07    |
| [[R-expo-sdk-58-versions]]         | VERIFIED   | 2026-12-23    |
| [[R-expo-video-sdk57]]             | VERIFIED   | 2026-12-17    |
| [[R-fonts-mongolian-cyrillic]]     | VERIFIED   | —             |
| [[R-fontsource-subset-css]]        | VERIFIED   | 2026-12-07    |
| [[R-google-id-token-verification]] | TO-VERIFY  | 2026-12-07    |
| [[R-github-actions-billing]]       | TO-VERIFY  | 2027-01-15    |
| [[R-google-signin-v16]]            | VERIFIED   | 2026-12-08    |
| [[R-google-play-closed-test]]      | VERIFIED   | 2027-01-06    |
| [[R-google-play-payments]]         | TO-VERIFY  | —             |
| [[R-hosting-limits]]               | TO-VERIFY  | —             |
| [[R-ios-device-install]]           | TO-VERIFY  | 2027-01-15    |
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

- [[2026-10-30]]
- [[2026-10-29]]
- [[2026-10-28]]
- [[2026-10-27]]
- [[2026-10-26]]
- [[2026-10-24]]
- [[2026-10-23]]

## Runbooks

- [[DEPLOY]] · [[BUNNY_SWITCH]] · [[MOBILE_BUILD]] · [[EXPO_GO_PREVIEW]] · [[DEVICE_SMOKE]] · [[SECRETS]] · [[STORE]] · [[LAUNCH_CHECKLIST]] (all drafts)
