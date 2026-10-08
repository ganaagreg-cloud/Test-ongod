---
type: client
tags: [client, scope]
---

# Change requests

Every client request that changes scope is recorded here before any code. Template: `templates/change-request.md`.

### 2026-10-08: Google / Apple login

- **Client asked:** sign in with Google (and Apple on iOS).
- **In scope:** no; paid add-on ([[SPEC#Workflows]] C, [[ADR-0009-social-login-feature-flag|ADR-0009]])
- **Price:** ~500,000 ₮ as an add-on
- **Status:** accepted as a paid add-on (decision relayed by Ganaa on 2026-10-08; phase 2 not chosen). Written confirmation and the final price are still to be added to [[approvals]].
- **Notes:** if Google is offered on iOS, Sign in with Apple is mandatory ([[R-apple-login-services-4-8]]). [[open-questions]] #10. API built behind `SOCIAL_LOGIN` ([[ADR-0019-social-login-implementation|ADR-0019]]).

### 2026-10-08: Offline downloads

- **Client asked:** download episodes to listen offline.
- **In scope:** no ([[SPEC#Out of scope (paid add-ons)]])
- **Price:** not quoted yet
- **Status:** proposed
- **Notes:** [[open-questions]] #11.

### 2026-10-08: Payment screen moved from app to web

- **Client asked:** the concept showed a payment screen inside the app.
- **In scope:** yes, as a scope clarification: payment happens only in the web portal ([[SPEC#Surfaces]], [[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]]).
- **Price:** 0 ₮
- **Status:** proposed (awaiting the client's confirmation)
- **Notes:** required by store rules ([[R-apple-no-payment-ui]], [[R-google-play-payments]]).

Dates are when the entries were logged; the requests came from earlier planning chats.
