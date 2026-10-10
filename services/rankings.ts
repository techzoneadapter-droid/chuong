import { Database } from '../types/database';
import { books as demoBooks } from '../data/books';
import { supabase } from '../lib/supabase';
import { Book } from '../types';
import { getBooksByIds } from './books';
import { toServiceError } from './errors';

export type PublicRankingKind = 'trending' | 'hot' | 'new' | 'top' | 'updated';

export type RankedBook = {
  book: Book;
  rank: number;
  score: number;
  uniqueReaders7d: number;
  sessions7d: number;
  returningReaders7d: number;
  completions7d: number;
  activeSeconds7d: number;
  recentFollows7d: number;
  viewsCount: number;
  followersCount: number;
  rating: number;
  ratingCount: number;
  releasedAt: string | null;
  lastChapterAt: string | null;
};

function demoRankings(kind: PublicRankingKind, limit: number): RankedBook[] {
  const rows = [...demoBooks];
  if (kind === 'top' || kind === 'hot' || kind === 'trending') {
    rows.sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0) || (b.followersCount ?? 0) - (a.followersCount ?? 0) || b.rating - a.rating);
  } else if (kind === 'new' || kind === 'updated') {
    rows.sort((a, b) => (b.latestChapter ?? 0) - (a.latestChapter ?? 0));
  }

  return rows.slice(0, limit).map((book, index) => ({
    book,
    rank: index + 1,
    score: Math.max(0, (book.viewsCount ?? 0) + (book.followersCount ?? 0) * 2 + book.rating),
    uniqueReaders7d: 0,
    sessions7d: 0,
    returningReaders7d: 0,
    completions7d: 0,
    activeSeconds7d: 0,
    recentFollows7d: 0,
    viewsCount: book.viewsCount ?? 0,
    followersCount: book.followersCount ?? 0,
    rating: book.rating,
    ratingCount: book.ratingCount ?? 0,
    releasedAt: null,
    lastChapterAt: null,
  }));
}

type RankingRows = Database['public']['Functions']['get_public_book_rankings']['Returns'];

async function fetchRankingRows(kind: PublicRankingKind, take: number): Promise<RankingRows> {
  const { data, error } = await supabase!.rpc('get_public_book_rankings', { p_kind: kind, p_limit: take });
  if (error) throw error;
  return data ?? [];
}

function hydrateRankingRows(rows: RankingRows, books: Book[]): RankedBook[] {
  const byId = new Map(books.map((book) => [book.id, book]));
  return rows.flatMap((row) => {
    const book = byId.get(row.book_id);
    if (!book) return [];
    return [{
      book,
      rank: Number(row.rank_no ?? 0),
      score: Number(row.score ?? 0),
      uniqueReaders7d: Number(row.unique_readers_7d ?? 0),
      sessions7d: Number(row.sessions_7d ?? 0),
      returningReaders7d: Number(row.returning_readers_7d ?? 0),
      completions7d: Number(row.completions_7d ?? 0),
      activeSeconds7d: Number(row.active_seconds_7d ?? 0),
      recentFollows7d: Number(row.recent_follows_7d ?? 0),
      viewsCount: Number(row.views_count ?? 0),
      followersCount: Number(row.followers_count ?? 0),
      rating: Number(row.rating ?? 0),
      ratingCount: Number(row.rating_count ?? 0),
      releasedAt: row.released_at ?? null,
      lastChapterAt: row.last_chapter_at ?? null,
    }];
  });
}

export async function getPublicBookRankings(kind: PublicRankingKind, limit = 12): Promise<RankedBook[]> {
  const take = Math.max(1, Math.min(limit, 50));
  if (!supabase) return demoRankings(kind, take);

  try {
    const rows = await fetchRankingRows(kind, take);
    return hydrateRankingRows(rows, await getBooksByIds(rows.map((row) => row.book_id)));
  } catch (error) {
    throw toServiceError(error, 'Không thể tải bảng xếp hạng truyện.');
  }
}

export async function getHomeRankingGroups(limit = 8) {
  const take = Math.max(1, Math.min(limit, 50));
  if (!supabase) return {
    trending: demoRankings('trending', take), hot: demoRankings('hot', take),
    newest: demoRankings('new', take), top: demoRankings('top', take),
  };
  try {
    const rows = await Promise.all((['trending', 'hot', 'new', 'top'] as const)
      .map((kind) => fetchRankingRows(kind, take)));
    const ids = [...new Set(rows.flatMap((group) => group.map((row) => row.book_id)))];
    const books = await getBooksByIds(ids);
    const [trending, hot, newest, top] = rows.map((group) => hydrateRankingRows(group, books));
    return { trending, hot, newest, top };
  } catch (error) {
    throw toServiceError(error, 'Không thể tải bảng xếp hạng truyện.');
  }
}

export function rankingReason(kind: PublicRankingKind, item: RankedBook) {
  if (kind === 'trending') {
    return item.uniqueReaders7d + ' độc giả · ' + item.sessions7d + ' phiên đọc trong 7 ngày';
  }
  if (kind === 'hot') {
    return 'Tăng tốc 48 giờ · dữ liệu đọc và theo dõi thực tế';
  }
  if (kind === 'new') {
    return item.releasedAt ? 'Ra mắt ' + new Date(item.releasedAt).toLocaleDateString('vi-VN') : 'Truyện mới ra';
  }
  if (kind === 'updated') {
    return item.lastChapterAt ? 'Cập nhật ' + new Date(item.lastChapterAt).toLocaleDateString('vi-VN') : 'Mới cập nhật';
  }
  return item.viewsCount + ' lượt đọc · ' + item.followersCount + ' theo dõi';
}
