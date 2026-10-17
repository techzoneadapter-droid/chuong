import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Promise, Map, Set, Date, JSON, Math,
    require: (name) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
  });
  return module.exports;
}
const storage = new Map();
const pause = () => new Promise((resolve) => setTimeout(resolve, 1));
const offline = load('../services/offlineDownloads.ts', {
  '../lib/asyncWork': load('../lib/asyncWork.ts'),
  'react-native': { Platform: { OS: 'web' } },
  '@react-native-async-storage/async-storage': {
    getItem: async (key) => { const value = storage.get(key) ?? null; await pause(); return value; },
    setItem: async (key, value) => { await pause(); storage.set(key, value); },
    removeItem: async (key) => { await pause(); storage.delete(key); },
  },
});
const book = { id: 'test-book', title: 'Test', author: 'Author', cover: '#000' };
const chapter = (number) => ({ number, title: `Chapter ${number}`, content: 'Long chapter '.repeat(3000), access: 'free' });
await Promise.all([1, 2, 3, 4].map((number) => offline.saveOfflineChapter(book, chapter(number))));
assert.equal((await offline.getOfflineBookRecords(book.id)).length, 4, 'Four parallel saves must retain all manifest entries');
await Promise.all([offline.getOfflineChapter(book.id, 1), offline.saveOfflineChapter(book, chapter(5))]);
assert.equal((await offline.getOfflineBookRecords(book.id)).length, 5, 'Read access timestamp must not overwrite a download');
await Promise.all([offline.removeOfflineChapter(book.id, 2), offline.saveOfflineChapter(book, chapter(6))]);
assert.deepEqual(Array.from(await offline.getOfflineBookRecords(book.id), (row) => row.chapterNumber), [1, 3, 4, 5, 6]);
await offline.saveOfflineChapter(book, { ...chapter(7), access: 'vip' });
const manifestKey = 'chuong:offline-manifest:v2';
const manifest = JSON.parse(storage.get(manifestKey));
manifest.chapters.find((row) => row.chapterNumber === 7).licenseValidUntil = '2000-01-01T00:00:00Z';
storage.set(manifestKey, JSON.stringify(manifest));
await assert.rejects(offline.getOfflineChapter(book.id, 7), { name: 'OfflineLicenseExpiredError' });
const payloadKey = 'chuong:offline-payload:v2:test-book:1';
const payload = JSON.parse(storage.get(payloadKey));
payload.chapter.content = 'corrupt';
storage.set(payloadKey, JSON.stringify(payload));
await assert.rejects(offline.getOfflineChapter(book.id, 1));
assert.equal(await offline.hasOfflineChapter(book.id, 1), false);
console.log('PASS: parallel download/read/delete manifest integrity, VIP expiry and checksum verification');

const helpers = load('../lib/asyncWork.ts');
let running = 0; let peak = 0;
const ordered = await helpers.mapConcurrent([1, 2, 3, 4, 5, 6, 7], 3, async (number) => {
  running++; peak = Math.max(peak, running); await pause(); running--; return number * 2;
});
assert.deepEqual(Array.from(ordered), [2, 4, 6, 8, 10, 12, 14]);
assert.equal(peak, 3);
let queries = 0; let cacheReads = 0; let cacheWrites = 0;
const ids = Array.from({ length: 205 }, (_, index) => `book-${index}`);
const cacheProgress = { bookId: ids[204], chapterNumber: 7, progressPercent: 55, updatedAt: '2026-10-10' };
let progressCache = JSON.stringify({ [ids[204]]: cacheProgress });
const library = load('../services/library.ts', {
  '@react-native-async-storage/async-storage': {
    getItem: async () => { cacheReads++; return progressCache; },
    setItem: async (_key, value) => { cacheWrites++; progressCache = value; },
  },
  '../lib/supabase': { supabase: { from: (table) => {
    assert.equal(table, 'reading_progress');
    let batch;
    const query = {
      select: () => query,
      eq: (key, value) => { assert.equal(key, 'user_id'); assert.equal(value, 'user-a'); return query; },
      in: (_key, values) => { batch = values; return query; },
      order: () => query,
      range: async (from, to) => {
        queries++; assert.equal(from, 0); assert.ok(to < 100);
        return { data: batch.filter((id) => id !== ids[204]).map((id) => ({
          user_id: 'user-a', book_id: id, chapter_number: 3, chapter_id: null,
          progress_percent: 20, scroll_position: 100, updated_at: '2026-10-10',
        })), error: null };
      },
    };
    return query;
  } } },
  './connectivity': { isInternetReachable: async () => true },
  './errors': { toServiceError: (error) => error },
  './offlineSync': {},
});
const progress = await library.getReadingProgressForBooks([...ids, ids[0]], 'user-a');
assert.equal(queries, 3, '205 books must use three progress queries rather than 205');
assert.equal(cacheWrites, 1);
assert.equal(cacheReads, 2);
assert.equal(progress[ids[204]].chapterNumber, 7, 'Missing remote row must preserve local progress');
assert.equal(progress[ids[0]].chapterNumber, 3);
assert.equal(Object.keys(progress).length, 205);
console.log('PASS: bounded concurrency and batched progress (205 books: 3 queries, 2 cache reads, 1 cache write)');

let discoveryQueries = 0;
const rankedBooks = Array.from({ length: 50 }, (_, index) => ({ book: { id: `rank-${index}` }, rank: index + 1 }));
const discovery = load('../services/discovery.ts', {
  '../lib/asyncWork': helpers,
  '@react-native-async-storage/async-storage': {},
  '../data/books': { books: [] },
  '../lib/supabase': { supabase: { rpc: async (name, args) => {
    discoveryQueries++;
    if (name === 'get_public_genre_counts') return { data: [{ genre: 'Test', book_count: 10 }], error: null };
    assert.equal(name, 'search_public_book_ids');
    return { data: Array.from({ length: Math.min(args.p_limit, 105 - args.p_offset) }, (_, index) => ({
      book_id: `search-${args.p_offset + index}`, total_count: 105,
    })), error: null };
  } } },
  './books': { getBooksByIds: async (ids) => ids.map((id) => ({ id })) },
  './errors': { toServiceError: (error) => error },
  './rankings': { getPublicBookRankings: async (_kind, limit) => rankedBooks.slice(0, limit) },
});
const query = { query: 'test', limit: 40, offset: 40 };
const page = discovery.searchDiscovery(query);
assert.equal(page, discovery.searchDiscovery(query));
const results = await page;
assert.equal(discoveryQueries, 1);
assert.equal(results.books[0].id, 'search-40');
assert.equal(results.books.length, 40);
assert.equal(results.total, 105);
await discovery.searchDiscovery(query);
assert.equal(discoveryQueries, 2, 'A completed public request must refresh normally');
const rankingPage = await discovery.searchDiscovery({ sort: 'trending', limit: 40, offset: 40 });
assert.equal(rankingPage.books.length, 10);
assert.equal(rankingPage.books[0].id, 'rank-40');
assert.equal(rankingPage.total, 50);
assert.equal((await discovery.searchDiscovery({ sort: 'trending', limit: 40, offset: 80 })).books.length, 0);
console.log('PASS: pending public request deduplication, fresh refetch, search offsets and final ranking page');

const nativeFiles = new Map();
let asyncWrites = 0;
class Directory {
  exists = true;
  constructor(_root, name) { this.uri = `file:///mock/${name}/`; }
  create() {}
}
class File {
  constructor(directory, name) { this.uri = directory.uri + name; }
  get exists() { return nativeFiles.has(this.uri); }
  get size() { return nativeFiles.get(this.uri)?.length ?? 0; }
  create() { nativeFiles.set(this.uri, ''); }
  write() { throw new Error('Synchronous chapter writes must not run'); }
  async text() { return nativeFiles.get(this.uri); }
  delete() { nativeFiles.delete(this.uri); }
}
let nativeManifest = null;
const nativeOffline = load('../services/offlineDownloads.ts', {
  '../lib/asyncWork': helpers,
  'react-native': { Platform: { OS: 'android' } },
  'expo-file-system': { Directory, File, Paths: { document: {} } },
  'expo-file-system/legacy': {
    EncodingType: { UTF8: 'utf8' },
    writeAsStringAsync: async (uri, text, options) => {
      assert.equal(options.encoding, 'utf8'); await pause(); asyncWrites++; nativeFiles.set(uri, text);
    },
  },
  '@react-native-async-storage/async-storage': {
    getItem: async () => nativeManifest,
    setItem: async (_key, value) => { nativeManifest = value; },
  },
});
await nativeOffline.saveOfflineChapter(book, chapter(1));
assert.equal(asyncWrites, 1);
assert.equal((await nativeOffline.getOfflineChapter(book.id, 1)).content, chapter(1).content);
console.log('PASS: native payload uses asynchronous UTF-8 file write and round-trips existing format');
