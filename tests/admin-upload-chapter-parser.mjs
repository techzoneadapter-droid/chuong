// Regression coverage for CHUONG Admin Upload. All fixtures are synthetic:
// uploaded novels are never copied into the repository.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const app = readFileSync(fileURLToPath(new URL('../admin-web/app.js', import.meta.url)), 'utf8');
const start = app.indexOf('function normalizeText(text) {');
const end = app.indexOf('function countWords(value) {', start);
assert.ok(start !== -1 && end > start, 'Chapter parser not found');
const context = vm.createContext({});
vm.runInContext(app.slice(start, end) + '\nthis.splitChapters = splitChapters;', context);
const parse = (input) => JSON.parse(JSON.stringify(context.splitChapters(input)));

const story = [
  'Tên truyện', '',
  'Chương 1: Khởi đầu', '',
  'Đây là nội dung thứ nhất.',
  'Hồi chuông thứ ba vang lên.',
  'Phần chữ còn lại hiện ra.',
  'Phan Mậu bước vào căn phòng.', '',
  'Chương 2: Chuyện mới', '',
  '### Chương 2: Chuyện mới', '',
  'Đây là nội dung thứ hai.', '',
  'Chapter 3: The end', '', 'Đây là nội dung thứ ba.'
].join('\n');
const chapters = parse(story);
assert.deepEqual(chapters.map(ch => ch.chapterNumber), [1, 2, 3]);
assert.match(chapters[0].content, /Hồi chuông thứ ba/);
assert.match(chapters[0].content, /Phan Mậu/);
assert.equal(chapters[1].title, 'Chuyện mới');
assert.doesNotMatch(chapters[1].content, /### Chương 2/);

const longStory = ['Tên truyện', ''];
for (let n = 1; n <= 500; n++) {
  longStory.push('Chương ' + n + ': Chương mẫu ' + n, '');
  if (n % 4 === 0) longStory.push('## Chương ' + n + ': Chương mẫu ' + n, '');
  longStory.push('Đây là nội dung truyện đầy đủ ' + n + '.', '');
  if (n % 9 === 0) longStory.push('Hồi chuông lại vang lên.', '');
}
const all = parse(longStory.join('\n'));
assert.equal(all.length, 500);
assert.ok(all.every((ch, i) => ch.chapterNumber === i + 1));
assert.ok(all.every(ch => ch.content.includes('Đây là nội dung truyện đầy đủ')));

assert.deepEqual(parse('Chương I: Đầu\n\nNội dung một.\n\n第五章：Năm\n\nNội dung năm.')
  .map(ch => ch.chapterNumber), [1, 5]);
assert.deepEqual(parse('Chương 1: A\n\nNội dung A.\n\nChương 1: B\n\nNội dung B.')
  .map(ch => ch.chapterNumber), [1, 1]);
assert.equal(parse('Văn bản không có tiêu đề')[0].chapterNumber, 1);
console.log('Admin Upload chapter parser: regression tests passed');
