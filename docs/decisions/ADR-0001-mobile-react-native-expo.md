---
id: ADR-0001
title: Mobile app = React Native + Expo dev build
status: accepted
date: 2026-10-08
tags: [adr, area/mobile]
---

## Context

One developer builds iOS, Android, web portal, admin and API. Background audio playback is required ([[SPEC#Surfaces]]).

## Decision

React Native with Expo, run as a **dev build** (not Expo Go), expo-router for navigation and react-native-track-player for audio. One TypeScript language across the whole stack, sharing zod schemas and design tokens from `packages/`.

## Alternatives rejected

- **Flutter:** a second language (Dart). Types, schemas and tokens could not be shared with the TypeScript API and web apps.

## Consequences

- Native modules (track-player, fonts) need a dev build: Android Studio locally or EAS ([[R-eas-free-tier]]).
- Expo SDK upgrades pin the React version for the whole monorepo ([[ADR-0017-toolchain-version-pins|ADR-0017]]).

## Evidence

- Decided in planning chats; no external facts involved.
