import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// On iOS a second Modal cannot open while the first one is still closing, so the two deletion
// questions ("Бүртгэлээ устгах уу?" then "Итгэлтэй байна уу?") must share ONE Sheet. Two sheets in
// a row made "Үргэлжлүүлэх" do nothing on a phone (found 2026-11-17 on a TestFlight build).
test('the settings screen asks both deletion questions in a single Sheet', () => {
  const source = readFileSync(new URL('../app/(app)/settings/index.tsx', import.meta.url), 'utf8');
  assert.equal((source.match(/<Sheet\b/g) ?? []).length, 1);
  assert.match(source, /visible=\{deleteStep > 0\}/);
});
