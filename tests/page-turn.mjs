import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module, exports: module.exports, Date, __DEV__: false, require: key => { assert.ok(key in dependencies, key); return dependencies[key]; } });
  return module.exports;
}
const turn = load('../lib/pageTurn.ts');
for (const sign of [-1, 1]) {
  assert.equal(turn.shouldCompleteTurn(sign * 63, sign * 2000, 64), false);
  assert.equal(turn.shouldCompleteTurn(sign * 65, sign * 10, 64), true);
  assert.equal(turn.shouldCompleteTurn(sign * 120, -sign * 100, 64), false);
  for (const velocity of [0, 100, 1000, 5000]) assert.ok(turn.turnDuration(sign * velocity) >= 200 && turn.turnDuration(sign * velocity) <= 350);
}
const { paginateReader } = load('../lib/readerPagination.ts');
for (const paragraph of ['word '.repeat(15000), '字'.repeat(50000), '😀'.repeat(30000)]) {
  const pages = paginateReader([paragraph], 800);
  assert.equal(pages.flat().join(''), paragraph);
  assert.ok(pages.every(page => page.join('').length <= 800));
  assert.ok(pages.flat().every(chunk => !/[\uD800-\uDBFF]$/.test(chunk)));
}
const callbacks = [], effects = [], values = [];
const completions = [];
let deferCompletion = false;
let scrollHandler;
const device = { totalMemory: 8 * 1024 ** 3, supportedCpuArchitectures: ['arm64-v8a'] };
const builder = () => {
  const handlers = {};
  const proxy = new Proxy(handlers, { get: (_, name) => (...args) => { handlers[name] = args[0]; return proxy; } });
  callbacks.push(handlers); return proxy;
};
const jsx = (type, props) => ({ type, props });
const native = load('../components/ReaderMotion.native.tsx', {
  react: { forwardRef: fn => fn, useRef: current => ({ current }), useMemo: fn => fn(), useCallback: fn => fn, useImperativeHandle() {}, useEffect: fn => effects.push(fn), useLayoutEffect: fn => effects.push(fn) },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { Platform: { OS: 'android' }, AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove() {} }) }, StyleSheet: { absoluteFill: {} }, useWindowDimensions: () => ({ width: 400 }), View: 'View', Text: 'Text' },
  'expo-device': device,
  'react-native-gesture-handler': { Gesture: { Native: () => ({}), Pan: builder, Race: (...args) => args }, GestureDetector: 'GestureDetector' },
  'react-native-reanimated': { default: { View: 'View', ScrollView: 'ScrollView' }, useSharedValue: value => { const box = { value }; values.push(box); return box; },
    useAnimatedStyle: fn => fn(), useAnimatedProps: fn => fn(), useAnimatedScrollHandler: fn => { scrollHandler = fn; return fn; }, useFrameCallback: () => ({ setActive() {} }), cancelAnimation() {}, Easing: { out: x => x, cubic: 1 }, runOnJS: fn => fn, withTiming: (value, _, done) => { if (deferCompletion) completions.push(done); else done?.(true); return value; } },
  '../lib/pageTurn': turn,
  '../lib/readerPerformance': { recordReaderElapsed() {} },
});
function setup(overrides = {}) {
  callbacks.length = 0; effects.length = 0; values.length = 0;
  const turns = [];
  const rendering = native.ReaderMotion({ contentKey: 'chapter:1', enabled: true, horizontal: true, vertical: true, previous: true, next: true, effect: 'book', sensitivity: 'medium', paper: '#fff', onTurn: direction => turns.push(direction), ...overrides }, null);
  const cleanups = effects.map(fn => fn());
  return { horizontal: callbacks[0], vertical: callbacks[1], turns, rendering, unmount: () => cleanups.forEach(fn => fn?.()) };
}
const touch = (x, y, count = 1) => ({ allTouches: Array.from({ length: count }, () => ({ x, y, absoluteX: x, absoluteY: y })) });
let state = setup(), activated = 0, failed = 0;
const manager = { activate: () => activated++, fail: () => failed++ };
scrollHandler({ contentOffset: { y: 300 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 600 } });
state.vertical.onTouchesDown(touch(200, 400), manager);
assert.equal(failed, 1); assert.equal(activated, 0); assert.equal(state.turns.length, 0);
state = setup(); activated = 0; failed = 0;
scrollHandler({ contentOffset: { y: 1400 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 600 } });
state.vertical.onTouchesDown(touch(200, 400), manager);
state.vertical.onTouchesMove(touch(200, 380), manager);
assert.equal(activated, 1);
state.vertical.onStart({ translationY: -20 });
state.vertical.onEnd({ translationY: -100, velocityY: -200 }, true);
assert.deepEqual(state.turns, ['next']);
state.vertical.onEnd({ translationY: -200, velocityY: -200 }, true);
assert.equal(state.turns.length, 1, 'one transition while busy');
state = setup();
scrollHandler({ contentOffset: { y: 1400 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 600 } });
state.vertical.onTouchesDown(touch(200, 400), manager);
state.vertical.onTouchesMove(touch(200, 380), manager);
state.vertical.onStart({ translationY: -20 });
state.vertical.onEnd({ translationY: -100, velocityY: -200 }, false);
state.vertical.onFinalize({}, false);
assert.equal(state.turns.length, 0, 'cancelled vertical onEnd cannot advance a chapter');
for (const cancelled of ['short', 'reverse', 'multitouch', 'terminated']) {
  state = setup(); state.horizontal.onBegin(); state.horizontal.onStart();
  if (cancelled === 'multitouch') state.horizontal.onTouchesDown(touch(200, 300, 2), manager);
  if (cancelled === 'terminated') {
    state.horizontal.onEnd({ translationX: -140, velocityX: -100 }, false);
    state.horizontal.onFinalize({}, false);
  } else state.horizontal.onEnd({ translationX: cancelled === 'short' ? -30 : -140, velocityX: cancelled === 'reverse' ? 200 : -100 }, true);
  assert.equal(state.turns.length, 0, cancelled);
}
state = setup(); state.horizontal.onBegin(); state.horizontal.onStart();
state.horizontal.onEnd({ translationX: -140, velocityX: -100 }, true);
state.horizontal.onBegin(); // A new finger arrives while the first turn is settling/loading.
state.horizontal.onStart();
values[2].value = false; // First navigation becomes ready before the second finger releases.
state.horizontal.onEnd({ translationX: -140, velocityX: -100 }, true);
assert.equal(state.turns.length, 1, 'a gesture started while busy stays rejected after readiness changes');
const instant = setup({ effect: 'none' }).rendering.props.children.props.children[1].props.style[1];
assert.equal(instant.transform[0].translateX, 0);
assert.equal(instant.transform[1].translateY, 0);
assert.equal(instant.transform[2].rotateY, '0deg', 'switching effects must explicitly clear the previous transform');
state = setup(); deferCompletion = true;
state.horizontal.onBegin(); state.horizontal.onStart();
state.horizontal.onEnd({ translationX: -140, velocityX: -100 }, true);
state.unmount(); completions.splice(0).forEach(fn => fn?.(true)); deferCompletion = false;
assert.equal(state.turns.length, 0, 'a late UI completion cannot navigate after leaving the reader');
const geometryRef = { current: null };
state = setup({ geometryRef });
scrollHandler({ contentOffset: { y: 900 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 600 } });
geometryRef.current(300);
const priorFailures = failed;
state.vertical.onTouchesDown(touch(200, 500), manager);
state.horizontal.onTouchesDown(touch(200, 500), manager);
assert.equal(failed, priorFailures + 2, 'discussion area scrolling and selection never acquire reader navigation');
let quality = setup({ effect: 'book', vertical: false }).rendering.props.children.props.children[1].props.style[1];
assert.ok(quality.transform.some(item => item.perspective), 'capable devices retain the book perspective');
device.totalMemory = 2 * 1024 ** 3; device.supportedCpuArchitectures = ['armeabi-v7a', 'armeabi'];
quality = setup({ effect: 'book', vertical: false }).rendering.props.children.props.children[1].props.style[1];
assert.equal(quality.transform.some(item => item.perspective), false, 'low-memory 32-bit Android uses a genuinely flat transform');
state = setup({ effect: 'none' }); state.horizontal.onBegin(); state.horizontal.onStart();
for (let i = 1; i <= 200; i++) state.horizontal.onUpdate({ translationX: -i });
assert.equal(values[0].value, 0, 'no-effect mode performs no pixel-by-pixel drag updates');
state.horizontal.onEnd({ translationX: -140, velocityX: -100 }, true);
assert.deepEqual(state.turns, ['next'], 'no-effect mode still honors the release threshold');
console.log('PASS: native boundary ownership, short/reverse/multitouch/cancelled pulls, duplicate navigation lock, bounded lossless long-paragraph pagination and turn durations');
