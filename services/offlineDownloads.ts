import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Book, Chapter } from '../types';

const MANIFEST_KEY = 'chuong:offline-manifest:v2';
const WEB_PAYLOAD_PREFIX = 'chuong:offline-payload:v2:';
const ROOT_DIRECTORY = 'chuong-offline-v2';
const DEFAULT_QUOTA_BYTES = 250 * 1024 * 1024;
const MIN_QUOTA_BYTES = 50 * 1024 * 1024;
const MAX_QUOTA_BYTES = 1024 * 1024 * 1024;
const VIP_OFFLINE_LICENSE_MS = 7 * 24 * 60 * 60 * 1000;

export class OfflineLicenseExpiredError extends Error {
  constructor() {
    super('Bản tải VIP cần kết nối mạng để xác minh lại quyền đọc.');
    this.name = 'OfflineLicenseExpiredError';
  }
}

export type OfflineChapterRecord = {
  key: string;
  bookId: string;
  bookTitle: string;
  author: string;
  cover: string;
  coverUrl: string | null;
  genre: string | null;
  chapterId: string | null;
  chapterNumber: number;
  chapterTitle: string;
  access: 'free' | 'vip';
  priceCoins: number;
  contentVersion: string;
  bytes: number;
  downloadedAt: string;
  lastAccessedAt: string;
  licenseValidUntil: string | null;
  checksum?: string;
};

export type OfflineBookSummary = {
  bookId: string;
  title: string;
  author: string;
  cover: string;
  coverUrl: string | null;
  genre: string | null;
  chapterCount: number;
  expiredVipCount: number;
  bytes: number;
  downloadedAt: string;
  lastAccessedAt: string;
};

export type OfflineStorageStats = {
  totalBytes: number;
  quotaBytes: number;
  chapterCount: number;
  bookCount: number;
  expiredVipCount: number;
};

type OfflineManifest = {
  version: 2;
  quotaBytes: number;
  chapters: OfflineChapterRecord[];
};

type StoredChapterPayload = {
  chapter: Chapter;
  contentVersion: string;
  savedAt: string;
  checksum?: string;
};

function emptyManifest(): OfflineManifest {
  return { version: 2, quotaBytes: DEFAULT_QUOTA_BYTES, chapters: [] };
}

function chapterKey(bookId: string, chapterNumber: number) {
  return `${bookId}:${chapterNumber}`;
}

function fileNameForKey(key: string) {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
}

function estimateBytes(text: string) {
  // Conservative UTF-16-ish estimate for quota decisions. Native file size replaces
  // this estimate after writing whenever the platform exposes it.
  return Math.max(1, text.length * 2);
}

function checksumChapter(chapter: Chapter, contentVersion: string) {
  const input = [
    chapter.bookId ?? '',
    chapter.id ?? '',
    chapter.number,
    chapter.title,
    contentVersion,
    chapter.content ?? '',
  ].join('\u241f');

  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function readManifest(): Promise<OfflineManifest> {
  try {
    const raw = await AsyncStorage.getItem(MANIFEST_KEY);
    if (!raw) return emptyManifest();
    const parsed = JSON.parse(raw) as Partial<OfflineManifest>;
    if (parsed.version !== 2 || !Array.isArray(parsed.chapters)) return emptyManifest();
    return {
      version: 2,
      quotaBytes: Math.min(
        MAX_QUOTA_BYTES,
        Math.max(MIN_QUOTA_BYTES, Number(parsed.quotaBytes) || DEFAULT_QUOTA_BYTES),
      ),
      chapters: parsed.chapters,
    };
  } catch {
    return emptyManifest();
  }
}

async function writeManifest(manifest: OfflineManifest) {
  await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
}

async function getNativeFile(key: string) {
  const { Directory, File, Paths } = await import('expo-file-system');
  const directory = new Directory(Paths.document, ROOT_DIRECTORY);
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  return new File(directory, fileNameForKey(key));
}

async function writePayload(key: string, payload: StoredChapterPayload) {
  const serialized = JSON.stringify(payload);

  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(WEB_PAYLOAD_PREFIX + key, serialized);
    return estimateBytes(serialized);
  }

  const file = await getNativeFile(key);
  if (!file.exists) file.create({ intermediates: true });
  file.write(serialized);
  return typeof file.size === 'number' && file.size > 0 ? file.size : estimateBytes(serialized);
}

async function readPayload(key: string): Promise<StoredChapterPayload | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = await AsyncStorage.getItem(WEB_PAYLOAD_PREFIX + key);
      return raw ? JSON.parse(raw) as StoredChapterPayload : null;
    }

    const file = await getNativeFile(key);
    if (!file.exists) return null;
    return JSON.parse(await file.text()) as StoredChapterPayload;
  } catch {
    return null;
  }
}

async function deletePayload(key: string) {
  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(WEB_PAYLOAD_PREFIX + key);
      return;
    }

    const file = await getNativeFile(key);
    if (file.exists) file.delete();
  } catch {
    // Manifest cleanup is still allowed to continue if the payload disappeared already.
  }
}

function expired(record: OfflineChapterRecord) {
  return Boolean(
    record.access === 'vip'
    && record.licenseValidUntil
    && Date.parse(record.licenseValidUntil) <= Date.now(),
  );
}

async function enforceQuota(manifest: OfflineManifest, preserveKeys: string[] = []) {
  let total = manifest.chapters.reduce((sum, item) => sum + Math.max(0, item.bytes), 0);
  if (total <= manifest.quotaBytes) return manifest;

  const preserve = new Set(preserveKeys);
  const removable = [...manifest.chapters]
    .filter((item) => !preserve.has(item.key))
    .sort((a, b) => Date.parse(a.lastAccessedAt) - Date.parse(b.lastAccessedAt));

  const removed = new Set<string>();
  for (const item of removable) {
    if (total <= manifest.quotaBytes) break;
    removed.add(item.key);
    total -= Math.max(0, item.bytes);
    await deletePayload(item.key);
  }

  if (removed.size) {
    manifest.chapters = manifest.chapters.filter((item) => !removed.has(item.key));
  }

  return manifest;
}

export async function saveOfflineChapter(
  book: Pick<Book, 'id' | 'title' | 'author' | 'cover' | 'coverUrl'> & Partial<Pick<Book, 'genre'>>,
  chapter: Chapter,
) {
  if (!chapter.content || !chapter.content.trim()) {
    throw new Error('Chương này chưa có nội dung để lưu offline.');
  }

  const now = new Date();
  const key = chapterKey(book.id, chapter.number);
  const contentVersion = chapter.updatedAt || chapter.publishedAt || chapter.id || String(chapter.number);
  const storedChapter: Chapter = {
    ...chapter,
    bookId: book.id,
    isDownloaded: true,
    offline: true,
  };
  const checksum = checksumChapter(storedChapter, contentVersion);
  const payload: StoredChapterPayload = {
    chapter: storedChapter,
    contentVersion,
    savedAt: now.toISOString(),
    checksum,
  };

  const bytes = await writePayload(key, payload);
  const manifest = await readManifest();
  const existing = manifest.chapters.find((item) => item.key === key);
  const record: OfflineChapterRecord = {
    key,
    bookId: book.id,
    bookTitle: book.title,
    author: book.author,
    cover: book.cover,
    coverUrl: book.coverUrl ?? null,
    genre: book.genre ?? existing?.genre ?? null,
    chapterId: chapter.id ?? null,
    chapterNumber: chapter.number,
    chapterTitle: chapter.title,
    access: chapter.access,
    priceCoins: chapter.priceCoins ?? 0,
    contentVersion,
    bytes,
    downloadedAt: existing?.downloadedAt ?? now.toISOString(),
    lastAccessedAt: now.toISOString(),
    licenseValidUntil: chapter.access === 'vip'
      ? new Date(now.getTime() + VIP_OFFLINE_LICENSE_MS).toISOString()
      : null,
    checksum,
  };

  manifest.chapters = [record, ...manifest.chapters.filter((item) => item.key !== key)];
  await enforceQuota(manifest, [key]);
  await writeManifest(manifest);
  return record;
}

export async function getOfflineChapter(bookId: string, chapterNumber: number): Promise<Chapter | null> {
  const manifest = await readManifest();
  const key = chapterKey(bookId, chapterNumber);
  const record = manifest.chapters.find((item) => item.key === key);
  if (!record) return null;
  if (expired(record)) throw new OfflineLicenseExpiredError();

  const payload = await readPayload(key);
  if (!payload?.chapter?.content) {
    manifest.chapters = manifest.chapters.filter((item) => item.key !== key);
    await writeManifest(manifest);
    return null;
  }

  const actualChecksum = checksumChapter(payload.chapter, payload.contentVersion);
  if ((payload.checksum && payload.checksum !== actualChecksum) || (record.checksum && record.checksum !== actualChecksum)) {
    await deletePayload(key);
    manifest.chapters = manifest.chapters.filter((item) => item.key !== key);
    await writeManifest(manifest);
    throw new Error('Bản tải bị lỗi nên đã được xóa. Hãy tải lại chương khi có mạng.');
  }

  record.lastAccessedAt = new Date().toISOString();
  await writeManifest(manifest);

  return {
    ...payload.chapter,
    bookId,
    isDownloaded: true,
    offline: true,
    updatedAt: payload.chapter.updatedAt ?? record.contentVersion,
  };
}

export async function hasOfflineChapter(bookId: string, chapterNumber: number) {
  const manifest = await readManifest();
  return manifest.chapters.some((item) => item.bookId === bookId && item.chapterNumber === chapterNumber);
}

export async function refreshOfflineChapterIfDownloaded(chapter: Chapter) {
  if (!chapter.bookId || !chapter.content) return false;
  const manifest = await readManifest();
  const current = manifest.chapters.find(
    (item) => item.bookId === chapter.bookId && item.chapterNumber === chapter.number,
  );
  if (!current) return false;

  await saveOfflineChapter(
    {
      id: current.bookId,
      title: current.bookTitle,
      author: current.author,
      cover: current.cover,
      coverUrl: current.coverUrl,
      genre: current.genre ?? undefined,
    },
    chapter,
  );
  return true;
}

export async function removeOfflineChapter(bookId: string, chapterNumber: number) {
  const manifest = await readManifest();
  const key = chapterKey(bookId, chapterNumber);
  const existed = manifest.chapters.some((item) => item.key === key);
  if (!existed) return false;

  await deletePayload(key);
  manifest.chapters = manifest.chapters.filter((item) => item.key !== key);
  await writeManifest(manifest);
  return true;
}

export async function removeOfflineBook(bookId: string) {
  const manifest = await readManifest();
  const targets = manifest.chapters.filter((item) => item.bookId === bookId);
  await Promise.all(targets.map((item) => deletePayload(item.key)));
  manifest.chapters = manifest.chapters.filter((item) => item.bookId !== bookId);
  await writeManifest(manifest);
  return targets.length;
}

export async function listOfflineBooks(): Promise<OfflineBookSummary[]> {
  const manifest = await readManifest();
  const grouped = new Map<string, OfflineBookSummary>();

  for (const item of manifest.chapters) {
    const current = grouped.get(item.bookId);
    if (!current) {
      grouped.set(item.bookId, {
        bookId: item.bookId,
        title: item.bookTitle,
        author: item.author,
        cover: item.cover,
        coverUrl: item.coverUrl,
        genre: item.genre ?? null,
        chapterCount: 1,
        expiredVipCount: expired(item) ? 1 : 0,
        bytes: item.bytes,
        downloadedAt: item.downloadedAt,
        lastAccessedAt: item.lastAccessedAt,
      });
      continue;
    }

    current.chapterCount += 1;
    current.expiredVipCount += expired(item) ? 1 : 0;
    current.bytes += item.bytes;
    if (Date.parse(item.downloadedAt) > Date.parse(current.downloadedAt)) current.downloadedAt = item.downloadedAt;
    if (Date.parse(item.lastAccessedAt) > Date.parse(current.lastAccessedAt)) current.lastAccessedAt = item.lastAccessedAt;
  }

  return [...grouped.values()].sort(
    (a, b) => Date.parse(b.lastAccessedAt) - Date.parse(a.lastAccessedAt),
  );
}

export async function getOfflineBookRecords(bookId: string) {
  const manifest = await readManifest();
  return manifest.chapters
    .filter((item) => item.bookId === bookId)
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
}

export async function getOfflineBookSnapshot(bookId: string): Promise<Book | null> {
  const records = await getOfflineBookRecords(bookId);
  if (!records.length) return null;

  const first = records[0];
  const chapters: Chapter[] = records.map((record) => ({
    id: record.chapterId ?? undefined,
    bookId: record.bookId,
    number: record.chapterNumber,
    title: record.chapterTitle,
    date: new Date(record.downloadedAt).toLocaleDateString('vi-VN'),
    relativeDate: 'Đã tải offline',
    access: record.access,
    priceCoins: record.priceCoins,
    status: 'published',
    publishedAt: null,
    updatedAt: record.contentVersion,
    isRead: false,
    isDownloaded: true,
    offline: true,
  }));

  return {
    id: first.bookId,
    title: first.bookTitle,
    author: first.author,
    authorFollowers: '—',
    cover: first.cover,
    coverUrl: first.coverUrl,
    genre: first.genre || 'Offline',
    rating: 0,
    views: '—',
    followers: '—',
    status: 'Đã tải offline',
    description: 'Bản tải trên thiết bị. Kết nối mạng để xem thông tin mới nhất.',
    tags: [],
    totalChapters: chapters.length,
    latestChapter: chapters[chapters.length - 1]?.number ?? 1,
    isVip: chapters.some((chapter) => chapter.access === 'vip'),
    price: 0,
    progress: 0,
    chapters,
  };
}

export async function getOfflineStorageStats(): Promise<OfflineStorageStats> {
  const manifest = await readManifest();
  return {
    totalBytes: manifest.chapters.reduce((sum, item) => sum + Math.max(0, item.bytes), 0),
    quotaBytes: manifest.quotaBytes,
    chapterCount: manifest.chapters.length,
    bookCount: new Set(manifest.chapters.map((item) => item.bookId)).size,
    expiredVipCount: manifest.chapters.filter(expired).length,
  };
}

export async function setOfflineQuotaBytes(bytes: number) {
  const manifest = await readManifest();
  manifest.quotaBytes = Math.min(MAX_QUOTA_BYTES, Math.max(MIN_QUOTA_BYTES, Math.round(bytes)));
  await enforceQuota(manifest);
  await writeManifest(manifest);
  return getOfflineStorageStats();
}

export async function clearOfflineDownloads() {
  const manifest = await readManifest();
  await Promise.all(manifest.chapters.map((item) => deletePayload(item.key)));
  await writeManifest({ ...manifest, chapters: [] });
}

export async function pruneExpiredVipDownloads() {
  const manifest = await readManifest();
  const expiredRecords = manifest.chapters.filter(expired);
  await Promise.all(expiredRecords.map((item) => deletePayload(item.key)));
  if (expiredRecords.length) {
    const expiredKeys = new Set(expiredRecords.map((item) => item.key));
    manifest.chapters = manifest.chapters.filter((item) => !expiredKeys.has(item.key));
    await writeManifest(manifest);
  }
  return expiredRecords.length;
}

export function formatOfflineBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
