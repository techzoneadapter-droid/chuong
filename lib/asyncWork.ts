// Serialize storage read/modify/write operations without poisoning later work on failure.
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.catch(() => undefined);
    return result;
  };
}

// Only pending requests are retained; no stale data or account-scoped results are cached.
export function createSingleFlight() {
  const pending = new Map<string, Promise<unknown>>();
  return function run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const existing = pending.get(key);
    if (existing) return existing as Promise<T>;
    const result = Promise.resolve().then(work);
    pending.set(key, result);
    const clear = () => { if (pending.get(key) === result) pending.delete(key); };
    void result.then(clear, clear);
    return result;
  };
}
