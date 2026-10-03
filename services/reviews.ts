import { requireSupabase, supabase } from '../lib/supabase';
import { Database } from '../types/database';
import { toServiceError } from './errors';

type ReviewRow = Database['public']['Tables']['book_reviews']['Row'];
type BookRow = Database['public']['Tables']['books']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export type ReviewSort = 'helpful' | 'recent' | 'high' | 'low';

export type BookReviewItem = {
  id: string;
  bookId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  rating: number;
  reviewText: string;
  spoiler: boolean;
  helpfulCount: number;
  helpful: boolean;
  moderationState: 'approved' | 'hidden' | 'rejected';
  createdAt: string;
  updatedAt: string;
};

export type BookReviewSummary = {
  averageRating: number;
  ratingCount: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  myReview: {
    id: string;
    rating: number;
    reviewText: string;
    spoiler: boolean;
  } | null;
};

export type AuthorReviewBook = {
  id: string;
  title: string;
  rating: number;
  ratingCount: number;
};

export type AuthorReviewDashboard = {
  books: AuthorReviewBook[];
  reviews: Array<BookReviewItem & { bookTitle: string }>;
  totalRatings: number;
  weightedAverage: number;
};

function mapReview(row: ReviewRow, profile: ProfileRow | undefined, helpful: boolean): BookReviewItem {
  return {
    id: row.id,
    bookId: row.book_id,
    userId: row.user_id,
    userName: profile?.display_name || profile?.username || 'Độc giả CHƯƠNG',
    avatarUrl: profile?.avatar_url ?? null,
    rating: Number(row.rating),
    reviewText: row.review_text,
    spoiler: row.spoiler,
    helpfulCount: Number(row.helpful_count),
    helpful,
    moderationState: row.moderation_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function hydrateReviews(rows: ReviewRow[], userId?: string) {
  if (!rows.length || !supabase) return rows.map((row) => mapReview(row, undefined, false));
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const reviewIds = rows.map((row) => row.id);

  const [{ data: profiles, error: profileError }, helpfulResult] = await Promise.all([
    supabase.from('profiles').select('id,username,display_name,avatar_url,bio,role,created_at,updated_at').in('id', userIds),
    userId && reviewIds.length
      ? supabase.from('book_review_helpful').select('review_id').eq('user_id', userId).in('review_id', reviewIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profileError) throw profileError;
  if (helpfulResult.error) throw helpfulResult.error;

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile as ProfileRow]));
  const helpfulSet = new Set((helpfulResult.data ?? []).map((item) => item.review_id));

  return rows.map((row) => mapReview(row, profileMap.get(row.user_id), helpfulSet.has(row.id)));
}

export async function getBookReviewSummary(bookId: string): Promise<BookReviewSummary> {
  if (!supabase) {
    return {
      averageRating: 0,
      ratingCount: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      myReview: null,
    };
  }

  const { data, error } = await supabase.rpc('get_book_review_summary', { p_book_id: bookId });
  if (error) throw toServiceError(error, 'Không thể tải tổng hợp đánh giá.');

  const row = data?.[0];
  return {
    averageRating: Number(row?.average_rating ?? 0),
    ratingCount: Number(row?.rating_count ?? 0),
    distribution: {
      1: Number(row?.star_1 ?? 0),
      2: Number(row?.star_2 ?? 0),
      3: Number(row?.star_3 ?? 0),
      4: Number(row?.star_4 ?? 0),
      5: Number(row?.star_5 ?? 0),
    },
    myReview: row?.my_review_id
      ? {
          id: row.my_review_id,
          rating: Number(row.my_rating),
          reviewText: row.my_review_text ?? '',
          spoiler: Boolean(row.my_spoiler),
        }
      : null,
  };
}

export async function getBookReviews(bookId: string, sort: ReviewSort = 'helpful', userId?: string) {
  if (!supabase) return [] as BookReviewItem[];

  let query = supabase
    .from('book_reviews')
    .select('*')
    .eq('book_id', bookId)
    .limit(100);

  if (sort === 'helpful') query = query.order('helpful_count', { ascending: false }).order('created_at', { ascending: false });
  if (sort === 'recent') query = query.order('created_at', { ascending: false });
  if (sort === 'high') query = query.order('rating', { ascending: false }).order('helpful_count', { ascending: false });
  if (sort === 'low') query = query.order('rating', { ascending: true }).order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw toServiceError(error, 'Không thể tải đánh giá.');

  try {
    return await hydrateReviews(data ?? [], userId);
  } catch (error) {
    throw toServiceError(error, 'Không thể tải thông tin người đánh giá.');
  }
}

export async function saveBookReview(input: {
  userId: string;
  bookId: string;
  rating: number;
  reviewText: string;
  spoiler: boolean;
}) {
  const rating = Math.round(input.rating);
  if (rating < 1 || rating > 5) throw new Error('Vui lòng chọn từ 1 đến 5 sao.');

  const reviewText = input.reviewText.trim();
  if (reviewText.length > 4000) throw new Error('Nội dung đánh giá tối đa 4.000 ký tự.');

  const client = requireSupabase();
  const { data, error } = await client
    .from('book_reviews')
    .upsert({
      user_id: input.userId,
      book_id: input.bookId,
      rating,
      review_text: reviewText,
      spoiler: input.spoiler,
    }, { onConflict: 'user_id,book_id' })
    .select('*')
    .single();

  if (error) {
    if (error.message?.includes('REVIEW_RATE_LIMIT')) throw new Error('Bạn đang gửi đánh giá quá nhanh. Hãy thử lại sau.');
    if (error.message?.includes('REVIEW_EDIT_COOLDOWN')) throw new Error('Hãy đợi vài giây trước khi sửa đánh giá tiếp.');
    if (error.message?.includes('Authors cannot rate')) throw new Error('Tác giả không thể tự đánh giá truyện của mình.');
    throw toServiceError(error, 'Không thể lưu đánh giá.');
  }
  return data;
}

export async function deleteBookReview(reviewId: string, userId: string) {
  const { error } = await requireSupabase()
    .from('book_reviews')
    .delete()
    .eq('id', reviewId)
    .eq('user_id', userId);
  if (error) throw toServiceError(error, 'Không thể xóa đánh giá.');
}

export async function setReviewHelpful(reviewId: string, userId: string, helpful: boolean) {
  const client = requireSupabase();
  if (helpful) {
    const { error } = await client
      .from('book_review_helpful')
      .upsert({ review_id: reviewId, user_id: userId }, { onConflict: 'review_id,user_id', ignoreDuplicates: true });
    if (error) throw toServiceError(error, 'Không thể đánh dấu hữu ích.');
    return;
  }

  const { error } = await client
    .from('book_review_helpful')
    .delete()
    .eq('review_id', reviewId)
    .eq('user_id', userId);
  if (error) throw toServiceError(error, 'Không thể bỏ đánh dấu hữu ích.');
}

export async function getAuthorReviewDashboard(authorId: string, userId?: string): Promise<AuthorReviewDashboard> {
  const client = requireSupabase();
  const { data: books, error: bookError } = await client
    .from('books')
    .select('id,title,rating,rating_count')
    .eq('author_id', authorId)
    .order('updated_at', { ascending: false });

  if (bookError) throw toServiceError(bookError, 'Không thể tải thống kê đánh giá.');

  const bookRows = (books ?? []) as Pick<BookRow, 'id' | 'title' | 'rating' | 'rating_count'>[];
  const ids = bookRows.map((book) => book.id);
  const mappedBooks: AuthorReviewBook[] = bookRows.map((book) => ({
    id: book.id,
    title: book.title,
    rating: Number(book.rating),
    ratingCount: Number(book.rating_count ?? 0),
  }));

  const totalRatings = mappedBooks.reduce((sum, book) => sum + book.ratingCount, 0);
  const weightedAverage = totalRatings
    ? mappedBooks.reduce((sum, book) => sum + book.rating * book.ratingCount, 0) / totalRatings
    : 0;

  if (!ids.length) return { books: mappedBooks, reviews: [], totalRatings, weightedAverage };

  const { data: reviews, error: reviewError } = await client
    .from('book_reviews')
    .select('*')
    .in('book_id', ids)
    .order('created_at', { ascending: false })
    .limit(100);

  if (reviewError) throw toServiceError(reviewError, 'Không thể tải đánh giá gần đây.');

  const hydrated = await hydrateReviews(reviews ?? [], userId);
  const titleMap = new Map(mappedBooks.map((book) => [book.id, book.title]));

  return {
    books: mappedBooks,
    reviews: hydrated.map((review) => ({ ...review, bookTitle: titleMap.get(review.bookId) ?? 'Truyện CHƯƠNG' })),
    totalRatings,
    weightedAverage,
  };
}
