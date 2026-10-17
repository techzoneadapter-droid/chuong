import { useCallback, useEffect, useRef, useState } from 'react';
import { usePersistentState } from './usePersistentState';
import { recordReaderDuration } from '../lib/readerPerformance';
import {
  buildTtsSegmentsAsync,
  chooseTtsVoice,
  DEFAULT_TTS_PREFERENCES,
  describeTtsVoice,
  estimateTtsSeconds,
  formatTtsTime,
  getVietnameseTtsVoices,
  hasDistinctGenderVoices,
  SleepTimer,
  speakTtsSegment,
  stopTts,
  TtsPreferences,
  TtsVoice,
  TtsVoiceInfo,
  TtsSegment,
  wordsForSeconds,
} from '../services/tts';

type Options = {
  chapterKey: string;
  text: string;
  initialProgressPercent?: number;
  onProgress?: (percent: number) => void;
  onEnded?: () => void;
};

const EMPTY_SEGMENTS: TtsSegment[] = [];

export function useTtsPlayer({
  chapterKey,
  text,
  initialProgressPercent = 0,
  onProgress,
  onEnded,
}: Options) {
  const [preferences, setPreferences] = usePersistentState<TtsPreferences>('reader:tts', DEFAULT_TTS_PREFERENCES);
  const [prepared, setPrepared] = useState<{ text: string; key: string; segments: TtsSegment[] } | null>(null);
  const preparing = Boolean(text) && (prepared?.text !== text || prepared.key !== chapterKey);
  const segments = prepared?.text === text && prepared.key === chapterKey ? prepared.segments : EMPTY_SEGMENTS;
  const totalWords = segments[segments.length - 1]?.endWord ?? 0;
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');
  const [voices, setVoices] = useState<TtsVoiceInfo[]>([]);
  const [sleepExpired, setSleepExpired] = useState(false);
  const runId = useRef(0);
  const restartTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEndedRef = useRef(onEnded);
  const onProgressRef = useRef(onProgress);
  const preferencesRef = useRef(preferences);

  useEffect(() => {
    let active = true;
    const started = performance.now();
    void buildTtsSegmentsAsync(text, 32, () => active).then(segments => {
      if (active) { recordReaderDuration('tts-prepare', started); setPrepared({ text, key: chapterKey, segments }); }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Không thể chuẩn bị giọng đọc.'); });
    return () => { active = false; };
  }, [text, chapterKey]);

  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);

  const progressPercent = totalWords
    ? Math.min(100, Math.round(((segments[segmentIndex]?.startWord ?? totalWords) / totalWords) * 100))
    : 0;
  const totalSeconds = estimateTtsSeconds(totalWords, preferences.speed);
  const currentSeconds = totalSeconds * progressPercent / 100;

  const clearSleepTimeout = useCallback(() => {
    if (sleepTimeout.current) clearTimeout(sleepTimeout.current);
    sleepTimeout.current = null;
  }, []);

  const clearRestartTimeout = useCallback(() => {
    if (restartTimeout.current !== null) clearTimeout(restartTimeout.current);
    restartTimeout.current = null;
  }, []);

  const stop = useCallback(async (keepPosition = true) => {
    runId.current += 1;
    clearRestartTimeout();
    clearSleepTimeout();
    await stopTts();
    setPlaying(false);
    setPaused(keepPosition);
  }, [clearSleepTimeout, clearRestartTimeout]);

  const scheduleSleep = useCallback((timer: SleepTimer) => {
    clearSleepTimeout();
    setSleepExpired(false);
    const minutes = timer === '15 phút' ? 15 : timer === '30 phút' ? 30 : timer === '60 phút' ? 60 : 0;
    if (!minutes) return;
    sleepTimeout.current = setTimeout(() => {
      setSleepExpired(true);
      void stop(true);
    }, minutes * 60_000);
  }, [clearSleepTimeout, stop]);

  const runFrom = useCallback(async (startIndex: number) => {
    if (!segments.length) return;
    if (!voices.length) {
      setError('Thiết bị chưa có giọng tiếng Việt. Hãy cài voice pack tiếng Việt trong cài đặt Text-to-Speech rồi thử lại.');
      setPlaying(false);
      return;
    }
    runId.current += 1;
    const token = runId.current;
    await stopTts();
    if (token !== runId.current) return;
    const prefs = preferencesRef.current;
    const distinctGenderVoices = hasDistinctGenderVoices(voices);
    const voiceId = chooseTtsVoice(voices, prefs.voice);
    const pitch = distinctGenderVoices ? 1 : prefs.voice === 'Nam' ? 0.82 : 1.08;
    setError('');
    setPaused(false);
    setPlaying(true);
    setSleepExpired(false);
    scheduleSleep(prefs.sleepTimer);

    try {
      for (let index = Math.min(Math.max(0, startIndex), segments.length - 1); index < segments.length; index += 1) {
        if (token !== runId.current) return;
        setSegmentIndex(index);
        const percent = totalWords ? Math.round((segments[index].startWord / totalWords) * 100) : 0;
        onProgressRef.current?.(percent);
        const status = await speakTtsSegment(segments[index].text, {
          rate: prefs.speed,
          pitch,
          voice: voiceId,
        });
        if (token !== runId.current || status === 'stopped') return;
      }

      if (token !== runId.current) return;
      setSegmentIndex(Math.max(0, segments.length - 1));
      setPlaying(false);
      setPaused(false);
      clearSleepTimeout();
      onProgressRef.current?.(100);
      onEndedRef.current?.();
    } catch (cause) {
      if (token !== runId.current) return;
      clearSleepTimeout();
      setPlaying(false);
      setPaused(false);
      setError(cause instanceof Error ? cause.message : 'Không thể phát giọng đọc trên thiết bị này.');
    }
  }, [clearSleepTimeout, scheduleSleep, segments, totalWords, voices]);

  const scheduleRestart = useCallback((index: number, delay: number) => {
    clearRestartTimeout();
    const token = runId.current;
    restartTimeout.current = setTimeout(() => {
      restartTimeout.current = null;
      if (token === runId.current) void runFrom(index);
    }, delay);
  }, [clearRestartTimeout, runFrom]);

  const play = useCallback(() => {
    if (!segments.length) return;
    void runFrom(segmentIndex);
  }, [runFrom, segmentIndex, segments.length]);

  const pause = useCallback(() => {
    void stop(true);
  }, [stop]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [pause, play, playing]);

  const seekBySeconds = useCallback((deltaSeconds: number) => {
    if (!segments.length || !totalWords) return;
    const currentWord = segments[segmentIndex]?.startWord ?? 0;
    const targetWord = Math.min(totalWords - 1, Math.max(0, currentWord + wordsForSeconds(deltaSeconds, preferences.speed)));
    let targetIndex = segments.findIndex((item) => targetWord >= item.startWord && targetWord < item.endWord);
    if (targetIndex < 0) targetIndex = targetWord <= 0 ? 0 : segments.length - 1;
    const resume = playing;
    runId.current += 1;
    void stopTts();
    clearSleepTimeout();
    setSegmentIndex(targetIndex);
    setPlaying(false);
    setPaused(true);
    const percent = Math.round((segments[targetIndex].startWord / totalWords) * 100);
    onProgressRef.current?.(percent);
    if (resume) scheduleRestart(targetIndex, 40);
  }, [clearSleepTimeout, playing, preferences.speed, runFrom, scheduleRestart, segmentIndex, segments, totalWords]);

  const seekToPercent = useCallback((percent: number) => {
    if (!segments.length || !totalWords) return;
    const targetWord = Math.round(Math.min(100, Math.max(0, percent)) / 100 * totalWords);
    let targetIndex = segments.findIndex((item) => targetWord >= item.startWord && targetWord < item.endWord);
    if (targetIndex < 0) targetIndex = percent <= 0 ? 0 : segments.length - 1;
    const resume = playing;
    runId.current += 1;
    void stopTts();
    clearSleepTimeout();
    setSegmentIndex(targetIndex);
    setPlaying(false);
    setPaused(true);
    onProgressRef.current?.(Math.round((segments[targetIndex].startWord / totalWords) * 100));
    if (resume) scheduleRestart(targetIndex, 40);
  }, [clearSleepTimeout, playing, runFrom, scheduleRestart, segments, totalWords]);

  const setSpeed = useCallback((speed: number) => {
    const resume = playing;
    preferencesRef.current = { ...preferencesRef.current, speed };
    setPreferences((current) => ({ ...current, speed }));
    if (resume) {
      runId.current += 1;
      void stopTts();
      setPlaying(false);
      scheduleRestart(segmentIndex, 60);
    }
  }, [playing, runFrom, scheduleRestart, segmentIndex, setPreferences]);

  const setVoice = useCallback((voice: TtsVoice) => {
    const resume = playing;
    preferencesRef.current = { ...preferencesRef.current, voice };
    setPreferences((current) => ({ ...current, voice }));
    if (resume) {
      runId.current += 1;
      void stopTts();
      setPlaying(false);
      scheduleRestart(segmentIndex, 60);
    }
  }, [playing, runFrom, scheduleRestart, segmentIndex, setPreferences]);

  const setSleepTimer = useCallback((sleepTimerValue: SleepTimer) => {
    preferencesRef.current = { ...preferencesRef.current, sleepTimer: sleepTimerValue };
    setPreferences((current) => ({ ...current, sleepTimer: sleepTimerValue }));
    if (playing) scheduleSleep(sleepTimerValue);
    else clearSleepTimeout();
  }, [clearSleepTimeout, playing, scheduleSleep, setPreferences]);

  const setAutoNext = useCallback((autoNext: boolean) => {
    preferencesRef.current = { ...preferencesRef.current, autoNext };
    setPreferences((current) => ({ ...current, autoNext }));
  }, [setPreferences]);

  const playFromStart = useCallback(() => {
    setSegmentIndex(0);
    void runFrom(0);
  }, [runFrom]);

  useEffect(() => {
    let active = true;
    void getVietnameseTtsVoices().then((items) => {
      if (active) setVoices(items);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    runId.current += 1;
    clearRestartTimeout();
    clearSleepTimeout();
    void stopTts();
    setPlaying(false);
    setPaused(false);
    setError('');
    setSleepExpired(false);
    const targetWord = totalWords * Math.min(100, Math.max(0, initialProgressPercent)) / 100;
    const targetIndex = segments.findIndex((item) => targetWord >= item.startWord && targetWord < item.endWord);
    setSegmentIndex(targetIndex >= 0 ? targetIndex : initialProgressPercent >= 100 ? Math.max(0, segments.length - 1) : 0);
  }, [chapterKey, clearSleepTimeout, clearRestartTimeout, segments, totalWords]);

  useEffect(() => () => {
    runId.current += 1;
    clearRestartTimeout();
    clearSleepTimeout();
    void stopTts();
  }, [clearSleepTimeout, clearRestartTimeout]);

  return {
    preparing,
    playing,
    paused,
    error,
    progressPercent,
    currentSeconds,
    totalSeconds,
    formattedCurrent: formatTtsTime(currentSeconds),
    formattedTotal: formatTtsTime(totalSeconds),
    speed: preferences.speed,
    voice: preferences.voice,
    voiceName: describeTtsVoice(voices, preferences.voice),
    sleepTimer: preferences.sleepTimer,
    autoNext: preferences.autoNext,
    sleepExpired,
    hasSpeech: segments.length > 0 && voices.length > 0,
    voiceCount: voices.length,
    hasDistinctGenderVoices: hasDistinctGenderVoices(voices),
    toggle,
    play,
    pause,
    stop,
    playFromStart,
    seekBySeconds,
    seekToPercent,
    setSpeed,
    setVoice,
    setSleepTimer,
    setAutoNext,
  };
}
