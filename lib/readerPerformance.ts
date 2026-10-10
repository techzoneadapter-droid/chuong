type Stage = 'catalog' | 'chapter-and-text' | 'open-to-ready' | 'ready-to-layout' | 'tts-prepare';
type Sample = { stage: Stage; ms: number };
const samples: Sample[] = [];
let recording = false;

// Development-only, explicitly enabled. Stores durations, never content/account identifiers.
if (__DEV__) {
  const host = globalThis as typeof globalThis & { __CHUONG_READER_PERF__?: unknown };
  host.__CHUONG_READER_PERF__ = {
    start: () => { samples.length = 0; recording = true; },
    stop: () => { recording = false; },
    clear: () => { samples.length = 0; },
    report: () => {
      const report: Record<string, unknown> = { mode: 'development', note: 'JS/layout callback durations; not native UI frames or heap' };
      for (const stage of ['catalog', 'chapter-and-text', 'open-to-ready', 'ready-to-layout', 'tts-prepare']) {
        const values = samples.filter(sample => sample.stage === stage).map(sample => sample.ms).sort((a, b) => a - b);
        report[stage] = { samples: values.length, p50Ms: values[Math.floor((values.length - 1) * .5)] ?? 0,
          p95Ms: values[Math.floor((values.length - 1) * .95)] ?? 0, maxMs: values[values.length - 1] ?? 0 };
      }
      return report;
    },
  };
}

export function recordReaderDuration(stage: Stage, started: number) {
  if (!__DEV__ || !recording) return;
  samples.push({ stage, ms: Math.max(0, performance.now() - started) });
  if (samples.length > 200) samples.shift();
}
