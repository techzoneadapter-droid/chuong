/** Business rule for book-level free chapter previews.
 * Backend get_chapter_for_reading_impl must enforce this same policy before
 * returning protected content; this client helper is DISPLAY ONLY.
 */
export function normalizeFreePreviewCount(value: unknown): number {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(count) || !Number.isInteger(count)) return 0;
  return Math.min(100000, Math.max(0, count));
}
export function isFreePreviewChapter(
  chapterNumber: number,
  freePreviewCount: unknown,
): boolean {
  return Number.isInteger(chapterNumber)
    && chapterNumber >= 1
    && chapterNumber <= normalizeFreePreviewCount(freePreviewCount);
}
export const FREE_PREVIEW_PRESETS = [0, 5, 10, 50] as const;
