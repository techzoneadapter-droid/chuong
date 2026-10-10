import { createSingleFlight } from './asyncWork';
import { Chapter, ServiceResult } from '../types';
import { stripLeadingChapterMarker } from '../services/contentText';

// Cooperative JS work, not a worker/UI-thread API. A single huge paragraph can still be expensive.
export async function prepareReaderParagraphs(raw: string, number: number): Promise<string[]> {
  const text = stripLeadingChapterMarker(raw, number);
  const separator = /\n\s*\n/g;
  const paragraphs: string[] = [];
  let start = 0;
  let sliceStarted = performance.now();
  let match: RegExpExecArray | null;
  let processed = 0;
  while ((match = separator.exec(text))) {
    const paragraph = text.slice(start, match.index);
    if (paragraph) paragraphs.push(paragraph);
    start = separator.lastIndex;
    processed++;
    if (processed % 128 === 0 && performance.now() - sliceStarted >= 4) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      sliceStarted = performance.now();
    }
  }
  const last = text.slice(start);
  if (last) paragraphs.push(last);
  return paragraphs;
}

type Prepared = { raw: string; paragraphs: string[]; bytes: number };

// Session-scoped cache: only text processing is reused; authorization is always revalidated.
export function createReaderEngine<C>(options: {
  loadCatalog: () => Promise<C>;
  cacheCatalog: (catalog: C) => boolean;
  loadChapter: (number: number) => Promise<ServiceResult<Chapter | null>>;
  now?: () => number;
  maxEntries?: number;
  maxBytes?: number;
}) {
  const now = options.now ?? Date.now;
  const singleFlight = createSingleFlight();
  const texts = new Map<number, Prepared>();
  const maxEntries = options.maxEntries ?? 3;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  let bytes = 0;
  let catalog: { value: C; expires: number } | undefined;
  let disposed = false;
  const forget = (number: number) => {
    const old = texts.get(number);
    if (old) bytes -= old.bytes;
    texts.delete(number);
  };
  const prepare = async (number: number, raw: string) => {
    const old = texts.get(number);
    if (old?.raw === raw) {
      texts.delete(number); texts.set(number, old);
      return old.paragraphs;
    }
    const paragraphs = await prepareReaderParagraphs(raw, number);
    if (disposed) return paragraphs;
    forget(number);
    // Conservative UTF-16 string/reference estimate; not a native heap measurement.
    const weight = raw.length * 4 + paragraphs.length * 128;
    if (weight <= maxBytes) {
      texts.set(number, { raw, paragraphs, bytes: weight });
      bytes += weight;
      while (texts.size > maxEntries || bytes > maxBytes) forget(texts.keys().next().value!);
    }
    return paragraphs;
  };
  return {
    catalog: (force = false) => {
      if (!force && catalog && now() < catalog.expires) return Promise.resolve(catalog.value);
      return singleFlight('catalog', async () => {
        const value = await options.loadCatalog();
        if (!disposed && options.cacheCatalog(value)) catalog = { value, expires: now() + 30_000 };
        return value;
      });
    },
    read: (number: number) => singleFlight(`chapter:${number}`, async () => {
      try {
        const result = await options.loadChapter(number);
        if (!result.data) { forget(number); return { result, paragraphs: [] }; }
        return { result, paragraphs: await prepare(number, result.data.content ?? '') };
      } catch (error) { forget(number); throw error; }
    }),
    hasPrepared: (number: number) => texts.has(number),
    stats: () => ({ entries: texts.size, estimatedBytes: bytes }),
    dispose: () => { disposed = true; catalog = undefined; texts.clear(); bytes = 0; },
  };
}
