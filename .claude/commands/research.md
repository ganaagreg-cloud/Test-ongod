---
description: Look up an external fact, reusing docs/research notes before searching the web
argument-hint: <topic>
---

Research topic: $ARGUMENTS

1. **First, search the vault.** Grep `docs/research/` and `docs/decisions/` for the topic and its synonyms.
   - If a note exists with `status: VERIFIED` and `recheck_after` empty or in the future: answer from it, cite it as `[[R-...]]`, and **stop. Do not search the web.**
   - If it is ASSUMPTION or TO-VERIFY, or `recheck_after` has passed: continue, updating that note.
2. Research from primary sources: the official docs, policy or pricing pages. Note the exact URL. For anything computable locally (library versions, file contents, contrast ratios), run the command instead and record it.
3. Write or update `docs/research/R-short-topic.md` from `docs/templates/research.md`:
   - `status`: VERIFIED only when confirmed in a primary source or by a local command; otherwise ASSUMPTION or TO-VERIFY
   - `checked`: today; `source`: URL or `computed locally: <command>`
   - `recheck_after`: prices, policies and store rules +90 days; library versions +60 days; physics-like facts empty
   - `## Fact` (one short paragraph), `## How it was checked`, `## Used by` (ADR links)
4. Update the research table in `docs/00-Index.md` (status, recheck_after).
5. Answer the question in one or two sentences and cite the note.
