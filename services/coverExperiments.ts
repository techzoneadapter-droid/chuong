import { requireSupabase, supabase } from '../lib/supabase';
import { getAnalyticsInstallId } from './analytics';
import { toServiceError } from './errors';

export type CoverExperimentVariant = 'A' | 'B';
export type CoverExperimentStatus = 'running' | 'completed' | 'cancelled';

export type AssignedCoverExperiment = {
  experimentId: string;
  bookId: string;
  variant: CoverExperimentVariant;
  coverUrl: string;
};

export type AuthorCoverExperiment = {
  experimentId: string;
  bookId: string;
  title: string;
  variantAUrl: string;
  variantBUrl: string;
  status: CoverExperimentStatus;
  winnerVariant: CoverExperimentVariant | null;
  startedAt: string;
  endedAt: string | null;
  impressionsA: number;
  impressionsB: number;
  clicksA: number;
  clicksB: number;
  ctrA: number;
  ctrB: number;
};

const sentEvents = new Set<string>();

function experimentError(error: unknown, fallback: string) {
  const raw = error && typeof error === 'object' && 'message' in error ? String((error as any).message) : '';
  if (/ACTIVE_EXPERIMENT_EXISTS/i.test(raw)) return new Error('Truyện này đang có một thử nghiệm bìa A/B hoạt động.');
  if (/COVER_A_REQUIRED/i.test(raw)) return new Error('Hãy đặt bìa hiện tại cho truyện trước khi bắt đầu A/B test.');
  if (/COVER_B_REQUIRED/i.test(raw)) return new Error('Hãy chọn bìa B trước khi bắt đầu.');
  if (/COVERS_MUST_DIFFER/i.test(raw)) return new Error('Bìa A và bìa B cần là hai ảnh khác nhau.');
  if (/EXPERIMENT_NOT_RUNNING/i.test(raw)) return new Error('Thử nghiệm này đã kết thúc.');
  if (/FORBIDDEN/i.test(raw)) return new Error('Bạn không có quyền quản lý thử nghiệm của truyện này.');
  return toServiceError(error, fallback);
}

export async function getAssignedCoverExperiments(bookIds: string[]) {
  const result = new Map<string, AssignedCoverExperiment>();
  if (!supabase || !bookIds.length) return result;

  const installId = await getAnalyticsInstallId();
  const { data, error } = await supabase.rpc('get_active_cover_experiments', {
    p_book_ids: bookIds,
    p_install_id: installId,
  });
  if (error) throw toServiceError(error, 'Không thể tải thử nghiệm bìa.');

  for (const row of data ?? []) {
    if (row.variant !== 'A' && row.variant !== 'B') continue;
    result.set(row.book_id, {
      experimentId: row.experiment_id,
      bookId: row.book_id,
      variant: row.variant,
      coverUrl: row.cover_url,
    });
  }
  return result;
}

export async function recordCoverExperimentEvent(experimentId: string, eventType: 'impression' | 'click') {
  if (!supabase || !experimentId) return false;
  const key = experimentId + ':' + eventType;
  if (sentEvents.has(key)) return true;

  try {
    const installId = await getAnalyticsInstallId();
    const { data, error } = await supabase.rpc('record_cover_experiment_event', {
      p_experiment_id: experimentId,
      p_install_id: installId,
      p_event_type: eventType,
    });
    if (error) return false;
    if (data) sentEvents.add(key);
    return Boolean(data);
  } catch {
    return false;
  }
}

export async function startCoverExperiment(bookId: string, variantBUrl: string) {
  try {
    const { data, error } = await requireSupabase().rpc('start_book_cover_experiment', {
      p_book_id: bookId,
      p_variant_b_url: variantBUrl,
    });
    if (error) throw error;
    return data;
  } catch (error) {
    throw experimentError(error, 'Không thể bắt đầu thử nghiệm bìa.');
  }
}

export async function finishCoverExperiment(experimentId: string, winner: CoverExperimentVariant) {
  try {
    const { data, error } = await requireSupabase().rpc('finish_book_cover_experiment', {
      p_experiment_id: experimentId,
      p_winner_variant: winner,
    });
    if (error) throw error;
    return Boolean(data);
  } catch (error) {
    throw experimentError(error, 'Không thể chốt bìa thắng.');
  }
}

export async function cancelCoverExperiment(experimentId: string) {
  try {
    const { data, error } = await requireSupabase().rpc('cancel_book_cover_experiment', {
      p_experiment_id: experimentId,
    });
    if (error) throw error;
    return Boolean(data);
  } catch (error) {
    throw experimentError(error, 'Không thể dừng thử nghiệm bìa.');
  }
}

export async function getAuthorCoverExperiments(authorId: string): Promise<AuthorCoverExperiment[]> {
  try {
    const { data, error } = await requireSupabase().rpc('get_author_cover_experiments', {
      p_author_id: authorId,
    });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      experimentId: row.experiment_id,
      bookId: row.book_id,
      title: row.title,
      variantAUrl: row.variant_a_url,
      variantBUrl: row.variant_b_url,
      status: row.status as CoverExperimentStatus,
      winnerVariant: row.winner_variant === 'A' || row.winner_variant === 'B' ? row.winner_variant : null,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      impressionsA: Number(row.impressions_a ?? 0),
      impressionsB: Number(row.impressions_b ?? 0),
      clicksA: Number(row.clicks_a ?? 0),
      clicksB: Number(row.clicks_b ?? 0),
      ctrA: Number(row.ctr_a ?? 0),
      ctrB: Number(row.ctr_b ?? 0),
    }));
  } catch (error) {
    throw experimentError(error, 'Không thể tải số liệu A/B bìa.');
  }
}

export function suggestedCoverWinner(experiment: AuthorCoverExperiment): CoverExperimentVariant | null {
  if (experiment.impressionsA < 50 || experiment.impressionsB < 50) return null;
  if (Math.abs(experiment.ctrA - experiment.ctrB) < 0.5) return null;
  return experiment.ctrB > experiment.ctrA ? 'B' : 'A';
}
