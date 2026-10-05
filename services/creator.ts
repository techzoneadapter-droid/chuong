import { requireSupabase } from '../lib/supabase';
import { Database } from '../types/database';
import { Book } from '../types';
import { toServiceError } from './errors';

export type PublicAuthorHub = Database['public']['Functions']['get_public_author_hub']['Returns'][number];
export const AUTHOR_PAGE_SIZE = 20;

export async function getPublicAuthorHub(authorId: string): Promise<PublicAuthorHub | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authorId)) return null;
  const { data, error } = await requireSupabase().rpc('get_public_author_hub', { p_author_id: authorId });
  if (error) throw toServiceError(error, 'Không thể tải trang tác giả.');
  return data?.[0] ?? null;
}

export async function getPublicAuthorBooks(author: PublicAuthorHub, offset = 0): Promise<Book[]> {
  const { data, error } = await requireSupabase().rpc('get_public_author_books', {
    p_author_id: author.author_id, p_limit: AUTHOR_PAGE_SIZE, p_offset: offset,
  });
  if (error) throw toServiceError(error, 'Không thể tải truyện của tác giả.');
  return (data ?? []).map(row => ({
    id: row.id, authorId: author.author_id, title: row.title,
    author: row.credited_author_name?.trim() || author.pen_name,
    authorFollowers: String(author.followers_count), cover: '#6D2E46', coverUrl: row.cover_url,
    genre: row.genre ?? 'Khác', rating: Number(row.rating), views: '', followers: '',
    status: ({ draft: 'Bản nháp', ongoing: 'Đang ra', completed: 'Đã hoàn thành', paused: 'Tạm dừng / Drop' })[row.status],
    backendStatus: row.status, description: '', tags: [], totalChapters: row.total_chapters,
    latestChapter: row.total_chapters, isVip: row.is_vip, price: 0, progress: 0, chapters: [],
  }));
}
