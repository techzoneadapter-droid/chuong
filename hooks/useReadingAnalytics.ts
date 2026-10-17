import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { createReadingSessionId, recordReaderEngagement } from '../services/analytics';

export function useReadingAnalytics(input: {
  bookId: string;
  chapterId?: string;
  chapterNumber: number;
  progressPercent: number;
}, enabled: boolean) {
  const progressRef = useRef(input.progressPercent);
  const focusedRef = useRef(true);
  const appStateRef = useRef(AppState.currentState);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    progressRef.current = input.progressPercent;
  }, [input.progressPercent]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    return () => {
      focusedRef.current = false;
      void flushRef.current();
    };
  }, []));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      if (previous === 'active' && next !== 'active') void flushRef.current();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!enabled || !input.chapterId) {
      flushRef.current = async () => undefined;
      return;
    }

    const sessionId = createReadingSessionId();
    let activeSeconds = 0;
    let sending = false;
    let queued = false;
    let disposed = false;

    const send = async () => {
      if (sending) {
        queued = true;
        return;
      }

      sending = true;
      do {
        queued = false;
        try {
          await recordReaderEngagement({
            bookId: input.bookId,
            chapterId: input.chapterId!,
            chapterNumber: input.chapterNumber,
            sessionId,
            progressPercent: progressRef.current,
            activeSeconds,
          });
        } catch {
          // Analytics is best-effort and must never interrupt reading.
        }
      } while (queued && !disposed);
      sending = false;
    };

    flushRef.current = send;
    void send();

    const activityTimer = setInterval(() => {
      if (focusedRef.current && appStateRef.current === 'active') activeSeconds += 1;
    }, 1000);

    const heartbeatTimer = setInterval(() => {
      if (focusedRef.current && appStateRef.current === 'active') void send();
    }, 30000);

    return () => {
      clearInterval(activityTimer);
      clearInterval(heartbeatTimer);
      void send();
      disposed = true;
      flushRef.current = async () => undefined;
    };
  }, [enabled, input.bookId, input.chapterId, input.chapterNumber]);

  return {
    flush: useCallback(() => flushRef.current(), []),
  };
}
