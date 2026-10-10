import { test, expect, Page } from '@playwright/test';

test.skip(!process.env.TEST_BACKEND, 'Requires isolated localhost mock backend');
const bookId = '30000000-0000-4000-8000-000000000033';
const authorId = '20000000-0000-4000-8000-000000000033';
const nextLabel = 'Ch\u01b0\u01a1ng sau';
const previousLabel = 'Ch\u01b0\u01a1ng tr\u01b0\u1edbc';

async function fixture(page: Page, count: number, body = 'Reader body.') {
  const calls = { metadata: 0, content: [] as number[], attempts: [] as string[], errors: [] as string[], locked: new Set<number>(), offline: false, publishedNumber: null as number | null };
  page.on('pageerror', error => calls.errors.push(error.message));
  const chapters = Array.from({ length: count }, (_, i) => ({
    id: `40000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, book_id: bookId,
    chapter_number: i * 3 + 1, title: `Reader title ${i * 3 + 1}`, status: 'published',
    is_vip: false, price_coins: 0, published_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  }));
  const book = { id: bookId, author_id: authorId, title: 'Reader fixture', slug: 'reader-fixture',
    description: 'Fixture', status: 'ongoing', visibility: 'public', total_chapters: count,
    cover_url: null, tags: [], is_vip: false, price_coins: 0, rating: 4, rating_count: 1, views_count: 1, followers_count: 0 };
  const liveChapters = () => calls.publishedNumber ? [...chapters, { ...chapters[0],
    id: '40000000-0000-4000-8000-999999999999', chapter_number: calls.publishedNumber,
    title: `Reader title ${calls.publishedNumber}` }] : chapters;
  await page.route('http://127.0.0.1:54321/**', async route => {
    const url = new URL(route.request().url());
    calls.attempts.push(url.pathname);
    if (calls.offline) return route.abort('internetdisconnected');
    if (url.pathname.endsWith('/get_chapter_for_reading')) {
      const n = route.request().postDataJSON().p_chapter_number;
      calls.content.push(n);
      return route.fulfill({ json: liveChapters().filter(row => row.chapter_number === n).map(row => ({ ...row,
        content: calls.locked.has(n) ? null : `${body}\n\nEnd body ${n}.`,
        lock_kind: calls.locked.has(n) ? 'chapter' : null, lock_price_coins: 100 })) });
    }
    if (url.pathname.endsWith('/chapters')) {
      calls.metadata++;
      expect(url.searchParams.get('select')).not.toContain('content');
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 500);
      return route.fulfill({ json: liveChapters().slice(offset, offset + limit) });
    }
    if (url.pathname.endsWith('/books')) return route.fulfill({ json: url.searchParams.has('id') ? book : [book] });
    if (url.pathname.endsWith('/authors')) return route.fulfill({ json: [{ id: authorId, pen_name: 'Reader author', followers_count: 0 }] });
    return route.fulfill({ json: [] });
  });
  return calls;
}

async function gestureSettings(page: Page, horizontal: boolean, vertical: boolean, previous = 'restore') {
  await page.addInitScript(({ horizontal, vertical, previous }) => {
    localStorage.setItem('reader:settings', JSON.stringify({ fontSize: 18, font: 'serif', spacing: 'normal', theme: 'paper', padding: 22,
      mode: 'scroll', keepAwake: false, autoScrollSpeed: 2, horizontalChapterGestures: horizontal,
      boundaryChapterGestures: vertical, gestureSensitivity: 'medium', previousChapterLanding: previous }));
  }, { horizontal, vertical, previous });
}
async function swipe(page: Page, x: number, y: number, dx: number, dy: number, duration = 240) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 4; i++) {
    await page.waitForTimeout(duration / 4);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 4, y: y + dy * i / 4 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('horizontal gestures preserve sparse ordering and recheck locked chapter access', async ({ page }) => {
  await gestureSettings(page, true, false);
  const calls = await fixture(page, 500, 'Gesture paragraph. ' + 'Reader text '.repeat(100));
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible({ timeout: 15000 });
  await swipe(page, 240, 320, -160, 0);
  await expect(page.getByText('Reader title 4', { exact: true })).toBeVisible();
  expect(calls.content.every(number => [1, 4, 7].includes(number))).toBe(true);
  await swipe(page, 120, 320, 160, 0);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
  calls.locked.add(4);
  await swipe(page, 240, 320, -160, 0);
  await expect(page.getByText('CH\u01af\u01a0NG VIP', { exact: true })).toBeVisible();
  expect(calls.attempts.some(path => /unlock|purchase/.test(path))).toBe(false);
  expect(calls.errors).toEqual([]);
});

test('boundary gestures work for short chapters, stop at catalog ends and land at previous end', async ({ page }) => {
  await gestureSettings(page, false, true, 'end');
  const calls = await fixture(page, 2);
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible({ timeout: 15000 });
  // Short text is already fully visible: no need to scroll through the discussion.
  await swipe(page, 190, 290, 0, -130);
  await expect(page.getByText('Reader title 4', { exact: true })).toBeVisible();
  await swipe(page, 190, 290, 0, -130);
  await expect(page.getByText('Reader title 4', { exact: true })).toBeVisible();
  await swipe(page, 190, 290, 0, 130);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
  await swipe(page, 190, 290, 0, 130);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
  expect(calls.content.every(number => [1, 4].includes(number))).toBe(true);
  expect(calls.errors).toEqual([]);
});

test('disabled gestures, system edges and diagonal moves do not navigate; settings persist', async ({ page }) => {
  const calls = await fixture(page, 1201, 'Gesture paragraph. ' + 'Reader text '.repeat(100));
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible({ timeout: 15000 });
  await swipe(page, 240, 320, -160, 0);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
  await page.getByText('Giao di\u1ec7n', { exact: true }).click();
  await page.getByLabel('Vu\u1ed1t ngang chuy\u1ec3n ch\u01b0\u01a1ng', { exact: true }).check();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reader:settings'))).toContain('"horizontalChapterGestures":true');
  await page.reload();
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
  await swipe(page, 15, 320, 160, 0);
  await swipe(page, 240, 320, -120, 90);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
  expect(calls.errors).toEqual([]);
});

test('long chapter boundary pull lands at previous text end without scrolling through discussion', async ({ page }) => {
  await gestureSettings(page, false, true, 'end');
  await fixture(page, 100, Array.from({ length: 100 }, (_, i) => `Gesture paragraph ${i}: ` + 'Reader text '.repeat(20)).join('\n\n'));
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByTestId('reader-gesture-content').evaluate(node => {
    let parent = node.parentElement;
    while (parent) {
      if (/auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) {
        parent.scrollTop += node.getBoundingClientRect().bottom - parent.getBoundingClientRect().bottom + 4;
        return;
      }
      parent = parent.parentElement;
    }
  });
  await page.waitForTimeout(250); // Allow the existing throttled scroll event to update boundary refs.
  await swipe(page, 190, 400, 0, -130);
  await expect(page).toHaveURL(/chapter=4/);
  await expect(page.getByText('Reader title 4', { exact: true })).toBeVisible();
  await swipe(page, 190, 400, 0, 130);
  await expect(page).toHaveURL(/chapter=1/);
  await expect(page.getByText(/Gesture paragraph 99:/)).toBeVisible();
});

test('a second swipe while loading cannot skip another chapter', async ({ page }) => {
  await gestureSettings(page, true, false);
  const calls = await fixture(page, 100, 'Gesture paragraph. ' + 'Reader text '.repeat(100));
  await page.route('**/rpc/get_chapter_for_reading', async route => {
    if (route.request().postDataJSON().p_chapter_number === 4) await new Promise(resolve => setTimeout(resolve, 1000));
    await route.fallback();
  });
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible({ timeout: 15000 });
  await swipe(page, 240, 320, -160, 0);
  await swipe(page, 240, 320, -160, 0);
  await expect(page.getByText('Reader title 4', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/chapter=4/);
  expect(calls.content.filter(number => number === 4)).toHaveLength(1);
});

test('chapter gesture stops active TTS and ignores its late completion callback', async ({ page }) => {
  await gestureSettings(page, true, false);
  await page.addInitScript(() => {
    (window as any).__spoken = [];
    (window as any).__cancelCount = 0;
    (window as any).SpeechSynthesisUtterance = class { text = ''; onstart: any; onend: any; };
    window.speechSynthesis.getVoices = () => [{ voiceURI: 'vi-test', name: 'Vietnamese test', lang: 'vi-VN', localService: true, default: true }] as SpeechSynthesisVoice[];
    window.speechSynthesis.speak = utterance => {
      (window as any).__spoken.push(utterance.text);
      (window as any).__oldUtterance = utterance;
      utterance.onstart?.({ utterance } as SpeechSynthesisEvent);
    };
    window.speechSynthesis.cancel = () => { (window as any).__cancelCount++; };
  });
  await fixture(page, 100, 'Gesture paragraph. ' + 'Reader text '.repeat(100));
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByText('Nghe', { exact: true }).click();
  await expect(page.getByLabel('Ph\u00e1t gi\u1ecdng \u0111\u1ecdc')).toBeEnabled();
  await page.getByLabel('Ph\u00e1t gi\u1ecdng \u0111\u1ecdc').click();
  await expect.poll(() => page.evaluate(() => (window as any).__spoken.length)).toBe(1);
  await page.getByLabel('\u0110\u00f3ng', { exact: true }).click({ position: { x: 10, y: 10 } });
  const cancelled = await page.evaluate(() => (window as any).__cancelCount);
  await swipe(page, 240, 320, -160, 0);
  await expect(page.getByText('Reader title 4', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__cancelCount)).toBeGreaterThan(cancelled);
  await page.evaluate(() => (window as any).__oldUtterance.onend?.({}));
  await expect(page).toHaveURL(/chapter=4/);
  expect(await page.evaluate(() => (window as any).__spoken.length)).toBe(1);
});

test('new publication link refreshes missing metadata instead of opening the first chapter', async ({ page }) => {
  const calls = await fixture(page, 100);
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
  calls.publishedNumber = 4000;
  await page.evaluate(({ id }) => {
    history.replaceState(history.state, '', `/reader/${id}?chapter=4000`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, { id: bookId });
  await expect(page.getByText('Reader title 4000', { exact: true })).toBeVisible();
  await expect(page.getByText('End body 4000.', { exact: true })).toBeVisible();
  expect(calls.metadata).toBe(2);
  expect(calls.content.includes(4000)).toBe(true);
  expect(calls.errors).toEqual([]);
});

test('obsolete slow chapter response cannot overwrite a newer route', async ({ page }) => {
  const calls = await fixture(page, 100);
  let release: () => void = () => {};
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rpc/get_chapter_for_reading', async route => {
    const n = route.request().postDataJSON().p_chapter_number;
    if (n === 4) await delayed;
    await route.fallback();
  });
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
  await page.getByText(nextLabel, { exact: true }).click();
  await expect(page).toHaveURL(/chapter=4/);
  await page.evaluate(({ id }) => {
    history.replaceState(history.state, '', `/reader/${id}?chapter=7`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, { id: bookId });
  await expect(page.getByText('Reader title 7', { exact: true })).toBeVisible();
  release();
  await expect.poll(() => calls.content.includes(4)).toBe(true);
  await expect(page.getByText('Reader title 7', { exact: true })).toBeVisible();
  await expect(page.getByText('End body 4.', { exact: true })).toHaveCount(0);
  expect(calls.errors).toEqual([]);
});

test('selecting the current chapter keeps Reader ready', async ({ page }) => {
  const calls = await fixture(page, 100);
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
  await page.getByText('M\u1ee5c l\u1ee5c', { exact: true }).click();
  await page.getByRole('dialog').getByText('Ch\u01b0\u01a1ng 1 \u00b7 Reader title 1', { exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Reader body.', { exact: true })).toBeVisible();
  expect(calls.errors).toEqual([]);
});

test('prefetch is bounded and cached text cannot bypass a later lock', async ({ page }) => {
  const calls = await fixture(page, 100);
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
  await expect.poll(() => calls.content.includes(4)).toBe(true);
  expect(calls.content).toEqual([1, 4]);
  calls.locked.add(4);
  await page.getByText(nextLabel, { exact: true }).click();
  await expect(page.getByText('Reader body.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('CH\u01af\u01a0NG VIP', { exact: true })).toBeVisible();
  expect(calls.content.filter(n => n === 4)).toHaveLength(2);
  expect(calls.content.includes(7)).toBe(false);
  expect(calls.errors).toEqual([]);
});

test('long chapter persists pixel movement within an unchanged progress percentage', async ({ page }) => {
  const body = Array.from({ length: 2000 }, (_, i) => `Long paragraph ${i}: ` + 'Reader text '.repeat(20) + '.').join('\n\n');
  await fixture(page, 100, body);
  await page.addInitScript(() => localStorage.setItem('chuong:retired-demo-cleanup:2026-10-04', '1'));
  await page.goto(`/reader/${bookId}`);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByText(/^Long paragraph 0:/).evaluate(node => {
    let parent = node.parentElement;
    while (parent) {
      if (/auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) {
        parent.scrollTop = 420;
        return;
      }
      parent = parent.parentElement;
    }
    throw new Error('Reader scroll container missing');
  });
  await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem('chuong:reading-progress') || '{}')[id]?.scrollPosition || 0, bookId), { timeout: 9000 }).toBeGreaterThan(300);
});

test('very long chapter, restored scroll, font and page settings preserve all text', async ({ page }) => {
  const body = Array.from({ length: 2000 }, (_, i) => `Long paragraph ${i}: ` + 'Reader text '.repeat(20) + '.').join('\n\n');
  const calls = await fixture(page, 1201, body);
  await page.addInitScript(({ id }) => {
    localStorage.setItem('chuong:retired-demo-cleanup:2026-10-04', '1');
    localStorage.setItem('chuong:reading-progress', JSON.stringify({ [id]: { bookId: id, chapterNumber: 1,
      progressPercent: 20, scrollPosition: 420, updatedAt: '2026-10-10T00:00:00Z' } }));
  }, { id: bookId });
  const start = performance.now();
  await page.goto(`/reader/${bookId}`);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
  const first = page.getByText(/^Long paragraph 0:/);
  const scrollY = () => first.evaluate(node => {
    let parent = node.parentElement;
    while (parent) {
      if (/auto|scroll/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent.scrollTop;
      parent = parent.parentElement;
    }
    return 0;
  });
  await expect.poll(scrollY).toBeGreaterThan(300);
  expect(await page.getByText(/^Long paragraph \d+:/).count()).toBe(2000);
  const readyMs = Math.round(performance.now() - start);
  await page.getByText('Giao di\u1ec7n', { exact: true }).click();
  await page.getByText('A+', { exact: true }).click();
  await page.getByText('Sans', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reader:settings'))).toContain('"font":"sans"');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('reader:settings'))).toContain('"fontSize":19');
  expect(await page.getByText(/^Long paragraph \d+:/).count()).toBe(2000);
  await page.getByText('L\u1eadt trang', { exact: true }).click();
  await expect(page.getByText(/L\u1eadt trang \u00b7 1\//)).toBeVisible();
  expect(await page.getByText(/^Long paragraph \d+:/).count()).toBeLessThan(20);
  expect(calls.errors).toEqual([]);
  console.log(JSON.stringify({ workload: 'development web, 2000 paragraphs', chars: body.length, readyAndRestoredMs: readyMs }));
});

test('TTS resumes the authorized next chapter after loading and stops on a lock', async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as any).__spoken = spoken;
    (window as any).SpeechSynthesisUtterance = class {
      text = ''; onstart: any; onend: any;
    };
    window.speechSynthesis.getVoices = () => [{ voiceURI: 'vi-test', name: 'Vietnamese test', lang: 'vi-VN', localService: true, default: true }] as SpeechSynthesisVoice[];
    window.speechSynthesis.speak = utterance => {
      spoken.push(utterance.text);
      (window as any).__utterance = utterance;
      utterance.onstart?.({ utterance } as SpeechSynthesisEvent);
    };
    window.speechSynthesis.cancel = () => {};
  });
  const calls = await fixture(page, 100);
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
  await page.getByText('Nghe', { exact: true }).click();
  await expect(page.getByLabel('Ph\u00e1t gi\u1ecdng \u0111\u1ecdc')).toBeEnabled();
  await page.getByLabel('Ph\u00e1t gi\u1ecdng \u0111\u1ecdc').click();
  await expect.poll(() => page.evaluate(() => (window as any).__spoken.length)).toBe(1);
  await page.getByLabel(nextLabel, { exact: true }).click();
  await expect(page.getByText('Reader title 4', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__spoken.some((text: string) => text.includes('End body 4.')))).toBe(true);
  calls.locked.add(7);
  // Finish chapter 4 through the actual Expo Speech callback path: auto-next must recheck chapter 7.
  await page.evaluate(() => {
    const utterance = (window as any).__utterance;
    utterance.onend?.({ utterance });
  });
  await expect(page.getByText('CH\u01af\u01a0NG VIP', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__spoken.some((text: string) => text.includes('End body 7.')))).toBe(false);
  expect(calls.errors).toEqual([]);
});

test('offline fallback restores downloaded chapter without speculative network work', async ({ page }) => {
  await gestureSettings(page, true, false);
  const calls = await fixture(page, 100);
  calls.offline = true;
  await page.addInitScript(({ id }) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    localStorage.setItem('chuong:retired-demo-cleanup:2026-10-04', '1');
    const time = '2026-10-10T00:00:00Z';
    const records = [1, 4].map(number => ({ key: `${id}:${number}`, bookId: id, bookTitle: 'Offline fixture',
      author: 'Offline author', cover: '#000', coverUrl: null, chapterNumber: number, chapterTitle: `Offline title ${number}`,
      access: 'free', priceCoins: 0, bytes: 100, contentVersion: time, downloadedAt: time, lastAccessedAt: time, licenseValidUntil: null }));
    localStorage.setItem('chuong:offline-manifest:v2', JSON.stringify({ version: 2, quotaBytes: 100000000, chapters: records }));
    for (const number of [1, 4]) localStorage.setItem(`chuong:offline-payload:v2:${id}:${number}`, JSON.stringify({
      chapter: { bookId: id, number, title: `Offline title ${number}`, content: `Offline body ${number}.`, access: 'free', status: 'published' },
      contentVersion: time, savedAt: time,
    }));
  }, { id: bookId });
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Offline body 1.', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByText(nextLabel, { exact: true }).click();
  await expect(page.getByText('Offline body 4.', { exact: true })).toBeVisible();
  const offlineBody = await page.getByText('Offline body 4.', { exact: true }).boundingBox();
  expect(offlineBody).not.toBeNull();
  await swipe(page, 120, offlineBody!.y + offlineBody!.height / 2, 160, 0);
  await expect(page.getByText('Offline body 1.', { exact: true })).toBeVisible();
  expect(calls.content).toEqual([]);
  expect(calls.attempts.filter(path => path.endsWith('/get_chapter_for_reading'))).toEqual([]);
  expect(calls.errors).toEqual([]);
});

for (const count of [100, 500, 1201]) {
  test(`reader ${count} chapters: opening, sparse navigation and bounded body loading`, async ({ page }) => {
    const calls = await fixture(page, count);
    const start = performance.now();
    await page.goto(`/reader/${bookId}?chapter=1`);
    await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
    const openedMs = performance.now() - start;
    const initialMetadata = calls.metadata;
    if (!process.env.READER_BASELINE) await page.evaluate(() => (globalThis as any).__CHUONG_READER_PERF__.start());
    const transition = performance.now();
    await page.getByText(nextLabel, { exact: true }).click();
    await expect(page.getByText('Reader title 4', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/chapter=4/);
    const nextMs = performance.now() - transition;
    await page.getByText(previousLabel, { exact: true }).click();
    await expect(page.getByText('Reader title 1', { exact: true })).toBeVisible();
    if (!process.env.READER_BASELINE) expect(calls.metadata).toBe(initialMetadata);
    if (!process.env.READER_BASELINE) await expect.poll(() => page.evaluate(() => (globalThis as any).__CHUONG_READER_PERF__.report()['chapter-and-text'].samples)).toBeGreaterThan(0);
    expect(calls.content.every(n => [1, 4, 7].includes(n))).toBe(true);
    expect(calls.errors).toEqual([]);
    console.log(JSON.stringify({ phase: process.env.READER_BASELINE ? 'baseline' : 'phase3', chapters: count,
      openedMs: Math.round(openedMs), nextMs: Math.round(nextMs), metadataRequests: calls.metadata, contentRequests: calls.content }));
  });
}
