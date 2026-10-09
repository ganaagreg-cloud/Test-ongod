---
topic: eas.json build profiles, environments and app version source
status: VERIFIED
checked: '2026-10-09'
recheck_after: '2026-12-08'
source: 'https://docs.expo.dev/eas/json/ and https://docs.expo.dev/build-reference/app-versions/ (fetched 2026-10-09)'
tags: [research, area/mobile, tooling]
---

## Fact

- Profile fields used: `developmentClient`, `distribution` (`internal` or `store`), `environment` (`development`, `preview` or `production`: picks the EAS environment variables), `channel` (EAS Update; no effect on the development profile), `android.buildType` (`apk` or `app-bundle`), `ios.simulator`, `autoIncrement`.
- `cli.appVersionSource`: `remote` means EAS keeps `android.versionCode` / `ios.buildNumber` on its servers and `autoIncrement` bumps them there; recommended from EAS CLI 12.0.0. The docs do not state the default, so `eas.json` sets it explicitly.
- Internal distribution needs an `.apk` or `.ipa`. For a development build on a physical iPhone, `ios.simulator` must be left out (devices must be registered with the Apple developer account).
- `EXPO_PUBLIC_*` variables are read when the JS bundle is built, so preview and production builds need them as EAS environment variables ([[MOBILE_BUILD]]).

## Not covered

- EAS free-tier build limits: still [[R-eas-free-tier]] (TO-VERIFY).
- `eas env:create` exact flags: the runbook lists the commands as a starting point; confirm with `eas env:create --help` before the first build.

## Used by

[[ADR-0029-mobile-app-foundation|ADR-0029]], [[ADR-0015-local-first-android-smoke-test|ADR-0015]]
