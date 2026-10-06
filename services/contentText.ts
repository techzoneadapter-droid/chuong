export const DEFAULT_BOOK_SUMMARY = 'Hãy khám phá.';

const SOURCE_PLACEHOLDER_PATTERNS = [
  /^Truyện được Admin nhập hàng loạt từ /i,
  /^Truyện được quản trị viên nhập bằng CHƯƠNG Upload Studio/i,
  /^Truyện được nhập vào Tàng Kinh Các từ nguồn /i,
  /^Truyện được nhập bằng CHƯƠNG Content Studio từ nguồn /i,
];

export function normalizeBookSummary(value?: string | null) {
  const text = String(value ?? '').trim();
  if (!text) return DEFAULT_BOOK_SUMMARY;
  if (SOURCE_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) return DEFAULT_BOOK_SUMMARY;
  return text;
}

export function displayChapterTitle(value: string | null | undefined, chapterNumber: number) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const generic = new RegExp('^(?:chương|chuong|chapter|chap)\\s*(?:số\\s*)?' + chapterNumber + '\\s*$', 'i');
  if (generic.test(text)) return '';
  const prefixed = new RegExp('^(?:chương|chuong|chapter|chap)\\s*(?:số\\s*)?' + chapterNumber + '\\s*[:.\\-–—]?\\s*', 'i');
  return text.replace(prefixed, '').trim();
}

export function stripLeadingChapterMarker(value: string | null | undefined, chapterNumber: number) {
  const text = String(value ?? '');
  if (!text.trim()) return '';
  const prefix = new RegExp(
    '^\\s*(?:chương|chuong|chapter|chap)\\s*(?:số\\s*)?' + chapterNumber +
    '(?:\\s*[/]\\s*\\d+)?\\s*[:.\\-–—]?\\s+',
    'i',
  );
  return text.replace(prefix, '').trimStart();
}
