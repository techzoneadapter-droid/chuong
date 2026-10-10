import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ReadingProgress } from '../types';
import { saveReadingProgress } from '../services/library';
import { messageForError } from '../services/errors';

type Snapshot = { progress: Omit<ReadingProgress, 'updatedAt'>; userId?: string };

// Periodic dirty flush avoids debounce starvation while scrolling. Writes are serialized.
export function useReadingProgressSync(progress: Snapshot['progress'], userId: string | undefined, ready: boolean, getScrollPosition?: () => number) {
  const latest = useRef<Snapshot | null>(null);
  const saved = useRef('');
  const queue = useRef(Promise.resolve());
  const [error, setError] = useState('');
  const scrollGetter = useRef(getScrollPosition);
  scrollGetter.current = getScrollPosition;
  latest.current = ready ? { progress, userId } : null;
  const flush = useCallback(() => {
    const current = latest.current;
    if (!current) return queue.current;
    // Capture live pixels before queuing; rounded percent can remain unchanged during scrolling.
    const snapshot = scrollGetter.current
      ? { ...current, progress: { ...current.progress, scrollPosition: scrollGetter.current() } }
      : current;
    const key = JSON.stringify(snapshot);
    if (key === saved.current) return queue.current;
    saved.current = key;
    queue.current = queue.current.then(() => saveReadingProgress(snapshot.progress, snapshot.userId)).then(() => setError('')).catch((cause) => {
      if (saved.current === key) saved.current = '';
      setError(messageForError(cause, 'Không thể lưu tiến độ.'));
    });
    return queue.current;
  }, []);
  useEffect(() => {
    const timer = setInterval(flush, 4000);
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') void flush(); });
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    if (Platform.OS === 'web') { window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', onHide); }
    return () => {
      clearInterval(timer); subscription.remove(); void flush();
      if (Platform.OS === 'web') { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHide); }
    };
  }, [flush]);
  useFocusEffect(useCallback(() => () => { void flush(); }, [flush]));
  return { flush, error };
}
