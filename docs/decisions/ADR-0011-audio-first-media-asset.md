---
id: ADR-0011
title: Audio-first content with a MediaAsset table for later video
status: accepted
date: 2026-10-08
tags: [adr, area/media, area/design]
---

## Context

Content today is audio over a cover image (20–40 min); video may come later ([[SPEC#Product]]).

## Decision

Square 1:1 covers and an audio player UI. Media files live in a separate `MediaAsset` table (`kind` AUDIO | VIDEO, `provider` BUNNY_STORAGE | BUNNY_STREAM), so video plugs in without schema changes to `Episode`.

## Alternatives rejected

- **16:9 video-style covers:** wrong for audio ([[DESIGN#Do not]]).

## Consequences

- When video arrives, the player's cover area becomes the video ([[DESIGN#App screens]]).

## Evidence

- [[R-audio-bitrate]] (ASSUMPTION) for size estimates.
