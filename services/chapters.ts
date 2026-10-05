import { getBook as getDemoBook } from '../data/books';
import { getChapterContent } from '../data/readerContent';
import { requireSupabase, supabase } from '../lib/supabase';
import { Chapter, ChapterInput, ServiceResult } from '../types';
import { Database } from '../types/database';
import { toServiceError } from './errors';
import {
  getOfflineBookRecords,
  getOfflineBookSnapshot,
  getOfflineChapter,
  OfflineLicenseExpiredError,
  refreshOfflineChapterIfDownloaded,
  removeOfflineChapter,
} from './offlineDownloads';

type ChapterRow = Database['public']['Tables']['chapters']['Row'];
type ChapterShape = Pick<ChapterRow, 'id' | 'book_id' | 'chapter_number' | 'title' | 'status' | 'is_vip' | 'price_coins' | 'published_at' | 'updated_at'> & {
  content?: string | null;
  early_access_until?: string | null;
};

export class ContentLockedError extends Error {
  kind: 'book' | 'chapter';
  priceCoins: number;
  chapterId: string;
  constructor(kind: 'book' | 'chapter', priceCoins: number, chapterId: string) {
    super(kind === 'book' ? 'Truyện VIP chưa được mở khóa.' : 'Chương VIP chưa được mở khóa.');
    this.name = 'ContentLockedError';
    this.kind = kind;
    this.priceCoins = priceCoins;
    this.chapterId = chapterId;
  }
}

export const mapChapter = (row: ChapterShape): Chapter => {
  const earlyAccessUntil = row.early_access_until ?? null;
  const earlyAccessActive = Boolean(
    earlyAccessUntil && new Date(earlyAccessUntil).getTime() > Date.now()
  );
  const effectiveVip = Boolean(
    row.is_vip && row.price_coins > 0 && (!earlyAccessUntil || earlyAccessActive)
  );
  return {
    id: row.id,
    bookId: row.book_id,
    number: row.chapter_number,
    title: row.title,
    content: row.content ?? undefined,
    date: row.published_at ? new Date(row.published_at).toLocaleDateString('vi-VN') : 'Bản nháp',
    relativeDate: row.published_at ? new Date(row.published_at).toLocaleDateString('vi-VN') : 'Chưa xuất bản',
    access: effectiveVip ? 'vip' : 'free',
    configuredVip: row.is_vip,
    priceCoins: row.price_coins,
    earlyAccessUntil,
    status: row.status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    isRead: false,
    isDownloaded: false
  };
};

function demoChapter(bookId: string, chapterNumber: number): Chapter | null {
  const chapter = getDemoBook(bookId).chapters[chapterNumber - 1];
  return chapter ? { ...chapter, bookId, content: getChapterContent(chapterNumber).join('\n\n'), status: 'published' } : null;
}

export async function getChaptersByBook(bookId: string): Promise<ServiceResult<Chapter[]>> {
  if (!supabase) {
    const records = await getOfflineBookRecords(bookId).catch(() => []);
    const downloaded = new Set(records.map((item) => item.chapterNumber));
    return {
      data: getDemoBook(bookId).chapters.map((chapter) => ({
        ...chapter,
        isDownloaded: downloaded.has(chapter.number),
      })),
      mode: 'demo',
    };
  }
  try {
    const chapters: Chapter[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .from('chapters')
        .select('id,book_id,chapter_number,title,status,is_vip,price_coins,early_access_until,published_at,updated_at')
        .eq('book_id', bookId)
        .eq('status', 'published')
        .order('chapter_number')
        .range(offset, offset + 499);
      if (error) throw error;
      chapters.push(...(data ?? []).map(mapChapter));
      if (!data || data.length < 500) break;
    }
    const records = await getOfflineBookRecords(bookId).catch(() => []);
    const downloaded = new Set(records.map((item) => item.chapterNumber));
    return {
      data: chapters.map((chapter) => ({
        ...chapter,
        isDownloaded: downloaded.has(chapter.number),
      })),
      mode: 'supabase',
    };
  } catch (error) {
    const offline = await getOfflineBookSnapshot(bookId).catch(() => null);
    if (offline) return { data: offline.chapters, mode: 'offline' };
    throw toServiceError(error, 'Không thể tải danh sách chương.');
  }
}

export async function getChapter(bookId: string, chapterNumber: number): Promise<ServiceResult<Chapter | null>> {
  if (!supabase) {
    const offline = await getOfflineChapter(bookId, chapterNumber).catch((error) => {
      if (error instanceof OfflineLicenseExpiredError) throw error;
      return null;
    });
    return offline ? { data: offline, mode: 'offline' } : { data: demoChapter(bookId, chapterNumber), mode: 'demo' };
  }

  try {
    const { data, error } = await supabase.rpc('get_chapter_for_reading', {
      p_book_id: bookId,
      p_chapter_number: chapterNumber,
    });
    if (error) throw error;
    const row = data?.[0];
    if (!row) return { data: null, mode: 'supabase' };

    if (row.lock_kind === 'book' || row.lock_kind === 'chapter') {
      // A refunded/revoked entitlement must invalidate any previously downloaded VIP copy
      // as soon as the app can reach the server again.
      await removeOfflineChapter(bookId, chapterNumber).catch(() => false);
      throw new ContentLockedError(row.lock_kind, row.lock_price_coins ?? row.price_coins ?? 0, row.id);
    }

    const chapter = mapChapter(row);
    await refreshOfflineChapterIfDownloaded(chapter).catch(() => false);
    return { data: chapter, mode: 'supabase' };
  } catch (error) {
    if (error instanceof ContentLockedError || error instanceof OfflineLicenseExpiredError) throw error;

    try {
      const offline = await getOfflineChapter(bookId, chapterNumber);
      if (offline) return { data: offline, mode: 'offline' };
    } catch (offlineError) {
      if (offlineError instanceof OfflineLicenseExpiredError) throw offlineError;
    }

    throw toServiceError(error, 'Không thể tải nội dung chương.');
  }
}

export async function getPreviousChapter(bookId: string, chapterNumber: number) {
  const result = await getChaptersByBook(bookId);
  return { ...result, data: [...result.data].reverse().find((item) => item.number < chapterNumber) ?? null };
}

export async function getNextChapter(bookId: string, chapterNumber: number) {
  const result = await getChaptersByBook(bookId);
  return { ...result, data: result.data.find((item) => item.number > chapterNumber) ?? null };
}

export async function getLatestChapter(bookId: string) {
  const result = await getChaptersByBook(bookId);
  return { ...result, data: result.data[result.data.length - 1] ?? null };
}

export const getChapters = getChaptersByBook;

export async function createChapter(input: Omit<ChapterInput, 'id'>) {
  const { saveChapter } = await import('./authors');
  return saveChapter(input);
}

export async function updateChapter(input: ChapterInput & { id: string }) {
  const { saveChapter } = await import('./authors');
  return saveChapter(input);
}

export async function saveDraft(input: ChapterInput) {
  const { saveChapter } = await import('./authors');
  return saveChapter({ ...input, status: 'draft' });
}

async function setChapterStatus(id: string, status: 'draft' | 'published') {
  const { data, error } = await requireSupabase()
    .from('chapters')
    .update({ status })
    .eq('id', id)
    .select('id,book_id,chapter_number,title,status,is_vip,price_coins,early_access_until,published_at,updated_at')
    .single();
  if (error) throw toServiceError(error, 'Không thể thay đổi trạng thái chương. Kiểm tra tiêu đề và nội dung.');
  return mapChapter(data);
}

export const publishChapter = (id: string) => setChapterStatus(id, 'published');
export const unpublishChapter = (id: string) => setChapterStatus(id, 'draft');

export async function deleteDraftChapter(id: string) {
  const { data, error } = await requireSupabase().from('chapters').delete().eq('id', id).eq('status', 'draft').select('id');
  if (error) throw toServiceError(error, 'Không thể xóa chương.');
  if (!data?.length) throw new Error('Chỉ có thể xóa chương nháp của bạn.');
}
