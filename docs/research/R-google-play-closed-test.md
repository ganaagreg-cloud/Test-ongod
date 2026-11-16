---
topic: New Google Play personal accounts need a closed test before production
status: TO-VERIFY
checked: '2026-11-16'
recheck_after: '2027-02-14'
source: 'Secondary sources only (third-party guides found by web search 2026-11-16); support.google.com is not reachable from the session network. Earlier note: Google Play Console Help, read during planning, URL not recorded'
tags: [research, store/google]
---

## Fact

Personal developer accounts created after 2023-11-13 must run a closed test with at least **12 testers for 14 days** before they can apply for production access (the number was 20 in 2023 and reduced to 12 in December 2024, per third-party guides). It applies per app, until that account has production access. **Organization accounts are exempt.** Third-party guides say reviewers in 2026 reject weak tester engagement (testers must really use the app). Allow about 3 weeks from first upload to a live app.

## How it was checked

Web search 2026-11-16: the sources agree with each other but none is Google's own page. Status lowered from VERIFIED to TO-VERIFY for that reason. Read the Play Console Help page once `support.google.com` is allowed in the session network, or look at the Play Console of the account itself: it shows the requirement for the real account.

## Used by

- [[STORE]]
- [[LAUNCH_CHECKLIST]]
