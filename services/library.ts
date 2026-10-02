import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Bookmark, LibraryEntry, LibraryStatus, ReadingProgress } from '../types';
import { toServiceError } from './errors';

const libraryKey = 'chuong:library';
const progressKey = 'chuong:reading-progress';
const bookmarkKey = 'chuong:bookmarks';
const followKey = 'chuong:follows';

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try { const value = await AsyncStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}
async function writeJson<T>(key: string, value: T) { await AsyncStorage.setItem(key, JSON.stringify(value)); }

export async function getLibrary(userId?: string): Promise<LibraryEntry[]> {
  if (!supabase || !userId) return readJson<LibraryEntry[]>(libraryKey, []);
  try {
    const { data, error } = await supabase.from('library').select('*').eq('user_id', userId).order('added_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({ userId: row.user_id, bookId: row.book_id, status: row.status, addedAt: row.added_at }));
  } catch (error) { throw toServiceError(error, 'Không thể tải tủ sách.'); }
}

export async function setLibraryStatus(bookId: string, status: LibraryStatus, userId?: string) {
  if (!supabase || !userId) {
    const entries = await getLibrary();
    const next = entries.some((entry) => entry.bookId === bookId)
      ? entries.map((entry) => entry.bookId === bookId ? { ...entry, status } : entry)
      : [{ bookId, status, addedAt: new Date().toISOString() }, ...entries];
    await writeJson(libraryKey, next);
    return;
  }
  const { error } = await supabase.from('library').upsert({ user_id: userId, book_id: bookId, status, added_at: new Date().toISOString() }, { onConflict: 'user_id,book_id' });
  if (error) throw toServiceError(error, 'Không thể cập nhật tủ sách.');
}

export async function removeFromLibrary(bookId: string, userId?: string) {
  if (!supabase || !userId) { await writeJson(libraryKey, (await getLibrary()).filter((entry) => entry.bookId !== bookId)); return; }
  const { error } = await supabase.from('library').delete().eq('user_id', userId).eq('book_id', bookId);
  if (error) throw toServiceError(error, 'Không thể xóa truyện khỏi tủ sách.');
}

export async function getReadingProgress(bookId: string, userId?: string): Promise<ReadingProgress | null> {
  if (!supabase || !userId) return (await readJson<Record<string, ReadingProgress>>(progressKey, {}))[bookId] ?? null;
  const { data, error } = await supabase.from('reading_progress').select('*').eq('user_id', userId).eq('book_id', bookId).maybeSingle();
  if (error) throw toServiceError(error, 'Không thể tải tiến độ đọc.');
  return data ? { userId: data.user_id, bookId: data.book_id, chapterId: data.chapter_id, chapterNumber: data.chapter_number, progressPercent: Number(data.progress_percent), scrollPosition: Number(data.scroll_position), updatedAt: data.updated_at } : null;
}

export async function saveReadingProgress(progress: Omit<ReadingProgress, 'updatedAt'>, userId?: string) {
  const updatedAt = new Date().toISOString();
  if (!supabase || !userId) {
    const all = await readJson<Record<string, ReadingProgress>>(progressKey, {});
    await writeJson(progressKey, { ...all, [progress.bookId]: { ...progress, updatedAt } });
    return;
  }
  const { error } = await supabase.from('reading_progress').upsert({ user_id: userId, book_id: progress.bookId, chapter_id: progress.chapterId ?? null, chapter_number: progress.chapterNumber, progress_percent: progress.progressPercent, scroll_position: progress.scrollPosition, updated_at: updatedAt }, { onConflict: 'user_id,book_id' });
  if (error) throw toServiceError(error, 'Không thể lưu tiến độ đọc.');
}

export async function getBookmarks(bookId: string, userId?: string): Promise<Bookmark[]> {
  if (!supabase || !userId) return (await readJson<Bookmark[]>(bookmarkKey, [])).filter((bookmark) => bookmark.bookId === bookId);
  const { data, error } = await supabase.from('bookmarks').select('*').eq('user_id', userId).eq('book_id', bookId).order('created_at', { ascending: false });
  if (error) throw toServiceError(error, 'Không thể tải dấu trang.');
  return (data ?? []).map((row) => ({ id: row.id, userId: row.user_id, bookId: row.book_id, chapterId: row.chapter_id, chapterNumber: row.chapter_number, position: Number(row.position), note: row.note, createdAt: row.created_at }));
}

export async function toggleBookmark(bookmark: Omit<Bookmark, 'id' | 'createdAt'>, userId?: string): Promise<boolean> {
  const existing = (await getBookmarks(bookmark.bookId, userId)).find((item) => item.chapterNumber === bookmark.chapterNumber);
  if (!supabase || !userId) {
    const all = await readJson<Bookmark[]>(bookmarkKey, []);
    const next = existing ? all.filter((item) => item.id !== existing.id) : [{ ...bookmark, id: `${Date.now()}`, createdAt: new Date().toISOString() }, ...all];
    await writeJson(bookmarkKey, next); return !existing;
  }
  const query = existing
    ? supabase.from('bookmarks').delete().eq('id', existing.id).eq('user_id', userId)
    : supabase.from('bookmarks').insert({ user_id: userId, book_id: bookmark.bookId, chapter_id: bookmark.chapterId ?? null, chapter_number: bookmark.chapterNumber, position: bookmark.position, note: bookmark.note ?? null });
  const { error } = await query;
  if (error) throw toServiceError(error, 'Không thể cập nhật dấu trang.');
  return !existing;
}

type FollowKind = 'author' | 'book';
export async function getFollowState(kind: FollowKind, targetId: string, userId?: string) {
  if (!supabase || !userId) return Boolean((await readJson<Record<string, boolean>>(followKey, {}))[`${kind}:${targetId}`]);
  const result = kind === 'author'
    ? await supabase.from('author_follows').select('user_id').eq('user_id', userId).eq('author_id', targetId).maybeSingle()
    : await supabase.from('book_follows').select('user_id').eq('user_id', userId).eq('book_id', targetId).maybeSingle();
  const { data, error } = result;
  if (error) throw toServiceError(error, 'Không thể tải trạng thái theo dõi.');
  return Boolean(data);
}

export async function setFollowState(kind: FollowKind, targetId: string, following: boolean, userId?: string) {
  if (!supabase || !userId) { const all = await readJson<Record<string, boolean>>(followKey, {}); await writeJson(followKey, { ...all, [`${kind}:${targetId}`]: following }); return; }
  const result = kind === 'author'
    ? following
      ? await supabase.from('author_follows').upsert({ user_id: userId, author_id: targetId }, { onConflict: 'user_id,author_id', ignoreDuplicates: true })
      : await supabase.from('author_follows').delete().eq('user_id', userId).eq('author_id', targetId)
    : following
      ? await supabase.from('book_follows').upsert({ user_id: userId, book_id: targetId }, { onConflict: 'user_id,book_id', ignoreDuplicates: true })
      : await supabase.from('book_follows').delete().eq('user_id', userId).eq('book_id', targetId);
  const { error } = result;
  if (error) throw toServiceError(error, 'Không thể cập nhật theo dõi.');
}

export const addToLibrary = setLibraryStatus;

export async function addBookmark(bookmark: Omit<Bookmark, 'id' | 'createdAt'>, userId?: string) {
  const existing = (await getBookmarks(bookmark.bookId, userId)).find((item) => item.chapterNumber === bookmark.chapterNumber);
  if (!existing) await toggleBookmark(bookmark, userId);
}
export async function removeBookmark(id: string, userId?: string) {
  if (!supabase || !userId) {
    await writeJson(bookmarkKey, (await readJson<Bookmark[]>(bookmarkKey, [])).filter((item) => item.id !== id));
    return;
  }
  const { error } = await supabase.from('bookmarks').delete().eq('id', id).eq('user_id', userId);
  if (error) throw toServiceError(error, 'Không thể xóa dấu trang.');
}

// Opt-in import: preserve every existing remote row and retain local data for retry.
// Demo identifiers are intentionally skipped because they are not backend foreign keys.
export async function mergeLocalLibrary(userId: string) {
  if (!supabase) return;
  const local = await getLibrary();
  const entries = local.filter((entry) => /^[0-9a-f-]{36}$/i.test(entry.bookId));
  if (!entries.length) return;
  const { error } = await supabase.from('library').upsert(entries.map((entry) => ({
    user_id: userId, book_id: entry.bookId, status: entry.status, added_at: entry.addedAt
  })), { onConflict: 'user_id,book_id', ignoreDuplicates: true });
  if (error) throw toServiceError(error, 'Không thể nhập tủ sách cục bộ.');
}
