import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../lib/freeChapterPreview.ts', import.meta.url), 'utf8');
test('free preview helper has safe presets and nonnegative index guard', () => {
  assert.match(source, /\[0, 5, 10, 50\]/);
  assert.match(source, /chapterNumber >= 1/);
  assert.match(source, /Number\.isInteger\(chapterNumber\)/);
});
