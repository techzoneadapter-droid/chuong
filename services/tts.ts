export type TtsVoice = 'Nam' | 'Nữ';
export type SleepTimer = 'Tắt' | '15 phút' | '30 phút' | '60 phút' | 'Hết chương';

export interface TtsPlaybackState {
  isPlaying: boolean;
  progress: number;
  speed: number;
  voice: TtsVoice;
  sleepTimer: SleepTimer;
}

export interface TtsProvider {
  load(bookId: string, chapter: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
}

// These values power the local demo player now. A cloud provider can implement
// TtsProvider later without changing the reader or its controls.
export const TTS_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export const TTS_VOICES: TtsVoice[] = ['Nam', 'Nữ'];
export const SLEEP_TIMERS: Exclude<SleepTimer, 'Tắt'>[] = ['15 phút', '30 phút', '60 phút', 'Hết chương'];
