import { getVndDashboard, VndDashboard } from './vndRevenue';
import { requireSupabase } from '../lib/supabase';
import { Tables } from '../types/database';
import { toServiceError } from './errors';

export type AuthorPayout = Tables<'author_payouts'>;
export type AuthorPayoutProfile = Tables<'author_payout_profiles'>;
export type AuthorRevenueAccount = Tables<'author_revenue_accounts'>;

export type AuthorPayoutWorkspace = {
  profile: AuthorPayoutProfile | null;
  payouts: AuthorPayout[];
  revenue: VndDashboard;
  reservedVnd: number;
  requestableVnd: number;
};

export type AdminPayoutQueueItem = AuthorPayout & {
  penName: string;
  payoutProfile: AuthorPayoutProfile | null;
};

export async function getAuthorPayoutWorkspace(authorId: string): Promise<AuthorPayoutWorkspace> {
  const client = requireSupabase();
  try {
    const [
      { data: profile, error: profileError },
      { data: payouts, error: payoutsError },
    ] = await Promise.all([
      client.from('author_payout_profiles').select('*').eq('author_id', authorId).maybeSingle(),
      client.from('author_payouts').select('*').eq('author_id', authorId).order('requested_at', { ascending: false }).limit(100),
    ]);

    if (profileError) throw profileError;
    if (payoutsError) throw payoutsError;

    const rows = payouts ?? [];
    const revenue = await getVndDashboard(authorId);
    return { profile, payouts: rows, revenue, reservedVnd: revenue.reserved_vnd, requestableVnd: revenue.available_payout_vnd };
  } catch (error) {
    throw toServiceError(error, 'Không thể tải yêu cầu rút doanh thu.');
  }
}

export async function updateAuthorPayoutProfile(input: {
  payoutMethod: string;
  destinationLabel: string;
}) {
  const { data, error } = await requireSupabase().rpc('author_update_payout_profile', {
    p_payout_method: input.payoutMethod.trim(),
    p_destination_label: input.destinationLabel.trim(),
  });
  if (error) throw toServiceError(error, 'Không thể lưu phương thức nhận thanh toán.');
  return data;
}

export async function requestAuthorPayout(input: {
  requestedVnd: number;
  note?: string;
  idempotencyKey: string;
}) {
  if (!Number.isSafeInteger(input.requestedVnd) || input.requestedVnd <= 0) throw new Error('Số tiền rút không hợp lệ.');
  const { data, error } = await requireSupabase().rpc('author_request_payout_vnd', {
    p_requested_vnd: input.requestedVnd,
    p_note: input.note?.trim() || '',
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw toServiceError(error, 'Không thể gửi yêu cầu rút doanh thu.');
  return data;
}

export async function cancelAuthorPayout(payoutId: string) {
  const { data, error } = await requireSupabase().rpc('author_cancel_payout_request', {
    p_payout_id: payoutId,
  });
  if (error) throw toServiceError(error, 'Không thể hủy yêu cầu rút.');
  return data;
}

export async function getAdminPayoutQueue(limit = 100): Promise<AdminPayoutQueueItem[]> {
  const client = requireSupabase();
  try {
    const { data: payouts, error: payoutError } = await client
      .from('author_payouts')
      .select('*')
      .order('requested_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)));
    if (payoutError) throw payoutError;

    const authorIds = [...new Set((payouts ?? []).map((item) => item.author_id))];
    if (!authorIds.length) return [];

    const [
      { data: authors, error: authorsError },
      { data: profiles, error: profilesError },
    ] = await Promise.all([
      client.from('authors').select('id,pen_name').in('id', authorIds),
      client.from('author_payout_profiles').select('*').in('author_id', authorIds),
    ]);

    if (authorsError) throw authorsError;
    if (profilesError) throw profilesError;

    const authorMap = new Map((authors ?? []).map((author) => [author.id, author.pen_name]));
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.author_id, profile]));

    return (payouts ?? []).map((payout) => ({
      ...payout,
      penName: authorMap.get(payout.author_id) || 'Tác giả CHƯƠNG',
      payoutProfile: profileMap.get(payout.author_id) || null,
    }));
  } catch (error) {
    throw toServiceError(error, 'Không thể tải hàng đợi thanh toán tác giả.');
  }
}

export async function adminSetPayoutCompliance(input: {
  authorId: string;
  kycStatus: AuthorPayoutProfile['kyc_status'];
  taxStatus: AuthorPayoutProfile['tax_status'];
  note?: string;
}) {
  const { data, error } = await requireSupabase().rpc('admin_set_author_payout_compliance', {
    p_author_id: input.authorId,
    p_kyc_status: input.kycStatus,
    p_tax_status: input.taxStatus,
    p_note: input.note?.trim() || '',
  });
  if (error) throw toServiceError(error, 'Không thể cập nhật trạng thái KYC/thuế.');
  return data;
}

export async function adminReviewPayout(input: {
  payoutId: string;
  action: 'approve' | 'cancel';
  note?: string;
}) {
  const { data, error } = await requireSupabase().rpc('admin_review_payout_request', {
    p_payout_id: input.payoutId,
    p_action: input.action,
    p_note: input.note?.trim() || '',
  });
  if (error) throw toServiceError(error, input.action === 'approve' ? 'Không thể duyệt yêu cầu rút.' : 'Không thể hủy yêu cầu rút.');
  return data;
}

export async function adminMarkPayoutPaid(input: {
  payoutId: string;
  externalReference: string;
  note?: string;
}) {
  const { data, error } = await requireSupabase().rpc('admin_mark_payout_paid', {
    p_payout_id: input.payoutId,
    p_external_reference: input.externalReference.trim(),
    p_note: input.note?.trim() || '',
  });
  if (error) throw toServiceError(error, 'Không thể ghi nhận đã thanh toán.');
  return data;
}

export function payoutStatusLabel(status: AuthorPayout['status']) {
  if (status === 'pending') return 'Chờ duyệt';
  if (status === 'approved') return 'Đã duyệt';
  if (status === 'paid') return 'Đã thanh toán';
  return 'Đã hủy';
}

export function complianceStatusLabel(status?: string | null) {
  if (status === 'verified') return 'Đã xác minh';
  if (status === 'pending') return 'Đang kiểm tra';
  if (status === 'rejected') return 'Bị từ chối';
  if (status === 'not_required') return 'Không yêu cầu';
  return 'Chưa gửi';
}

export function createPayoutIdempotencyKey(authorId: string) {
  return `payout:${authorId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}
