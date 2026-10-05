import { requireSupabase } from '../lib/supabase';
import { Database } from '../types/database';
import { toServiceError } from './errors';

export type FollowedBookUpdate = Database['public']['Functions']['get_my_followed_book_updates']['Returns'][number];
export type FollowedUpdateBadge = { updated_books: number; unread_chapters: number };

export async function getFollowedBookUpdates(limit = 20, offset = 0, updatesOnly = false): Promise<FollowedBookUpdate[]> {
  const { data, error } = await requireSupabase().rpc('get_my_followed_book_updates', {
    p_limit: limit, p_offset: offset, p_updates_only: updatesOnly,
  });
  if (error) throw toServiceError(error, 'Không thể tải cập nhật truyện.');
  return data ?? [];
}

export async function getFollowedUpdateBadge(): Promise<FollowedUpdateBadge> {
  const { data, error } = await requireSupabase().rpc('get_my_followed_book_update_badge');
  if (error) throw toServiceError(error, 'Không thể tải số chương mới.');
  const row = data?.[0];
  return { updated_books: Number(row?.updated_books ?? 0), unread_chapters: Number(row?.unread_chapters ?? 0) };
}
