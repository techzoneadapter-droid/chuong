// Defers best-effort maintenance without delaying notification navigation or user actions.
export function scheduleIdle(work: () => void): () => void {
  if (typeof requestIdleCallback === 'function' && typeof cancelIdleCallback === 'function') {
    const handle = requestIdleCallback(work, { timeout: 1000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(work, 100);
  return () => clearTimeout(handle);
}
