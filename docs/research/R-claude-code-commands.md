---
topic: Claude Code custom slash command format
status: VERIFIED
checked: 2026-10-08
recheck_after: 2026-12-07
source: https://code.claude.com/docs/en/slash-commands
tags: [research, tooling]
---

## Fact

`.claude/commands/<name>.md` still creates `/<name>`. Commands have been merged into skills, and new work is recommended as `.claude/skills/<name>/SKILL.md`. Frontmatter fields include `description`, `argument-hint`, `allowed-tools`, `model` and `disable-model-invocation`. Arguments: `$ARGUMENTS` (full string), `$0`, `$1`… (0-based).

## How it was checked

Fetched the docs page on 2026-10-08.

## Used by

- The project commands in `.claude/commands/` (log, decide, research, recheck).
