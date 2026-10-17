---
topic: EAS cloud build free-tier limits
status: TO-VERIFY
checked: '2026-10-17'
recheck_after:
source: 'web search summary of https://expo.dev/pricing and https://expo.dev/changelog/2023-08-01-eas-free-plan-limits (expo.dev not reachable from the session)'
tags: [research, area/mobile, cost]
---

## Fact

Reported, not read on the live page: the Free plan includes up to 15 Android and 15 iOS builds per month in a low-priority queue; failed builds that end within 3 minutes do not count (up to 10 per month). Builds need no Mac. iOS builds for a physical device also need a paid Apple Developer Program membership ([[R-ios-device-install]]).

## How it was checked

2026-10-17: web search only; `expo.dev` was blocked by the session's network policy. Open https://expo.dev/pricing and confirm before relying on the numbers.

## Used by

- [[ADR-0001-mobile-react-native-expo|ADR-0001]]
- [[ADR-0015-local-first-android-smoke-test|ADR-0015]]
