import { books as demoBooks, getBook as getDemoBook } from '../data/books';
import { supabase } from '../lib/supabase';
import { Book, ServiceResult } from '../types';
import { Database } from '../types/database';
import { toServiceError } from './errors';

type BookRow = Database['public']['Tables']['books']['Row'];
type AuthorRow = Database['public']['Tables']['authors']['Row'];

const statusLabels: Record<BookRow['status'], string> = {
  draft: 'Bản nháp', ongoing: 'Đang ra', completed: 'Đã hoàn thành', paused: 'Tạm dừng'
};

const compactNumber = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1).replace('.', ',')}M` : value >= 1_000 ? `${Math.round(value / 1_000)}K` : String(value);

export function mapBook(row: BookRow, author?: AuthorRow, genres: string[] = []): Book {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    slug: row.slug,
    author: author?.pen_name ?? 'Tác giả CHƯƠNG',
    authorFollowers: compactNumber(author?.followers_count ?? 0),
    authorAvatarUrl: author?.avatar_url,
    cover: '#6D2E46',
    coverUrl: row.cover_url,
    genre: genres[0] ?? 'Khác',
    rating: Number(row.rating),
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
    const { data, error } = await supabase.from('books').select('*').eq('visibility', 'public').neq('status', 'draft').order('updated_at', { ascending: false });
    if (error) throw error;
    return { data: await hydrateBooks(data ?? []), mode: 'supabase' };
  } catch (error) { throw toServiceError(error, 'Không thể tải danh sách truyện.'); }
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
  } catch (error) { throw toServiceError(error, 'Không thể tải truyện.'); }
}
