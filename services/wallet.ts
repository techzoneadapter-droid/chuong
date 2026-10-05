import { SpiritCurrency } from './spiritStones';
import { requireSupabase } from '../lib/supabase';
import { Tables } from '../types/database';
import { toServiceError } from './errors';

export type WalletAccount = Tables<'wallet_accounts'>;
export type WalletTransaction = Tables<'wallet_transactions'>;

export async function getWallet(userId: string): Promise<WalletAccount> {
  try {
    const { data, error } = await requireSupabase()
      .from('wallet_accounts')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    return { ...data, low_spirit_stones: data.low_spirit_stones ?? data.balance_coins, high_spirit_stones: data.high_spirit_stones ?? 0 };
  } catch (error) {
    throw toServiceError(error, 'Không thể tải Ví CHƯƠNG.');
  }
}

export async function getWalletTransactions(userId: string, limit = 100): Promise<WalletTransaction[]> {
  try {
    const { data, error } = await requireSupabase()
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)));
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    throw toServiceError(error, 'Không thể tải lịch sử giao dịch.');
  }
}

export async function adminAdjustWallet(input: {
  userId: string;
  amount: number;
  reason: string;
  idempotencyKey?: string;
  currency?: SpiritCurrency;
}) {
  const { data, error } = await requireSupabase().rpc('admin_adjust_wallet_currency', {
    p_user_id: input.userId,
    p_amount: Math.trunc(input.amount),
    p_reason: input.reason.trim(),
    p_idempotency_key: input.idempotencyKey?.trim() || null,
    p_currency_type: input.currency ?? 'low',
  });
  if (error) throw toServiceError(error, 'Không thể điều chỉnh số dư.');
  return data?.[0] ?? null;
}

export function walletTransactionLabel(type: WalletTransaction['type']) {
  return ({
    purchase_credit: 'Nạp ví',
    unlock_debit: 'Mở khóa nội dung',
    refund_credit: 'Hoàn mở khóa',
    promo_credit: 'Hạ Phẩm Linh Thạch khuyến mãi',
    admin_credit: 'Điều chỉnh cộng',
    admin_debit: 'Điều chỉnh trừ',
    author_payout_debit: 'Thanh toán doanh thu',
    purchase_reversal_debit: 'Thu hồi do hoàn giao dịch',
    refund_reversal_credit: 'Khôi phục do đảo hoàn tiền',
    gift_debit: 'Tặng quà tác giả',
  } as const)[type];
}

export function formatCoins(value: number) {
  return new Intl.NumberFormat('vi-VN').format(value);
}
