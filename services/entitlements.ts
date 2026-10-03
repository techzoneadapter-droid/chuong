import { requireSupabase } from '../lib/supabase';
import { Tables } from '../types/database';
import { toServiceError } from './errors';

export type BookEntitlement = Tables<'book_entitlements'>;
export type ChapterEntitlement = Tables<'chapter_entitlements'>;

export type UnlockResult = {
  unlocked: boolean;
  alreadyUnlocked: boolean;
  balanceCoins: number;
  pricePaidCoins: number;
  entitlementId: string | null;
};

export class UnlockError extends Error {
  code: 'AUTH_REQUIRED' | 'INSUFFICIENT_COINS' | 'CONTENT_NOT_AVAILABLE' | 'BOOK_UNLOCK_REQUIRED' | 'UNKNOWN';
  constructor(code: UnlockError['code'], message: string) {
    super(message);
    this.name = 'UnlockError';
    this.code = code;
  }
}

function classifyUnlockError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('AUTH_REQUIRED')) throw new UnlockError('AUTH_REQUIRED', 'Bạn cần đăng nhập để mở khóa nội dung.');
  if (message.includes('INSUFFICIENT_COINS')) throw new UnlockError('INSUFFICIENT_COINS', 'Số dư CHƯƠNG Xu không đủ.');
  if (message.includes('CONTENT_NOT_AVAILABLE')) throw new UnlockError('CONTENT_NOT_AVAILABLE', 'Nội dung hiện không khả dụng.');
  if (message.includes('BOOK_UNLOCK_REQUIRED')) throw new UnlockError('BOOK_UNLOCK_REQUIRED', 'Truyện này cần được mở khóa toàn bộ.');
  throw toServiceError(error, 'Không thể mở khóa nội dung.');
}

function idempotencyKey(kind: 'book' | 'chapter', id: string) {
  return `unlock:${kind}:${id}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
}

function mapUnlock(row: {
  unlocked: boolean;
  already_unlocked: boolean;
  balance_coins: number;
  price_paid_coins: number;
  entitlement_id: string | null;
}): UnlockResult {
  return {
    unlocked: row.unlocked,
    alreadyUnlocked: row.already_unlocked,
    balanceCoins: row.balance_coins,
    pricePaidCoins: row.price_paid_coins,
    entitlementId: row.entitlement_id,
  };
}

export async function unlockChapter(chapterId: string): Promise<UnlockResult> {
  try {
    const { data, error } = await requireSupabase().rpc('unlock_chapter', {
      p_chapter_id: chapterId,
      p_idempotency_key: idempotencyKey('chapter', chapterId),
    });
    if (error) throw error;
    const row = data?.[0];
    if (!row) throw new Error('Không nhận được kết quả mở khóa.');
    return mapUnlock(row);
  } catch (error) {
    return classifyUnlockError(error);
  }
}

export async function unlockBook(bookId: string): Promise<UnlockResult> {
  try {
    const { data, error } = await requireSupabase().rpc('unlock_book', {
      p_book_id: bookId,
      p_idempotency_key: idempotencyKey('book', bookId),
    });
    if (error) throw error;
    const row = data?.[0];
    if (!row) throw new Error('Không nhận được kết quả mở khóa.');
    return mapUnlock(row);
  } catch (error) {
    return classifyUnlockError(error);
  }
}

export async function hasBookEntitlement(userId: string, bookId: string) {
  const { data, error } = await requireSupabase()
    .from('book_entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw toServiceError(error, 'Không thể kiểm tra quyền đọc.');
  return Boolean(data);
}

export async function getChapterEntitlements(userId: string, bookId: string) {
  const { data, error } = await requireSupabase()
    .from('chapter_entitlements')
    .select('*')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .is('revoked_at', null)
    .order('granted_at', { ascending: false });
  if (error) throw toServiceError(error, 'Không thể tải nội dung đã mở khóa.');
  return data ?? [];
}
