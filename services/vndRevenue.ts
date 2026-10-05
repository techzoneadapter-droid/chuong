import { requireSupabase } from '../lib/supabase';
import { VndPolicy, VndLedger, Json } from '../types/database';
import { toServiceError } from './errors';
export type { VndPolicy, VndLedger };
export type VndDashboard = {
 policy: VndPolicy; total_vnd: number; paid_vnd: number; reserved_vnd: number;
 available_payout_vnd: number; debt_vnd: number; pending_count: number; pending_low_stones: number;
 breakdown: Partial<Record<VndLedger['source_type'], number>>; ledger: VndLedger[];
};
export const formatVnd = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
export async function getVndDashboard(authorId: string): Promise<VndDashboard> {
 const { data, error } = await requireSupabase().rpc('get_author_vnd_dashboard', { p_author_id: authorId });
 if (error) throw toServiceError(error, 'Không thể tải doanh thu VND.');
 return data as unknown as VndDashboard;
}
export async function getVndPolicies() {
 const { data, error } = await requireSupabase().from('author_payout_policies').select('*').order('created_at', { ascending: false }).limit(30);
 if (error) throw toServiceError(error, 'Không thể tải chính sách thanh toán.');
 return data ?? [];
}
export async function saveVndPolicy(input: Pick<VndPolicy, 'high_stone_value_vnd' | 'chapter_author_bps' | 'book_author_bps' | 'gift_author_bps' | 'low_creator_pool_bps' | 'minimum_withdrawal_vnd' | 'withdrawal_fee_vnd'>) {
 const { error } = await requireSupabase().rpc('admin_set_author_payout_policy', {
 p_high_stone_value_vnd: input.high_stone_value_vnd, p_chapter_bps: input.chapter_author_bps,
 p_book_bps: input.book_author_bps, p_gift_bps: input.gift_author_bps, p_low_pool_bps: input.low_creator_pool_bps,
 p_minimum_vnd: input.minimum_withdrawal_vnd, p_fee_vnd: input.withdrawal_fee_vnd,
 });
 if (error) throw toServiceError(error, 'Không thể lưu chính sách thanh toán.');
}
export async function settleVndPeriod(start: string, end: string, actualPoolVnd: number) {
 const { error } = await requireSupabase().rpc('admin_settle_author_period', { p_start: start, p_end: end, p_actual_pool_vnd: actualPoolVnd });
 if (error) throw toServiceError(error, 'Không thể đối soát kỳ doanh thu.');
}
export function payoutSnapshot(value: Json): { payout_method?: string; destination_label?: string; kyc_status?: string; tax_status?: string } {
 return value && typeof value === 'object' && !Array.isArray(value) ? value as ReturnType<typeof payoutSnapshot> : {};
}
