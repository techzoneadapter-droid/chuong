import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
const execute = promisify(execFile);
const adb = process.env.ADB || 'D:\\Android\\Sdk\\platform-tools\\adb.exe';
const serial = process.env.ANDROID_SERIAL || '5dabf420';
const mode = process.argv[2] || 'report', count = Number(process.argv[3] || 30);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const shell = async (...args) => (await execute(adb, ['-s', serial, 'shell', ...args], { timeout: 20000, maxBuffer: 2 ** 22 })).stdout;
const target = (await (await fetch('http://localhost:8081/json/list')).json())[0];
assert.ok(target, 'Start the Android development build connected to Metro first');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!pending.has(message.id)) return;
  const { resolve, reject, timeout } = pending.get(message.id); pending.delete(message.id); clearTimeout(timeout);
  if (message.error || message.result?.exceptionDetails) reject(Error(JSON.stringify(message)));
  else resolve(message.result?.result?.value);
});
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(Error('Runtime.enable timeout')), 12000);
  pending.set(0, { resolve, reject, timeout });
  socket.send(JSON.stringify({ id: 0, method: 'Runtime.enable' }));
});
const evaluate = expression => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timeout = setTimeout(() => { pending.delete(id); reject(Error('Hermes timeout')); }, 12000);
  pending.set(id, { resolve, reject, timeout });
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
});
const report = async () => {
  for (let i = 0; i < 50; i++) {
    const value = await evaluate('JSON.stringify(globalThis.__CHUONG_READER_MOTION__?.report())');
    if (value && value !== 'undefined') return JSON.parse(value);
    await delay(100);
  }
  throw Error('Open the Reader and wait for it to finish loading');
};
const key = state => { const parts = state.contentKey.split(':'); return { chapter: Number(parts.at(-3)), page: Number(parts.at(-2)), mode: parts.at(-1) }; };
const gesture = (kind = 'swipe', dx = -480, dy = 0, duration = 260) => shell('CLASSPATH=/data/local/tmp/chuong-reader-touch.jar', 'app_process', '/', 'ReaderTouch', kind, '620', '250', String(dx), String(dy), String(duration));
const samples = [];
try {
  if (mode === 'report') console.log(JSON.stringify(await report()));
  else {
    await shell('dumpsys', 'gfxinfo', 'vn.chuong.app', 'reset');
    await evaluate('globalThis.__CHUONG_READER_PERF__.start()');
    if (['reverse', 'multi', 'cancel', 'short'].includes(mode)) {
      const before = await report();
      await gesture(mode === 'short' ? 'swipe' : mode, mode === 'short' ? -40 : -380);
      await delay(700);
      assert.equal((await report()).contentKey, before.contentKey, `${mode} must not navigate`);
      samples.push({ scenario: mode, passed: true });
    } else {
      for (let i = 0; i < count; i++) {
        const before = await report(), from = key(before);
        assert.equal(from.mode, mode === 'pages' ? 'page' : 'scroll');
        const started = performance.now();
        await gesture();
        let after;
        for (let attempt = 0; attempt < 200; attempt++) {
          after = await report();
          if (after.contentKey !== before.contentKey && !after.busy) break;
          await delay(100);
        }
        const to = key(after);
        if (mode === 'pages' && before.hasNextPage) {
          assert.equal(to.chapter, from.chapter); assert.equal(to.page, from.page + 1);
        } else { assert.equal(to.chapter, from.chapter + 1); assert.equal(to.page, 0); }
        samples.push({ from, to, inputThroughReadyMs: Math.round(performance.now() - started), fallback: after.fallback });
        console.log(JSON.stringify({ step: i + 1, ...samples.at(-1) }));
      }
    }
    const gfx = await shell('dumpsys', 'gfxinfo', 'vn.chuong.app');
    const metrics = JSON.parse(await evaluate('JSON.stringify(globalThis.__CHUONG_READER_PERF__.report())'));
    const result = { mode, samples, metrics, graphics: gfx, final: await report(), note: 'Native debug build, actual injected Android touch events. Input-through-ready includes injector and polling overhead; settle is UI callback timing, gfxinfo is the native frame source.' };
    const output = process.env.NATIVE_REPORT || `.cache/page-turn-native-${mode}-${Date.now()}.json`;
    writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ output, passed: samples.length, metrics }));
  }
} finally { socket.close(); }
