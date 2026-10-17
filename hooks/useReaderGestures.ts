import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, View } from 'react-native';
import { ChapterDirection, chapterGestureDirection, GestureStart, GestureSensitivity, gestureReachedThreshold } from '../lib/readerGestures';

type Options = {
  enabled: boolean; horizontal: boolean; vertical: boolean; sensitivity: GestureSensitivity;
  chapterKey: string; start: () => GestureStart; navigate: (direction: ChapterDirection, releasedAt?: number) => void;
};

// Claim only a decisive, single-finger gesture that began in the reading text region.
export function useReaderGestures(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const session = useRef<{ start: GestureStart; time: number; direction: ChapterDirection | null; axis: 'x' | 'y' | null; rejected: boolean; scrolling: boolean; originY: number; grantX: number; grantY: number; claimed: boolean } | null>(null);
  const [feedback, setFeedback] = useState<{ direction: ChapterDirection; armed: boolean } | null>(null);
  const feedbackRef = useRef<typeof feedback>(null);
  const publish = (next: typeof feedback) => {
    if (feedbackRef.current?.direction === next?.direction && feedbackRef.current?.armed === next?.armed) return;
    feedbackRef.current = next;
    setFeedback(next);
  };
  const directionFor = (dx: number, dy: number) => {
    const current = session.current;
    if (!current) return null;
    if (!current.direction && Math.abs(dy) >= 6 && Math.abs(dy) > Math.abs(dx) * 2) {
      current.scrolling = true;
      const boundary = latest.current.start();
      if ((!current.start.atBottom && boundary.atBottom && dy < 0) || (!current.start.atTop && boundary.atTop && dy > 0)) {
        current.originY = dy;
        current.time = Date.now();
      }
      current.start.atTop = boundary.atTop;
      current.start.atBottom = boundary.atBottom;
    }
    return chapterGestureDirection(current.start, dx, dy - current.originY, latest.current.horizontal, latest.current.vertical);
  };
  const removeWebListener = useRef<(() => void) | null>(null);
  // Browser panning otherwise cancels touch delivery before the JS responder can finish a pull.
  // Prevent only a recognized chapter swipe/pull, never ordinary scrolling or selection.
  const bindWeb = useCallback((view: View | null) => {
    removeWebListener.current?.();
    removeWebListener.current = null;
    if (Platform.OS !== 'web' || !view) return;
    const node = view as unknown as HTMLElement;
    const onMove = (event: TouchEvent) => {
      const current = session.current;
      if (!current || current.rejected || !latest.current.enabled || event.touches.length !== 1
        || (!current.direction && !current.scrolling && Date.now() - current.time > 350) || window.getSelection()?.toString()) return;
      const touch = event.touches[0];
      const direction = directionFor(touch.pageX - current.start.x, touch.pageY - current.start.y);
      if (direction) {
        if (event.cancelable) event.preventDefault();
        if (!current.claimed) {
          if (!current.direction) {
            current.direction = direction;
            current.axis = Math.abs(touch.pageX - current.start.x) > Math.abs(touch.pageY - current.start.y) ? 'x' : 'y';
          }
          const distance = current.axis === 'x' ? touch.pageX - current.start.x : touch.pageY - current.start.y - current.originY;
          publish({ direction: current.direction, armed: direction === current.direction && gestureReachedThreshold(distance, Date.now() - current.time, latest.current.sensitivity) });
        }
      } else if (current.direction && !current.claimed) publish({ direction: current.direction, armed: false });
    };
    const onEnd = (event: TouchEvent) => {
      const current = session.current;
      if (!current || current.claimed) return;
      const touch = event.changedTouches[0];
      const direction = touch && chapterGestureDirection(current.start, touch.pageX - current.start.x, touch.pageY - current.start.y - current.originY, latest.current.horizontal, latest.current.vertical);
      const distance = touch && (current.axis === 'x' ? touch.pageX - current.start.x : touch.pageY - current.start.y - current.originY);
      const navigate = !current.rejected && latest.current.enabled && event.touches.length === 0 && direction === current.direction
        && direction && gestureReachedThreshold(distance, Date.now() - current.time, latest.current.sensitivity) && !window.getSelection()?.toString();
      clear();
      if (navigate && direction) latest.current.navigate(direction, performance.now());
    };
    const onCancel = () => clear();
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd);
    node.addEventListener('touchcancel', onCancel);
    removeWebListener.current = () => { node.removeEventListener('touchmove', onMove); node.removeEventListener('touchend', onEnd); node.removeEventListener('touchcancel', onCancel); };
  }, []);
  const clear = () => { session.current = null; publish(null); };
  const responders = useMemo<Parameters<typeof PanResponder.create>[0]>(() => ({
    onStartShouldSetPanResponderCapture: (event) => {
      clear();
      if (latest.current.enabled && event.nativeEvent.touches.length === 1) {
        session.current = { start: { ...latest.current.start(), x: event.nativeEvent.pageX, y: event.nativeEvent.pageY },
          time: Date.now(), direction: null, axis: null, rejected: false, scrolling: false, originY: 0, grantX: 0, grantY: 0, claimed: false };
      }
      return false;
    },
    onMoveShouldSetPanResponderCapture: (_, gesture) => {
      const current = session.current;
      if (!current || current.rejected || !latest.current.enabled) return false;
      if (gesture.numberActiveTouches !== 1 || (!current.scrolling && Date.now() - current.time > 350)
        || (Platform.OS === 'web' && typeof window !== 'undefined' && Boolean(window.getSelection()?.toString()))) {
        current.rejected = true;
        return false;
      }
      const direction = directionFor(gesture.dx, gesture.dy);
      // Keep normal scrolling native; only acquire navigation after a deliberate pull at the live boundary.
      if (!direction && !current.scrolling && Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) >= 24) current.rejected = true;
      if (!direction) return false;
      current.direction = direction;
      current.axis = Math.abs(gesture.dx) > Math.abs(gesture.dy) ? 'x' : 'y';
      return true;
    },
    onPanResponderGrant: (event) => {
      const current = session.current;
      if (current) current.claimed = true;
      // PanResponder resets dx/dy on grant; retain the distance already moved before acquisition.
      if (current && event) { current.grantX = event.nativeEvent.pageX - current.start.x; current.grantY = event.nativeEvent.pageY - current.start.y; }
      if (current?.direction) publish({ direction: current.direction, armed: false });
    },
    onPanResponderStart: (_, gesture) => {
      if (gesture.numberActiveTouches !== 1) {
        if (session.current) session.current.rejected = true;
        publish(null);
      }
    },
    onPanResponderMove: (_, gesture) => {
      const current = session.current;
      if (!current?.direction || !latest.current.enabled || gesture.numberActiveTouches !== 1) {
        if (current) current.rejected = true;
        publish(null);
        return;
      }
      const dx = gesture.dx + current.grantX, dy = gesture.dy + current.grantY - current.originY;
      const direction = chapterGestureDirection(current.start, dx, dy, latest.current.horizontal, latest.current.vertical);
      const distance = current.axis === 'x' ? dx : dy;
      const armed = !current.rejected && direction === current.direction
        && gestureReachedThreshold(distance, Date.now() - current.time, latest.current.sensitivity);
      publish({ direction: current.direction!, armed });
    },
    onPanResponderRelease: (_, gesture) => {
      const releasedAt = typeof performance === 'undefined' ? undefined : performance.now();
      const current = session.current;
      const dx = gesture.dx + (current?.grantX ?? 0), dy = gesture.dy + (current?.grantY ?? 0) - (current?.originY ?? 0);
      const distance = current?.axis === 'x' ? dx : dy;
      const direction = current && chapterGestureDirection(current.start, dx, dy, latest.current.horizontal, latest.current.vertical);
      const navigate = current && !current.rejected && latest.current.enabled && direction === current.direction
        && gesture.numberActiveTouches <= 1 && gestureReachedThreshold(distance, Date.now() - current.time, latest.current.sensitivity);
      clear();
      if (navigate && direction) latest.current.navigate(direction, releasedAt);
    },
    onPanResponderTerminate: clear,
    onPanResponderTerminationRequest: () => !session.current?.direction,
    onShouldBlockNativeResponder: () => Boolean(session.current?.direction),
  }), []);
  const handlers = useMemo(() => PanResponder.create(responders).panHandlers, []);
  // Android ScrollView cancels JS touch delivery when native scrolling starts.
  // A small boundary surface can own the *next* pull without taking over normal scrolling.
  const boundaryHandlers = useMemo(() => {
    const create = (direction: ChapterDirection) => PanResponder.create({
      ...responders,
      onStartShouldSetPanResponderCapture: (event, gesture) => {
        responders.onStartShouldSetPanResponderCapture?.(event, gesture);
        const current = session.current;
        if (!current || !latest.current.vertical || !(direction === 'next' ? current.start.atBottom && current.start.next : current.start.atTop && current.start.previous)) return false;
        current.direction = direction;
        current.axis = 'y';
        return true;
      },
      onShouldBlockNativeResponder: () => true,
    }).panHandlers;
    return { next: create('next'), previous: create('previous') };
  }, []);
  useEffect(() => { clear(); }, [options.chapterKey, options.enabled, options.horizontal, options.vertical, options.sensitivity]);
  useEffect(() => () => { session.current = null; removeWebListener.current?.(); }, []);
  return { handlers, boundaryHandlers, feedback, cancel: clear, bindWeb };
}
