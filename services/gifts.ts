import { requireSupabase } from '../lib/supabase';
import { toServiceError } from './errors';

export type AuthorGiftKey = 'linh_hoa' | 'tien_dan' | 'ngoc_boi' | 'linh_kiem';

export type AuthorGiftOption = {
  key: AuthorGiftKey;
  name: string;
  amount: number;
  subtitle: string;
};

export const AUTHOR_GIFT_OPTIONS: AuthorGiftOption[] = [
  { key: 'linh_hoa', name: 'Linh Hoa', amount: 10, subtitle: 'Một lời động viên nhẹ nhàng' },
  { key: 'tien_dan', name: 'Tiên Đan', amount: 50, subtitle: 'Tiếp thêm linh lực cho tác giả' },
  { key: 'ngoc_boi', name: 'Ngọc Bội', amount: 100, subtitle: 'Ủng hộ một chương thật hay' },
  { key: 'linh_kiem', name: 'Linh Kiếm', amount: 500, subtitle: 'Một món quà nổi bật dành cho tác giả' },
];

export type BookGiftSummary = {
  totalGifts: number;
  totalCoins: number;
};

export type SendAuthorGiftResult = {
  giftId: string;
  amountCoins: number;
  balanceCoins: number;
  authorEarningsCoins: number;
  platformShareCoins: number;
  alreadySent: boolean;
};

function giftError(error: unknown) {
  const raw = error && typeof error === 'object' && 'message' in error ? String((error as any).message) : '';
  if (/INSUFFICIENT_COINS/i.test(raw)) return new Error('Số dư Linh Thạch không đủ để tặng món quà này.');
  if (/SELF_GIFT_NOT_ALLOWED/i.test(raw)) return new Error('Bạn không thể tự tặng quà cho chính tài khoản tác giả của mình.');
  if (/DAILY_GIFT_LIMIT/i.test(raw)) return new Error('Bạn đã đạt giới hạn tặng quà trong ngày. Vui lòng quay lại vào ngày mai.');
  if (/CONTENT_NOT_AVAILABLE/i.test(raw)) return new Error('Truyện này hiện không đủ điều kiện nhận quà.');
  if (/REVENUE_POLICY_UNAVAILABLE/i.test(raw)) return new Error('Hệ thống phân bổ doanh thu đang tạm khóa. Vui lòng thử lại sau.');
  if (/INVALID_GIFT/i.test(raw)) return new Error('Món quà không hợp lệ.');
  return toServiceError(error, 'Chưa thể gửi quà cho tác giả. Vui lòng thử lại.');
}

export async function getBookGiftSummary(bookId: string): Promise<BookGiftSummary> {
  try {
    const { data, error } = await requireSupabase().rpc('get_book_gift_summary', { p_book_id: bookId });
    if (error) throw error;
    const row = data?.[0];
    return {
      totalGifts: Number(row?.total_gifts ?? 0),
      totalCoins: Number(row?.total_coins ?? 0),
    };
  } catch (error) {
    throw toServiceError(error, 'Không thể tải thống kê quà tặng.');
  }
}

export async function sendAuthorGift(bookId: string, giftKey: AuthorGiftKey): Promise<SendAuthorGiftResult> {
  try {
    const idempotencyKey = `gift:${bookId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const { data, error } = await requireSupabase().rpc('send_author_gift', {
      p_book_id: bookId,
      p_gift_key: giftKey,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    const row = data?.[0];
    if (!row) throw new Error('GIFT_RESULT_MISSING');
    return {
      giftId: row.gift_id,
      amountCoins: Number(row.amount_coins),
      balanceCoins: Number(row.balance_coins),
      authorEarningsCoins: Number(row.author_earnings_coins),
      platformShareCoins: Number(row.platform_share_coins),
      alreadySent: Boolean(row.already_sent),
    };
  } catch (error) {
    throw giftError(error);
  }
}
