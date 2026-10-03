import { books as demoBooks } from '../data/books';
import { supabase } from '../lib/supabase';
import { Book } from '../types';
import { getBooksByIds } from './books';
import { toServiceError } from './errors';

export type RecommendationReason =
  | 'followed_author'
  | 'favorite_genre'
  | 'familiar_author'
  | 'popular';

export type PersonalizedRecommendation = {
  book: Book;
  score: number;
  reasonType: RecommendationReason;
  reasonLabel: string;
  personalized: boolean;
};

function demoRecommendations(limit: number): PersonalizedRecommendation[] {
  return [...demoBooks]
    .sort((a, b) => {
      const byViews = (b.viewsCount ?? 0) - (a.viewsCount ?? 0);
      if (byViews) return byViews;
      return b.rating - a.rating;
    })
    .slice(0, limit)
    .map((book, index) => ({
      book,
      score: demoBooks.length - index,
      reasonType: 'popular' as const,
      reasonLabel: 'Nổi bật trên CHƯƠNG',
      personalized: false,
    }));
}

export async function getPersonalizedRecommendations(limit = 12): Promise<PersonalizedRecommendation[]> {
  const take = Math.max(1, Math.min(limit, 30));
  if (!supabase) return demoRecommendations(take);

  try {
    const { data, error } = await supabase.rpc('get_personalized_book_ids', {
      p_limit: take,
    });
    if (error) throw error;

    const rows = data ?? [];
    const books = await getBooksByIds(rows.map((row) => row.book_id));
    const bookMap = new Map(books.map((book) => [book.id, book]));

    return rows.flatMap((row) => {
      const book = bookMap.get(row.book_id);
      if (!book) return [];
      return [{
        book,
        score: Number(row.score ?? 0),
        reasonType: row.reason_type as RecommendationReason,
        reasonLabel: row.reason_label,
        personalized: Boolean(row.personalized),
      }];
    });
  } catch (error) {
    throw toServiceError(error, 'Không thể tải đề xuất dành cho bạn.');
  }
}

export async function hideRecommendation(bookId: string) {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('set_recommendation_hidden', {
      p_book_id: bookId,
      p_hidden: true,
    });
    if (error) throw error;
    return Boolean(data);
  } catch (error) {
    throw toServiceError(error, 'Không thể ẩn đề xuất này.');
  }
}

export function recommendationReasonText(item: PersonalizedRecommendation) {
  if (!item.personalized) return 'Đang nổi bật trên CHƯƠNG';
  if (item.reasonType === 'followed_author') return 'Tác giả bạn đang theo dõi · ' + item.reasonLabel;
  if (item.reasonType === 'favorite_genre') return 'Vì bạn hay đọc · ' + item.reasonLabel;
  if (item.reasonType === 'familiar_author') return 'Cùng tác giả bạn đã đọc · ' + item.reasonLabel;
  return 'Đang nổi bật trên CHƯƠNG';
}
