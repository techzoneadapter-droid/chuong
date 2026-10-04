import { requireSupabase } from '../lib/supabase';
import { DiscussionComment } from '../types';
import { toServiceError } from './errors';

export async function getComments(bookId: string, chapterId?: string, userId?: string): Promise<DiscussionComment[]> {
  const client = requireSupabase();
  let query = client.from('comments').select('*').eq('book_id', bookId).order('created_at').limit(100);
  query = chapterId ? query.eq('chapter_id', chapterId) : query.is('chapter_id', null);
  const { data, error } = await query;
  if (error) throw toServiceError(error, 'Không thể tải bình luận.');
  if (!data?.length) return [];
  const [profiles, likes] = await Promise.all([
    client.from('profiles').select('id,display_name,avatar_url').in('id', [...new Set(data.map((row) => row.user_id))]),
    client.from('comment_likes').select('*').in('comment_id', data.map((row) => row.id))
  ]);
  if (profiles.error || likes.error) throw toServiceError(profiles.error ?? likes.error, 'Không thể tải bình luận.');
  return data.map((row) => {
    const profile = profiles.data?.find((item) => item.id === row.user_id);
    const reactions = likes.data?.filter((item) => item.comment_id === row.id) ?? [];
    return { id: row.id, userId: row.user_id, parentId: row.parent_id, name: profile?.display_name || 'Độc giả CHƯƠNG', avatarUrl: profile?.avatar_url ?? null, content: row.content, createdAt: row.created_at, likes: reactions.length, liked: reactions.some((item) => item.user_id === userId) };
  });
}
export async function createComment(userId: string, bookId: string, content: string, chapterId?: string, parentId?: string) {
  if (!content.trim() || content.trim().length > 3000) throw new Error('Bình luận cần có từ 1 đến 3.000 ký tự.');
  const { error } = await requireSupabase().from('comments').insert({ user_id: userId, book_id: bookId, chapter_id: chapterId ?? null, parent_id: parentId ?? null, content: content.trim() });
  if (error) throw toServiceError(error, 'Không thể gửi bình luận.');
}
export async function deleteComment(id: string, userId: string) {
  const { error } = await requireSupabase().from('comments').delete().eq('id', id).eq('user_id', userId);
  if (error) throw toServiceError(error, 'Không thể xóa bình luận.');
}
export async function setCommentLike(id: string, userId: string, liked: boolean) {
  const client = requireSupabase();
  const { error } = liked
    ? await client.from('comment_likes').upsert({ comment_id: id, user_id: userId }, { onConflict: 'user_id,comment_id', ignoreDuplicates: true })
    : await client.from('comment_likes').delete().eq('comment_id', id).eq('user_id', userId);
  if (error) throw toServiceError(error, 'Không thể cập nhật lượt thích.');
}
