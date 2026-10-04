import AsyncStorage from '@react-native-async-storage/async-storage';
import { books as demoBooks } from '../data/books';
import { supabase } from '../lib/supabase';
import { Book } from '../types';
import { getBooksByIds } from './books';
import { toServiceError } from './errors';
import { getPublicBookRankings, PublicRankingKind } from './rankings';

export type DiscoverySort = 'relevance' | 'popular' | 'newest' | 'rating' | 'trending' | 'hot' | 'new' | 'top' | 'updated';
export type DiscoveryAccess = 'all' | 'free' | 'vip';
export type DiscoveryStatus = 'all' | 'ongoing' | 'completed' | 'paused';

export type DiscoveryQuery = {
  query?: string;
  genre?: string | null;
  access?: DiscoveryAccess;
  status?: DiscoveryStatus;
  sort?: DiscoverySort;
  limit?: number;
  offset?: number;
};

export type DiscoveryResult = {
  books: Book[];
  total: number;
  mode: 'supabase' | 'demo';
};

export type GenreCount = {
  genre: string;
  count: number;
};

const HISTORY_KEY = 'chuong:search-history:v1';

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function demoSearch(input: DiscoveryQuery): DiscoveryResult {
  const q = normalize(input.query || '');
  let rows = [...demoBooks];

  if (q) {
    rows = rows.filter((book) => normalize([
      book.title,
      book.author,
      book.description,
      book.genre,
      ...book.tags,
    ].join(' ')).includes(q));
  }

  if (input.genre) rows = rows.filter((book) => normalize(book.genre) === normalize(input.genre || ''));
  if (input.access === 'vip') rows = rows.filter((book) => book.isVip);
  if (input.access === 'free') rows = rows.filter((book) => !book.isVip);

  if (input.sort === 'rating') rows.sort((a, b) => b.rating - a.rating);
  else if (input.sort === 'popular') rows.sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0));
  else if (input.sort === 'newest') rows.sort((a, b) => (b.latestChapter ?? 0) - (a.latestChapter ?? 0));

  const total = rows.length;
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.max(1, Math.min(input.limit ?? 30, 60));

  return { books: rows.slice(offset, offset + limit), total, mode: 'demo' };
}

export async function searchDiscovery(input: DiscoveryQuery = {}): Promise<DiscoveryResult> {
  if (!supabase) return demoSearch(input);

  try {
    const requestedSort = input.sort ?? ((input.query?.trim() || '') ? 'relevance' : 'trending');
    const rankingKinds = new Set<DiscoverySort>(['trending','hot','new','top','updated']);
    const hasFilters = Boolean(input.query?.trim() || input.genre?.trim() || (input.access && input.access !== 'all') || (input.status && input.status !== 'all'));

    if (!hasFilters && rankingKinds.has(requestedSort)) {
      const ranked = await getPublicBookRankings(requestedSort as PublicRankingKind, Math.max(1, Math.min(input.limit ?? 30, 50)));
      const offset = Math.max(0, input.offset ?? 0);
      return {
        books: ranked.slice(offset).map((item) => item.book),
        total: ranked.length,
        mode: 'supabase',
      };
    }
    const args: {
      p_query?: string;
      p_genre?: string;
      p_access?: string;
      p_status?: string;
      p_sort?: string;
      p_limit?: number;
      p_offset?: number;
    } = {
      p_query: input.query?.trim() || '',
      p_access: input.access ?? 'all',
      p_status: input.status ?? 'all',
      p_sort: requestedSort === 'new' || requestedSort === 'updated' ? 'newest'
        : requestedSort === 'trending' || requestedSort === 'hot' || requestedSort === 'top' ? 'popular'
        : requestedSort,
      p_limit: Math.max(1, Math.min(input.limit ?? 30, 60)),
      p_offset: Math.max(0, input.offset ?? 0),
    };

    if (input.genre?.trim()) args.p_genre = input.genre.trim();

    const { data, error } = await supabase.rpc('search_public_book_ids', args);
    if (error) throw error;

    const rows = data ?? [];
    const ids = rows.map((row) => row.book_id);
    const books = await getBooksByIds(ids);

    return {
      books,
      total: Number(rows[0]?.total_count ?? 0),
      mode: 'supabase',
    };
  } catch (error) {
    throw toServiceError(error, 'Không thể tìm kiếm truyện.');
  }
}

export async function getDiscoveryGenres(limit = 30): Promise<GenreCount[]> {
  if (!supabase) {
    const counts = new Map<string, number>();
    for (const book of demoBooks) counts.set(book.genre, (counts.get(book.genre) ?? 0) + 1);
    return [...counts.entries()]
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre, 'vi'))
      .slice(0, limit);
  }

  try {
    const { data, error } = await supabase.rpc('get_public_genre_counts', {
      p_limit: Math.max(1, Math.min(limit, 100)),
    });
    if (error) throw error;
    return (data ?? []).map((row) => ({ genre: row.genre, count: Number(row.book_count) }));
  } catch (error) {
    throw toServiceError(error, 'Không thể tải thể loại.');
  }
}

export async function getSearchHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string').slice(0, 8);
  } catch {
    return [];
  }
}

export async function addSearchHistory(term: string): Promise<string[]> {
  const clean = term.trim().replace(/\s+/g, ' ');
  if (clean.length < 2) return getSearchHistory();

  const current = await getSearchHistory();
  const normalized = normalize(clean);
  const next = [clean, ...current.filter((item) => normalize(item) !== normalized)].slice(0, 8);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => undefined);
  return next;
}

export async function removeSearchHistory(term: string): Promise<string[]> {
  const normalized = normalize(term);
  const next = (await getSearchHistory()).filter((item) => normalize(item) !== normalized);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => undefined);
  return next;
}

export async function clearSearchHistory() {
  await AsyncStorage.removeItem(HISTORY_KEY).catch(() => undefined);
}
