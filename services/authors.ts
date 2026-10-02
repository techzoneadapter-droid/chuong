import { requireSupabase, supabase } from '../lib/supabase';
import { Author, AuthorBookInput, Book, Chapter, ChapterInput } from '../types';
import { Database } from '../types/database';
import { toServiceError } from './errors';
import { mapBook } from './books';

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
    const { data, error } = await client.from('authors').insert({ user_id: userId, pen_name: input.penName.trim(), bio: input.bio.trim() || null, avatar_url: input.avatarUrl }).select('*').single();
    if (error) throw error;
    const { error: profileError } = await client.from('profiles').update({ role: 'author', updated_at: new Date().toISOString() }).eq('id', userId);
    if (profileError) throw profileError;
    return mapAuthor(data);
  } catch (error) { throw toServiceError(error, 'Không thể tạo hồ sơ tác giả.'); }
}

export async function updateAuthorAvatar(authorId: string, avatarUrl: string) {
  const { data, error } = await requireSupabase().from('authors').update({ avatar_url: avatarUrl }).eq('id', authorId).select('*').single();
  if (error) throw toServiceError(error, 'Không thể cập nhật ảnh tác giả.');
  return mapAuthor(data);
}

export async function getMyBooks(authorId: string): Promise<Book[]> {
  const client = requireSupabase();
  try {
    const { data, error } = await client.from('books').select('*').eq('author_id', authorId).order('updated_at', { ascending: false });
    if (error) throw error;
    const { data: author } = await client.from('authors').select('*').eq('id', authorId).single();
    const ids = (data ?? []).map((book) => book.id);
    const { data: genres } = ids.length ? await client.from('book_genres').select('*').in('book_id', ids) : { data: [] };
    return (data ?? []).map((book) => mapBook(book, author ?? undefined, genres?.filter((item) => item.book_id === book.id).map((item) => item.genre) ?? []));
  } catch (error) { throw toServiceError(error, 'Không thể tải truyện của bạn.'); }
}

const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function createBook(authorId: string, input: AuthorBookInput): Promise<Book> {
  const client = requireSupabase();
  try {
    const slug = `${slugify(input.title)}-${Date.now().toString(36)}`;
    const { data, error } = await client.from('books').insert({
      author_id: authorId, title: input.title.trim(), slug, description: input.description.trim(), cover_url: input.coverUrl,
      language: input.language, source_type: input.sourceType, status: input.status, visibility: input.status === 'draft' ? 'private' : 'public', tags: input.tags
    }).select('*').single();
    if (error) throw error;
    if (input.genre.trim()) {
      const { error: genreError } = await client.from('book_genres').insert({ book_id: data.id, genre: input.genre.trim() });
      if (genreError) throw genreError;
    }
    const author = await client.from('authors').select('*').eq('id', authorId).single();
    return mapBook(data, author.data ?? undefined, [input.genre.trim()]);
  } catch (error) { throw toServiceError(error, 'Không thể tạo truyện.'); }
}

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
  const payload = { book_id: input.bookId, chapter_number: input.chapterNumber, title: input.title.trim(), content: input.content, status: input.status, is_vip: input.isVip, price_coins: input.priceCoins, published_at: input.status === 'published' ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
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
