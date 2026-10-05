import { requireSupabase, supabase } from '../lib/supabase';
import { Author, Book, Chapter, ChapterInput } from '../types';
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

/** Check the requested book directly; do not scan every book and chapter owned by an author. */
export async function getOwnedAuthorBook(userId: string, bookId: string): Promise<Book | null> {
  const author = await getAuthorForUser(userId);
  if (!author) return null;
  const { data, error } = await requireSupabase().from('books').select('*').eq('id', bookId).eq('author_id', author.id).maybeSingle();
  if (error) throw toServiceError(error, 'Không thể tải truyện của bạn.');
  return data ? { ...mapBook(data), author: author.penName, authorUserId: userId } : null;
}

export async function getAuthorChapters(bookId: string): Promise<Chapter[]> {
  const client = requireSupabase();
  const data: Pick<Database['public']['Tables']['chapters']['Row'], 'id' | 'book_id' | 'chapter_number' | 'title' | 'status' | 'is_vip' | 'price_coins' | 'early_access_until' | 'scheduled_publish_at' | 'published_at' | 'updated_at'>[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data: page, error } = await client
      .from('chapters')
      .select('id,book_id,chapter_number,title,status,is_vip,price_coins,early_access_until,scheduled_publish_at,published_at,updated_at')
      .eq('book_id', bookId)
      .order('chapter_number')
      .range(offset, offset + 499);
    if (error) throw toServiceError(error, 'Không thể tải bản thảo.');
    data.push(...(page ?? []));
    if (!page || page.length < 500) break;
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    bookId: row.book_id,
    number: row.chapter_number,
    title: row.title,
    date: row.published_at ?? row.updated_at,
    relativeDate: row.status === 'published' ? 'Đã xuất bản' : 'Bản nháp',
    access: row.is_vip ? 'vip' : 'free',
    configuredVip: row.is_vip,
    priceCoins: row.price_coins,
    earlyAccessUntil: row.early_access_until,
    scheduledPublishAt: row.scheduled_publish_at,
    status: row.status,
    publishedAt: row.published_at,
    isRead: false,
    isDownloaded: false,
  }));
}

export async function getAuthorChapter(bookId: string, chapterId: string): Promise<Chapter | null> {
  if (chapterId === 'new') return null;
  const client = requireSupabase();
  const [{ data, error }, { data: accessMeta, error: accessError }] = await Promise.all([
    client.rpc('get_author_chapter_for_editing', {
      p_book_id: bookId,
      p_chapter_id: chapterId,
    }),
    client
      .from('chapters')
      .select('is_vip,price_coins,early_access_until,scheduled_publish_at')
      .eq('book_id', bookId)
      .eq('id', chapterId)
      .maybeSingle(),
  ]);
  if (error) throw toServiceError(error, 'Không thể tải nội dung bản thảo.');
  if (accessError) throw toServiceError(accessError, 'Không thể tải cấu hình quyền đọc.');
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id,
    bookId: row.book_id,
    number: row.chapter_number,
    title: row.title,
    content: row.content,
    date: row.published_at ?? row.updated_at,
    relativeDate: row.status === 'published' ? 'Đã xuất bản' : 'Bản nháp',
    access: (accessMeta?.is_vip ?? row.is_vip) ? 'vip' : 'free',
    configuredVip: accessMeta?.is_vip ?? row.is_vip,
    priceCoins: accessMeta?.price_coins ?? row.price_coins,
    earlyAccessUntil: accessMeta?.early_access_until ?? null,
    scheduledPublishAt: accessMeta?.scheduled_publish_at ?? null,
    status: row.status,
    publishedAt: row.published_at,
    isRead: false,
    isDownloaded: false,
  };
}

export async function saveChapter(input: ChapterInput): Promise<string> {
  const client = requireSupabase();
  if (input.status === 'published' && (input.title.trim().length < 2 || input.content.trim().length < 50)) throw new Error('Chương cần có tiêu đề và ít nhất 50 ký tự trước khi xuất bản.');
  if (input.isVip && (!Number.isInteger(input.priceCoins) || input.priceCoins <= 0)) throw new Error('Chương VIP/Tiên Cơ cần giá Hạ Phẩm Linh Thạch lớn hơn 0.');
  if (input.earlyAccessUntil && !input.isVip) throw new Error('Tiên Cơ chỉ dùng cho chương có mở khóa bằng Hạ Phẩm Linh Thạch.');
  if (input.earlyAccessUntil && Number.isNaN(Date.parse(input.earlyAccessUntil))) throw new Error('Thời điểm kết thúc Tiên Cơ không hợp lệ.');
  const payload = {
    book_id: input.bookId,
    chapter_number: input.chapterNumber,
    title: input.title.trim(),
    content: input.content,
    status: input.status,
    is_vip: input.isVip,
    price_coins: input.isVip ? input.priceCoins : 0,
    early_access_until: input.isVip ? input.earlyAccessUntil ?? null : null,
    updated_at: new Date().toISOString(),
  };
  try {
    if (input.id) {
      const { data, error } = await client.from('chapters').update(payload).eq('id', input.id).eq('book_id', input.bookId).select('id').single();
      if (error) throw error;
      return data.id;
    }
    const { data, error } = await client.from('chapters').insert(payload).select('id').single();
    if (error) throw error;
    return data.id;
  } catch (error) { throw toServiceError(error, 'Không thể lưu chương.'); }
}
