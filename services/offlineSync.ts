import { createSerialQueue, createSingleFlight } from '../lib/asyncWork';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Bookmark, LibraryStatus, ReadingProgress } from '../types';
import { isInternetReachable } from './connectivity';

const QUEUE_KEY = 'chuong:offline-sync-queue:v1';
const MAX_QUEUE = 500;
const MAX_ATTEMPTS = 8;
const mutateQueue = createSerialQueue();
const flushOnce = createSingleFlight();

type SyncMeta = {
  id: string;
  attempts: number;
  createdAt: string;
  nextAttemptAt?: string;
};

type ProgressOperation = SyncMeta & {
  type: 'progress';
  userId: string;
  bookId: string;
  payload: Omit<ReadingProgress, 'updatedAt'> & { updatedAt: string };
};

type LibrarySetOperation = SyncMeta & {
  type: 'library-set';
  userId: string;
  bookId: string;
  payload: { status: LibraryStatus; addedAt: string };
};

type LibraryRemoveOperation = SyncMeta & {
  type: 'library-remove';
  userId: string;
  bookId: string;
};

type BookmarkOperation = SyncMeta & {
  type: 'bookmark-set';
  userId: string;
  bookId: string;
  payload: {
    desired: boolean;
    chapterId?: string | null;
    chapterNumber: number;
    position: number;
    note?: string | null;
  };
};

type BookmarkDeleteIdOperation = SyncMeta & {
  type: 'bookmark-delete-id';
  userId: string;
  bookId: string;
  payload: { bookmarkId: string };
};

export type OfflineSyncOperation =
  | ProgressOperation
  | LibrarySetOperation
  | LibraryRemoveOperation
  | BookmarkOperation
  | BookmarkDeleteIdOperation;

async function readQueue(): Promise<OfflineSyncOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: OfflineSyncOperation[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
}

function operationKey(operation: OfflineSyncOperation) {
  if (operation.type === 'progress') return `progress:${operation.userId}:${operation.bookId}`;
  if (operation.type === 'library-set' || operation.type === 'library-remove') return `library:${operation.userId}:${operation.bookId}`;
  if (operation.type === 'bookmark-set') return `bookmark:${operation.userId}:${operation.bookId}:${operation.payload.chapterNumber}`;
  if (operation.type === 'bookmark-delete-id') return `bookmark-id:${operation.userId}:${operation.payload.bookmarkId}`;
  throw new Error('Unknown offline sync operation');
}

export function enqueueOfflineSync(operation: OfflineSyncOperation) {
  return mutateQueue(async () => {
    const queue = await readQueue();
    const key = operationKey(operation);
    const next = [
      ...queue.filter((item) => operationKey(item) !== key),
      operation,
    ];
    await writeQueue(next);
  });
}

export function makeProgressOperation(
  userId: string,
  progress: Omit<ReadingProgress, 'updatedAt'>,
  updatedAt: string,
): ProgressOperation {
  return {
    id: `progress:${userId}:${progress.bookId}`,
    type: 'progress',
    userId,
    bookId: progress.bookId,
    payload: { ...progress, updatedAt },
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
}

export function makeLibrarySetOperation(userId: string, bookId: string, status: LibraryStatus, addedAt: string): LibrarySetOperation {
  return {
    id: `library:${userId}:${bookId}`,
    type: 'library-set',
    userId,
    bookId,
    payload: { status, addedAt },
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
}

export function makeLibraryRemoveOperation(userId: string, bookId: string): LibraryRemoveOperation {
  return {
    id: `library:${userId}:${bookId}`,
    type: 'library-remove',
    userId,
    bookId,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
}

export function makeBookmarkOperation(
  userId: string,
  bookmark: Omit<Bookmark, 'id' | 'createdAt'>,
  desired: boolean,
): BookmarkOperation {
  return {
    id: `bookmark:${userId}:${bookmark.bookId}:${bookmark.chapterNumber}`,
    type: 'bookmark-set',
    userId,
    bookId: bookmark.bookId,
    payload: {
      desired,
      chapterId: bookmark.chapterId,
      chapterNumber: bookmark.chapterNumber,
      position: bookmark.position,
      note: bookmark.note,
    },
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
}

export function makeBookmarkDeleteIdOperation(userId: string, bookId: string, bookmarkId: string): BookmarkDeleteIdOperation {
  return {
    id: `bookmark-id:${userId}:${bookmarkId}`,
    type: 'bookmark-delete-id',
    userId,
    bookId,
    payload: { bookmarkId },
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
}

async function applyOperation(operation: OfflineSyncOperation) {
  if (!supabase) return false;

  if (operation.type === 'progress') {
    const p = operation.payload;
    const { error } = await supabase.rpc('sync_reading_progress', {
      p_book_id: operation.bookId,
      p_chapter_id: (p.chapterId ?? null) as unknown as string,
      p_chapter_number: p.chapterNumber,
      p_progress_percent: p.progressPercent,
      p_scroll_position: p.scrollPosition,
      p_updated_at: p.updatedAt,
    });
    if (error) throw error;
    return true;
  }

  if (operation.type === 'library-set') {
    const { error } = await supabase.from('library').upsert({
      user_id: operation.userId,
      book_id: operation.bookId,
      status: operation.payload.status,
      added_at: operation.payload.addedAt,
    }, { onConflict: 'user_id,book_id' });
    if (error) throw error;
    return true;
  }

  if (operation.type === 'library-remove') {
    const { error } = await supabase.from('library')
      .delete()
      .eq('user_id', operation.userId)
      .eq('book_id', operation.bookId);
    if (error) throw error;
    return true;
  }

  if (operation.type === 'bookmark-delete-id') {
    const { error } = await supabase.from('bookmarks')
      .delete()
      .eq('user_id', operation.userId)
      .eq('id', operation.payload.bookmarkId);
    if (error) throw error;
    return true;
  }

  if (operation.type === 'bookmark-set') {
    if (operation.payload.desired) {
      const { data, error: findError } = await supabase.from('bookmarks')
        .select('id')
        .eq('user_id', operation.userId)
        .eq('book_id', operation.bookId)
        .eq('chapter_number', operation.payload.chapterNumber)
        .limit(1);
      if (findError) throw findError;

      if (!data?.length) {
        const { error } = await supabase.from('bookmarks').insert({
          user_id: operation.userId,
          book_id: operation.bookId,
          chapter_id: operation.payload.chapterId ?? null,
          chapter_number: operation.payload.chapterNumber,
          position: operation.payload.position,
          note: operation.payload.note ?? null,
        });
        if (error) throw error;
      }
      return true;
    }

    const { error } = await supabase.from('bookmarks')
      .delete()
      .eq('user_id', operation.userId)
      .eq('book_id', operation.bookId)
      .eq('chapter_number', operation.payload.chapterNumber);
    if (error) throw error;
    return true;
  }

  return false;
}

export function flushOfflineSyncQueue(userId?: string) {
  return flushOnce(userId ?? '*', () => flushQueue(userId));
}

async function flushQueue(userId?: string) {
  if (!supabase || !(await isInternetReachable())) {
    return { synced: 0, remaining: (await readQueue()).filter((item) => !userId || item.userId === userId).length };
  }

  const queue = await mutateQueue(readQueue);
  const remaining: OfflineSyncOperation[] = [];
  let synced = 0;

  for (const operation of queue) {
    if (userId && operation.userId !== userId) {
      remaining.push(operation);
      continue;
    }

    if (operation.attempts >= MAX_ATTEMPTS) {
      remaining.push(operation);
      continue;
    }

    if (operation.nextAttemptAt && Date.parse(operation.nextAttemptAt) > Date.now()) {
      remaining.push(operation);
      continue;
    }

    try {
      await applyOperation(operation);
      synced += 1;
    } catch {
      const attempts = operation.attempts + 1;
      const delayMs = Math.min(30 * 60_000, 15_000 * 2 ** Math.max(0, attempts - 1));
      remaining.push({
        ...operation,
        attempts,
        nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
      });
    }
  }

  // Reconcile against the current queue so progress written while requests were
  // pending survives; never hold the storage lock across network I/O.
  const pendingCount = await mutateQueue(async () => {
    const current = await readQueue();
    const original = new Map(queue.map((item) => [operationKey(item), JSON.stringify(item)]));
    const replacements = new Map(remaining.map((item) => [operationKey(item), item]));
    const next = current.flatMap((item) => {
      const key = operationKey(item);
      if (original.get(key) !== JSON.stringify(item)) return [item];
      const replacement = replacements.get(key);
      return replacement ? [replacement] : [];
    });
    await writeQueue(next);
    return next.filter((item) => !userId || item.userId === userId).length;
  });
  return {
    synced,
    remaining: pendingCount,
  };
}

export async function getPendingOfflineSyncCount(userId?: string) {
  const queue = await readQueue();
  return queue.filter((item) => !userId || item.userId === userId).length;
}

export async function getOfflineSyncQueueStats(userId?: string) {
  const queue = (await readQueue()).filter((item) => !userId || item.userId === userId);
  return {
    pending: queue.length,
    stalled: queue.filter((item) => item.attempts >= MAX_ATTEMPTS).length,
  };
}

export function clearOfflineSyncQueue(userId?: string) {
  return mutateQueue(async () => {
    if (!userId) {
      await writeQueue([]);
      return;
    }
    const queue = await readQueue();
    await writeQueue(queue.filter((item) => item.userId !== userId));
  });
}
