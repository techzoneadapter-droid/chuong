import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Bookmark, LibraryEntry, LibraryStatus, ReadingProgress } from '../types';
import { isInternetReachable } from './connectivity';
import { toServiceError } from './errors';
import {
  enqueueOfflineSync,
  makeBookmarkDeleteIdOperation,
  makeBookmarkOperation,
  makeLibraryRemoveOperation,
  makeLibrarySetOperation,
  makeProgressOperation,
} from './offlineSync';

const libraryKey = 'chuong:library';
const progressKey = 'chuong:reading-progress';
const bookmarkKey = 'chuong:bookmarks';
const followKey = 'chuong:follows';

function scopedKey(base: string, userId?: string) {
  return userId ? `${base}:${userId}` : base;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(key: string, value: T) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

async function readLibraryCache(userId?: string) {
  return readJson<LibraryEntry[]>(scopedKey(libraryKey, userId), []);
}

async function writeLibraryCache(entries: LibraryEntry[], userId?: string) {
  await writeJson(scopedKey(libraryKey, userId), entries);
}

async function readProgressCache(userId?: string) {
  return readJson<Record<string, ReadingProgress>>(scopedKey(progressKey, userId), {});
}

async function writeProgressCache(progress: Record<string, ReadingProgress>, userId?: string) {
  await writeJson(scopedKey(progressKey, userId), progress);
}

async function readBookmarkCache(userId?: string) {
  return readJson<Bookmark[]>(scopedKey(bookmarkKey, userId), []);
}

async function writeBookmarkCache(bookmarks: Bookmark[], userId?: string) {
  await writeJson(scopedKey(bookmarkKey, userId), bookmarks);
}

export async function getLibrary(userId?: string): Promise<LibraryEntry[]> {
  const cached = await readLibraryCache(userId);
  if (!supabase || !userId) return cached;
  if (!(await isInternetReachable())) return cached;

  try {
    const { data, error } = await supabase
      .from('library')
      .select('*')
      .eq('user_id', userId)
      .order('added_at', { ascending: false });
    if (error) throw error;

    const mapped = (data ?? []).map((row) => ({
      userId: row.user_id,
      bookId: row.book_id,
      status: row.status,
      addedAt: row.added_at,
    }));
    await writeLibraryCache(mapped, userId);
    return mapped;
  } catch (error) {
    if (cached.length) return cached;
    throw toServiceError(error, 'Không thể tải tủ sách.');
  }
}

export async function setLibraryStatus(bookId: string, status: LibraryStatus, userId?: string) {
  const addedAt = new Date().toISOString();
  const entries = await readLibraryCache(userId);
  const next = entries.some((entry) => entry.bookId === bookId)
    ? entries.map((entry) => entry.bookId === bookId ? { ...entry, status } : entry)
    : [{ userId, bookId, status, addedAt }, ...entries];
  await writeLibraryCache(next, userId);

  if (!supabase || !userId) return;

  if (!(await isInternetReachable())) {
    await enqueueOfflineSync(makeLibrarySetOperation(userId, bookId, status, addedAt));
    return;
  }

  const { error } = await supabase.from('library').upsert({
    user_id: userId,
    book_id: bookId,
    status,
    added_at: addedAt,
  }, { onConflict: 'user_id,book_id' });

  if (error) {
    await enqueueOfflineSync(makeLibrarySetOperation(userId, bookId, status, addedAt));
    if (await isInternetReachable()) throw toServiceError(error, 'Không thể cập nhật tủ sách.');
  }
}

export async function removeFromLibrary(bookId: string, userId?: string) {
  const entries = await readLibraryCache(userId);
  await writeLibraryCache(entries.filter((entry) => entry.bookId !== bookId), userId);

  if (!supabase || !userId) return;

  if (!(await isInternetReachable())) {
    await enqueueOfflineSync(makeLibraryRemoveOperation(userId, bookId));
    return;
  }

  const { error } = await supabase
    .from('library')
    .delete()
    .eq('user_id', userId)
    .eq('book_id', bookId);

  if (error) {
    await enqueueOfflineSync(makeLibraryRemoveOperation(userId, bookId));
    if (await isInternetReachable()) throw toServiceError(error, 'Không thể xóa truyện khỏi tủ sách.');
  }
}

function mapProgressRow(data: {
  user_id: string;
  book_id: string;
  chapter_id: string | null;
  chapter_number: number;
  progress_percent: number;
  scroll_position: number;
  updated_at: string;
}): ReadingProgress {
  return {
    userId: data.user_id,
    bookId: data.book_id,
    chapterId: data.chapter_id,
    chapterNumber: data.chapter_number,
    progressPercent: Number(data.progress_percent),
    scrollPosition: Number(data.scroll_position),
    updatedAt: data.updated_at,
  };
}

export async function getReadingProgress(bookId: string, userId?: string): Promise<ReadingProgress | null> {
  const cache = await readProgressCache(userId);
  if (!supabase || !userId) return cache[bookId] ?? null;
  if (!(await isInternetReachable())) return cache[bookId] ?? null;

  try {
    const { data, error } = await supabase
      .from('reading_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .maybeSingle();
    if (error) throw error;

    if (!data) return cache[bookId] ?? null;
    const mapped = mapProgressRow(data);
    await writeProgressCache({ ...cache, [bookId]: mapped }, userId);
    return mapped;
  } catch (error) {
    if (cache[bookId]) return cache[bookId];
    throw toServiceError(error, 'Không thể tải tiến độ đọc.');
  }
}

export async function getLatestReadingProgress(userId?: string): Promise<ReadingProgress | null> {
  const cache = await readProgressCache(userId);
  const cachedLatest = Object.values(cache)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;

  if (!supabase || !userId) return cachedLatest;
  if (!(await isInternetReachable())) return cachedLatest;

  try {
    const { data, error } = await supabase
      .from('reading_progress')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    if (!data) return cachedLatest;
    const mapped = mapProgressRow(data);
    await writeProgressCache({ ...cache, [mapped.bookId]: mapped }, userId);
    return mapped;
  } catch (error) {
    if (cachedLatest) return cachedLatest;
    throw toServiceError(error, 'Không thể tải truyện đang đọc gần nhất.');
  }
}

export async function saveReadingProgress(progress: Omit<ReadingProgress, 'updatedAt'>, userId?: string) {
  const updatedAt = new Date().toISOString();
  const cache = await readProgressCache(userId);
  await writeProgressCache({
    ...cache,
    [progress.bookId]: { ...progress, userId, updatedAt },
  }, userId);

  if (!supabase || !userId) return;

  if (!(await isInternetReachable())) {
    await enqueueOfflineSync(makeProgressOperation(userId, progress, updatedAt));
    return;
  }

  const { error } = await supabase.from('reading_progress').upsert({
    user_id: userId,
    book_id: progress.bookId,
    chapter_id: progress.chapterId ?? null,
    chapter_number: progress.chapterNumber,
    progress_percent: progress.progressPercent,
    scroll_position: progress.scrollPosition,
    updated_at: updatedAt,
  }, { onConflict: 'user_id,book_id' });

  if (error) {
    await enqueueOfflineSync(makeProgressOperation(userId, progress, updatedAt));
    if (await isInternetReachable()) throw toServiceError(error, 'Không thể lưu tiến độ đọc.');
  }
}

export async function getBookmarks(bookId: string, userId?: string): Promise<Bookmark[]> {
  const cache = await readBookmarkCache(userId);
  const cachedBook = cache.filter((bookmark) => bookmark.bookId === bookId);

  if (!supabase || !userId) return cachedBook;
  if (!(await isInternetReachable())) return cachedBook;

  try {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', userId)
      .eq('book_id', bookId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const mapped = (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      bookId: row.book_id,
      chapterId: row.chapter_id,
      chapterNumber: row.chapter_number,
      position: Number(row.position),
      note: row.note,
      createdAt: row.created_at,
    }));

    await writeBookmarkCache([
      ...cache.filter((bookmark) => bookmark.bookId !== bookId),
      ...mapped,
    ], userId);
    return mapped;
  } catch (error) {
    if (cachedBook.length) return cachedBook;
    throw toServiceError(error, 'Không thể tải dấu trang.');
  }
}

export async function toggleBookmark(
  bookmark: Omit<Bookmark, 'id' | 'createdAt'>,
  userId?: string,
): Promise<boolean> {
  const cache = await readBookmarkCache(userId);
  const existing = cache.find(
    (item) => item.bookId === bookmark.bookId && item.chapterNumber === bookmark.chapterNumber,
  );
  const desired = !existing;
  const optimistic: Bookmark[] = desired
    ? [{
        ...bookmark,
        userId,
        id: `offline:${bookmark.bookId}:${bookmark.chapterNumber}`,
        createdAt: new Date().toISOString(),
      }, ...cache.filter((item) => !(item.bookId === bookmark.bookId && item.chapterNumber === bookmark.chapterNumber))]
    : cache.filter((item) => !(item.bookId === bookmark.bookId && item.chapterNumber === bookmark.chapterNumber));

  await writeBookmarkCache(optimistic, userId);

  if (!supabase || !userId) return desired;

  if (!(await isInternetReachable())) {
    await enqueueOfflineSync(makeBookmarkOperation(userId, bookmark, desired));
    return desired;
  }

  try {
    if (!desired) {
      const { error } = await supabase.from('bookmarks')
        .delete()
        .eq('user_id', userId)
        .eq('book_id', bookmark.bookId)
        .eq('chapter_number', bookmark.chapterNumber);
      if (error) throw error;
      return false;
    }

    const { data: existingRemote, error: findError } = await supabase.from('bookmarks')
      .select('*')
      .eq('user_id', userId)
      .eq('book_id', bookmark.bookId)
      .eq('chapter_number', bookmark.chapterNumber)
      .limit(1);
    if (findError) throw findError;

    let remote = existingRemote?.[0];
    if (!remote) {
      const { data, error } = await supabase.from('bookmarks').insert({
        user_id: userId,
        book_id: bookmark.bookId,
        chapter_id: bookmark.chapterId ?? null,
        chapter_number: bookmark.chapterNumber,
        position: bookmark.position,
        note: bookmark.note ?? null,
      }).select('*').single();
      if (error) throw error;
      remote = data;
    }

    const latestCache = await readBookmarkCache(userId);
    const mapped: Bookmark = {
      id: remote.id,
      userId: remote.user_id,
      bookId: remote.book_id,
      chapterId: remote.chapter_id,
      chapterNumber: remote.chapter_number,
      position: Number(remote.position),
      note: remote.note,
      createdAt: remote.created_at,
    };
    await writeBookmarkCache([
      mapped,
      ...latestCache.filter((item) => !(item.bookId === bookmark.bookId && item.chapterNumber === bookmark.chapterNumber)),
    ], userId);
    return true;
  } catch (error) {
    await enqueueOfflineSync(makeBookmarkOperation(userId, bookmark, desired));
    if (await isInternetReachable()) {
      await writeBookmarkCache(cache, userId);
      throw toServiceError(error, 'Không thể cập nhật dấu trang.');
    }
    return desired;
  }
}

type FollowKind = 'author' | 'book';

export async function getFollowState(kind: FollowKind, targetId: string, userId?: string) {
  if (!supabase || !userId) {
    return Boolean((await readJson<Record<string, boolean>>(scopedKey(followKey, userId), {}))[`${kind}:${targetId}`]);
  }

  const result = kind === 'author'
    ? await supabase.from('author_follows').select('user_id').eq('user_id', userId).eq('author_id', targetId).maybeSingle()
    : await supabase.from('book_follows').select('user_id').eq('user_id', userId).eq('book_id', targetId).maybeSingle();
  const { data, error } = result;
  if (error) throw toServiceError(error, 'Không thể tải trạng thái theo dõi.');
  return Boolean(data);
}

export async function setFollowState(kind: FollowKind, targetId: string, following: boolean, userId?: string) {
  if (!supabase || !userId) {
    const key = scopedKey(followKey, userId);
    const all = await readJson<Record<string, boolean>>(key, {});
    await writeJson(key, { ...all, [`${kind}:${targetId}`]: following });
    return;
  }

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
  const existing = (await getBookmarks(bookmark.bookId, userId))
    .find((item) => item.chapterNumber === bookmark.chapterNumber);
  if (!existing) await toggleBookmark(bookmark, userId);
}

export async function removeBookmark(id: string, userId?: string) {
  const cache = await readBookmarkCache(userId);
  const existing = cache.find((item) => item.id === id);
  await writeBookmarkCache(cache.filter((item) => item.id !== id), userId);

  if (!supabase || !userId) return;

  if (!(await isInternetReachable())) {
    if (existing) {
      await enqueueOfflineSync(makeBookmarkOperation(userId, existing, false));
    } else {
      await enqueueOfflineSync(makeBookmarkDeleteIdOperation(userId, '', id));
    }
    return;
  }

  const { error } = await supabase.from('bookmarks')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) {
    if (existing) await enqueueOfflineSync(makeBookmarkOperation(userId, existing, false));
    else await enqueueOfflineSync(makeBookmarkDeleteIdOperation(userId, '', id));
    if (await isInternetReachable()) throw toServiceError(error, 'Không thể xóa dấu trang.');
  }
}

// Opt-in import: preserve every existing remote row and retain local data for retry.
// Demo identifiers are intentionally skipped because they are not backend foreign keys.
export async function mergeLocalLibrary(userId: string) {
  if (!supabase) return;
  const local = await readLibraryCache();
  const entries = local.filter((entry) => /^[0-9a-f-]{36}$/i.test(entry.bookId));
  if (!entries.length) return;

  const { error } = await supabase.from('library').upsert(entries.map((entry) => ({
    user_id: userId,
    book_id: entry.bookId,
    status: entry.status,
    added_at: entry.addedAt,
  })), { onConflict: 'user_id,book_id', ignoreDuplicates: true });

  if (error) throw toServiceError(error, 'Không thể nhập tủ sách cục bộ.');
}
