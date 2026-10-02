import { requireSupabase, supabase } from '../lib/supabase';
import { Author, Chapter, ChapterInput } from '../types';
import { Database } from '../types/database';
import { toServiceError } from './errors';

type AuthorRow = Database['public']['Tables']['authors']['Row'];

const mapAuthor = (row: AuthorRow): Author => ({
  id: row.id, userId: row.user_id, penName: row.pen_name, bio: row.bio, avatarUrl: row.avatar_url,
  followersCount: row.followers_count, verified: row.verified, createdAt: row.created_at
});

export async function getAuthorForUser(userId: string): Promise<Author | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('authors').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw toServiceError(error, 'Không thể tải hồ sơ tác giả.');
  return data ? mapAuthor(data) : null;
}

export async function becomeAuthor(userId: string, input: { penName: string; bio: string; avatarUrl: string | null; agreed: boolean }) {
  if (!input.agreed) throw new Error('Bạn cần xác nhận cam kết bản quyền trước khi tiếp tục.');
  const client = requireSupabase();
  try {
    const existing = await getAuthorForUser(userId);
    if (existing) return existing;
    const { data, error } = await client.from('authors').insert({ user_id: userId, pen_name: input.penName.trim(), bio: input.bio.trim() || null, avatar_url: input.avatarUrl }).select('*').single();
    if (error) throw error;
    return mapAuthor(data);
  } catch (error) { throw toServiceError(error, 'Không thể tạo hồ sơ tác giả.'); }
}

export async function updateAuthorAvatar(authorId: string, avatarUrl: string) {
  const { data, error } = await requireSupabase().from('authors').update({ avatar_url: avatarUrl }).eq('id', authorId).select('*').single();
  if (error) throw toServiceError(error, 'Không thể cập nhật ảnh tác giả.');
  return mapAuthor(data);
}

export { createBook, getMyBooks } from './books';

export async function getAuthorChapters(bookId: string): Promise<Chapter[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('chapters').select('*').eq('book_id', bookId).order('chapter_number');
  if (error) throw toServiceError(error, 'Không thể tải bản thảo.');
  return (data ?? []).map((row) => ({ id: row.id, bookId: row.book_id, number: row.chapter_number, title: row.title, content: row.content, date: row.published_at ?? row.updated_at, relativeDate: row.status === 'published' ? 'Đã xuất bản' : 'Bản nháp', access: row.is_vip ? 'vip' : 'free', priceCoins: row.price_coins, status: row.status, publishedAt: row.published_at, isRead: false, isDownloaded: false }));
}

export async function getAuthorChapter(bookId: string, chapterId: string): Promise<Chapter | null> {
  if (chapterId === 'new') return null;
  const chapters = await getAuthorChapters(bookId);
  return chapters.find((chapter) => chapter.id === chapterId) ?? null;
}

export async function saveChapter(input: ChapterInput): Promise<string> {
  const client = requireSupabase();
  if (input.status === 'published' && (input.title.trim().length < 2 || input.content.trim().length < 50)) throw new Error('Chương cần có tiêu đề và ít nhất 50 ký tự trước khi xuất bản.');
  const payload = { book_id: input.bookId, chapter_number: input.chapterNumber, title: input.title.trim(), content: input.content, status: input.status, is_vip: input.isVip, price_coins: input.priceCoins, updated_at: new Date().toISOString() };
  try {
    if (input.id) {
      const { data, error } = await client.from('chapters').update(payload).eq('id', input.id).select('id').single();
      if (error) throw error;
      return data.id;
    }
    const { data, error } = await client.from('chapters').insert(payload).select('id').single();
    if (error) throw error;
    return data.id;
  } catch (error) { throw toServiceError(error, 'Không thể lưu chương.'); }
}
