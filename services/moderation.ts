import { requireSupabase } from '../lib/supabase';
import { Tables } from '../types/database';
import { toServiceError } from './errors';

export type ReportReason = 'copyright' | 'plagiarism' | 'spam' | 'harassment' | 'inappropriate' | 'impersonation' | 'other';
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'rejected';
export type ModerationState = 'approved' | 'hidden' | 'rejected';
export type ModerationTarget = 'book' | 'chapter' | 'comment' | 'author' | 'review';

export type ReportRow = Tables<'reports'>;
export type ModerationActionRow = Tables<'moderation_actions'>;

export type ReviewModerationPreview = {
  id: string;
  rating: number;
  reviewText: string;
  spoiler: boolean;
  moderationState: ModerationState;
  userName: string;
  bookTitle: string;
};

export async function submitReport(input: {
  reporterId: string;
  reason: ReportReason;
  details?: string;
  bookId?: string;
  chapterId?: string;
  commentId?: string;
  authorId?: string;
  reviewId?: string;
}) {
  const targetCount = [input.bookId, input.chapterId, input.commentId, input.authorId, input.reviewId].filter(Boolean).length;
  if (targetCount !== 1) throw new Error('Báo cáo cần đúng một đối tượng.');
  const details = input.details?.trim() ?? '';
  if (details.length > 5000) throw new Error('Nội dung báo cáo tối đa 5.000 ký tự.');

  const { data, error } = await requireSupabase()
    .from('reports')
    .insert({
      reporter_id: input.reporterId,
      reason: input.reason,
      details,
      book_id: input.bookId ?? null,
      chapter_id: input.chapterId ?? null,
      comment_id: input.commentId ?? null,
      author_id: input.authorId ?? null,
      review_id: input.reviewId ?? null,
    })
    .select('*')
    .single();

  if (error) throw toServiceError(error, 'Không thể gửi báo cáo.');
  return data;
}

export async function getMyReports(userId: string) {
  const { data, error } = await requireSupabase()
    .from('reports')
    .select('*')
    .eq('reporter_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw toServiceError(error, 'Không thể tải báo cáo.');
  return data ?? [];
}

export async function getAdminReports(status?: ReportStatus) {
  let query = requireSupabase()
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw toServiceError(error, 'Không thể tải hàng đợi kiểm duyệt.');
  return data ?? [];
}

export async function getAdminReport(id: string) {
  const client = requireSupabase();
  const { data, error } = await client.from('reports').select('*').eq('id', id).single();
  if (error) throw toServiceError(error, 'Không thể tải báo cáo.');
  return data;
}

export async function getAdminReviewPreview(reviewId: string): Promise<ReviewModerationPreview> {
  const client = requireSupabase();
  const { data: review, error } = await client.from('book_reviews').select('*').eq('id', reviewId).single();
  if (error) throw toServiceError(error, 'Không thể tải nội dung đánh giá.');

  const [profileResult, bookResult] = await Promise.all([
    client.from('profiles').select('display_name,username').eq('id', review.user_id).maybeSingle(),
    client.from('books').select('title').eq('id', review.book_id).maybeSingle(),
  ]);

  if (profileResult.error || bookResult.error) {
    throw toServiceError(profileResult.error ?? bookResult.error, 'Không thể tải ngữ cảnh đánh giá.');
  }

  return {
    id: review.id,
    rating: Number(review.rating),
    reviewText: review.review_text,
    spoiler: review.spoiler,
    moderationState: review.moderation_state,
    userName: profileResult.data?.display_name || profileResult.data?.username || 'Độc giả CHƯƠNG',
    bookTitle: bookResult.data?.title || 'Truyện CHƯƠNG',
  };
}

export async function getAdminDashboardCounts() {
  const client = requireSupabase();
  const statuses: ReportStatus[] = ['open', 'reviewing', 'resolved', 'rejected'];
  const values = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await client.from('reports').select('*', { head: true, count: 'exact' }).eq('status', status);
      if (error) throw error;
      return [status, count ?? 0] as const;
    })
  );
  return Object.fromEntries(values) as Record<ReportStatus, number>;
}

export async function adminUpdateReport(id: string, status: ReportStatus, note?: string) {
  const resolution = note?.trim();
  const args: {
    p_report_id: string;
    p_status: ReportStatus;
    p_resolution_note?: string;
  } = { p_report_id: id, p_status: status };
  if (resolution) args.p_resolution_note = resolution;
  const { error } = await requireSupabase().rpc('admin_update_report', args);
  if (error) throw toServiceError(error, 'Không thể cập nhật báo cáo.');
}

export async function adminModerate(
  targetType: ModerationTarget,
  targetId: string,
  state: ModerationState,
  reason?: string,
  reportId?: string
) {
  const args: {
    p_target_type: string;
    p_target_id: string;
    p_state: ModerationState;
    p_reason?: string;
    p_report_id?: string;
  } = {
    p_target_type: targetType,
    p_target_id: targetId,
    p_state: state,
  };
  const cleanReason = reason?.trim();
  if (cleanReason) args.p_reason = cleanReason;
  if (reportId) args.p_report_id = reportId;
  const { error } = await requireSupabase().rpc('admin_set_moderation', args);
  if (error) throw toServiceError(error, 'Không thể cập nhật trạng thái kiểm duyệt.');
}

export function getReportTarget(report: ReportRow): { type: ModerationTarget; id: string } | null {
  if (report.book_id) return { type: 'book', id: report.book_id };
  if (report.chapter_id) return { type: 'chapter', id: report.chapter_id };
  if (report.comment_id) return { type: 'comment', id: report.comment_id };
  if (report.author_id) return { type: 'author', id: report.author_id };
  if (report.review_id) return { type: 'review', id: report.review_id };
  return null;
}

export function reportReasonLabel(reason: ReportReason) {
  return ({
    copyright: 'Vi phạm bản quyền',
    plagiarism: 'Sao chép / đạo văn',
    spam: 'Spam / quảng cáo',
    harassment: 'Quấy rối / công kích',
    inappropriate: 'Nội dung không phù hợp',
    impersonation: 'Mạo danh',
    other: 'Lý do khác',
  } as const)[reason];
}

export function reportStatusLabel(status: ReportStatus) {
  return ({
    open: 'Mới',
    reviewing: 'Đang xem xét',
    resolved: 'Đã xử lý',
    rejected: 'Không vi phạm',
  } as const)[status];
}
