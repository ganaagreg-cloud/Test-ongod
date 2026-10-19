---
topic: Wire (wire.mn) payment gateway with QPay as an operator: API shape, webhooks, amount units, fees
status: TO-VERIFY
checked: '2026-10-19'
recheck_after: '2026-11-19'
source: 'https://wire.mn (landing page, fetched 2026-10-19); https://docs.wire.mn (landing page only, no endpoint detail); the owner''s working code in ganaagreg-cloud/dear-love-app (src/lib/wire.ts, src/lib/orders.ts, src/app/api/webhooks/wire/route.ts, read 2026-10-19)'
tags: [research, area/payments]
---

## Fact

All TO-VERIFY: not read from Wire's API reference (docs.wire.mn gave only a landing page). The shape below is what the owner's production code for dearlove.mn does, which is real evidence that it works, but it is not Wire's documentation.

- **What Wire is:** a Mongolian unified payment gateway; one integration for bank apps and QR payments. QPay is one "operator" (`allowed_operators: ['qpay']`; `['sandbox']` with a test key). The wire.mn page does not name QPay itself; the dearlove.mn footer says "QPay (Wire)".
- **Fees:** wire.mn says no setup or monthly fee, and a transaction fee on successful payments "starting at 1%, depending on the connector" (the exact rate shows after a bank account is linked). ASSUMPTION for our cost until a real rate is seen.
- **API:** `https://api.wire.mn`. Official TypeScript SDK `@buildry-wire/wire` (Node 18 or newer). Flow: `paymentIntents.create({ amount, currency: 'MNT', allowed_operators, metadata, idempotencyKey })`, then `POST /v1/checkout/sessions { payment_intent, success_url, cancel_url }` returns a hosted checkout `url`; later `paymentIntents.retrieve(id)` gives `status`, `amount`, `livemode`.
- **Statuses used:** `succeeded` (paid), `canceled` and `failed` (dead); anything else is still pending.
- **Webhook:** `POST` with header `WirePayment-Signature`, verified by `new Webhooks().verify(rawBody, signature, secret)` (needs the raw body). Events used: `payment_intent.succeeded`, `payment_intent.canceled`, `payment_intent.payment_failed`. The intent id is `(event.data.object ?? event.data).id`. Event ids repeat on retries, so they must be de-duplicated.
- **Amount units (known bug, from the owner's experience, 2026-09-25):** Wire's docs say MNT amounts are minor units (x100), but the live QPay connector charged the raw number: 10000 sent for a 100 ₮ price produced a 10,000 ₮ invoice. The reference code therefore sends whole ₮ (`toMinor = Math.round`). Reported to Wire support; no fix confirmed. **Must be re-checked with one small live payment before launch** (flipping it early silently undercharges 100x).
- **Test keys:** `sk_test_...` and `sk_live_...`; `pi.livemode` tells which. Never unlock on a test intent in production.

## Checked in code (2026-10-19)

The installed SDK `@buildry-wire/wire` 1.0.0 (MIT, Node 18 or newer, published 2026-06) matches the shape above: `paymentIntents.create/retrieve`, `Wire.request`, `Webhooks.verify`, `SIGNATURE_HEADER = "WirePayment-Signature"`, `PaymentIntent { id, amount, status, livemode, ... }`, default base URL `https://api.wire.mn`. The webhook signature is `t=<unix>,v1=<hex HMAC-SHA256 of "t." + raw body>` with a 300 s tolerance (read from the SDK source). This confirms the types and the signing scheme, not Wire's server behaviour, fees or the amount-unit bug.

## Implication

[[ADR-0041-qpay-via-wire-replaces-bank-transfer]] builds on this. Open items before launch: Wire merchant account and QPay operator enabled (client side, see [[open-questions]] #6), the exact fee, the amount-unit behaviour, and a sandbox test with our own key.
