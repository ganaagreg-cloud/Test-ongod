---
topic: Motion libraries for Expo SDK 57 (Reanimated, worklets, gesture-handler, blur, gradient, haptics, image)
status: VERIFIED
checked: '2026-10-09'
recheck_after: '2026-12-08'
source: 'https://docs.expo.dev/versions/latest/sdk/reanimated/ , https://docs.expo.dev/versions/latest/sdk/gesture-handler/ (fetched 2026-10-09); versions read from node_modules after `npx expo install`'
tags: [research, area/mobile, tooling]
---

## Fact

Installed with `npx expo install` in apps/mobile (Expo SDK 57, RN 0.86.3, pnpm, `node-linker=hoisted`):

| Package | Installed | package.json range |
|---|---|---|
| react-native-reanimated | 4.5.1 | 4.5.1 |
| react-native-worklets | 0.10.1 | (expo-chosen) |
| react-native-gesture-handler | 2.32.0 | ~2.32.0 |
| expo-blur | 57.0.3 | ~57.0.3 |
| expo-linear-gradient | 57.0.2 | ~57.0.2 |
| expo-haptics | 57.0.3 | ~57.0.3 |
| expo-image | 57.0.5 | ~57.0.5 |

- Reanimated 4 needs `react-native-worklets` as a direct dependency (Expo docs: `npx expo install react-native-reanimated react-native-worklets`).
- Babel: no `babel.config.js` and no manual plugin. `babel-preset-expo` adds the worklets plugin automatically when `react-native-worklets` is installed (Expo docs: "No additional configuration is required"; confirmed in `babel-preset-expo/build/configs/expo.js`).
- Gesture handler: the Expo page only covers installation. The library's own docs require `GestureHandlerRootView` at the app root, and content inside a React Native `Modal` needs its own `GestureHandlerRootView` on Android (library docs, not re-fetched; confirmed by the Sheet test on a device = TO-VERIFY).
- `expo-image` suggests the `expo-image` config plugin; `app.config.ts` is dynamic so it was added by hand.
- All of these need a NEW dev build (native code changed). Expo web works with all six (blur = CSS backdrop-filter; haptics = no-op).

## Not covered

- Behavior on a real device (blur on iOS, reduce-motion, Android Modal gestures): TO-VERIFY at the first dev build ([[ADR-0015-local-first-android-smoke-test|ADR-0015]]).

## Used by

[[ADR-0027-design-v2-aurora-forest-motion|ADR-0027]]
