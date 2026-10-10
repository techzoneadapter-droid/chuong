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

// Run independent work with bounded concurrency, preserving input order.
export async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(items.length, Math.max(1, Math.floor(concurrency))) }, async () => {
    while (!failed && cursor < items.length) {
      const index = cursor++;
      try { results[index] = await work(items[index], index); }
      catch (error) { failed = true; throw error; }
    }
  });
  await Promise.all(workers);
  return results;
}
