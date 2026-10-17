import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const execute = promisify(execFile), adb = process.env.ADB || 'D:\\Android\\Sdk\\platform-tools\\adb.exe';
const serial = process.env.ANDROID_SERIAL || '5dabf420';
const count = Number(process.argv[2] || 30), kind = process.env.READER_PROFILE_MODE || 'pages';
const shell = async (...args) => (await execute(adb, ['-s', serial, 'shell', ...args], { timeout: 25000, maxBuffer: 2 ** 22 })).stdout;
function load(path) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports });
  return module.exports;
}
const { getChapterContent } = load('../../data/readerContent.ts');
const { paginateReader } = load('../../lib/readerPagination.ts');
const total = n => paginateReader(getChapterContent(n), Number(process.env.READER_PAGE_TARGET || 1120)).length;
async function state() {
  assert.match(await shell('uiautomator', 'dump', '/sdcard/chuong-reader-ui.xml'), /dumped to/);
  const xml = await shell('cat', '/sdcard/chuong-reader-ui.xml');
  assert.match(xml, /Kiếm Yên Vân/, 'Use the local demo book and default 18px/normal spacing');
  const chapter = xml.match(/text="Chương (\d+) ·/), page = xml.match(/text="Lật trang · (\d+)\/(\d+)/);
  assert.ok(chapter, 'Keep the reader controls visible');
  return { chapter: Number(chapter[1]), page: page ? Number(page[1]) : null, total: page ? Number(page[2]) : null };
}
const from = await state(), expected = { ...from };
if (kind === 'pages') assert.equal(from.total, total(from.chapter), 'Page target must match saved font/spacing settings');
else assert.equal(from.page, null);
await shell('dumpsys', 'gfxinfo', 'vn.chuong.app', 'reset');
const surface = (await shell('dumpsys', 'SurfaceFlinger', '--list')).split(/\r?\n/).find(line => line.startsWith('vn.chuong.app/'))?.trim();
if (surface) await shell('dumpsys', 'SurfaceFlinger', '--latency-clear', surface);
const inputs = [];
for (let i = 0; i < count; i++) {
  inputs.push((await shell('CLASSPATH=/data/local/tmp/chuong-reader-touch.jar', 'app_process', '/', 'ReaderTouch', 'swipe', '620', '250', '-480', '0', '260')).trim());
  await new Promise(resolve => setTimeout(resolve, 400));
  if (kind === 'pages' && expected.page < expected.total) expected.page++;
  else { expected.chapter++; if (kind === 'pages') { expected.page = 1; expected.total = total(expected.chapter); } }
  if ((i + 1) % 5 === 0) console.log(JSON.stringify({ injected: i + 1 }));
}
// Read metrics before UIAutomator reconnects, so inspector work is outside the profile.
const graphics = await shell('dumpsys', 'gfxinfo', 'vn.chuong.app', 'framestats');
const surfaceLatency = surface ? await shell('dumpsys', 'SurfaceFlinger', '--latency', surface) : '';
const lines = surfaceLatency.trim().split(/\r?\n/);
const presented = lines.slice(1).map(line => Number(line.trim().split(/\s+/)[1])).filter(time => time > 0 && time < 9e18);
const intervals = presented.slice(1).map((time, index) => (time - presented[index]) / 1e6).filter(ms => ms >= 5 && ms <= 100).sort((a, b) => a - b);
const presentation = { refreshHz: Math.round(1e9 / Number(lines[0])) || null, recentActiveSamples: intervals.length,
  p50IntervalMs: intervals[Math.floor((intervals.length - 1) * .5)] ?? null,
  p95IntervalMs: intervals[Math.floor((intervals.length - 1) * .95)] ?? null,
  note: 'SurfaceFlinger last ~128 presentations, excluding idle gaps over 100 ms; not a whole-session FPS average.' };
const to = await state();
assert.deepEqual(to, expected);
const output = process.env.NATIVE_REPORT || `.cache/page-turn-pure-${Date.now()}.json`;
writeFileSync(output, JSON.stringify({ effect: process.env.READER_EFFECT || 'book', count, kind, from, to, inputs, graphics, surfaceLatency, presentation,
  note: 'Release APK. MOVE events queued asynchronously on a fixed wall-clock schedule; DOWN/UP wait for delivery. No UIAutomator between gestures. Initial/final state verified; individual transitions verified separately by reader-release-usb.mjs.' }, null, 2));
console.log(JSON.stringify({ output, passed: count }));
