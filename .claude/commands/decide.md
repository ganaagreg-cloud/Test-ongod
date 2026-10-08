---
description: Record a technical decision as the next ADR in docs/decisions
argument-hint: <decision text>
---

Record this decision as an ADR: $ARGUMENTS

1. Read `docs/00-Index.md` and list `docs/decisions/` to find the highest ADR number; the new one is the next number, zero-padded to 4 digits.
2. Search `docs/decisions/` and `docs/research/` for related notes. If the decision conflicts with an accepted ADR, `docs/SPEC.md` or `docs/DESIGN.md`, say so and ask before going on.
3. Create `docs/decisions/ADR-NNNN-short-kebab-title.md` from `docs/templates/adr.md`:
   - frontmatter: `id`, `title` (quote it if it contains a colon), `status: accepted` unless the user says proposed, `date` (today), `tags: [adr, area/...]`
   - sections: `## Context`, `## Decision`, `## Alternatives rejected` (each with why), `## Consequences`, `## Evidence`
   - Evidence links existing `[[R-...]]` notes. Any external fact without a VERIFIED note is marked ASSUMPTION or TO-VERIFY, and a research note is created for it (see `/research`).
4. If it replaces an earlier ADR, change ONLY that ADR's `status:` to `superseded by [[ADR-NNNN-slug|ADR-NNNN]]`. Never rewrite an accepted ADR's decision text.
5. Update the decisions table in `docs/00-Index.md` (new row; changed status for a superseded one).
6. If SPEC.md or DESIGN.md must change, prepare the edit, **show me the diff and wait for approval** before writing it.
7. Mention the new ADR in today's log under `## Decisions` (see `/log`).
