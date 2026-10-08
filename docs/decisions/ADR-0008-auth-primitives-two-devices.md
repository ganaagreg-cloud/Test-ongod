---
id: ADR-0008
title: Auth with proven primitives; max 2 devices; email verified by 6-digit code
status: accepted
date: 2026-10-08
tags: [adr, area/auth, area/backend]
---

## Context

Paid accounts must not be shared widely; custom crypto is a risk.

## Decision

- Passwords: argon2id.
- Access token: JWT, 15 minutes.
- Refresh token: opaque, stored as a SHA-256 hash, rotated on each use, with reuse detection (reuse revokes the token family).
- Max 2 devices per user; the third login gets `DEVICE_LIMIT` ([[SPEC#Workflows]] B).
- Email verified by a 6-digit code ([[SPEC#Workflows]] A).
- Proven libraries only (argon2, jose, google-auth-library). No custom crypto.

## Alternatives rejected

- **Long-lived JWTs without refresh rotation:** a stolen token cannot be revoked.

## Consequences

- Session and Device tables per [[SPEC#Data model (Prisma)]].

## Evidence

- None external.
