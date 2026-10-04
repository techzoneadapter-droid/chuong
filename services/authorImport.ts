import { ParsedImportBook } from './adminImport';
import { getAuthorChapters, saveChapter } from './authors';

export type AuthorImportResult = {
  imported: number;
  chapterNumbers: number[];
};

export async function importAuthorParsedBook(
  bookId: string,
  parsed: ParsedImportBook,
  options?: { publish?: boolean },
): Promise<AuthorImportResult> {
  const existing = await getAuthorChapters(bookId);
  const existingNumbers = new Set(existing.map((item) => item.number));
  const duplicates = parsed.chapters
    .map((item) => item.chapterNumber)
    .filter((number) => existingNumbers.has(number));

  if (duplicates.length) {
    throw new Error(`Trùng số chương đã có: ${[...new Set(duplicates)].slice(0, 12).join(', ')}. Hãy chỉnh file hoặc xóa chương cũ trước khi nhập.`);
  }

  const seen = new Set<number>();
  const repeated = parsed.chapters.find((item) => {
    if (seen.has(item.chapterNumber)) return true;
    seen.add(item.chapterNumber);
    return false;
  });
  if (repeated) throw new Error(`File nhập có số chương trùng: ${repeated.chapterNumber}.`);

  let imported = 0;
  const chapterNumbers: number[] = [];
  for (const chapter of [...parsed.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber)) {
    const content = chapter.content.trim();
    const title = chapter.title.trim() || `Chương ${chapter.chapterNumber}`;
    if (!content) continue;
    const publish = Boolean(options?.publish && title.length >= 2 && content.length >= 50);
    await saveChapter({
      bookId,
      chapterNumber: chapter.chapterNumber,
      title,
      content,
      status: publish ? 'published' : 'draft',
      isVip: false,
      priceCoins: 0,
    });
    imported += 1;
    chapterNumbers.push(chapter.chapterNumber);
  }

  if (!imported) throw new Error('Không có chương hợp lệ để nhập.');
  return { imported, chapterNumbers };
}
