import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const load = (file, dependencies) => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => dependencies[name], Headers, URL, AbortController, setTimeout, clearTimeout });
  return exports;
};
const helpers = load('../lib/asyncWork.ts', {});
const { createRequestTransport } = load('../lib/requestTransport.ts', { './asyncWork': helpers });
let calls = 0;
const transport = createRequestTransport(async () => {
  calls++;
  await new Promise(resolve => setTimeout(resolve, 5));
  return Response.json({ value: calls });
});
const url = 'https://example.invalid/rest/v1/books';
const [a, b] = await Promise.all([transport(url), transport(url)]);
assert.equal(calls, 1);
assert.deepEqual(await a.json(), await b.json(), 'each consumer can read its own body');
await transport(url); assert.equal(calls, 2, 'completed reads are never reused');
await Promise.all(['alice', 'bob'].map(token => transport(url, { headers: { authorization: token } })));
assert.equal(calls, 4, 'accounts are isolated');
await Promise.all(['0-9', '10-19'].map(range => transport(url, { headers: { range } })));
assert.equal(calls, 6, 'pagination ranges are isolated');
await Promise.all([transport(url, { method: 'POST' }), transport(url, { method: 'POST' })]);
assert.equal(calls, 8, 'mutations are never coalesced');
let retries = 0;
const failing = createRequestTransport(async () => { if (++retries === 1) throw Error('network'); return new Response('OK'); });
await assert.rejects(failing(url)); assert.equal(await (await failing(url)).text(), 'OK');
const timed = createRequestTransport((_input, init) => new Promise((_resolve, reject) => {
  init.signal.addEventListener('abort', () => reject(Error('aborted')));
}), 5);
await assert.rejects(timed(url), /aborted/);
const controller = new AbortController();
let aborted = false;
const cancellable = createRequestTransport((_input, init) => new Promise((_resolve, reject) => {
  init.signal.addEventListener('abort', () => { aborted = true; reject(Error('aborted')); });
}));
const pending = cancellable(url, { signal: controller.signal }); controller.abort();
await assert.rejects(pending, /aborted/); assert.equal(aborted, true);
console.log('PASS: shared pending reads, independent bodies, fresh refetch, auth/range isolation, mutations, retries, timeout and cancellation');
