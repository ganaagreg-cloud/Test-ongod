---
description: List research notes that are overdue or still unverified, ordered by launch risk
---

Read the frontmatter of every note in `docs/research/` and list:

1. Notes whose `recheck_after` is before today.
2. Every note with `status: TO-VERIFY` or `status: ASSUMPTION`.

Order them by risk to launch, highest first:

1. store rules and payments (rejection risk)
2. hosting and platform limits (launch-day failure)
3. security and media access (token auth)
4. costs and prices
5. tooling and library versions

For each, output one line: `[[R-...]]`, status, recheck_after, why it matters (which ADR or runbook depends on it), and the concrete check to run (official URL to read, or local command). Do not research anything now; this is only the list. Suggest `/research <topic>` for the top items.
