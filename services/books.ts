import { books as demoBooks, getBook as getDemoBook } from '../data/books';
import { requireSupabase, supabase } from '../lib/supabase';
import { AuthorBookInput, Book, BookStatus, ServiceResult } from '../types';
import { Database } from '../types/database';
import { deleteOwnBookCover } from './storage';
import { toServiceError } from './errors';
import { getOfflineBookSnapshot, listOfflineBooks } from './offlineDownloads';

type BookRow = Database['public']['Tables']['books']['Row'];
type AuthorRow = Database['public']['Tables']['authors']['Row'];

const statusLabels: Record<BookRow['status'], string> = {
  draft: 'Bản nháp', ongoing: 'Đang ra', completed: 'Đã hoàn thành', paused: 'Tạm dừng / Drop'
};

const compactNumber = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1).replace('.', ',')}M` : value >= 1_000 ? `${Math.round(value / 1_000)}K` : String(value);

export function mapBook(row: BookRow, author?: AuthorRow, genres: string[] = []): Book {
  return {
    id: row.id,
    authorId: row.author_id,
    authorUserId: author?.user_id,
    title: row.title,
    slug: row.slug,
    author: row.credited_author_name?.trim() || author?.pen_name || 'Tác giả CHƯƠNG',
    creditedAuthorName: row.credited_author_name,
    authorFollowers: compactNumber(author?.followers_count ?? 0),
    authorAvatarUrl: author?.avatar_url,
    cover: '#6D2E46',
    coverUrl: row.cover_url,
    genre: genres[0] ?? 'Khác',
    rating: Number(row.rating),
    ratingCount: Number(row.rating_count ?? 0),
    views: compactNumber(row.views_count),
    viewsCount: row.views_count,
    followers: compactNumber(row.followers_count),
    followersCount: row.followers_count,
    status: statusLabels[row.status],
    backendStatus: row.status,
    visibility: row.visibility,
    language: row.language,
    sourceType: row.source_type,
    description: row.description,
    tags: row.tags ?? [],
    totalChapters: row.total_chapters,
    latestChapter: row.total_chapters,
    isVip: row.is_vip,
    price: row.price_coins,
    progress: 0,
    chapters: []
  };
}

async function hydrateBooks(rows: BookRow[]): Promise<Book[]> {
  if (!supabase || rows.length === 0) return [];
  const authorIds = [...new Set(rows.map((row) => row.author_id))];
  const bookIds = rows.map((row) => row.id);
  const [{ data: authors, error: authorError }, { data: genres, error: genreError }] = await Promise.all([
    supabase.from('authors').select('*').in('id', authorIds),
    supabase.from('book_genres').select('*').in('book_id', bookIds)
  ]);
  if (authorError) throw authorError;
  if (genreError) throw genreError;
  return rows.map((row) => mapBook(
    row,
    authors?.find((author) => author.id === row.author_id),
    genres?.filter((genre) => genre.book_id === row.id).map((genre) => genre.genre) ?? []
  ));
}

export async function getBooks(): Promise<ServiceResult<Book[]>> {
  if (!supabase) return { data: demoBooks, mode: 'demo' };
  try {
    const books: Book[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('books').select('*').eq('visibility', 'public').neq('status', 'draft').order('updated_at', { ascending: false }).order('id').range(offset, offset + 499);
      if (error) throw error;
      books.push(...await hydrateBooks(data ?? []));
      if (!data || data.length < 500) break;
    }
    return { data: books, mode: 'supabase' };
  } catch (error) {
    const summaries = await listOfflineBooks().catch(() => []);
    if (summaries.length) {
      const snapshots = await Promise.all(summaries.map((item) => getOfflineBookSnapshot(item.bookId)));
      return { data: snapshots.filter((book): book is Book => Boolean(book)), mode: 'offline' };
    }
    throw toServiceError(error, 'Không thể tải danh sách truyện.');
  }
}

export async function getBookById(id?: string): Promise<ServiceResult<Book | null>> {
  if (!supabase) return { data: getDemoBook(id), mode: 'demo' };
  if (!id) return { data: null, mode: 'supabase' };
  try {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    let query = supabase.from('books').select('*').eq('visibility', 'public').neq('status', 'draft');
    query = uuid ? query.eq('id', id) : query.eq('slug', id);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return { data: null, mode: 'supabase' };
    return { data: (await hydrateBooks([data]))[0] ?? null, mode: 'supabase' };
  } catch (error) {
    const offline = id ? await getOfflineBookSnapshot(id).catch(() => null) : null;
    if (offline) return { data: offline, mode: 'offline' };
    throw toServiceError(error, 'Không thể tải truyện.');
  }
}

export async function getBooksByIds(ids: string[]): Promise<Book[]> {
  if (!ids.length) return [];
  if (!supabase) {
    const order = new Map(ids.map((id, index) => [id, index]));
    return demoBooks.filter((book) => order.has(book.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  try {
    const { data, error } = await supabase.from('books').select('*').in('id', ids);
    if (error) throw error;
    const hydrated = await hydrateBooks(data ?? []);
    const order = new Map(ids.map((id, index) => [id, index]));
    return hydrated.sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  } catch (error) {
    const offline = (await Promise.all(ids.map((id) => getOfflineBookSnapshot(id).catch(() => null))))
      .filter((book): book is Book => Boolean(book));
    if (offline.length) {
      const order = new Map(ids.map((id, index) => [id, index]));
      return offline.sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    }
    throw toServiceError(error, 'Không thể tải kết quả tìm kiếm.');
  }
}

export const getHomeBooks = getBooks;
export async function getMyBooks(authorId: string): Promise<Book[]> {
  if (!supabase) return demoBooks.filter((book) => book.authorId === authorId || book.author === authorId);
  const client = requireSupabase();
  try {
    const { data, error } = await client.from('books').select('*').eq('author_id', authorId).order('updated_at', { ascending: false });
    if (error) throw error;
    const { data: author, error: authorError } = await client.from('authors').select('*').eq('id', authorId).single();
    if (authorError) throw authorError;
    const ids = (data ?? []).map((book) => book.id);
    const { data: genres, error: genreError } = ids.length ? await client.from('book_genres').select('*').in('book_id', ids) : { data: [], error: null };
    if (genreError) throw genreError;
    const counts: Record<string, { published: number; draft: number }> = {};
    if (ids.length) for (let offset = 0; ; offset += 500) {
      const { data: chapters, error: chapterError } = await client.from('chapters').select('book_id,status').in('book_id', ids).order('id').range(offset, offset + 499);
      if (chapterError) throw chapterError;
      for (const chapter of chapters ?? []) {
        const count = counts[chapter.book_id] ??= { published: 0, draft: 0 };
        if (chapter.status === 'published') count.published++; else count.draft++;
      }
      if (!chapters || chapters.length < 500) break;
    }
    return (data ?? []).map((book) => ({ ...mapBook(book, author ?? undefined, genres?.filter((item) => item.book_id === book.id).map((item) => item.genre) ?? []), totalChapters: (counts[book.id]?.published ?? 0) + (counts[book.id]?.draft ?? 0), publishedChapters: counts[book.id]?.published ?? 0, draftChapters: counts[book.id]?.draft ?? 0 }));
  } catch (error) { throw toServiceError(error, 'Không thể tải truyện của bạn.'); }
}

const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function createBook(authorId: string, input: AuthorBookInput): Promise<Book> {
  const client = requireSupabase();
  try {
    const slug = `${slugify(input.title) || 'truyen'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const { data, error } = await client.from('books').insert({
      author_id: authorId, title: input.title.trim(), slug, description: input.description.trim(), cover_url: input.coverUrl,
      language: input.language, source_type: input.sourceType, status: 'draft', visibility: 'private', tags: input.tags, credited_author_name: input.creditedAuthorName?.trim() || null
    }).select('*').single();
    if (error) throw error;
    if (input.genre.trim()) {
      const { error: genreError } = await client.from('book_genres').insert({ book_id: data.id, genre: input.genre.trim() });
      if (genreError) { await client.from('books').delete().eq('id', data.id).eq('status', 'draft'); throw genreError; }
    }
    const author = await client.from('authors').select('*').eq('id', authorId).single();
    return mapBook(data, author.data ?? undefined, [input.genre.trim()]);
  } catch (error) { throw toServiceError(error, 'Không thể tạo truyện.'); }
}


export async function searchBooks(query: string): Promise<ServiceResult<Book[]>> {
  const result = await getBooks();
  const term = query.trim().toLocaleLowerCase('vi');
  return { ...result, data: result.data.filter((book) => `${book.title} ${book.author} ${book.description} ${book.tags.join(' ')}`.toLocaleLowerCase('vi').includes(term)) };
}
export async function getBooksByGenre(genre: string): Promise<ServiceResult<Book[]>> {
  const result = await getBooks();
  return { ...result, data: result.data.filter((book) => book.genre === genre) };
}
export async function getBooksByAuthor(authorId: string): Promise<ServiceResult<Book[]>> {
  const result = await getBooks();
  return { ...result, data: result.data.filter((book) => book.authorId === authorId || book.author === authorId) };
}
export const getLatestBooks = getBooks;
export async function getPopularBooks(): Promise<ServiceResult<Book[]>> {
  const result = await getBooks();
  return { ...result, data: [...result.data].sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0)) };
}
export async function updateBook(id: string, updates: Partial<Pick<BookRow, 'title' | 'description' | 'cover_url' | 'language' | 'source_type' | 'status' | 'visibility' | 'tags'>>) {
  const { data, error } = await requireSupabase().from('books').update(updates).eq('id', id).select('*').single();
  if (error) throw toServiceError(error, 'Không thể cập nhật truyện.');
  return (await hydrateBooks([data]))[0];
}
export async function setAuthorBookStatus(id: string, status: BookStatus) {
  const client = requireSupabase();
  try {
    if (status !== 'draft') {
      const { count, error: countError } = await client
        .from('chapters')
        .select('id', { count: 'exact', head: true })
        .eq('book_id', id)
        .eq('status', 'published');
      if (countError) throw countError;
      if (!count) throw new Error('Hãy xuất bản ít nhất một chương trước khi công khai truyện.');
    }

    const { data, error } = await client
      .from('books')
      .update({
        status,
        visibility: status === 'draft' ? 'private' : 'public',
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return (await hydrateBooks([data]))[0];
  } catch (error) {
    throw toServiceError(error, 'Không thể đổi trạng thái truyện.');
  }
}
export async function deleteDraftBook(id: string) {
  const client = requireSupabase();
  const { data, error } = await client.from('books').delete().eq('id', id).eq('status', 'draft').select('id,cover_url');
  if (error) throw toServiceError(error, 'Không thể xóa bản nháp.');
  if (!data?.length) throw new Error('Chỉ có thể xóa bản nháp của bạn.');
  const { data: auth } = await client.auth.getUser();
  if (auth.user && data[0].cover_url) await deleteOwnBookCover(auth.user.id, id, data[0].cover_url);
}
