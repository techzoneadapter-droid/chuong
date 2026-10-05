import { requireSupabase } from '../lib/supabase';
import { toServiceError } from './errors';
import { BookStatus } from '../types';

export type ChapterScheduleRow = {
  chapterNumber: number;
  scheduledPublishAt: string;
};

function scheduleError(error: unknown, fallback: string) {
  const raw = error && typeof error === 'object' && 'message' in error ? String((error as any).message) : '';
  if (/START_TIME_MUST_BE_FUTURE/i.test(raw)) return new Error('Thời gian bắt đầu phải ở tương lai.');
  if (/INVALID_PER_DAY/i.test(raw)) return new Error('Số chương mỗi ngày phải từ 1 đến 24.');
  if (/CHAPTERS_NOT_READY/i.test(raw)) return new Error('Có chương chưa đủ điều kiện hẹn đăng: phải là bản nháp, có tiêu đề và ít nhất 50 ký tự.');
  if (/DUPLICATE_CHAPTER_NUMBERS/i.test(raw)) return new Error('Danh sách chương hẹn đăng đang bị trùng số.');
  if (/FORBIDDEN/i.test(raw)) return new Error('Bạn không có quyền hẹn đăng các chương này.');
  if (/BOOK_NOT_FOUND/i.test(raw)) return new Error('Không tìm thấy truyện.');
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
