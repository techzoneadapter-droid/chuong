import { getBook as getDemoBook } from '../data/books';
import { getChapterContent } from '../data/readerContent';
import { supabase } from '../lib/supabase';
import { Chapter, ServiceResult } from '../types';
import { Database } from '../types/database';
import { toServiceError } from './errors';

type ChapterRow = Database['public']['Tables']['chapters']['Row'];

const mapChapter = (row: ChapterRow): Chapter => ({
  id: row.id,
  bookId: row.book_id,
  number: row.chapter_number,
  title: row.title,
  content: row.content,
  date: row.published_at ? new Date(row.published_at).toLocaleDateString('vi-VN') : 'Bản nháp',
  relativeDate: row.published_at ? new Date(row.published_at).toLocaleDateString('vi-VN') : 'Chưa xuất bản',
  access: row.is_vip ? 'vip' : 'free',
  priceCoins: row.price_coins,
  status: row.status,
  publishedAt: row.published_at,
  isRead: false,
  isDownloaded: false
});

function demoChapter(bookId: string, chapterNumber: number): Chapter | null {
  const chapter = getDemoBook(bookId).chapters[chapterNumber - 1];
  return chapter ? { ...chapter, bookId, content: getChapterContent(chapterNumber).join('\n\n'), status: 'published' } : null;
}

export async function getChaptersByBook(bookId: string): Promise<ServiceResult<Chapter[]>> {
  if (!supabase) return { data: getDemoBook(bookId).chapters, mode: 'demo' };
  try {
    const { data, error } = await supabase.from('chapters').select('*').eq('book_id', bookId).eq('status', 'published').order('chapter_number');
    if (error) throw error;
    return { data: (data ?? []).map(mapChapter), mode: 'supabase' };
  } catch (error) { throw toServiceError(error, 'Không thể tải danh sách chương.'); }
}

export async function getChapter(bookId: string, chapterNumber: number): Promise<ServiceResult<Chapter | null>> {
  if (!supabase) return { data: demoChapter(bookId, chapterNumber), mode: 'demo' };
  try {
    const { data, error } = await supabase.from('chapters').select('*').eq('book_id', bookId).eq('chapter_number', chapterNumber).eq('status', 'published').maybeSingle();
    if (error) throw error;
    return { data: data ? mapChapter(data) : null, mode: 'supabase' };
  } catch (error) { throw toServiceError(error, 'Không thể tải nội dung chương.'); }
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
