import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { module, exports: module.exports, Date, ...globals,
    require: name => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return module.exports;
}
const math = load('../lib/readerGestures.ts');
const start = { x: 190, y: 300, width: 390, height: 844, topInset: 24, bottomInset: 20,
  atTop: true, atBottom: true, previous: true, next: true };
const direction = (dx, dy, overrides = {}, horizontal = true, vertical = true) => math.chapterGestureDirection({ ...start, ...overrides }, dx, dy, horizontal, vertical);
assert.equal(direction(-130, 15), 'next');
assert.equal(direction(130, -15), 'previous');
assert.equal(direction(10, -130), 'next');
assert.equal(direction(-10, 130), 'previous');
for (const [dx, dy] of [[15, 0], [100, 100], [-100, 70], [70, -100]]) assert.equal(direction(dx, dy), null);
assert.equal(direction(-130, 0, { x: 12 }), null);
assert.equal(direction(130, 0, { x: 378 }), null);
assert.equal(direction(130, 0, { x: 45, leftInset: 47 }), null);
assert.equal(direction(-130, 0, { x: 345, rightInset: 47 }), null);
assert.equal(direction(-130, 0, { y: 830 }), null);
assert.equal(direction(-130, 0, { y: 20 }), null);
assert.equal(direction(0, -130, { atBottom: false }), null);
assert.equal(direction(0, 130, { atTop: false }), null);
assert.equal(direction(-130, 0, { next: false }), null);
assert.equal(direction(130, 0, { previous: false }), null);
assert.equal(direction(-130, 0, {}, false), null);
assert.equal(direction(0, -130, {}, true, false), null);
for (const sensitivity of ['low', 'medium', 'high']) {
  const { distance } = math.gestureThresholds[sensitivity];
  assert.equal(math.gestureReachedThreshold(distance - 1, 300, sensitivity), false);
  assert.equal(math.gestureReachedThreshold(distance, 300, sensitivity), true);
  assert.equal(math.gestureReachedThreshold(distance, 1500, sensitivity), false);
  assert.equal(math.gestureReachedThreshold(distance, 0, sensitivity), false);
}

let now = 0;
let feedback = null;
const effects = [];
const hook = load('../hooks/useReaderGestures.ts', {
  react: { useCallback: fn => fn, useRef: current => ({ current }), useMemo: fn => fn(), useState: value => [value, next => { feedback = typeof next === 'function' ? next(feedback) : next; }], useEffect: fn => effects.push(fn) },
  'react-native': { Platform: { OS: 'android' }, PanResponder: { create: callbacks => ({ panHandlers: callbacks }) } },
  '../lib/readerGestures': math,
}, { Date: { now: () => now } });
const navigations = [];
const options = { enabled: true, horizontal: true, vertical: true, sensitivity: 'medium', chapterKey: '1', start: () => start, navigate: value => navigations.push(value) };
const { handlers } = hook.useReaderGestures(options);
const event = { nativeEvent: { touches: [{}], pageX: 190, pageY: 300 } };
const gesture = (dx, dy, touches = 1) => ({ dx, dy, numberActiveTouches: touches });
function begin() { now += 2000; handlers.onStartShouldSetPanResponderCapture(event); }
begin(); now += 80;
assert.equal(handlers.onMoveShouldSetPanResponderCapture(event, gesture(-30, 0)), true);
handlers.onPanResponderGrant(); now += 150;
handlers.onPanResponderMove(event, gesture(-100, 0));
assert.equal(feedback.armed, true);
handlers.onPanResponderRelease(event, gesture(-100, 0, 0));
handlers.onPanResponderRelease(event, gesture(-100, 0, 0));
assert.deepEqual(navigations, ['next']);
begin(); now += 80;
assert.equal(handlers.onMoveShouldSetPanResponderCapture(event, gesture(0, -30)), true);
handlers.onPanResponderGrant(); now += 150;
handlers.onPanResponderRelease(event, gesture(0, -100, 0));
assert.deepEqual(navigations, ['next', 'next']);
begin(); now += 500; // Let long-press/selection win.
assert.equal(handlers.onMoveShouldSetPanResponderCapture(event, gesture(-100, 0)), false);
begin(); now += 80;
assert.equal(handlers.onMoveShouldSetPanResponderCapture(event, gesture(-30, 0, 2)), false);
begin(); now += 80;
assert.equal(handlers.onMoveShouldSetPanResponderCapture(event, gesture(-30, 20)), false);
assert.equal(handlers.onMoveShouldSetPanResponderCapture(event, gesture(-120, 0)), false);
begin(); now += 80;
assert.equal(handlers.onMoveShouldSetPanResponderCapture(event, gesture(-30, 0)), true);
handlers.onPanResponderTerminate();
handlers.onPanResponderRelease(event, gesture(-120, 0, 0));
assert.equal(navigations.length, 2);
begin(); now += 80;
assert.equal(handlers.onMoveShouldSetPanResponderCapture(event, gesture(-30, 0)), true);
handlers.onPanResponderGrant();
handlers.onPanResponderStart(event, gesture(-30, 0, 2));
now += 150;
handlers.onPanResponderRelease(event, gesture(-120, 0, 0));
assert.equal(navigations.length, 2); // A briefly added second finger cancels even without a move.
for (const effect of effects) effect()?.();
console.log('PASS: direction, boundary, edge exclusion, sensitivity, long press, multi-touch, diagonal rejection, single release and cleanup');
