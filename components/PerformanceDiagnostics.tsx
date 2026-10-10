import { Profiler, ReactNode, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

type Sample = { kind: 'react-render' | 'js-lag'; ms: number };
type Diagnostics = { start: () => void; stop: () => void; clear: () => void; report: () => unknown };
const host = globalThis as typeof globalThis & { __CHUONG_PERF__?: Diagnostics };

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: values.length, p50Ms: sorted[Math.floor((sorted.length - 1) * .5)] ?? 0,
    p95Ms: sorted[Math.floor((sorted.length - 1) * .95)] ?? 0, maxMs: sorted[sorted.length - 1] ?? 0 };
}

// Opt-in development diagnostics. No timer, samples, network or persistent storage while disabled.
function DevDiagnostics({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const samples = useRef<Sample[]>([]);
  const running = useRef(false);
  const add = (sample: Sample) => {
    if (!running.current) return;
    samples.current.push(sample);
    if (samples.current.length > 600) samples.current.shift();
  };
  useEffect(() => {
    const api: Diagnostics = {
      start: () => { samples.current = []; running.current = true; setEnabled(true); },
      stop: () => { running.current = false; setEnabled(false); },
      clear: () => { samples.current = []; },
      report: () => ({ mode: 'development', platformMetrics: 'JS only; use native tools for UI frames and memory',
        reactRender: summarize(samples.current.filter((item) => item.kind === 'react-render').map((item) => item.ms)),
        jsLag: summarize(samples.current.filter((item) => item.kind === 'js-lag').map((item) => item.ms)) }),
    };
    host.__CHUONG_PERF__ = api;
    return () => { running.current = false; if (host.__CHUONG_PERF__ === api) delete host.__CHUONG_PERF__; };
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      if (AppState.currentState === 'active') add({ kind: 'js-lag', ms: Math.max(0, now - previous - 100) });
      previous = now;
    }, 100);
    const listener = AppState.addEventListener('change', () => { previous = performance.now(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [enabled]);
  return <Profiler id="CHUONG" onRender={(_id, _phase, actualDuration) => add({ kind: 'react-render', ms: actualDuration })}>
    {children}
  </Profiler>;
}

export function PerformanceDiagnostics({ children }: { children: ReactNode }) {
  return __DEV__ ? <DevDiagnostics>{children}</DevDiagnostics> : children;
}
