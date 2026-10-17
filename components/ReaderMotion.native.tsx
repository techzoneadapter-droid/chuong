import { ElementRef, forwardRef, useCallback, useEffect, useLayoutEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Device from 'expo-device';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedProps, useAnimatedScrollHandler, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming } from 'react-native-reanimated';
import type { ReaderMotionProps } from './ReaderMotion';
import { shouldCompleteTurn, turnDuration } from '../lib/pageTurn';
import { recordReaderElapsed } from '../lib/readerPerformance';

export const ReaderMotion = forwardRef<ScrollView, ReaderMotionProps>(function ReaderMotion({
  contentKey, enabled, horizontal, vertical, previous, next, effect, sensitivity, paper,
  previousPreview, nextPreview, onTurn, motionRef, geometryRef, onScroll, children, ink = '#282326', ...props
}, ref) {
  const scroll = useRef<ElementRef<typeof Animated.ScrollView>>(null);
  const pendingCommand = useRef<(() => void) | null>(null);
  const mounted = useRef(true), latestEnabled = useRef(enabled);
  latestEnabled.current = enabled;
  const latestTurn = useRef(onTurn);
  latestTurn.current = onTurn;
  const dispatchTurn = useCallback((direction: 'previous' | 'next', settleMs: number) => {
    const command = pendingCommand.current;
    pendingCommand.current = null;
    if (!mounted.current || !latestEnabled.current) return;
    recordReaderElapsed('page-turn-settle', settleMs);
    if (command) command(); else latestTurn.current(direction);
  }, []);
  useImperativeHandle(ref, () => scroll.current!, []);
  const { width } = useWindowDimensions();
  const drag = useSharedValue(0), pull = useSharedValue(0), busy = useSharedValue(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; cancelAnimation(drag); cancelAnimation(pull); busy.value = true;
    };
  }, [drag, pull, busy]);
  const offset = useSharedValue(0), maximum = useSharedValue(0), originX = useSharedValue(0), originY = useSharedValue(0);
  const textBottom = useSharedValue(0), viewportHeight = useSharedValue(0), fullHeight = useSharedValue(0);
  useLayoutEffect(() => {
    if (geometryRef) geometryRef.current = bottom => {
      textBottom.value = bottom;
      maximum.value = Math.max(0, Math.min(fullHeight.value, bottom || fullHeight.value) - viewportHeight.value);
    };
    return () => { if (geometryRef) geometryRef.current = null; };
  }, [geometryRef, textBottom, maximum, fullHeight, viewportHeight]);
  const boundary = useSharedValue(0), axis = useSharedValue(0);
  const rejected = useSharedValue(false), pullSign = useSharedValue(0);
  const constrainedDevice = useMemo(() => Platform.OS === 'android' && Device.totalMemory != null
    && Device.totalMemory < 3 * 1024 ** 3 && Boolean(Device.supportedCpuArchitectures?.includes('armeabi-v7a'))
    && !Device.supportedCpuArchitectures?.includes('arm64-v8a'), []);
  const reduced = useSharedValue(false), simple = useSharedValue(constrainedDevice);
  const degrade = useSharedValue(false);
  const slow = useSharedValue(0), frames = useSharedValue(0), reported = useSharedValue(0);
  const threshold = sensitivity === 'low' ? 96 : sensitivity === 'high' ? 48 : 64;
  useEffect(() => {
    if (!__DEV__ || !enabled) return;
    const host = globalThis as typeof globalThis & { __CHUONG_READER_MOTION__?: unknown };
    const diagnostics = { report: () => ({ contentKey, effect, busy: busy.value, fallback: simple.value,
      animationFrames: frames.value, slowFramesOver25Ms: slow.value, offset: offset.value, maximum: maximum.value,
      hasNextPage: Boolean(nextPreview), hasPreviousPage: Boolean(previousPreview) }) };
    host.__CHUONG_READER_MOTION__ = diagnostics;
    return () => { if (host.__CHUONG_READER_MOTION__ === diagnostics) delete host.__CHUONG_READER_MOTION__; };
  }, [contentKey, effect, busy, simple, frames, slow, offset, maximum, nextPreview, previousPreview, enabled]);
  useLayoutEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) reduced.value = value; });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduced.value = value; });
    return () => { active = false; listener.remove(); };
  }, [reduced]);
  useLayoutEffect(() => {
    cancelAnimation(drag); cancelAnimation(pull);
    drag.value = 0; pull.value = 0; busy.value = false; axis.value = 0;
  }, [contentKey, enabled, effect, width, drag, pull, busy, axis]);
  // Fall back for the remainder of this reader session after sustained missed frames.
  const frameMeter = useFrameCallback(frame => {
    if (!axis.value || simple.value) return;
    frames.value++;
    if ((frame.timeSincePreviousFrame ?? 0) > 25) slow.value++;
    if (frames.value >= 30 && slow.value / frames.value > .2) degrade.value = true;
  }, false);
  useEffect(() => {
    frameMeter.setActive(enabled && !constrainedDevice && effect === 'book');
    return () => frameMeter.setActive(false);
  }, [frameMeter, enabled, constrainedDevice, effect]);
  const native = useMemo(() => Gesture.Native(), []);
  const finish = useCallback((distance: number, velocity: number, verticalTurn: boolean) => {
    'worklet';
    if (busy.value) return;
    const direction = distance < 0 ? 'next' : 'previous';
    const allowed = direction === 'next' ? next : previous;
    const complete = !rejected.value && allowed && (!verticalTurn || !pullSign.value || Math.sign(distance) === pullSign.value)
      && shouldCompleteTurn(distance, velocity, threshold);
    busy.value = true;
    const value = verticalTurn ? pull : drag;
    const duration = reduced.value || effect === 'none' ? 0 : turnDuration(velocity);
    const releasedAt = Date.now();
    value.value = withTiming(complete ? (verticalTurn ? Math.sign(distance) * 48 : Math.sign(distance) * width) : 0,
      { duration, easing: Easing.out(Easing.cubic) }, finished => {
        axis.value = 0;
        if (degrade.value) simple.value = true;
        if (finished && complete) runOnJS(dispatchTurn)(direction, Date.now() - releasedAt);
        else busy.value = false;
      });
  }, [busy, previous, next, rejected, pullSign, threshold, pull, drag, reduced, effect, width, axis, degrade, simple, dispatchTurn]);
  useEffect(() => {
    if (!motionRef) return;
    motionRef.current = (direction, commit) => {
      if (!enabled || busy.value) return;
      rejected.value = false; pullSign.value = 0;
      pendingCommand.current = commit;
      finish(direction === 'next' ? -width : width, 0, vertical);
    };
  });
  useEffect(() => () => { if (motionRef) motionRef.current = null; pendingCommand.current = null; }, [motionRef]);
  const horizontalPan = useMemo(() => Gesture.Pan().enabled(enabled && horizontal).maxPointers(1)
    .activeOffsetX([-18, 18]).failOffsetY([-12, 12]).simultaneousWithExternalGesture(native)
    .onBegin(() => { rejected.value = busy.value; })
    .onTouchesDown((event, manager) => {
      if (event.allTouches.length > 1 || (textBottom.value > 0 && event.allTouches[0]
        && offset.value + event.allTouches[0].y > textBottom.value + 64)) {
        rejected.value = true; manager.fail();
      }
    })
    .onStart(() => { if (!busy.value && !rejected.value) axis.value = 1; })
    .onUpdate(event => {
      if (busy.value || rejected.value || effect === 'none' || reduced.value) return;
      const allowed = event.translationX < 0 ? next : previous;
      drag.value = allowed ? event.translationX : event.translationX * .12;
    })
    .onEnd((event, success) => { if (success) finish(event.translationX, event.velocityX, false); })
    .onFinalize((_event, success) => { if (!success && !busy.value) { drag.value = withTiming(0, { duration: 200 }); axis.value = 0; } }),
    [enabled, horizontal, native, rejected, busy, axis, next, previous, drag, finish, textBottom, offset, effect, reduced]);
  // Acquire only a NEW pull that starts at an edge. Reaching an edge while scrolling
  // never arms navigation. Native scroll and this recognizer see the same touch stream.
  const verticalPan = useMemo(() => Gesture.Pan().enabled(enabled && vertical).manualActivation(true).maxPointers(1)
    .simultaneousWithExternalGesture(native)
    .onTouchesDown((event, manager) => {
      if (event.allTouches.length !== 1) rejected.value = true;
      if (busy.value || event.allTouches.length !== 1) { manager.fail(); return; }
      if (textBottom.value > 0 && offset.value + event.allTouches[0].y > textBottom.value + 64) { manager.fail(); return; }
      rejected.value = false; pullSign.value = 0;
      originX.value = event.allTouches[0].absoluteX; originY.value = event.allTouches[0].absoluteY;
      boundary.value = (offset.value <= 2 && previous ? 1 : 0) + (offset.value >= maximum.value - 2 && next ? 2 : 0);
      if (!boundary.value) manager.fail();
    })
    .onTouchesMove((event, manager) => {
      if (event.allTouches.length !== 1 || busy.value) { rejected.value = true; manager.fail(); return; }
      const dx = event.allTouches[0].absoluteX - originX.value, dy = event.allTouches[0].absoluteY - originY.value;
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) { manager.fail(); return; }
      if (Math.abs(dy) < 10) return;
      if ((dy > 0 && (boundary.value === 1 || boundary.value === 3)) || (dy < 0 && boundary.value >= 2)) manager.activate();
      else manager.fail();
    })
    .onStart(event => { axis.value = 2; pullSign.value = Math.sign(event.translationY); })
    .onUpdate(event => { if (!busy.value) pull.value = effect === 'none' || reduced.value ? Math.sign(event.translationY) : event.translationY; })
    .onEnd((event, success) => { if (success) finish(event.translationY, event.velocityY, true); })
    .onFinalize((_event, success) => { if (!success && !busy.value) { pull.value = withTiming(0, { duration: 200 }); axis.value = 0; } }),
    [enabled, vertical, native, rejected, busy, pullSign, originX, originY, boundary, offset, previous, maximum, next, axis, pull, finish, textBottom, effect, reduced]);
  const gestures = useMemo(() => Gesture.Race(horizontalPan, verticalPan), [horizontalPan, verticalPan]);
  const reportScroll = (y: number, height: number, viewport: number) => {
    onScroll?.({ nativeEvent: { contentOffset: { x: 0, y }, contentSize: { width, height }, layoutMeasurement: { width, height: viewport } } } as Parameters<NonNullable<typeof onScroll>>[0]);
  };
  const scrollHandler = useAnimatedScrollHandler(event => {
    offset.value = event.contentOffset.y;
    viewportHeight.value = event.layoutMeasurement.height; fullHeight.value = event.contentSize.height;
    maximum.value = Math.max(0, Math.min(event.contentSize.height, textBottom.value || event.contentSize.height) - event.layoutMeasurement.height);
    const now = Date.now();
    if (now - reported.value > 120 || offset.value <= 2 || offset.value >= maximum.value - 2) {
      reported.value = now; runOnJS(reportScroll)(offset.value, event.contentSize.height, event.layoutMeasurement.height);
    }
  });
  const front = useAnimatedStyle(() => {
    if (effect === 'none' || reduced.value) return { transform: [{ translateX: 0 }, { translateY: 0 }, { rotateY: '0deg' }] };
    const x = Math.max(-width, Math.min(width, drag.value));
    const flip = effect === 'book' && !simple.value && !vertical;
    const y = Math.max(-40, Math.min(40, pull.value * .25));
    if (!flip) return { transform: [{ translateX: x }, { translateY: y }] };
    const pivot = x < 0 ? -width / 2 : width / 2;
    return { transform: [
      { perspective: width * 2 }, { translateX: x * (flip ? .7 : 1) },
      { translateX: pivot }, { rotateY: `${flip ? -x / width * 48 : 0}deg` }, { translateX: -pivot },
      { translateY: y },
    ] };
  });
  const nextStyle = useAnimatedStyle(() => ({ opacity: effect !== 'none' && !reduced.value && drag.value < -1 ? 1 : 0 }));
  const previousStyle = useAnimatedStyle(() => ({ opacity: effect !== 'none' && !reduced.value && drag.value > 1 ? 1 : 0 }));
  const hasNextPreview = Boolean(nextPreview), hasPreviousPreview = Boolean(previousPreview);
  const placeholder = useAnimatedStyle(() => ({ opacity: drag.value < 0 ? (hasNextPreview ? 0 : 1) : (hasPreviousPreview ? 0 : 1) }));
  const shadow = useAnimatedStyle(() => {
    if (effect !== 'book' || simple.value || reduced.value) return { opacity: 0, transform: [{ translateX: 0 }] };
    return { opacity: Math.min(.2, Math.abs(drag.value) / width * .4), transform: [{ translateX: drag.value * .7 - (drag.value > 0 ? width - 16 : 0) }] };
  });
  const hint = useAnimatedStyle(() => ({ opacity: axis.value === 2 ? 1 : 0 }));
  const nextHint = useAnimatedStyle(() => ({ opacity: pull.value < 0 ? 1 : 0 }));
  const previousHint = useAnimatedStyle(() => ({ opacity: pull.value > 0 ? 1 : 0 }));
  // Fast UI-prop transforms do not update Fabric hit testing. The resting transform
  // is always identity, and child controls cannot receive taps while it is moving.
  const inputProps = useAnimatedProps(() => ({ pointerEvents: busy.value ? 'none' as const : 'auto' as const }));
  return <GestureDetector gesture={gestures}>
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: paper }}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <Animated.View style={[{ paddingTop: 120, alignItems: 'center' }, placeholder]}><Text style={{ color: ink }}>Đang mở trang…</Text></Animated.View>
        <Animated.View renderToHardwareTextureAndroid={hasNextPreview && effect !== 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: paper }, nextStyle]}>{nextPreview}</Animated.View>
        <Animated.View renderToHardwareTextureAndroid={hasPreviousPreview && effect !== 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: paper }, previousStyle]}>{previousPreview}</Animated.View>
      </View>
      <Animated.View animatedProps={inputProps} renderToHardwareTextureAndroid={effect === 'book'} style={[{ flex: 1, backgroundColor: paper }, front]}>
        <GestureDetector gesture={native}><Animated.ScrollView {...props} ref={scroll} onScroll={scrollHandler} scrollEventThrottle={16}
          onLayout={event => { viewportHeight.value = event.nativeEvent.layout.height; maximum.value = Math.max(0, Math.min(fullHeight.value, textBottom.value || fullHeight.value) - viewportHeight.value); props.onLayout?.(event); }}
          onContentSizeChange={(w, h) => { fullHeight.value = h; maximum.value = Math.max(0, Math.min(h, textBottom.value || h) - viewportHeight.value); props.onContentSizeChange?.(w, h); }}
        >{children}</Animated.ScrollView></GestureDetector>
      </Animated.View>
      <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', top: 0, bottom: 0, width: 16, right: 0 }, shadow]}>
        {[.12, .25, .45, .8].map((opacity, index) => <View key={index} style={{ position: 'absolute', top: 0, bottom: 0, left: index * 4, width: 4, backgroundColor: '#30251A', opacity }} />)}
      </Animated.View>
      <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', top: 80, left: 20, right: 20, alignItems: 'center' }, hint]}>
        <Animated.View style={[{ position: 'absolute', backgroundColor: paper, padding: 12, borderRadius: 16 }, nextHint]}><Text style={{ color: ink }}>Vuốt tiếp để sang chương sau</Text></Animated.View>
        <Animated.View style={[{ position: 'absolute', backgroundColor: paper, padding: 12, borderRadius: 16 }, previousHint]}><Text style={{ color: ink }}>Vuốt để về chương trước</Text></Animated.View>
      </Animated.View>
    </View>
  </GestureDetector>;
});
