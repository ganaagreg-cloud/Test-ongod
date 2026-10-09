---
topic: react-native-track-player on the React Native New Architecture (RN 0.86 / Expo SDK 57)
status: VERIFIED
checked: '2026-10-09'
recheck_after: '—'
source: '`npx expo-doctor` on apps/mobile (2026-10-09); node_modules/react-native-track-player/package.json 4.1.2; https://cdn.jsdelivr.net/npm/@rntp/player@5.7.0/README.md (fetched 2026-10-09)'
tags: [research, area/mobile, risk]
---

## Fact

- **4.1.2 (installed until 2026-10-09):** `expo-doctor` check "Validate packages against React Native Directory package metadata" failed for exactly one package: **react-native-track-player: Unsupported on New Architecture** (the other 20 checks passed). The package has no `codegenConfig`, so it is a classic native module that could only run through React Native's compatibility layer; whether that layer runs it correctly on RN 0.86 was never tested.
- **v5 (`@rntp/player` 5.7.0):** its README says it is "Built on the New Architecture" (Fabric + TurboModules, React Native 0.74 or later) and that it is **"Free for non-commercial use"**; commercial use needs a paid license (rntp.dev/pricing, badge "License: Commercial", terms in `license.txt`, which was not read). No price is stated in the README. Expo is not mentioned.

## Conclusion

react-native-track-player is replaced by **expo-audio** ([[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]], facts in [[R-expo-audio-sdk57]]). After the swap `expo-doctor` passes 21/21. This note is closed; it stays as the record of why.

## Not covered

- The RNTP v5 price and license text; release notes and issues of either version (not read, not needed after the decision).

## Used by

[[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]], [[ADR-0001-mobile-react-native-expo|ADR-0001]] (the audio part is superseded)
