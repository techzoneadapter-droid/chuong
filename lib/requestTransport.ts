import { createSingleFlight } from './asyncWork';

// Share only in-flight reads. Completed responses and financial mutations are never cached.
export function createRequestTransport(fetcher: typeof fetch, timeoutMs = 15000): typeof fetch {
  const singleFlight = createSingleFlight();
  return async (input, init) => {
    const execute = async () => {
      const controller = new AbortController();
      const signal = init?.signal;
      const cancel = () => controller.abort();
      if (signal?.aborted) cancel();
      else signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(cancel, timeoutMs);
      try { return await fetcher(input, { ...init, signal: controller.signal }); }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
    };
    const method = (init?.method ?? 'GET').toUpperCase();
    // Request objects and independently cancellable requests retain their own lifecycle.
    if (!['GET', 'HEAD'].includes(method) || init?.signal || (typeof input !== 'string' && !(input instanceof URL))) return execute();
    const headers = [...new Headers(init?.headers).entries()].sort(([a], [b]) => a.localeCompare(b));
    // Authorization, range and representation headers are part of identity: accounts never share reads.
    const key = JSON.stringify([String(input), method, headers, init?.credentials, init?.redirect, init?.cache]);
    const response = await singleFlight(key, execute);
    return response.clone();
  };
}
