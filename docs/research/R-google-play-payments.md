---
topic: Google Play requires Play Billing for in-app digital content sales
status: TO-VERIFY
checked: '2026-11-16'
recheck_after: '2027-02-14'
source: 'Web search summaries of the Google Play Payments policy (support.google.com/googleplay/android-developer/answer/9858738), 2026-11-16; the page itself is not reachable from the session network'
tags: [research, area/payments, store/google]
---

## Fact

Summary of what the search results say about the Payments policy (not read first-hand):

- Digital goods and subscriptions sold **inside** a Play-distributed app must use Google Play's billing system.
- Inside the app, developers may not lead users to another payment method, for example a link to a web page that leads to another way to pay, or wording that encourages buying outside the app.
- Links to administrative pages (account management, privacy policy, help centre) are allowed if the page does not lead on to a prohibited payment method.
- Purchases that can only be consumed **outside** a Play app do not need Play billing.
- Some regions (the EEA and some other countries) have alternative billing or external-offer programs. **Nothing was found about Mongolia**: no program is known, so assume none.

**For us (assumption):** with the server switch `inAppPayment` off the Android app shows no payment wording, which is the safe setting. With the switch **on**, "Эрх авах" opening a bank app, the gift shop and the code field (ADR-0076, ADR-0090) are the kind of thing this policy restricts; keep the switch off for the Google submission until this is read first-hand. The owner has accepted the risk for Apple in ADR-0076; Google has not been decided.

## How it was checked

Two web searches 2026-11-16. Both returned summaries of Google pages and an older Android Developers blog post (2020), not the current policy text. Direct fetches of `support.google.com` and `play.google.com` failed (hosts not allowed in this session).

## Used by

- [[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]]
- [[ADR-0076-in-app-payment-with-bank-deeplinks|ADR-0076]]
