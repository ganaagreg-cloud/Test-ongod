---
topic: Store requirements for account deletion
status: TO-VERIFY
checked: '2026-11-16'
recheck_after: '2027-02-14'
source: 'Google: web search summary of https://support.google.com/googleplay/android-developer/answer/13327111 (not reachable directly), 2026-11-16. Apple: not checked yet (App Review Guidelines 5.1.1(v))'
tags: [research, store/apple, store/google]
---

## Fact

To verify: Apple requires in-app account deletion when the app allows account creation. Google Play requires in-app deletion plus a web link where users can request deletion. The plan covers both: Тохиргоо → "Бүртгэл устгах" in the app and a portal deletion page ([[SPEC#Surfaces]], [[SPEC#Workflows]] H).

**Google (TO-VERIFY, from a search summary of Google's help page):** all developers answer deletion questions in the **Data safety** form. An app that lets people create an account must say so and give a **web link** where a person can ask for deletion, even if the app has in-app deletion. The link can be a deletion page, a support email or a form. Our portal page `/delete-account` and the support page `/support` fit this.

## How it was checked

Google part: one web search 2026-11-16 (Google help page text as quoted in the result, plus a security news article). Apple part not checked.

## Used by

- [[STORE]]
