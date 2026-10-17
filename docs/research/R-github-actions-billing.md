---
topic: GitHub Actions cost for this repository
status: TO-VERIFY
checked: '2026-10-17'
recheck_after: '2027-01-15'
source: 'web search quoting https://docs.github.com/en/billing/concepts/product-billing/github-actions (docs.github.com not reachable from the session)'
tags: [research, tooling, cost]
---

## Fact

Quoted from GitHub's billing docs via search, not read directly: "GitHub Actions usage is free for standard GitHub-hosted runners in public repositories, and for self-hosted runners." Private repositories get a monthly allowance per plan; GitHub Free: 2,000 minutes and 500 MB artifact storage; without a payment method, runs are blocked once it is used up. Larger runners are always billed.

`ganaagreg-cloud/Test-ongod` is **public** (session repository listing, 2026-10-17), so the standard `ubuntu-latest` runner costs nothing. If it becomes private, CI uses the 2,000 free minutes.

## How it was checked

Web search 2026-10-17; direct fetch of docs.github.com failed (session network policy). Open the page and confirm before relying on the numbers.

## Used by

- [[ADR-0036-ci-github-actions|ADR-0036]]
