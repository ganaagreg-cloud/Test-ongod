---
topic: Apple External Link Account Entitlement for reader apps
status: VERIFIED
checked: '2026-11-17'
recheck_after: '2027-02-15'
source: 'https://developer.apple.com/support/reader-apps/ (fetched 2026-11-17)'
tags: [research, area/payments, store/apple]
---

## Fact

**VERIFIED (Apple, primary, 2026-11-17).** An approved reader app may show **one link** inside the app to its own website, where people create or manage an account. Digital content (audio, video, and so on) must be the app's **primary function**; users sign in and use content bought outside the app; the app must **not offer in-app purchases** on iOS while it uses the entitlement; no real-time person-to-person services.

How to apply: the Account Holder sends a request form for each bundle ID; each entitlement works only with the one binary tied to that bundle ID. Then configure the App ID, add the entitlement key `com.apple.developer.storekit.external-link.account` in Xcode and `SKExternalLinkAccount` in Info.plist (a dictionary of region code to URL, with a `*` default).

The link: `https` URL with no query parameters, at most 1,000 characters; goes directly to a site we own (no redirects or landing pages); opens in the **default browser, not a web view**; statically set in Info.plist (a change means a resubmission); shown as a standard blue underlined link with the domain name; **one link per app page**; **no wording about prices**. Allowed wording is along the lines of "go to example.com to create or manage your account." Before every link-out the app shows an **Apple disclosure sheet** (iOS 16 and later: the External Link Account API; check `canMakePayments` first). Not allowed in app metadata. Available in every storefront where the App Store is available (no Mongolia exception found).

What it does **not** give: a buy button, plan names or prices in the app. It is an account link only. EU (from 2026-10-01): reader apps may promote out-of-app offers without a link under a different entitlement, on a separate page. Apple may reject an app that does not qualify as a reader app, and says that turning an existing app into a reader app by a big update is not appropriate.

## How it was checked

WebFetch of Apple's "reader apps" page on 2026-11-17. Not read: the request form itself and Apple's current review turnaround.

## Used by

- [[ADR-0076-in-app-payment-with-bank-deeplinks|ADR-0076]] (the switch that this route would replace)
- Builds on [[R-apple-no-payment-ui]]
