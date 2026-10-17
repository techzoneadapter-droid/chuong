import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Promise, Map, Date, JSON,
    require: (name) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
  });
  return module.exports;
}
const helpers = load('../lib/asyncWork.ts');
const flight = helpers.createSingleFlight();
let calls = 0;
const work = async () => { calls++; return 42; };
const first = flight('user-a', work);
assert.equal(first, flight('user-a', work));
assert.equal(await first, 42);
assert.equal(calls, 1);
await flight('user-a', work);
assert.equal(calls, 2, 'Completed requests must not become stale cache');
await assert.rejects(flight('failure', async () => { throw new Error('network'); }));
assert.equal(await flight('failure', work), 42, 'Failure must be retryable');
await Promise.all([flight('user-a', work), flight('user-b', work)]);
assert.equal(calls, 5, 'Different users must not share requests');
const serial = helpers.createSerialQueue();
const order = [];
await Promise.all([serial(async () => { order.push(1); await Promise.resolve(); order.push(2); }),
  serial(async () => { order.push(3); })]);
assert.deepEqual(order, [1, 2, 3]);
await assert.rejects(serial(async () => { throw new Error('storage'); }));
assert.equal(await serial(async () => 7), 7);

let stored = '[]';
let release;
let entered;
const started = new Promise((resolve) => { entered = resolve; });
const gate = new Promise((resolve) => { release = resolve; });
let rpcCalls = 0;
const sync = load('../services/offlineSync.ts', {
  '../lib/asyncWork': helpers,
  '@react-native-async-storage/async-storage': {
    getItem: async () => stored, setItem: async (_key, value) => { stored = value; },
  },
  '../lib/supabase': { supabase: { rpc: async () => { rpcCalls++; entered(); await gate; return { error: null }; } } },
  './connectivity': { isInternetReachable: async () => true },
});
const progress = (bookId) => ({ bookId, chapterNumber: 1, progressPercent: 10, scrollPosition: 100 });
await sync.enqueueOfflineSync(sync.makeProgressOperation('a', progress('first'), '2026-10-10T00:00:00Z'));
await sync.enqueueOfflineSync(sync.makeProgressOperation('b', progress('other-account'), '2026-10-10T00:00:00Z'));
const flush = sync.flushOfflineSyncQueue('a');
assert.equal(flush, sync.flushOfflineSyncQueue('a'));
await started;
const pendingWrite = sync.enqueueOfflineSync(sync.makeProgressOperation('a', progress('second'), '2026-10-10T00:00:01Z'));
await pendingWrite;
const newerWrite = sync.enqueueOfflineSync(sync.makeProgressOperation('a', { ...progress('first'), progressPercent: 50 }, '2026-10-10T00:00:02Z'));
await newerWrite;
release();
await flush;
assert.equal(rpcCalls, 1, 'Simultaneous flushes must not repeat RPCs');
assert.deepEqual(JSON.parse(stored).map((item) => item.bookId), ['other-account', 'second', 'first'],
  'A write during flush and another account must survive');
assert.equal(await sync.getPendingOfflineSyncCount('a'), 2);
await sync.clearOfflineSyncQueue('a');
assert.equal(await sync.getPendingOfflineSyncCount('b'), 1);
console.log('PASS: request deduplication, retry, account isolation, serialized storage and enqueue during flush');

let hydrationCalls = 0;
const groups = {
  trending: [{ book_id: 'shared', rank_no: 1, score: 99 }],
  hot: [{ book_id: 'second', rank_no: 1, score: 15 }, { book_id: 'shared', rank_no: 2, score: 12 }],
  new: [{ book_id: 'shared', rank_no: 1, score: 1 }],
  top: [{ book_id: 'missing', rank_no: 1 }, { book_id: 'second', rank_no: 2, score: 200 }],
};
const rankings = load('../services/rankings.ts', {
  '../data/books': { books: [] },
  '../lib/supabase': { supabase: { rpc: async (_name, args) => ({ data: groups[args.p_kind], error: null }) } },
  './books': { getBooksByIds: async (ids) => {
    hydrationCalls++;
    assert.deepEqual(Array.from(ids), ['shared', 'second', 'missing']);
    return [{ id: 'second' }, { id: 'shared' }];
  } },
  './errors': { toServiceError: (error) => error },
});
const ranked = await rankings.getHomeRankingGroups(8);
assert.equal(hydrationCalls, 1, 'Four ranking groups must hydrate one unique book batch');
assert.deepEqual(Array.from(ranked.hot, (item) => [item.book.id, item.rank, item.score]), [['second', 1, 15], ['shared', 2, 12]]);
assert.equal(ranked.top.length, 1, 'Missing books must still be omitted');
assert.equal(ranked.top[0].rank, 2, 'Server ranks must be preserved');
console.log('PASS: shared ranking hydration preserves ordering, scores, ranks and missing-book handling');
