import { requireSupabase } from '../lib/supabase';
import { Tables } from '../types/database';
import { toServiceError } from './errors';

export type RevenuePolicy = Tables<'revenue_share_policies'>;
export type RevenueAccount = Tables<'author_revenue_accounts'>;
export type RevenueLedgerEntry = Tables<'author_revenue_ledger'>;
export type AuthorPayout = Tables<'author_payouts'>;

export type RevenueDashboard = {
  account: RevenueAccount;
  policy: RevenuePolicy | null;
  ledger: (RevenueLedgerEntry & { bookTitle?: string })[];
  payouts: AuthorPayout[];
  availablePayoutCoins: number;
  unallocatedGrossCoins: number;
};

export async function getActiveRevenuePolicy(): Promise<RevenuePolicy | null> {
  try {
    const { data, error } = await requireSupabase()
      .from('revenue_share_policies')
      .select('*')
      .eq('active', true)
      .order('effective_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (error) {
    throw toServiceError(error, 'Không thể tải chính sách chia doanh thu.');
  }
}

export async function getRevenuePolicies(limit = 20): Promise<RevenuePolicy[]> {
  try {
    const { data, error } = await requireSupabase()
      .from('revenue_share_policies')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100)));
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    throw toServiceError(error, 'Không thể tải lịch sử chính sách.');
  }
}

export async function getAuthorRevenueDashboard(authorId: string): Promise<RevenueDashboard> {
  const client = requireSupabase();
  try {
    const [{ data: account, error: accountError }, { data: ledger, error: ledgerError }, { data: payouts, error: payoutError }, policy] = await Promise.all([
      client.from('author_revenue_accounts').select('*').eq('author_id', authorId).single(),
      client.from('author_revenue_ledger').select('*').eq('author_id', authorId).order('created_at', { ascending: false }).limit(100),
      client.from('author_payouts').select('*').eq('author_id', authorId).order('created_at', { ascending: false }).limit(50),
      getActiveRevenuePolicy(),
    ]);

    if (accountError) throw accountError;
    if (ledgerError) throw ledgerError;
    if (payoutError) throw payoutError;

    const rows = ledger ?? [];
    const bookIds = [...new Set(rows.map((item) => item.book_id).filter(Boolean))];
    const { data: books, error: booksError } = bookIds.length
      ? await client.from('books').select('id,title').in('id', bookIds)
      : { data: [], error: null };
    if (booksError) throw booksError;

    const titleMap = new Map((books ?? []).map((book) => [book.id, book.title]));
    const availablePayoutCoins = Math.max(
      0,
      account.author_earnings_coins - account.refunded_earnings_coins - account.paid_out_coins
    );
    const unallocatedGrossCoins = rows.reduce((sum, row) => {
      if (row.share_policy_id !== null) return sum;
      return sum + row.gross_coins;
    }, 0);

    return {
      account,
      policy,
      ledger: rows.map((row) => ({ ...row, bookTitle: titleMap.get(row.book_id) })),
      payouts: payouts ?? [],
      availablePayoutCoins,
      unallocatedGrossCoins,
    };
  } catch (error) {
    throw toServiceError(error, 'Không thể tải doanh thu tác giả.');
  }
}

export async function adminSetRevenueSharePolicy(input: {
  authorSharePercent: number;
  note?: string;
  activate?: boolean;
}): Promise<RevenuePolicy> {
  const bps = Math.round(input.authorSharePercent * 100);
  if (!Number.isFinite(bps) || bps < 0 || bps > 10000) throw new Error('Tỷ lệ tác giả phải từ 0% đến 100%.');

  const { data, error } = await requireSupabase().rpc('admin_set_revenue_share_policy', {
    p_author_share_bps: bps,
    p_note: input.note?.trim() || undefined,
    p_activate: input.activate ?? true,
  });
  if (error) throw toServiceError(error, 'Không thể cập nhật chính sách doanh thu.');
  if (!data) throw new Error('Không nhận được chính sách mới.');
  return data;
}

export async function adminRefundEntitlement(input: {
  type: 'book' | 'chapter';
  entitlementId: string;
  reason: string;
  idempotencyKey: string;
}) {
  const { data, error } = await requireSupabase().rpc('admin_refund_entitlement', {
    p_entitlement_type: input.type,
    p_entitlement_id: input.entitlementId,
    p_reason: input.reason.trim(),
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw toServiceError(error, 'Không thể hoàn Linh Thạch cho giao dịch.');
  return data?.[0] ?? null;
}

export async function adminRecordPaidAuthorPayout(input: {
  authorId: string;
  amountCoins: number;
  externalReference: string;
  note?: string;
  idempotencyKey: string;
}) {
  const { data, error } = await requireSupabase().rpc('admin_record_paid_author_payout', {
    p_author_id: input.authorId,
    p_amount_coins: Math.trunc(input.amountCoins),
    p_external_reference: input.externalReference.trim(),
    p_note: input.note?.trim() || '',
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw toServiceError(error, 'Không thể ghi nhận thanh toán tác giả.');
  return data;
}

export function formatRevenueCoins(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value);
}

export function sharePercent(bps?: number | null) {
  return bps == null ? null : bps / 100;
}
