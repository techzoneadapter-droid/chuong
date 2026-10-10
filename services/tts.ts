import * as Speech from 'expo-speech';

export type TtsVoice = 'Nam' | 'Nữ';
export type SleepTimer = 'Tắt' | '15 phút' | '30 phút' | '60 phút' | 'Hết chương';

export interface TtsPreferences {
  speed: number;
  voice: TtsVoice;
  sleepTimer: SleepTimer;
  autoNext: boolean;
}

export interface TtsSegment {
  text: string;
  startWord: number;
  endWord: number;
}

export interface TtsVoiceInfo {
  identifier: string;
  name: string;
  language: string;
  quality?: string;
}

export const TTS_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export const TTS_VOICES: TtsVoice[] = ['Nam', 'Nữ'];
export const SLEEP_TIMERS: Exclude<SleepTimer, 'Tắt'>[] = ['15 phút', '30 phút', '60 phút', 'Hết chương'];
export const DEFAULT_TTS_PREFERENCES: TtsPreferences = {
  speed: 1,
  voice: 'Nữ',
  sleepTimer: 'Tắt',
  autoNext: true,
};

const WORDS_PER_SECOND = 2.55;

export function wordsIn(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function splitLongSentence(sentence: string, targetWords: number) {
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  const result: string[] = [];
  for (let index = 0; index < words.length; index += targetWords) {
    result.push(words.slice(index, index + targetWords).join(' '));
  }
  return result;
}

export function buildTtsSegments(text: string, targetWords = 32): TtsSegment[] {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (!normalized) return [];

  const sentences = normalized
    .split(/(?<=[.!?…。！？])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => wordsIn(item) > targetWords * 1.7 ? splitLongSentence(item, targetWords) : [item]);

  const segments: TtsSegment[] = [];
  let current: string[] = [];
  let currentWords = 0;
  let totalWords = 0;

  const flush = () => {
    if (!current.length) return;
    const textValue = current.join(' ').trim();
    const count = wordsIn(textValue);
    segments.push({ text: textValue, startWord: totalWords, endWord: totalWords + count });
    totalWords += count;
    current = [];
    currentWords = 0;
  };

  for (const sentence of sentences) {
    const count = wordsIn(sentence);
    if (current.length && currentWords + count > targetWords * 1.25) flush();
    current.push(sentence);
    currentWords += count;
    if (currentWords >= targetWords) flush();
  }
  flush();

  return segments;
}

async function normalizeTtsTextAsync(text: string, isCurrent: () => boolean) {
  const chunks: string[] = [];
  let tail = '';
  let carriageReturn = '';
  let started = performance.now();
  for (let offset = 0; offset < text.length; offset += 32768) {
    if (!isCurrent()) return '';
    let raw = carriageReturn + text.slice(offset, offset + 32768);
    carriageReturn = raw.endsWith('\r') ? '\r' : '';
    if (carriageReturn) raw = raw.slice(0, -1);
    const normalized = (tail + raw).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ');
    tail = normalized.match(/(?:\n+|[ \t]+)$/)?.[0] ?? '';
    chunks.push(tail ? normalized.slice(0, -tail.length) : normalized);
    if (performance.now() - started >= 4) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      started = performance.now();
    }
  }
  chunks.push((tail + carriageReturn).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' '));
  return chunks.join('').trim();
}

// Same sentence/word boundaries as buildTtsSegments, yielding between bounded batches.
export async function buildTtsSegmentsAsync(text: string, targetWords = 32, isCurrent = () => true): Promise<TtsSegment[]> {
  const normalized = await normalizeTtsTextAsync(text, isCurrent);
  const segments: TtsSegment[] = [];
  const separator = /(?<=[.!?…。！？])\s+|\n+/g;
  let current: string[] = [];
  let currentWords = 0;
  let totalWords = 0;
  let sliceStarted = performance.now();
  let processed = 0;
  const flush = () => {
    if (!current.length) return;
    const value = current.join(' ').trim();
    const count = wordsIn(value);
    segments.push({ text: value, startWord: totalWords, endWord: totalWords + count });
    totalWords += count; current = []; currentWords = 0;
  };
  const consume = (sentence: string) => {
    const count = wordsIn(sentence);
    if (current.length && currentWords + count > targetWords * 1.25) flush();
    current.push(sentence); currentWords += count;
    if (currentWords >= targetWords) flush();
  };
  let start = 0;
  while (start <= normalized.length) {
    if (!isCurrent()) return [];
    const match = separator.exec(normalized);
    const sentence = normalized.slice(start, match?.index ?? normalized.length).trim();
    if (sentence) {
      const parts = wordsIn(sentence) > targetWords * 1.7 ? splitLongSentence(sentence, targetWords) : [sentence];
      for (const part of parts) {
        if (!isCurrent()) return [];
        consume(part);
        processed++;
        if (processed % 64 === 0 && performance.now() - sliceStarted >= 4) {
          await new Promise<void>(resolve => setTimeout(resolve, 0));
          sliceStarted = performance.now();
        }
      }
    }
    if (!match) break;
    start = separator.lastIndex;
  }
  flush();
  return segments;
}

export function estimateTtsSeconds(totalWords: number, speed: number) {
  if (!totalWords) return 0;
  return totalWords / (WORDS_PER_SECOND * Math.max(.5, speed));
}

export function wordsForSeconds(seconds: number, speed: number) {
  return Math.round(seconds * WORDS_PER_SECOND * Math.max(.5, speed));
}

export function formatTtsTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function mapVoice(item: Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>[number]): TtsVoiceInfo {
  return {
    identifier: item.identifier,
    name: item.name,
    language: item.language,
    quality: String(item.quality ?? ''),
  };
}

export async function getVietnameseTtsVoices(): Promise<TtsVoiceInfo[]> {
  // Never fall back to an English/foreign voice. That was the cause of Vietnamese
  // chapter text being spoken with a foreign accent in Chrome.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const vietnamese = voices
        .filter((item) => /^vi(?:-|_)/i.test(item.language) || /tiếng việt|vietnam/i.test(item.name))
        .map(mapVoice);
      if (vietnamese.length) return vietnamese;
    } catch {
      // Some web speech engines expose their voices slightly after page load.
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return [];
}

const femalePattern = /female|woman|nữ|hoai\s?my|hoài\s?my|linh|mai|thảo|thao|huyền|huyen|google tiếng việt/i;
const malePattern = /male|man|nam|minh|nam\s?minh|sơn|son|quang|dũng|dung/i;

function scoredVoice(voices: TtsVoiceInfo[], preference: TtsVoice) {
  const wanted = preference === 'Nam' ? malePattern : femalePattern;
  const opposite = preference === 'Nam' ? femalePattern : malePattern;
  return [...voices].sort((a, b) => {
    const score = (item: TtsVoiceInfo) =>
      (wanted.test(item.name) ? 20 : 0)
      - (opposite.test(item.name) ? 10 : 0)
      + (/enhanced|premium|natural|high/i.test(item.quality + ' ' + item.name) ? 2 : 0);
    return score(b) - score(a);
  })[0];
}

export function chooseTtsVoice(voices: TtsVoiceInfo[], preference: TtsVoice) {
  // Only Vietnamese voices enter this function. If there are none, omit the
  // explicit voice and let language=vi-VN ask the OS for its Vietnamese default.
  return scoredVoice(voices, preference)?.identifier;
}

export function describeTtsVoice(voices: TtsVoiceInfo[], preference: TtsVoice) {
  const id = chooseTtsVoice(voices, preference);
  const selected = voices.find((item) => item.identifier === id);
  return selected?.name || 'Giọng tiếng Việt mặc định của thiết bị';
}

export function hasDistinctGenderVoices(voices: TtsVoiceInfo[]) {
  if (voices.length < 2) return false;
  const male = scoredVoice(voices.filter((item) => malePattern.test(item.name)), 'Nam');
  const female = scoredVoice(voices.filter((item) => femalePattern.test(item.name)), 'Nữ');
  return Boolean(male && female && male.identifier !== female.identifier);
}

export async function stopTts() {
  try { await Speech.stop(); } catch { /* best effort */ }
}

export async function speakTtsSegment(
  text: string,
  options: {
    rate: number;
    pitch?: number;
    voice?: string;
    onStart?: () => void;
  },
): Promise<'done' | 'stopped'> {
  if (!text.trim()) return 'done';

  return new Promise((resolve, reject) => {
    let settled = false;
    const estimated = Math.max(8, estimateTtsSeconds(wordsIn(text), options.rate));
    const timeout = setTimeout(() => finish('done'), Math.min(180_000, Math.max(20_000, estimated * 4_000)));

    const finish = (state: 'done' | 'stopped') => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(state);
    };

    try {
      Speech.speak(text.slice(0, Speech.maxSpeechInputLength), {
        language: 'vi-VN',
        rate: options.rate,
        pitch: options.pitch ?? 1,
        voice: options.voice,
        onStart: options.onStart,
        onDone: () => finish('done'),
        onStopped: () => finish('stopped'),
        onError: (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error('Không thể phát giọng đọc.'));
        },
      });
    } catch (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error('Không thể phát giọng đọc.'));
    }
  });
}
