import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { isInternetReachable } from './connectivity';
import { toServiceError } from './errors';

const INSTALL_KEY = 'chuong:analytics-install-id';

function randomToken(prefix: string) {
  const random = Math.random().toString(36).slice(2);
  const random2 = Math.random().toString(36).slice(2);
  return prefix + ':' + Date.now().toString(36) + ':' + random + random2;
}

export async function getAnalyticsInstallId() {
  const existing = await AsyncStorage.getItem(INSTALL_KEY).catch(() => null);
  if (existing && existing.length >= 16) return existing;
  const next = randomToken('install');
  await AsyncStorage.setItem(INSTALL_KEY, next).catch(() => undefined);
  return next;
}

export function createReadingSessionId() {
  return randomToken('session');
}

export async function recordReaderEngagement(input: {
  bookId: string;
  chapterId: string;
  chapterNumber: number;
  sessionId: string;
  progressPercent: number;
  activeSeconds: number;
}) {
  if (!supabase) return false;
  if (!/^[0-9a-f-]{36}$/i.test(input.bookId) || !/^[0-9a-f-]{36}$/i.test(input.chapterId)) return false;
  if (!(await isInternetReachable())) return false;

  const installId = await getAnalyticsInstallId();
  const { data, error } = await supabase.rpc('record_reader_engagement', {
    p_book_id: input.bookId,
    p_chapter_id: input.chapterId,
    p_chapter_number: input.chapterNumber,
    p_install_id: installId,
    p_session_id: input.sessionId,
    p_progress: Math.max(0, Math.min(100, input.progressPercent)),
    p_active_seconds: Math.max(0, Math.floor(input.activeSeconds)),
  });

  if (error) throw toServiceError(error, 'Không thể ghi nhận phiên đọc.');
  return Boolean(data?.[0]?.accepted);
}

export type AuthorEngagementSummary = {
  readerCount: number;
  returningReaders: number;
  sessions: number;
  chapterStarts: number;
  chapterCompletions: number;
  activeSeconds: number;
  completionRate: number;
  returnRate: number;
  avgSessionMinutes: number;
};

export type AuthorEngagementDay = {
  date: string;
  uniqueReaders: number;
  newReaders: number;
  returningReaders: number;
  sessions: number;
  chapterCompletions: number;
  activeSeconds: number;
};

export type AuthorBookEngagement = {
  bookId: string;
  title: string;
  uniqueReaderDays: number;
  sessions: number;
  chapterCompletions: number;
  activeSeconds: number;
  completionRate: number;
};

export type AuthorReadingAnalytics = {
  days: number;
  summary: AuthorEngagementSummary;
  daily: AuthorEngagementDay[];
  books: AuthorBookEngagement[];
};

export async function getAuthorReadingAnalytics(authorId: string, days = 30): Promise<AuthorReadingAnalytics> {
  const boundedDays = Math.max(1, Math.min(days, 365));
  if (!supabase) {
    return {
      days: boundedDays,
      summary: {
        readerCount: 0,
        returningReaders: 0,
        sessions: 0,
        chapterStarts: 0,
        chapterCompletions: 0,
        activeSeconds: 0,
        completionRate: 0,
        returnRate: 0,
        avgSessionMinutes: 0,
      },
      daily: [],
      books: [],
    };
  }

  const [summaryResult, dailyResult, booksResult] = await Promise.all([
    supabase.rpc('get_author_engagement_summary', { p_author_id: authorId, p_days: boundedDays }),
    supabase.rpc('get_author_engagement_daily', { p_author_id: authorId, p_days: boundedDays }),
    supabase.rpc('get_author_book_engagement', { p_author_id: authorId, p_days: boundedDays }),
  ]);

  const firstError = summaryResult.error ?? dailyResult.error ?? booksResult.error;
  if (firstError) throw toServiceError(firstError, 'Không thể tải phân tích độc giả.');

  const summary = summaryResult.data?.[0];
  return {
    days: boundedDays,
    summary: {
      readerCount: Number(summary?.reader_count ?? 0),
      returningReaders: Number(summary?.returning_readers ?? 0),
      sessions: Number(summary?.sessions ?? 0),
      chapterStarts: Number(summary?.chapter_starts ?? 0),
      chapterCompletions: Number(summary?.chapter_completions ?? 0),
      activeSeconds: Number(summary?.active_seconds ?? 0),
      completionRate: Number(summary?.completion_rate ?? 0),
      returnRate: Number(summary?.return_rate ?? 0),
      avgSessionMinutes: Number(summary?.avg_session_minutes ?? 0),
    },
    daily: (dailyResult.data ?? []).map((row) => ({
      date: row.metric_date,
      uniqueReaders: Number(row.unique_readers),
      newReaders: Number(row.new_readers),
      returningReaders: Number(row.returning_readers),
      sessions: Number(row.sessions),
      chapterCompletions: Number(row.chapter_completions),
      activeSeconds: Number(row.active_seconds),
    })),
    books: (booksResult.data ?? []).map((row) => ({
      bookId: row.book_id,
      title: row.title,
      uniqueReaderDays: Number(row.unique_reader_days),
      sessions: Number(row.sessions),
      chapterCompletions: Number(row.chapter_completions),
      activeSeconds: Number(row.active_seconds),
      completionRate: Number(row.completion_rate),
    })),
  };
}

export function formatReadingDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 60) return safe + ' giây';
  const minutes = Math.floor(safe / 60);
  if (minutes < 60) return minutes + ' phút';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? hours + ' giờ ' + rest + ' phút' : hours + ' giờ';
}
