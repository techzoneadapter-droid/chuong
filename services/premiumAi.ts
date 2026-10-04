import { requireSupabase } from '../lib/supabase';
import { toServiceError } from './errors';

export type PremiumStatus = {
  premium: boolean;
  providerReady: boolean;
  provider?: string | null;
  model?: string | null;
};

export type AiTranslationJob = {
  id: string;
  bookId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  totalChapters: number;
  completedChapters: number;
  lastChapterNumber?: number | null;
  errorMessage?: string | null;
};

function mapJob(row: Record<string, unknown>): AiTranslationJob {
  return {
    id: String(row.id),
    bookId: String(row.book_id ?? row.bookId),
    status: String(row.status) as AiTranslationJob['status'],
    totalChapters: Number(row.total_chapters ?? row.totalChapters ?? 0),
    completedChapters: Number(row.completed_chapters ?? row.completedChapters ?? 0),
    lastChapterNumber: row.last_chapter_number == null ? null : Number(row.last_chapter_number),
    errorMessage: row.error_message == null ? null : String(row.error_message),
  };
}

export async function getPremiumAiStatus(): Promise<PremiumStatus> {
  try {
    const { data, error } = await requireSupabase().functions.invoke('ai-translate-book', {
      body: { action: 'status' },
    });
    if (error) throw error;
    return {
      premium: Boolean(data?.premium),
      providerReady: Boolean(data?.providerReady),
      provider: data?.provider ?? null,
      model: data?.model ?? null,
    };
  } catch (error) {
    throw toServiceError(error, 'Không thể kiểm tra quyền AI Premium.');
  }
}

export async function startWholeBookTranslation(bookId: string, genre: string): Promise<AiTranslationJob> {
  try {
    const { data, error } = await requireSupabase().functions.invoke('ai-translate-book', {
      body: { action: 'start', bookId, genre },
    });
    if (error) throw error;
    if (!data?.job) throw new Error(data?.error || 'Không tạo được tác vụ AI.');
    return mapJob(data.job);
  } catch (error) {
    throw toServiceError(error, 'Không thể bắt đầu AI dịch toàn truyện.');
  }
}

export async function continueWholeBookTranslation(jobId: string): Promise<AiTranslationJob> {
  try {
    const { data, error } = await requireSupabase().functions.invoke('ai-translate-book', {
      body: { action: 'step', jobId },
    });
    if (error) throw error;
    if (!data?.job) throw new Error(data?.error || 'Không xử lý được chương tiếp theo.');
    return mapJob(data.job);
  } catch (error) {
    throw toServiceError(error, 'AI không thể xử lý chương tiếp theo.');
  }
}

export async function runWholeBookTranslation(
  bookId: string,
  genre: string,
  onProgress?: (job: AiTranslationJob) => void,
) {
  let job = await startWholeBookTranslation(bookId, genre);
  onProgress?.(job);
  while (job.status === 'queued' || job.status === 'processing') {
    job = await continueWholeBookTranslation(job.id);
    onProgress?.(job);
  }
  if (job.status !== 'completed') {
    throw new Error(job.errorMessage || 'AI dịch toàn truyện chưa hoàn tất.');
  }
  return job;
}
