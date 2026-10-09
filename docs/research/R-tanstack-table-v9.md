---
topic: TanStack Table 9.2.8 React API (useTable, `features`, display columns)
status: VERIFIED
checked: '2026-10-09'
recheck_after: '2026-12-08'
source: 'computed locally: read node_modules/@tanstack/react-table and table-core type definitions (9.2.8); apps/admin typechecks and its e2e passes'
tags: [research, area/admin, area/frontend]
---

## Fact

- `pnpm add @tanstack/react-table` resolves to **9.2.8**, not v8. The v8 names are gone from the main entry; a deprecated `useLegacyTable` shim exists.
- Minimal use: `const features = tableFeatures({})` (core only), then `useTable<typeof features, Row>({ features, columns, data, getRowId })`. The option is **`features`** (no underscore) and there is no `_rowModels` option.
- Columns: `createColumnHelper<typeof features, Row>()` and `helper.display({ id, header, cell })`. The row type must satisfy `RowData` (`T extends RowData`).
- Rendering: `table.getHeaderGroups()`, `table.getRowModel().rows`, `row.getAllCells()`, and `<table.FlexRender header={h} />` / `<table.FlexRender cell={c} />`.
- Documentation and examples found online may show the older `_features` or the v8 API; trust the installed `.d.ts`.

## How we use it

[[ADR-0029-admin-app-implementation]]: display columns only; the API does paging, search and filtering.
