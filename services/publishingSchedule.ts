import { requireSupabase } from '../lib/supabase';
import { toServiceError } from './errors';
import { BookStatus } from '../types';

export type ChapterScheduleRow = {
  chapterNumber: number;
  scheduledPublishAt: string;
};

export type ScheduledChapter = {
  id: string;
  chapterNumber: number;
  title: string;
  scheduledPublishAt: string;
};

export type BookChapterSchedule = {
  bookId: string;
  bookTitle: string;
  bookStatus: BookStatus;
  finalStatus: Exclude<BookStatus, 'draft'> | null;
  totalChapters: number;
  publishedCount: number;
  pendingCount: number;
  draftCount: number;
  pending: ScheduledChapter[];
};

function scheduleError(error: unknown, fallback: string) {
  const raw = error && typeof error === 'object' && 'message' in error ? String((error as any).message) : '';
  if (/START_TIME_MUST_BE_FUTURE/i.test(raw)) return new Error('Thời gian bắt đầu phải ở tương lai.');
  if (/INVALID_PER_DAY/i.test(raw)) return new Error('Số chương mỗi ngày phải từ 1 đến 24.');
  if (/CHAPTERS_NOT_READY/i.test(raw)) return new Error('Có chương chưa đủ điều kiện hẹn đăng: phải là bản nháp, có tiêu đề và ít nhất 50 ký tự.');
  if (/DUPLICATE_CHAPTER_NUMBERS/i.test(raw)) return new Error('Danh sách chương hẹn đăng đang bị trùng số.');
  if (/FORBIDDEN/i.test(raw)) return new Error('Bạn không có quyền hẹn đăng các chương này.');
  if (/BOOK_NOT_FOUND/i.test(raw)) return new Error('Không tìm thấy truyện.');
  if (/SCHEDULED_CHAPTER_NOT_FOUND/i.test(raw)) return new Error('Chương này không còn trong lịch đăng.');
  return toServiceError(error, fallback);
}

export async function scheduleBookChapters(
  bookId: string,
  chapterNumbers: number[],
  startAt: string,
  perDay: number,
  finalStatus: Exclude<BookStatus, 'draft'> = 'ongoing',
): Promise<ChapterScheduleRow[]> {
  if (!chapterNumbers.length) throw new Error('Chưa có chương để hẹn đăng.');
  if (!Number.isInteger(perDay) || perDay < 1 || perDay > 24) throw new Error('Số chương mỗi ngày phải từ 1 đến 24.');
  if (!startAt || Number.isNaN(Date.parse(startAt)) || new Date(startAt).getTime() <= Date.now()) throw new Error('Thời gian bắt đầu phải ở tương lai.');

  try {
    const { data, error } = await requireSupabase().rpc('schedule_book_chapters', {
      p_book_id: bookId,
      p_chapter_numbers: [...new Set(chapterNumbers)].sort((a, b) => a - b),
      p_start_at: startAt,
      p_per_day: perDay,
      p_final_status: finalStatus,
    });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      chapterNumber: row.chapter_number,
      scheduledPublishAt: row.scheduled_publish_at,
    }));
  } catch (error) {
    throw scheduleError(error, 'Không thể hẹn lịch đăng chương.');
  }
}

export async function cancelBookChapterSchedule(bookId: string, chapterNumbers?: number[]) {
  try {
    const { data, error } = await requireSupabase().rpc('cancel_book_chapter_schedule', {
      p_book_id: bookId,
      p_chapter_numbers: chapterNumbers?.length ? chapterNumbers : null,
    });
    if (error) throw error;
    return Number(data ?? 0);
  } catch (error) {
    throw scheduleError(error, 'Không thể hủy lịch đăng chương.');
  }
}

export async function getBookChapterSchedule(bookId: string): Promise<BookChapterSchedule> {
  const client = requireSupabase();
  try {
    const [{ data: book, error: bookError }, { data: chapters, error: chapterError }] = await Promise.all([
      client
        .from('books')
        .select('id,title,status,schedule_final_status')
        .eq('id', bookId)
        .single(),
      client
        .from('chapters')
        .select('id,chapter_number,title,status,scheduled_publish_at,published_at')
        .eq('book_id', bookId)
        .order('chapter_number'),
    ]);
    if (bookError) throw bookError;
    if (chapterError) throw chapterError;

    const rows = chapters ?? [];
    const pending = rows
      .filter((row) => row.status === 'draft' && row.scheduled_publish_at)
      .map((row) => ({
        id: row.id,
        chapterNumber: row.chapter_number,
        title: row.title,
        scheduledPublishAt: row.scheduled_publish_at!,
      }))
      .sort((a, b) => new Date(a.scheduledPublishAt).getTime() - new Date(b.scheduledPublishAt).getTime());

    return {
      bookId,
      bookTitle: book.title,
      bookStatus: book.status,
      finalStatus: book.schedule_final_status === 'ongoing' || book.schedule_final_status === 'completed' || book.schedule_final_status === 'paused'
        ? book.schedule_final_status
        : null,
      totalChapters: rows.length,
      publishedCount: rows.filter((row) => row.status === 'published').length,
      pendingCount: pending.length,
      draftCount: rows.filter((row) => row.status === 'draft' && !row.scheduled_publish_at).length,
      pending,
    };
  } catch (error) {
    throw scheduleError(error, 'Không thể tải lịch đăng chương.');
  }
}

export async function updateScheduledChapterTime(bookId: string, chapterNumber: number, scheduledAt: string) {
  if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt)) || new Date(scheduledAt).getTime() <= Date.now()) {
    throw new Error('Thời gian đăng mới phải ở tương lai.');
  }
  try {
    const { data, error } = await requireSupabase().rpc('update_scheduled_chapter_time', {
      p_book_id: bookId,
      p_chapter_number: chapterNumber,
      p_scheduled_at: scheduledAt,
    });
    if (error) throw error;
    return data;
  } catch (error) {
    throw scheduleError(error, 'Không thể đổi thời gian đăng chương.');
  }
}

export async function publishScheduledChapterNow(bookId: string, chapterNumber: number) {
  try {
    const { data, error } = await requireSupabase().rpc('publish_scheduled_chapter_now', {
      p_book_id: bookId,
      p_chapter_number: chapterNumber,
    });
    if (error) throw error;
    return Boolean(data);
  } catch (error) {
    throw scheduleError(error, 'Không thể đăng chương ngay lúc này.');
  }
}

export async function reschedulePendingBookChapters(
  bookId: string,
  startAt: string,
  perDay: number,
  finalStatus?: Exclude<BookStatus, 'draft'>,
) {
  const current = await getBookChapterSchedule(bookId);
  if (!current.pending.length) throw new Error('Truyện này không có chương nào đang chờ đăng.');
  return scheduleBookChapters(
    bookId,
    current.pending.map((chapter) => chapter.chapterNumber),
    startAt,
    perDay,
    finalStatus ?? current.finalStatus ?? 'ongoing',
  );
}

export function buildLocalScheduleIso(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error('Ngày hoặc giờ hẹn đăng chưa đúng định dạng.');
  }
  const local = new Date(`${date}T${time}:00`);
  if (Number.isNaN(local.getTime())) throw new Error('Ngày hoặc giờ hẹn đăng không hợp lệ.');
  if (local.getTime() <= Date.now()) throw new Error('Thời gian bắt đầu phải ở tương lai.');
  return local.toISOString();
}

export function defaultScheduleFields() {
  const target = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, time: '20:00' };
}
