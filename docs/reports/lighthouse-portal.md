---
type: report
date: 2026-10-08
tags: [report, area/web]
---

# Lighthouse: portal (mobile)

Mobile preset (emulated phone, simulated slow 4G), production build served by the API process, median of 3 runs per page, Lighthouse 13.5.0. Times in ms. Pages behind the login are not audited (the access token lives in memory only).

| Page              | Performance | Accessibility | Best practices | SEO | FCP  | LCP  | TBT | CLS | Speed index |
| ----------------- | ----------- | ------------- | -------------- | --- | ---- | ---- | --- | --- | ----------- |
| `/`               | 95          | 100           | 96             | 100 | 1664 | 2863 | 0   | 0   | 1664        |
| `/plans`          | 94          | 100           | 96             | 100 | 2050 | 2907 | 0   | 0   | 2050        |
| `/login`          | 96          | 100           | 96             | 100 | 1899 | 2453 | 0   | 0   | 1899        |
| `/register`       | 95          | 100           | 96             | 100 | 2199 | 2592 | 0   | 0   | 2199        |
| `/privacy`        | 95          | 100           | 96             | 100 | 2033 | 2560 | 0   | 0   | 2033        |
| `/terms`          | 95          | 100           | 96             | 100 | 2034 | 2561 | 0   | 0   | 2034        |
| `/delete-account` | 95          | 100           | 96             | 100 | 2050 | 2593 | 0   | 0   | 2050        |

## Audits that did not pass

- `/`: inspector-issues (Issues were logged in the `Issues` panel in Chrome Devtools)
- `/plans`: inspector-issues (Issues were logged in the `Issues` panel in Chrome Devtools)
- `/login`: inspector-issues (Issues were logged in the `Issues` panel in Chrome Devtools)
- `/register`: inspector-issues (Issues were logged in the `Issues` panel in Chrome Devtools)
- `/privacy`: inspector-issues (Issues were logged in the `Issues` panel in Chrome Devtools)
- `/terms`: inspector-issues (Issues were logged in the `Issues` panel in Chrome Devtools)
- `/delete-account`: inspector-issues (Issues were logged in the `Issues` panel in Chrome Devtools)
