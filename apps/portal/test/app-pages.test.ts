import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// ADR-0053: the pages the mobile apps open (/app/*) must not lead to a purchase.
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('the app-only layout has no navigation, links or plans', () => {
  const layout = read('../src/layout/AppLayout.tsx');
  assert.doesNotMatch(layout, /NavLink|<Link|<a |href=|to=|plans|mn\.nav|mn\.footer/);
});

test('the /app routes sit outside the normal Layout and hold only the legal pages', () => {
  const app = read('../src/App.tsx');
  const start = app.indexOf('path="app"');
  assert.ok(start > 0, 'no /app route');
  const block = app.slice(start, app.indexOf('<Route element={<Layout'));
  assert.match(block, /AppTerms/);
  assert.match(block, /AppPrivacy/);
  assert.doesNotMatch(block, /Plans|Pay|Account|Login|Register|Status/);
});

test('the app copy leaves out every section flagged as payment, and the terms flag theirs', () => {
  assert.match(read('../src/pages/Legal.tsx'), /!\(app && section\.payment\)/);
  assert.match(read('../src/i18n/mn.ts'), /payment: true,\s*\n\s*title: 'Эрх ба төлбөр'/);
});
