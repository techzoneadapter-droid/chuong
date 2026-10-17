import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { module, exports: module.exports, performance, setTimeout, Map, Set, Date,
    require: name => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return module.exports;
}
const text = load('../services/contentText.ts');
const helpers = load('../lib/asyncWork.ts');
const engine = load('../lib/readerEngine.ts', { './asyncWork': helpers, '../services/contentText': text });
const tts = load('../services/tts.ts', { 'expo-speech': {} });
const same = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

for (const body of ['', '  ', 'Chapter 4: Title\n\nBody\n \t\nEnd', 'a\r\n\r\nb\n\n\nc', '\n\nOnly one paragraph', 'x '.repeat(5000), 'One! Two? Three\u2026 Four\u3002\n\nTail']) {
  same(await engine.prepareReaderParagraphs(body, 4), text.stripLeadingChapterMarker(body, 4).split(/\n\s*\n/).filter(Boolean));
  same(await tts.buildTtsSegmentsAsync(body), tts.buildTtsSegments(body));
}
for (let i = 1; i <= 30; i++) {
  const body = ('Sentence.\r\n\r\nLong ' + 'word '.repeat(i * 5) + '!\n Next? ').repeat(i);
  same(await tts.buildTtsSegmentsAsync(body), tts.buildTtsSegments(body));
}
for (const suffix of ['\r\n\n\nTail', '\n\n\n\nTail', '\t\t Tail', '\rTail']) {
  const body = 'x'.repeat(32767) + suffix + '\n'.repeat(65536) + 'End';
  same(await tts.buildTtsSegmentsAsync(body), tts.buildTtsSegments(body));
}
let time = 0; let catalogCalls = 0; let chapterCalls = 0; let allowed = true; let body = 'Body\n\nEnd';
const session = engine.createReaderEngine({ now: () => time, maxBytes: 10000,
  loadCatalog: async () => { catalogCalls++; return { offline: false }; }, cacheCatalog: value => !value.offline,
  loadChapter: async number => {
    chapterCalls++; await new Promise(resolve => setTimeout(resolve, 1));
    if (!allowed) throw new Error('ContentLockedError');
    return { data: { number, content: body }, mode: 'supabase' };
  },
});
await Promise.all([session.catalog(), session.catalog()]);
await session.catalog(); assert.equal(catalogCalls, 1);
await session.catalog(true); assert.equal(catalogCalls, 2, 'A new publication target can bypass a fresh metadata snapshot');
time = 30001; await session.catalog(); assert.equal(catalogCalls, 3);
const [a, b] = await Promise.all([session.read(1), session.read(1)]);
assert.equal(chapterCalls, 1); assert.equal(a.paragraphs, b.paragraphs);
const reread = await session.read(1);
assert.equal(chapterCalls, 2, 'Each settled navigation revalidates permission');
assert.equal(reread.paragraphs, a.paragraphs, 'Exact validated text reuses parsing');
await session.read(2); await session.read(3); await session.read(1); await session.read(4);
assert.equal(session.hasPrepared(2), false, 'Least recently used item is evicted');
assert.equal(session.stats().entries, 3);
body = 'Changed content'; assert.notEqual((await session.read(1)).paragraphs, a.paragraphs);
allowed = false; await assert.rejects(session.read(1), /ContentLockedError/);
assert.equal(session.hasPrepared(1), false, 'Permission errors discard prepared text');
allowed = true; body = 'Large '.repeat(10000); await session.read(5);
assert.equal(session.hasPrepared(5), false, 'Oversized chapters display but are not retained');
assert.ok(session.stats().estimatedBytes <= 10000);
session.dispose(); assert.equal(session.stats().entries, 0);
let offlineCatalogCalls = 0;
const offline = engine.createReaderEngine({ loadCatalog: async () => { offlineCatalogCalls++; return false; },
  cacheCatalog: value => value, loadChapter: async () => ({ data: null, mode: 'offline' }) });
await offline.catalog(); await offline.catalog(); assert.equal(offlineCatalogCalls, 2, 'Offline catalog must not hide reconnect');
console.log('PASS: exact text/TTS parity, sparse-compatible metadata TTL, pending dedup, LRU bounds, fresh permission checks and reconnect');

let connected = true; let rpcCalls = 0; let removed = 0; let locked = false; let expired = false;
class OfflineLicenseExpiredError extends Error {}
const chapterService = load('../services/chapters.ts', {
  '../lib/freeChapterPreview': load('../lib/freeChapterPreview.ts'),
  '../data/books': { getBook: () => ({ chapters: [] }) }, '../data/readerContent': { getChapterContent: () => [] },
  '../lib/supabase': { supabase: { rpc: async () => {
    rpcCalls++;
    return { data: [{ id: 'chapter', book_id: 'book', chapter_number: 1, title: 'Title', status: 'published',
      is_vip: true, price_coins: 100, content: locked ? null : 'Authorized body', lock_kind: locked ? 'chapter' : null }] };
  } }, requireSupabase: () => { throw new Error('Unused'); } },
  // A connected network with uncertain/negative reachability must still ask the server.
  './connectivity': { getConnectivityState: async () => ({ connected, reachable: false }) },
  './errors': { toServiceError: error => error },
  './offlineDownloads': {
    getOfflineBookRecords: async () => [], getOfflineBookSnapshot: async () => null,
    getOfflineChapter: async () => { if (expired) throw new OfflineLicenseExpiredError(); return { number: 1, content: 'Offline body' }; },
    OfflineLicenseExpiredError, refreshOfflineChapterIfDownloaded: async () => false,
    removeOfflineChapter: async () => { removed++; return true; },
  },
});
const secured = engine.createReaderEngine({ loadCatalog: async () => true, cacheCatalog: value => value,
  loadChapter: number => chapterService.getChapter('book', number) });
await secured.read(1); locked = true;
await assert.rejects(secured.read(1), error => error.name === 'ContentLockedError');
assert.equal(removed, 1); assert.equal(secured.hasPrepared(1), false);
connected = false;
assert.equal((await secured.read(1)).result.mode, 'offline');
assert.equal(rpcCalls, 2, 'Explicit offline state must avoid RPC');
expired = true; await assert.rejects(secured.read(1), OfflineLicenseExpiredError);
console.log('PASS: actual chapter service rechecks server lock, invalidates downloads, skips offline RPC and enforces license expiry');

const large = Array.from({ length: 20000 }, (_, i) => `Paragraph ${i}: ` + 'Reader text '.repeat(20) + '.').join('\n\n');
const start = performance.now(); const expected = tts.buildTtsSegments(large); const syncMs = performance.now() - start;
let heartbeat = 0; let maxGap = 0; let previous = performance.now();
const timer = setInterval(() => { const current = performance.now(); maxGap = Math.max(maxGap, current - previous); previous = current; heartbeat++; }, 1);
const asyncStart = performance.now(); const actual = await tts.buildTtsSegmentsAsync(large);
const asyncMs = performance.now() - asyncStart; clearInterval(timer);
same(actual, expected); assert.ok(heartbeat > 0, 'Long TTS work must yield to other JS tasks');
let current = true; const cancelled = tts.buildTtsSegmentsAsync(large, 32, () => current);
setTimeout(() => { current = false; }, 0); assert.equal((await cancelled).length, 0);
console.log(JSON.stringify({ workload: 'Node fixture, not native performance', chars: large.length, paragraphs: 20000,
  syncTtsMs: Math.round(syncMs), cooperativeTtsMs: Math.round(asyncMs), heartbeats: heartbeat, maxHeartbeatGapMs: Math.round(maxGap) }));
