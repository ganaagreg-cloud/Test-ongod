---
id: ADR-0009
title: Google + Sign in with Apple behind feature flag SOCIAL_LOGIN
status: proposed
date: 2026-10-08
tags: [adr, area/auth]
---

## Context

The client may want social login. Apple requires an equivalent privacy-focused login if Google login is offered on iOS ([[R-apple-login-services-4-8]]).

## Decision (proposed)

Social login is an optional feature behind `SOCIAL_LOGIN`. If enabled on iOS, Google and Sign in with Apple ship together. Flow per [[SPEC#Workflows]] C. Stays proposed until the client decides between a paid add-on and phase 2 ([[open-questions]] #10, [[changes]]).

## Alternatives rejected

- **Google only on iOS:** rejected by App Review guideline 4.8.

## Consequences

- `GET /v1/app-config` already returns `socialLogin` from env.

## Evidence

- [[R-apple-login-services-4-8]]
