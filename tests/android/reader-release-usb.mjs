import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
const execute = promisify(execFile), adb = process.env.ADB || 'D:\\Android\\Sdk\\platform-tools\\adb.exe';
const serial = process.env.ANDROID_SERIAL || '5dabf420';
const mode = process.argv[2] || 'report', count = Number(process.argv[3] || 30);
const effect = process.env.READER_EFFECT || 'book';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const shell = async (...args) => (await execute(adb, ['-s', serial, 'shell', ...args], { timeout: 25000, maxBuffer: 2 ** 22 })).stdout;
async function nodes() {
  const output = await shell('uiautomator', 'dump', '/sdcard/chuong-reader-ui.xml');
  assert.match(output, /dumped to/, 'Android must expose an idle, unlocked app window');
  const xml = await shell('cat', '/sdcard/chuong-reader-ui.xml');
  return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute => [attribute[1], attribute[2]])));
}
function state(list) {
  const texts = list.map(node => node.text).filter(Boolean);
  const chapter = texts.map(text => text.match(/^Chương (\d+) · (\d+)%/)).find(Boolean);
  const page = texts.map(text => text.match(/Lật trang · (\d+)\/(\d+)/)).find(Boolean);
  assert.ok(chapter, 'Keep the reader controls visible');
  const body = list.find(node => node['resource-id']?.endsWith('reader-gesture-content'));
  return { chapter: Number(chapter[1]), progress: Number(chapter[2]), page: page ? Number(page[1]) : null, total: page ? Number(page[2]) : null,
    textBottom: body ? Number(body.bounds.match(/\d+/g).at(-1)) : null, viewportBottom: Number(list[0].bounds.match(/\d+/g).at(-1)) };
}
function center(node) {
  assert.ok(node, 'Requested control must be visible');
  const [x1, y1, x2, y2] = node.bounds.match(/\d+/g).map(Number);
  assert.ok(x2 > x1 && y2 > y1);
  return [String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2))];
}
const tap = async (list, label) => shell('input', 'tap', ...center(list.find(node => node['content-desc'] === label) || list.find(node => node.text === label)));
const gesture = (kind = 'swipe', dx = -480, dy = 0, duration = 260, x = 620, y = 250) => shell('CLASSPATH=/data/local/tmp/chuong-reader-touch.jar', 'app_process', '/', 'ReaderTouch', kind, String(x), String(y), String(dx), String(dy), String(duration));
function assertNext(from, to) {
  if (from.page && from.page < from.total) { assert.equal(to.chapter, from.chapter); assert.equal(to.page, from.page + 1); }
  else { assert.equal(to.chapter, from.chapter + 1); if (from.page) assert.equal(to.page, 1); }
}
function assertPrevious(from, to) {
  if (from.page > 1) { assert.equal(to.chapter, from.chapter); assert.equal(to.page, from.page - 1); }
  else { assert.equal(to.chapter, from.chapter - 1); if (from.page) assert.equal(to.page, to.total); }
}
async function configure(readingMode = mode === 'pages' ? 'page' : 'scroll') {
  await tap(await nodes(), 'Giao diện');
  let list = await nodes();
  const modeLabel = readingMode === 'page' ? 'Lật trang' : 'Cuộn dọc';
  const effectLabel = { book: 'Lật sách 3D', slide: 'Trượt mượt', none: 'Không hiệu ứng' }[effect];
  await tap(list, modeLabel); await tap(list, effectLabel);
  list = await nodes();
  assert.equal(list.find(node => node['content-desc'] === modeLabel)?.checked, 'true');
  assert.equal(list.find(node => node['content-desc'] === effectLabel)?.checked, 'true');
  const horizontal = list.find(node => node['content-desc'] === 'Vuốt ngang chuyển chương');
  if (horizontal?.checked === 'false') await shell('input', 'tap', ...center(horizontal));
  await shell('input', 'keyevent', 'BACK');
}
const samples = [];
if (mode === 'report') console.log(JSON.stringify(state(await nodes())));
else {
  if (['pages', 'chapters'].includes(mode)) await configure();
  await shell('dumpsys', 'gfxinfo', 'vn.chuong.app', 'reset');
  if (['back', 'edges', 'buttons'].includes(mode)) {
    const from = state(await nodes()); assert.ok(from.page, 'Choose page mode first');
    if (mode === 'back') {
      await gesture('swipe', 480, 0, 260, 160, 250);
      const to = state(await nodes()); assertPrevious(from, to); samples.push({ scenario: mode, from, to, passed: true });
    } else if (mode === 'edges') {
      await shell('input', 'tap', '755', '250');
      const next = state(await nodes()); assertNext(from, next);
      await shell('input', 'tap', '45', '250');
      const previous = state(await nodes()); assertPrevious(next, previous);
      assert.equal(previous.chapter, from.chapter); assert.equal(previous.page, from.page);
      samples.push({ scenario: mode, from, next, previous, passed: true });
    } else {
      let list;
      for (let i = 0; i < 6; i++) {
        list = await nodes();
        const button = list.find(node => node.text === 'Trang sau');
        const bounds = button?.bounds.match(/\d+/g).map(Number);
        if (bounds && bounds[1] > 120 && bounds[3] < 1185 && bounds[3] > bounds[1]) break;
        await gesture('swipe', 0, -700, 300, 400, 1050);
      }
      await tap(list, 'Trang sau');
      const to = state(await nodes()); assertNext(from, to); samples.push({ scenario: mode, from, to, passed: true });
    }
  } else if (['reverse', 'multi', 'cancel', 'short', 'slow', 'fast', 'burst'].includes(mode)) {
    const from = state(await nodes());
    await gesture(['short', 'slow', 'fast'].includes(mode) ? 'swipe' : mode, mode === 'short' ? -40 : -380, 0, mode === 'slow' ? 1000 : mode === 'fast' ? 60 : 300);
    const to = state(await nodes());
    if (['slow', 'fast', 'burst'].includes(mode)) {
      assertNext(from, to);
    } else { assert.equal(to.chapter, from.chapter); assert.equal(to.page, from.page); }
    samples.push({ scenario: mode, from, to, passed: true });
  } else if (mode === 'modeposition') {
    const from = state(await nodes()); assert.ok(from.page, 'Choose page mode first');
    await configure('scroll');
    // A tiny real scroll forces the header to reflect the native offset, rather
    // than accepting a stale percentage left over from the previous mode.
    await gesture('swipe', 0, -24, 350, 400, 1000);
    const vertical = state(await nodes());
    assert.equal(vertical.chapter, from.chapter); assert.equal(vertical.page, null);
    assert.ok(Math.abs(vertical.progress - from.progress) <= 2, `Changing mode must retain native progress: expected ${from.progress}, got ${vertical.progress}`);
    await configure('page');
    const to = state(await nodes()); assert.equal(to.chapter, from.chapter); assert.equal(to.page, from.page);
    samples.push({ scenario: mode, from, vertical, to, passed: true });
  } else if (mode === 'longscroll') {
    const from = state(await nodes()); assert.equal(from.page, null, 'Choose vertical mode first');
    let previous = from;
    for (const dy of [-700, 700, 700, -700, -700, 700]) {
      await gesture('swipe', 0, dy, 350, 400, dy < 0 ? 1050 : 400);
      const to = state(await nodes()); assert.equal(to.chapter, from.chapter);
      samples.push({ from: previous, to }); previous = to;
    }
    assert.ok(samples.some(sample => sample.to.progress > sample.from.progress), 'Long text must scroll toward its end');
    assert.ok(samples.some(sample => sample.to.progress < sample.from.progress), 'Long text must scroll toward its beginning');
  } else if (mode === 'comments') {
    const from = state(await nodes()); assert.equal(from.page, null);
    for (let i = 0; i < 4; i++) {
      await gesture('swipe', 0, -700, 300, 400, 1050);
      assert.equal(state(await nodes()).chapter, from.chapter, 'scrolling discussion must not change chapter');
    }
    samples.push({ scenario: mode, passed: true });
  } else if (mode === 'boundary') {
    const from = state(await nodes()); assert.equal(from.page, null, 'Choose vertical mode first');
    let position = from;
    assert.ok(position.textBottom !== null, 'Reader text bounds must be accessible');
    for (let i = 0; i < 12 && position.textBottom >= position.viewportBottom - 1; i++) {
      await gesture('swipe', 0, -700, 300, 400, 1050);
      position = state(await nodes());
      assert.equal(position.chapter, from.chapter, 'ordinary scrolling to an edge must not navigate');
    }
    await gesture('swipe', 0, -150, 350, 400, Math.max(180, Math.min(900, position.textBottom - 50)));
    const next = state(await nodes()); assert.equal(next.chapter, from.chapter + 1);
    await gesture('swipe', 0, 200, 350, 400, 500);
    const previous = state(await nodes()); assert.equal(previous.chapter, from.chapter);
    samples.push({ scenario: 'boundary', from, next, previous, passed: true });
  } else {
    let from = state(await nodes());
    for (let i = 0; i < count; i++) {
      const started = performance.now(); await gesture();
      const to = state(await nodes());
      if (mode === 'pages' && from.page < from.total) {
        assert.equal(to.chapter, from.chapter); assert.equal(to.page, from.page + 1);
      } else { assert.equal(to.chapter, from.chapter + 1); if (mode === 'pages') assert.equal(to.page, 1); }
      samples.push({ from, to, touchAndAutomationMs: Math.round(performance.now() - started) });
      from = to; console.log(JSON.stringify({ step: i + 1, ...samples.at(-1) }));
    }
  }
  const graphics = await shell('dumpsys', 'gfxinfo', 'vn.chuong.app');
  const output = process.env.NATIVE_REPORT || `.cache/page-turn-release-${effect}-${mode}-${Date.now()}.json`;
  writeFileSync(output, JSON.stringify({ mode, effect, samples, graphics,
    note: 'Actual Android input events and UIAutomator assertions in release APK. Automation durations include app_process startup and UIAutomator idle/tree overhead and are not page animation latency.' }, null, 2));
  console.log(JSON.stringify({ output, passed: samples.length }));
}
