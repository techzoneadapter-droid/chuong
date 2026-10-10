import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, View } from 'react-native';
import { ChapterDirection, chapterGestureDirection, GestureStart, GestureSensitivity, gestureReachedThreshold } from '../lib/readerGestures';

type Options = {
  enabled: boolean; horizontal: boolean; vertical: boolean; sensitivity: GestureSensitivity;
  chapterKey: string; start: () => GestureStart; navigate: (direction: ChapterDirection) => void;
};

// Claim only a decisive, single-finger gesture that began in the reading text region.
export function useReaderGestures(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const session = useRef<{ start: GestureStart; time: number; direction: ChapterDirection | null; axis: 'x' | 'y' | null; rejected: boolean } | null>(null);
  const [feedback, setFeedback] = useState<{ direction: ChapterDirection; armed: boolean } | null>(null);
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
        || (!current.direction && Date.now() - current.time > 350) || window.getSelection()?.toString()) return;
      const touch = event.touches[0];
      const direction = chapterGestureDirection(current.start, touch.pageX - current.start.x, touch.pageY - current.start.y, latest.current.horizontal, latest.current.vertical);
      if (direction && event.cancelable) event.preventDefault();
    };
    node.addEventListener('touchmove', onMove, { passive: false });
    removeWebListener.current = () => node.removeEventListener('touchmove', onMove);
  }, []);
  const clear = () => { session.current = null; setFeedback(null); };
  const handlers = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: (event) => {
      clear();
      if (latest.current.enabled && event.nativeEvent.touches.length === 1) {
        session.current = { start: { ...latest.current.start(), x: event.nativeEvent.pageX, y: event.nativeEvent.pageY },
          time: Date.now(), direction: null, axis: null, rejected: false };
      }
      return false;
    },
    onMoveShouldSetPanResponderCapture: (_, gesture) => {
      const current = session.current;
      if (!current || current.rejected || !latest.current.enabled) return false;
      if (gesture.numberActiveTouches !== 1 || Date.now() - current.time > 350
        || (Platform.OS === 'web' && typeof window !== 'undefined' && Boolean(window.getSelection()?.toString()))) {
        current.rejected = true;
        return false;
      }
      const direction = chapterGestureDirection(current.start, gesture.dx, gesture.dy, latest.current.horizontal, latest.current.vertical);
      // A gesture that begins scrolling normally must never turn into chapter navigation later.
      if (!direction && Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) >= 24) current.rejected = true;
      if (!direction) return false;
      current.direction = direction;
      current.axis = Math.abs(gesture.dx) > Math.abs(gesture.dy) ? 'x' : 'y';
      return true;
    },
    onPanResponderGrant: () => {
      const current = session.current;
      if (current?.direction) setFeedback({ direction: current.direction, armed: false });
    },
    onPanResponderStart: (_, gesture) => {
      if (gesture.numberActiveTouches !== 1) {
        if (session.current) session.current.rejected = true;
        setFeedback(null);
      }
    },
    onPanResponderMove: (_, gesture) => {
      const current = session.current;
      if (!current?.direction || !latest.current.enabled || gesture.numberActiveTouches !== 1) {
        if (current) current.rejected = true;
        setFeedback(null);
        return;
      }
      const direction = chapterGestureDirection(current.start, gesture.dx, gesture.dy, latest.current.horizontal, latest.current.vertical);
      const distance = current.axis === 'x' ? gesture.dx : gesture.dy;
      const armed = !current.rejected && direction === current.direction
        && gestureReachedThreshold(distance, Date.now() - current.time, latest.current.sensitivity);
      setFeedback(previous => previous?.armed === armed && previous.direction === current.direction
        ? previous : { direction: current.direction!, armed });
    },
    onPanResponderRelease: (_, gesture) => {
      const current = session.current;
      const distance = current?.axis === 'x' ? gesture.dx : gesture.dy;
      const direction = current && chapterGestureDirection(current.start, gesture.dx, gesture.dy, latest.current.horizontal, latest.current.vertical);
      const navigate = current && !current.rejected && latest.current.enabled && direction === current.direction
        && gesture.numberActiveTouches <= 1 && gestureReachedThreshold(distance, Date.now() - current.time, latest.current.sensitivity);
      clear();
      if (navigate && direction) latest.current.navigate(direction);
    },
    onPanResponderTerminate: clear,
    onPanResponderTerminationRequest: () => true,
    onShouldBlockNativeResponder: () => Boolean(session.current?.direction),
  }).panHandlers, []);
  useEffect(() => { clear(); }, [options.chapterKey, options.enabled, options.horizontal, options.vertical, options.sensitivity]);
  useEffect(() => () => { session.current = null; removeWebListener.current?.(); }, []);
  return { handlers, feedback, cancel: clear, bindWeb };
}
