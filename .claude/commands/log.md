---
description: Append this session's work to today's log in docs/log and refresh the index
---

Update the project log in the Obsidian vault (`docs/`).

1. Today's note is `docs/log/YYYY-MM-DD.md` (local date). If it does not exist, create it from `docs/templates/log.md`: frontmatter `date: YYYY-MM-DD`, `tags: [log]`, and the sections `## Done`, `## Tests`, `## Decisions`, `## Problems / blockers`, `## Next`.
2. Collect the facts for this session; do not guess:
   - commits: `git log --since=midnight --format='%h %s'` (plus any earlier commits from this session)
   - test results actually run this session, as pass/fail counts per suite. If tests were not run, write "not run".
   - ADRs created or superseded this session, as `[[ADR-xxxx-slug|ADR-xxxx]]`
   - blockers and open problems; link research notes and `[[open-questions]]` where relevant
   - the next concrete step
3. Append terse bullets under the matching sections. Never delete or rewrite earlier bullets of the day. Put commit hashes in backticks.
4. In `docs/00-Index.md`, update "Latest logs" to the 7 newest log notes (newest first) and the `updated:` date.
5. Never write secrets, passwords, tokens or personal customer data.
6. Show a short summary of what was added.

Extra notes from the user (may be empty): $ARGUMENTS
