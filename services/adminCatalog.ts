import { requireSupabase } from '../lib/supabase';
import { Book, BookStatus, Chapter, SourceType } from '../types';
import { Database } from '../types/database';
import { mapBook } from './books';
import { mapChapter } from './chapters';
import { toServiceError } from './errors';

type AuthorRow = Database['public']['Tables']['authors']['Row'];
type BookRow = Database['public']['Tables']['books']['Row'];

export type AdminAuthorOption = {
  id: string;
  userId: string;
  penName: string;
  verified: boolean;
};

export type AdminCatalogBookInput = {
  ownerAuthorId: string;
  title: string;
  creditedAuthorName?: string | null;
  description: string;
  genre: string;
  tags: string[];
  language: string;
  sourceType: SourceType;
};

export type AdminChapterImport = {
  chapterNumber: number;
  title: string;
  content: string;
};

export type AdminCatalogBookMetadataInput = {
  title: string;
  creditedAuthorName?: string | null;
  description: string;
  genre: string;
  tags: string[];
  language: string;
  sourceType: SourceType;
};


async function requireAdmin() {
  const client = requireSupabase();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Bạn cần đăng nhập quản trị.');
  const { data: profile, error } = await client.from('profiles').select('role').eq('id', auth.user.id).single();
  if (error) throw error;
  if (profile.role !== 'admin') throw new Error('Tài khoản này không có quyền quản trị.');
  return { client, user: auth.user };
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function hydrateAdminBooks(rows: BookRow[]): Promise<Book[]> {
  if (!rows.length) return [];
  const { client } = await requireAdmin();
  const authorIds = [...new Set(rows.map((row) => row.author_id))];
  const bookIds = rows.map((row) => row.id);
  const [{ data: authors, error: authorError }, { data: genres, error: genreError }] = await Promise.all([
    client.from('authors').select('*').in('id', authorIds),
    client.from('book_genres').select('*').in('book_id', bookIds),
  ]);
  if (authorError) throw authorError;
  if (genreError) throw genreError;
  return rows.map((row) =>
    mapBook(
      row,
      authors?.find((author) => author.id === row.author_id),
      genres?.filter((item) => item.book_id === row.id).map((item) => item.genre) ?? [],
    ),
  );
}

export async function listAdminAuthors(): Promise<AdminAuthorOption[]> {
  const { client } = await requireAdmin();
  const { data, error } = await client
    .from('authors')
    .select('id,user_id,pen_name,verified,moderation_state')
    .eq('moderation_state', 'approved')
    .order('verified', { ascending: false })
    .order('pen_name');
  if (error) throw toServiceError(error, 'Không thể tải danh sách tác giả.');
  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    penName: row.pen_name,
    verified: row.verified,
  }));
}

export async function listAdminCatalogBooks(): Promise<Book[]> {
  const { client } = await requireAdmin();
  const { data, error } = await client.from('books').select('*').order('updated_at', { ascending: false }).limit(500);
  if (error) throw toServiceError(error, 'Không thể tải kho truyện quản trị.');
  return hydrateAdminBooks(data ?? []);
}

export async function getAdminCatalogBook(bookId: string): Promise<Book | null> {
  const { client } = await requireAdmin();
  const { data, error } = await client.from('books').select('*').eq('id', bookId).maybeSingle();
  if (error) throw toServiceError(error, 'Không thể tải truyện.');
  if (!data) return null;
  return (await hydrateAdminBooks([data]))[0] ?? null;
}

export async function createAdminCatalogBook(input: AdminCatalogBookInput) {
  const { client } = await requireAdmin();
  if (input.title.trim().length < 2) throw new Error('Tên truyện cần có ít nhất 2 ký tự.');
  if (input.description.trim().length < 20) throw new Error('Mô tả cần có ít nhất 20 ký tự.');
  if (!input.genre.trim()) throw new Error('Vui lòng nhập thể loại.');
  if (input.creditedAuthorName && input.creditedAuthorName.trim().length < 2) throw new Error('Tên tác giả hiển thị cần có ít nhất 2 ký tự.');

  const slugBase = slugify(input.title) || 'truyen';
  const slug = `${slugBase}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const { data, error } = await client
    .from('books')
    .insert({
      author_id: input.ownerAuthorId,
      title: input.title.trim(),
      slug,
      description: input.description.trim(),
      credited_author_name: input.creditedAuthorName?.trim() || null,
      language: input.language.trim() || 'vi',
      source_type: input.sourceType,
      status: 'draft',
      visibility: 'private',
      tags: input.tags,
    })
    .select('*')
    .single();

  if (error) throw toServiceError(error, 'Không thể tạo truyện trong kho quản trị.');

  try {
    const { error: genreError } = await client.from('book_genres').insert({ book_id: data.id, genre: input.genre.trim() });
    if (genreError) throw genreError;
  } catch (cause) {
    await client.from('books').delete().eq('id', data.id).eq('status', 'draft');
    throw toServiceError(cause, 'Không thể lưu thể loại truyện.');
  }

  return data.id;
}

export async function updateAdminCatalogBookMetadata(bookId: string, input: AdminCatalogBookMetadataInput) {
  const { client } = await requireAdmin();
  if (input.title.trim().length < 2) throw new Error('Tên truyện cần có ít nhất 2 ký tự.');
  if (input.description.trim().length < 20) throw new Error('Mô tả cần có ít nhất 20 ký tự.');
  if (!input.genre.trim()) throw new Error('Vui lòng nhập thể loại.');

  const { error: bookError } = await client
    .from('books')
    .update({
      title: input.title.trim(),
      credited_author_name: input.creditedAuthorName?.trim() || null,
      description: input.description.trim(),
      tags: input.tags,
      language: input.language.trim() || 'vi',
      source_type: input.sourceType,
    })
    .eq('id', bookId);
  if (bookError) throw toServiceError(bookError, 'Không thể cập nhật thông tin truyện.');

  const { data: existingGenres, error: readGenreError } = await client
    .from('book_genres')
    .select('genre')
    .eq('book_id', bookId);
  if (readGenreError) throw toServiceError(readGenreError, 'Không thể tải thể loại hiện tại.');

  const { error: deleteGenreError } = await client.from('book_genres').delete().eq('book_id', bookId);
  if (deleteGenreError) throw toServiceError(deleteGenreError, 'Không thể cập nhật thể loại.');

  const { error: insertGenreError } = await client.from('book_genres').insert({ book_id: bookId, genre: input.genre.trim() });
  if (insertGenreError) {
    if (existingGenres?.length) {
      await client.from('book_genres').insert(existingGenres.map((item) => ({ book_id: bookId, genre: item.genre })));
    }
    throw toServiceError(insertGenreError, 'Không thể lưu thể loại mới.');
  }
}

export async function setAdminCatalogChapterStatus(bookId: string, chapterId: string, status: 'draft' | 'published') {
  const { client } = await requireAdmin();
  const { data: chapter, error: readError } = await client
    .from('chapters')
    .select('id,title,content')
    .eq('id', chapterId)
    .eq('book_id', bookId)
    .maybeSingle();
  if (readError) throw toServiceError(readError, 'Không thể tải chương.');
  if (!chapter) throw new Error('Không tìm thấy chương.');
  if (status === 'published' && String(chapter.content || '').trim().length < 50) {
    throw new Error('Chương cần ít nhất 50 ký tự trước khi xuất bản.');
  }

  const { error } = await client
    .from('chapters')
    .update({
      status,
      published_at: status === 'published' ? new Date().toISOString() : null,
    })
    .eq('id', chapterId)
    .eq('book_id', bookId);
  if (error) throw toServiceError(error, 'Không thể đổi trạng thái chương.');
}

export async function getAdminCatalogChapters(bookId: string): Promise<Chapter[]> {
  const { client } = await requireAdmin();
  const { data, error } = await client
    .from('chapters')
    .select('id,book_id,chapter_number,title,content,status,is_vip,price_coins,published_at,updated_at')
    .eq('book_id', bookId)
    .order('chapter_number');
  if (error) throw toServiceError(error, 'Không thể tải danh sách chương.');
  return (data ?? []).map(mapChapter);
}

export type AdminCatalogChapterInput = {
  id?: string;
  bookId: string;
  chapterNumber: number;
  title: string;
  content: string;
  status: 'draft' | 'published';
  isVip: boolean;
  priceCoins: number;
};

export async function getAdminCatalogChapter(bookId: string, chapterId: string): Promise<Chapter | null> {
  const { client } = await requireAdmin();
  const { data, error } = await client
    .from('chapters')
    .select('id,book_id,chapter_number,title,content,status,is_vip,price_coins,published_at,updated_at')
    .eq('book_id', bookId)
    .eq('id', chapterId)
    .maybeSingle();
  if (error) throw toServiceError(error, 'Không thể tải chương.');
  return data ? mapChapter(data) : null;
}

export async function saveAdminCatalogChapter(input: AdminCatalogChapterInput) {
  const { client } = await requireAdmin();
  if (!Number.isInteger(input.chapterNumber) || input.chapterNumber <= 0) throw new Error('Số chương phải lớn hơn 0.');
  if (input.title.trim().length < 2) throw new Error('Tiêu đề chương cần ít nhất 2 ký tự.');
  if (input.status === 'published' && input.content.trim().length < 50) throw new Error('Chương cần ít nhất 50 ký tự trước khi xuất bản.');
  if (input.isVip && (!Number.isInteger(input.priceCoins) || input.priceCoins <= 0)) throw new Error('Chương VIP cần giá Linh Thạch lớn hơn 0.');

  const duplicateQuery = client
    .from('chapters')
    .select('id')
    .eq('book_id', input.bookId)
    .eq('chapter_number', input.chapterNumber);
  if (input.id) duplicateQuery.neq('id', input.id);
  const { data: duplicates, error: duplicateError } = await duplicateQuery.limit(1);
  if (duplicateError) throw toServiceError(duplicateError, 'Không thể kiểm tra số chương.');
  if (duplicates?.length) throw new Error(`Truyện đã có Chương ${input.chapterNumber}.`);

  const payload = {
    book_id: input.bookId,
    chapter_number: input.chapterNumber,
    title: input.title.trim(),
    content: input.content.trim(),
    status: input.status,
    is_vip: input.isVip,
    price_coins: input.isVip ? input.priceCoins : 0,
    published_at: input.status === 'published' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await client
      .from('chapters')
      .update(payload)
      .eq('id', input.id)
      .eq('book_id', input.bookId)
      .select('id')
      .single();
    if (error) throw toServiceError(error, 'Không thể cập nhật chương.');
    return data.id;
  }

  const { data, error } = await client
    .from('chapters')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw toServiceError(error, 'Không thể tạo chương.');
  return data.id;
}

export async function deleteAdminDraftChapter(bookId: string, chapterId: string) {
  const { client } = await requireAdmin();
  const { data, error } = await client
    .from('chapters')
    .delete()
    .eq('book_id', bookId)
    .eq('id', chapterId)
    .eq('status', 'draft')
    .select('id');
  if (error) throw toServiceError(error, 'Không thể xóa chương nháp.');
  if (!data?.length) throw new Error('Chỉ có thể xóa chương đang ở trạng thái nháp.');
}

export async function importAdminCatalogChapters(
  bookId: string,
  chapters: AdminChapterImport[],
  publish = false,
) {
  const { client } = await requireAdmin();
  if (!chapters.length) throw new Error('Chưa có chương hợp lệ để nhập.');
  const seen = new Set<number>();
  for (const chapter of chapters) {
    if (!Number.isInteger(chapter.chapterNumber) || chapter.chapterNumber <= 0) throw new Error('Số chương phải lớn hơn 0.');
    if (seen.has(chapter.chapterNumber)) throw new Error(`Bị trùng Chương ${chapter.chapterNumber} trong nội dung nhập.`);
    seen.add(chapter.chapterNumber);
    if (chapter.title.trim().length < 2) throw new Error(`Chương ${chapter.chapterNumber} cần có tiêu đề.`);
    if (publish && chapter.content.trim().length < 50) throw new Error(`Chương ${chapter.chapterNumber} cần ít nhất 50 ký tự để xuất bản.`);
  }

  const { data: existing, error: existingError } = await client
    .from('chapters')
    .select('chapter_number')
    .eq('book_id', bookId)
    .in('chapter_number', [...seen]);
  if (existingError) throw existingError;
  if (existing?.length) throw new Error(`Kho truyện đã có Chương ${existing.map((row) => row.chapter_number).join(', ')}.`);

  const { data, error } = await client
    .from('chapters')
    .insert(
      chapters.map((chapter) => ({
        book_id: bookId,
        chapter_number: chapter.chapterNumber,
        title: chapter.title.trim(),
        content: chapter.content.trim(),
        status: publish ? 'published' : 'draft',
        published_at: publish ? new Date().toISOString() : null,
        is_vip: false,
        price_coins: 0,
      })),
    )
    .select('id,chapter_number');

  if (error) throw toServiceError(error, 'Không thể nhập chương hàng loạt.');
  return data ?? [];
}

export async function setAdminCatalogBookStatus(bookId: string, status: BookStatus) {
  const { client } = await requireAdmin();
  if (status !== 'draft') {
    const { count, error: countError } = await client
      .from('chapters')
      .select('id', { count: 'exact', head: true })
      .eq('book_id', bookId)
      .eq('status', 'published');
    if (countError) throw countError;
    if (!count) throw new Error('Cần ít nhất một chương đã xuất bản trước khi công khai truyện.');
  }
  const { error } = await client
    .from('books')
    .update({
      status,
      visibility: status === 'draft' ? 'private' : 'public',
    })
    .eq('id', bookId);
  if (error) throw toServiceError(error, 'Không thể đổi trạng thái truyện.');
}

export async function deleteAdminDraftBook(bookId: string) {
  const { client } = await requireAdmin();
  const { data, error } = await client.from('books').delete().eq('id', bookId).eq('status', 'draft').select('id');
  if (error) throw toServiceError(error, 'Không thể xóa truyện nháp.');
  if (!data?.length) throw new Error('Chỉ có thể xóa truyện đang ở trạng thái nháp.');
}
