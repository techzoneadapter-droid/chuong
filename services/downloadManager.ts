import { Book } from '../types';
import { ContentLockedError, getChapter, getChaptersByBook } from './chapters';
import { isInternetReachable } from './connectivity';
import {
  applyOfflineStoragePlan,
  getOfflineBookRecords,
  OfflineLicenseExpiredError,
  saveOfflineChapter,
} from './offlineDownloads';
import { getMembershipStatus } from './membership';

export type DownloadSelection = 'current' | 'next20' | 'all';

export type OfflineDownloadProgress = {
  completed: number;
  total: number;
  chapterNumber: number;
  status: 'saved' | 'locked' | 'failed';
};

export type OfflineDownloadResult = {
  requested: number;
  saved: number;
  locked: number;
  failed: number;
  existingBefore: number;
};

export async function downloadBookForOffline(
  book: Book,
  selection: DownloadSelection,
  currentChapter: number,
  onProgress?: (progress: OfflineDownloadProgress) => void,
  userId?: string | null,
): Promise<OfflineDownloadResult> {
  if (!(await isInternetReachable())) {
    throw new Error('Cần kết nối mạng để tải thêm chương.');
  }

  const membership = await getMembershipStatus(userId);
  await applyOfflineStoragePlan(membership.isPremium);

  const chapterResult = await getChaptersByBook(book.id, book);
  const chapters = chapterResult.data;
  if (!chapters.length) throw new Error('Truyện này chưa có chương công khai để tải.');

  const startIndex = Math.max(
    0,
    chapters.findIndex((chapter) => chapter.number >= Math.max(1, currentChapter)),
  );

  let targets = chapters;
  if (selection === 'current') {
    const exact = chapters.find((chapter) => chapter.number === currentChapter) ?? chapters[startIndex];
    targets = exact ? [exact] : [];
  } else if (selection === 'next20') {
    targets = chapters.slice(startIndex, startIndex + 20);
  }

  if (!targets.length) throw new Error('Không tìm thấy chương phù hợp để tải.');

  const existingBefore = (await getOfflineBookRecords(book.id)).length;
  let saved = 0;
  let locked = 0;
  let failed = 0;
  let completed = 0;

  // A small batch size prevents a large book from opening hundreds of simultaneous
  // Supabase/RPC requests while still being much faster than fully sequential downloads.
  for (let index = 0; index < targets.length; index += 4) {
    const batch = targets.slice(index, index + 4);
    await Promise.all(batch.map(async (meta) => {
      let status: OfflineDownloadProgress['status'] = 'failed';
      try {
        const result = await getChapter(book.id, meta.number, book);
        if (!result.data?.content) throw new Error('Chương không có nội dung.');
        await saveOfflineChapter(book, result.data);
        saved += 1;
        status = 'saved';
      } catch (error) {
        if (error instanceof ContentLockedError) {
          locked += 1;
          status = 'locked';
        } else if (error instanceof OfflineLicenseExpiredError) {
          failed += 1;
          status = 'failed';
        } else {
          failed += 1;
          status = 'failed';
        }
      } finally {
        completed += 1;
        onProgress?.({
          completed,
          total: targets.length,
          chapterNumber: meta.number,
          status,
        });
      }
    }));
  }

  return {
    requested: targets.length,
    saved,
    locked,
    failed,
    existingBefore,
  };
}
