---
topic: WCAG contrast of the admin light theme
status: VERIFIED
checked: 2026-10-08
recheck_after:
source: 'computed locally: WCAG 2.x relative-luminance formula in Node, values from packages/tokens themes.light'
tags: [research, area/design]
---

## Fact

On white: textPrimary #141A17 17.6:1, textSecondary #4F5A54 7.2:1, accentText #8A6A2B 5.0:1, success 5.1, danger 5.6, warning 5.7, info 6.4; white on #1F3B2E 12.2:1. textTertiary #5F6862 is 5.2:1 on bg #F6F4EF and 4.8:1 on surfaceSunken #EEEBE4.

**Below AA 4.5:1:**

- accentText 4.22 and success 4.27 on surfaceSunken.
- Success badge text on its 12% background: 4.34 on white, 3.97 on bg. Danger badges: 4.26 on bg, 3.95 on sunken. Warning badges: 4.44 on bg.
- Dark theme danger badge: 4.12 on surface, 3.71 on surfaceRaised.

A darker success such as #2A733D gives 4.91 on white and 4.49 on bg.

## How it was checked

Node script with the WCAG formula; badge backgrounds alpha-composited (12%) over each surface before measuring. Values only change if the tokens change.

## Used by

- [[ADR-0014-admin-light-theme|ADR-0014]]
