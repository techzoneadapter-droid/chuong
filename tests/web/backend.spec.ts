import { test, expect, Page } from '@playwright/test';

test.skip(!process.env.TEST_BACKEND, 'Requires configured mock backend build');

const userId = '10000000-0000-4000-8000-000000000001';
const targetUserId = '10000000-0000-4000-8000-000000000002';
const authorId = '20000000-0000-4000-8000-000000000001';
const bookId = '30000000-0000-4000-8000-000000000001';
const chapterId = '40000000-0000-4000-8000-000000000001';
const now = new Date().toISOString();

const book = {
  id: bookId,
  author_id: authorId,
  title: 'Truyện từ máy chủ',
  slug: 'server-book',
  description: 'Nội dung thật từ kho dữ liệu backend.',
  cover_url: null,
  language: 'vi',
  source_type: 'original',
  status: 'ongoing',
  visibility: 'public',
  is_vip: false,
  price_coins: 0,
  rating: 4.5,
  rating_count: 2,
  views_count: 12,
  followers_count: 3,
  total_chapters: 2,
  tags: ['Fantasy'],
  moderation_state: 'approved',
  moderation_note: null,
  moderated_at: null,
  moderated_by: null,
  search_text: 'truyen tu may chu',
  engagement_score: 0,
  engagement_updated_at: null,
  created_at: now,
  updated_at: now,
};

const author = {
  id: authorId,
  user_id: userId,
  pen_name: 'Tác giả kiểm thử',
  bio: '',
  avatar_url: null,
  followers_count: 0,
  verified: false,
  moderation_state: 'approved',
  moderation_note: null,
  moderated_at: null,
  moderated_by: null,
  created_at: now,
};

const profile = {
  id: userId,
  display_name: 'Độc giả kiểm thử',
  username: 'reader_test',
  bio: 'Hồ sơ thật',
  avatar_url: null,
  role: 'author',
  created_at: now,
  updated_at: now,
};

const targetProfile = {
  id: targetUserId,
  display_name: 'Bạn đọc thử nghiệm',
  username: 'friend_reader',
  bio: 'Thích truyện fantasy và bình luận có tâm.',
  avatar_url: null,
  role: 'reader',
  created_at: now,
  updated_at: now,
};

const user = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'reader@example.test',
  user_metadata: { display_name: 'Độc giả kiểm thử' },
  app_metadata: {},
  created_at: now,
};

const session = {
  access_token: 'test.access.token',
  refresh_token: 'test-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
};

const chapters = [1, 4].map((number) => ({
  id: number === 1 ? chapterId : '40000000-0000-4000-8000-000000000004',
  book_id: bookId,
  chapter_number: number,
  title: `Nội dung máy chủ ${number}`,
  content: `Văn bản từ backend chương ${number}. `.repeat(80),
  status: 'published',
  is_vip: false,
  price_coins: 0,
  moderation_state: 'approved',
  moderation_note: null,
  moderated_at: null,
  moderated_by: null,
  published_at: now,
  created_at: now,
  updated_at: now,
}));

type Write = { table: string; method: string; data: Record<string, unknown> };

const followedUpdate = {
  book_id: bookId, title: book.title, cover_url: null, author_id: authorId, author_name: author.pen_name,
  current_chapter_number: 3, next_chapter_number: 5, latest_chapter_number: 8,
  latest_chapter_title: 'Chương mới nhất', latest_published_at: now, last_update_at: now,
  published_count: 5, unread_count: 2, has_updates: true,
};

async function mock(page: Page, authenticated = false) {
  const writes: Write[] = [];
  let following = false;
  let muted = false;
  let blocked = false;

  if (authenticated) {
    await page.addInitScript((value) => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), session);
  }

  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.includes('/auth/v1/')) {
      if (url.pathname.endsWith('/token')) return route.fulfill({ json: session });
      if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
      if (url.pathname.endsWith('/signup')) return route.fulfill({ json: { user, session: null } });
      if (url.pathname.endsWith('/user')) return route.fulfill({ json: { user } });
      return route.fulfill({ json: {} });
    }

    if (url.pathname.includes('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').at(-1)!;
      const data = request.postDataJSON() ?? {};
      writes.push({ table: fn, method: request.method(), data });

      if (fn === 'get_chapter_for_reading') {
        const number = Number(data.p_chapter_number ?? 1);
        const row = chapters.find((item) => item.chapter_number === number);
        return route.fulfill({
          json: row ? [{ ...row, lock_kind: null, lock_price_coins: 0 }] : [],
        });
      }

      if (fn === 'record_reader_engagement') {
        return route.fulfill({ json: [{ accepted: true, new_reader_day: false, session_completed: false }] });
      }

      if (fn === 'sync_reading_progress') {
        return route.fulfill({
          json: [{
            user_id: userId,
            book_id: String(data.p_book_id ?? bookId),
            chapter_id: data.p_chapter_id ?? chapterId,
            chapter_number: Number(data.p_chapter_number ?? 1),
            progress_percent: Number(data.p_progress_percent ?? 0),
            scroll_position: Number(data.p_scroll_position ?? 0),
            updated_at: String(data.p_updated_at ?? now),
          }],
        });
      }

      if (fn === 'get_my_author_gifts') return route.fulfill({ json: { totalHigh: 0, totalLow: 0, count: 0, recent: [] } });
      if (fn === 'get_author_chapter_for_editing') return route.fulfill({ json: chapters.filter((item) => item.id === data.p_chapter_id).map((item) => ({ ...item, status: 'draft', is_vip: true, price_coins: 101, scheduled_publish_at: '2027-01-01T00:00:00Z' })) });
      if (fn === 'get_book_gift_summary') return route.fulfill({ json: [{ total_gifts: 0, total_coins: 0 }] });
      if (fn === 'get_unread_notification_count') return route.fulfill({ json: 0 });
      if (fn === 'get_my_followed_book_updates') return route.fulfill({ json: [followedUpdate] });
      if (fn === 'get_my_followed_book_update_badge') return route.fulfill({ json: [{ updated_books: 1, unread_chapters: 2 }] });

      if (fn === 'get_public_reader_profile') {
        const id = String(data.p_user_id ?? userId);
        const base = id === targetUserId ? targetProfile : profile;
        return route.fulfill({
          json: [{
            id: base.id,
            username: base.username,
            display_name: base.display_name,
            avatar_url: base.avatar_url,
            bio: base.bio,
            role: base.role,
            created_at: base.created_at,
            follower_count: id === targetUserId ? 7 : 2,
            following_count: id === targetUserId ? 4 : 1,
            viewer_follows: id === targetUserId ? following : false,
            viewer_muted: id === targetUserId ? muted : false,
            viewer_blocked: id === targetUserId ? blocked : false,
            profile_public: true,
            show_shelves: true,
            show_reviews: true,
            show_comments: true,
            allow_follows: true,
          }],
        });
      }

      if (fn === 'search_public_readers') {
        return route.fulfill({
          json: [{
            id: targetUserId,
            username: targetProfile.username,
            display_name: targetProfile.display_name,
            avatar_url: null,
            bio: targetProfile.bio,
            role: 'reader',
            follower_count: 7 + (following ? 1 : 0),
            viewer_follows: following,
          }],
        });
      }

      if (fn === 'get_public_reader_shelf') {
        return route.fulfill({
          json: [{
            book_id: bookId,
            title: book.title,
            cover_url: null,
            author_name: author.pen_name,
            genre: 'Fantasy',
            book_status: 'ongoing',
            shelf_status: 'favorite',
            added_at: now,
          }],
        });
      }

      if (fn === 'get_reader_public_activity') {
        return route.fulfill({
          json: [{
            activity_type: 'review',
            activity_id: '60000000-0000-4000-8000-000000000001',
            actor_user_id: targetUserId,
            book_id: bookId,
            book_title: book.title,
            chapter_id: null,
            rating: 5,
            body: 'Một đánh giá công khai để kiểm thử hồ sơ.',
            created_at: now,
          }],
        });
      }

      if (fn === 'get_community_feed') {
        return route.fulfill({
          json: following ? [{
            activity_type: 'review',
            activity_id: '60000000-0000-4000-8000-000000000001',
            actor_user_id: targetUserId,
            actor_name: targetProfile.display_name,
            actor_avatar_url: null,
            book_id: bookId,
            book_title: book.title,
            chapter_id: null,
            rating: 5,
            body: 'Một đánh giá công khai để kiểm thử bảng tin.',
            created_at: now,
          }] : [],
        });
      }

      if (fn === 'get_my_reader_privacy') {
        return route.fulfill({
          json: [{
            user_id: userId,
            profile_public: true,
            show_shelves: false,
            show_reviews: false,
            show_comments: false,
            allow_follows: true,
            created_at: now,
            updated_at: now,
          }],
        });
      }

      if (fn === 'update_reader_privacy') {
        return route.fulfill({
          json: [{
            user_id: userId,
            profile_public: Boolean(data.p_profile_public),
            show_shelves: Boolean(data.p_show_shelves),
            show_reviews: Boolean(data.p_show_reviews),
            show_comments: Boolean(data.p_show_comments),
            allow_follows: Boolean(data.p_allow_follows),
            created_at: now,
            updated_at: new Date().toISOString(),
          }],
        });
      }

      if (fn === 'set_reader_follow') {
        following = Boolean(data.p_following);
        return route.fulfill({ json: following });
      }
      if (fn === 'set_reader_mute') {
        muted = Boolean(data.p_muted);
        return route.fulfill({ json: muted });
      }
      if (fn === 'set_reader_block') {
        blocked = Boolean(data.p_blocked);
        if (blocked) {
          following = false;
          muted = false;
        }
        return route.fulfill({ json: blocked });
      }

      if (fn === 'get_book_review_summary') {
        return route.fulfill({
          json: [{
            average_rating: 4.5,
            rating_count: 2,
            star_1: 0,
            star_2: 0,
            star_3: 0,
            star_4: 1,
            star_5: 1,
            my_review_id: null,
            my_rating: null,
            my_review_text: null,
            my_spoiler: null,
          }],
        });
      }

      if (fn === 'get_personalized_book_ids') {
        return route.fulfill({ json: [{ book_id: bookId, personalized: true, reason_label: 'Dành cho bạn', reason_type: 'popular', score: 1 }] });
      }

      return route.fulfill({ json: [] });
    }

    const table = url.pathname.split('/').at(-1)!;

    if (request.method() !== 'GET') {
      const data = request.postDataJSON() ?? {};
      writes.push({ table, method: request.method(), data });

      if (table === 'chapters') {
        if (data.status === 'published') {
          return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } });
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
        return route.fulfill({ json: { id: chapterId } });
      }

      return route.fulfill({ json: table === 'profiles' ? profile : {} });
    }

    let rows: Record<string, unknown>[] =
      table === 'books' ? [book] :
      table === 'authors' ? [author] :
      table === 'profiles' ? [profile] :
      table === 'book_genres' ? [{ book_id: bookId, genre: 'Fantasy' }] :
      table === 'chapters' ? chapters.map((item) => ({ ...item, is_vip: true, price_coins: 101, scheduled_publish_at: '2027-01-01T00:00:00Z' })) :
      table === 'wallet_accounts' ? [{ user_id: userId, balance_coins: 100, low_spirit_stones: 100, high_spirit_stones: 50 }] :
      table === 'wallet_transactions' ? [] :
      table === 'reading_progress' ? [] :
      table === 'library' ? [] :
      table === 'bookmarks' ? [] :
      table === 'comments' ? [] :
      table === 'comment_likes' ? [] :
      table === 'book_reviews' ? [] :
      table === 'book_review_helpful' ? [] :
      table === 'notifications' ? [] :
      [];

    const number = url.searchParams.get('chapter_number');
    if (number) rows = rows.filter((row) => row.chapter_number === Number(number.replace('eq.', '')));

    if (table === 'chapters' && !url.searchParams.get('select')?.split(',').includes('content') && url.searchParams.get('select') !== '*') {
      rows = rows.map(({ content: _content, ...row }) => row);
    }

    const idFilter = url.searchParams.get('id');
    if (idFilter?.startsWith('eq.')) rows = rows.filter((row) => row.id === idFilter.slice(3));

    const single = request.headers().accept?.includes('vnd.pgrst.object');
    await route.fulfill({ json: single ? rows[0] ?? null : rows });
  });

  return writes;
}

test('backend reader displays backend content, navigates sparse chapter numbers, and never substitutes demo on missing books', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mock(page);

  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Nội dung máy chủ 1', { exact: true })).toBeVisible();
  await expect(page.locator('body')).toContainText('Văn bản từ backend chương 1.');

  await page.getByText('Chương sau', { exact: true }).click();
  await expect(page.getByText('Nội dung máy chủ 4', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/chapter=4/);

  await page.route('**/rest/v1/books?**', (route) => route.fulfill({ json: null }));
  await page.goto(`/reader/${bookId}`);
  await expect(page.getByText('Không tìm thấy truyện công khai.', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Kiếm Yên Vân');
  expect(errors).toEqual([]);
});

test('session restores profile, progress flushes through sync RPC, and logout clears account', async ({ page }) => {
  const writes = await mock(page, true);

  await page.goto('/profile');
  await expect(page.getByText('Độc giả kiểm thử', { exact: true })).toBeVisible();

  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Nội dung máy chủ 1', { exact: true })).toBeVisible();
  await page.mouse.wheel(0, 900);

  // Leaving Reader flushes the current reading progress. AI is intentionally
  // upload-only now and must not be used as a reader-side flush trigger.
  await page.getByLabel('Quay lại trang truyện').click();

  await expect.poll(() => writes.filter((item) => item.table === 'sync_reading_progress').length).toBeGreaterThan(0);
  expect(writes.find((item) => item.table === 'sync_reading_progress')?.data.p_book_id).toBe(bookId);

  await page.goto('/profile');
  await page.getByText('Đăng xuất', { exact: true }).click();
  await expect(page.getByText('Đăng nhập', { exact: true })).toBeVisible();
});

test('chapter autosave serializes insertion and failed publish retains draft state', async ({ page }) => {
  const writes = await mock(page, true);

  await page.goto(`/author/books/${bookId}/chapters/new`);
  await page.getByPlaceholder('Tên chương').fill('Bản thảo mới');
  await page.getByPlaceholder('Bắt đầu câu chuyện…').fill('Nội dung bản thảo mới có ít nhất năm mươi ký tự để thử xuất bản chương.');

  await expect(page.getByText('Đã lưu', { exact: true })).toBeVisible({ timeout: 6000 });
  expect(writes.filter((item) => item.table === 'chapters' && item.method === 'POST')).toHaveLength(1);

  await page.getByText('Xuất bản', { exact: true }).click();
  await expect(page.locator('body')).toContainText('Bạn không có quyền thực hiện thao tác này.');
  await expect(page.getByText('Xuất bản', { exact: true })).toBeVisible();
  await expect(page.getByText('Gỡ xuất bản', { exact: true })).toHaveCount(0);
});

test('login submits email/password and displays account', async ({ page }) => {
  await mock(page);

  await page.goto('/auth/login');
  await page.getByPlaceholder('ban@example.com').fill('reader@example.test');
  await page.getByPlaceholder('Ít nhất 6 ký tự').fill('testing123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

  await expect(page.getByText('Độc giả kiểm thử', { exact: true })).toBeVisible();
});

test('community discovery, follow, public profile and privacy settings stay connected', async ({ page }) => {
  const writes = await mock(page, true);

  await page.goto('/community');
  await expect(page.getByText('Cộng đồng', { exact: true })).toBeVisible();

  await page.getByText('Khám phá độc giả', { exact: true }).first().click();
  await expect(page.getByText('Bạn đọc thử nghiệm', { exact: true })).toBeVisible();

  await page.getByText('Theo dõi', { exact: true }).first().click();
  await expect(page.getByText('Đang theo dõi', { exact: true }).first()).toBeVisible();
  await expect.poll(() => writes.filter((item) => item.table === 'set_reader_follow').length).toBe(1);

  await page.getByText('Bạn đọc thử nghiệm', { exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/user/${targetUserId}`));
  await expect(page.getByText('Kệ sách công khai', { exact: true })).toBeVisible();
  await expect(page.getByText('Truyện từ máy chủ', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Một đánh giá công khai để kiểm thử hồ sơ.', { exact: true })).toBeVisible();

  await page.goto('/profile/privacy');
  await expect(page.getByText('Quyền riêng tư', { exact: true })).toBeVisible();
  await expect(page.getByText('Tiến độ đọc, lịch sử đọc chi tiết, dấu trang và truyện “Đang đọc” luôn được giữ riêng tư.', { exact: true })).toBeVisible();
  await page.getByText('Lưu quyền riêng tư', { exact: true }).click();
  await expect(page.getByText('Đã lưu quyền riêng tư.', { exact: true })).toBeVisible();
  await expect.poll(() => writes.filter((item) => item.table === 'update_reader_privacy').length).toBe(1);
});


test('author book chapters render list and report runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.log('AUTHOR_RUNTIME_ERROR:', error.stack); });
  await mock(page, true);
  await page.goto('/write');
  await page.getByText(book.title, { exact: true }).first().click();
  await expect(page.getByText('Quản lý chương', { exact: true })).toBeVisible();
  await expect(page.getByText('Nội dung máy chủ 1', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});


test('author existing VIP chapter and legacy route show editor, price preview and schedule', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mock(page, true);
  await page.goto(`/author/books/${bookId}/chapters/${chapterId}`);
  await expect(page.getByPlaceholder('Tên chương')).toHaveValue('Nội dung máy chủ 1');
  await expect(page.getByText('Giá Hạ Phẩm Linh Thạch', { exact: true })).toBeVisible();
  await expect(page.getByText(/Giá Thượng Phẩm: 51/)).toBeVisible();
  await expect(page.getByText(/Hẹn đăng ·/)).toBeVisible();
  await page.getByPlaceholder('Tên chương').fill('Chương được chỉnh sửa');
  await page.getByText('Lưu', { exact: true }).click();
  await expect(page.getByText('Đã lưu', { exact: true })).toBeVisible();
  await page.goto(`/author/books/${bookId}/chapter/${chapterId}`);
  await expect(page.getByPlaceholder('Tên chương')).toHaveValue('Nội dung máy chủ 1');
  expect(errors).toEqual([]);
});

test('author errors have retry and back; malformed chapter routes safely return to books', async ({ page }) => {
  await mock(page, true);
  let failing = true;
  await page.route('**/rest/v1/rpc/get_author_chapter_for_editing', (route) => route.fulfill(failing ? { status: 500, json: { message: 'Không thể tải bản thảo kiểm thử.' } } : { json: [chapters[0]] }));
  await page.goto(`/author/books/${bookId}/chapters/${chapterId}`);
  await expect(page.getByText('Thử lại', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Quay lại', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Tên chương')).toHaveCount(0);
  failing = false;
  await page.getByText('Thử lại', { exact: true }).click();
  await expect(page.getByPlaceholder('Tên chương')).toHaveValue('Nội dung máy chủ 1');
  await page.goto('/author/books/invalid/chapters/missing');
  await expect(page).toHaveURL(/\/write$/);
  await expect(page.getByText('Truyện của tôi', { exact: true })).toBeVisible();
});

test('wallet shows distinct balances and premium-only gift packages', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mock(page, true);
  await page.goto('/wallet');
  await expect(page.getByText('Hạ Phẩm', { exact: true })).toBeVisible();
  await expect(page.getByText('Thượng Phẩm', { exact: true })).toBeVisible();
  await expect(page.getByText('100', { exact: true })).toBeVisible();
  await expect(page.getByText('50', { exact: true })).toBeVisible();
  await page.screenshot({ path: '.cache/two-currency-wallet.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('VIP paywall shows both prices, spends selected currency, and offers reward/top-up links', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mock(page, true);
  let unlocked = false;
  let selectedCurrency = '';
  await page.route('**/rest/v1/rpc/get_chapter_for_reading', (route) => route.fulfill({ json: [{ ...chapters[0], content: unlocked ? chapters[0].content : null, lock_kind: unlocked ? null : 'chapter', lock_price_coins: 101 }] }));
  await page.route('**/rest/v1/wallet_accounts?**', (route) => route.fulfill({ json: { user_id: userId, balance_coins: 0, low_spirit_stones: 0, high_spirit_stones: 100 } }));
  await page.route('**/rest/v1/rpc/unlock_chapter_currency', (route) => {
    selectedCurrency = route.request().postDataJSON().p_currency_type;
    unlocked = true;
    return route.fulfill({ json: [{ unlocked: true, already_unlocked: false, balance_coins: 49, price_paid_coins: 51, entitlement_id: chapterId }] });
  });
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('101 Hạ Phẩm · hoặc 51 Thượng Phẩm', { exact: true })).toBeVisible();
  await expect(page.getByText('Xem quảng cáo để nhận Hạ Phẩm', { exact: true })).toBeVisible();
  await expect(page.getByText('Làm nhiệm vụ để nhận Hạ Phẩm', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở khóa bằng Hạ Phẩm · 101' })).toBeDisabled();
  await page.screenshot({ path: '.cache/two-currency-paywall.png', fullPage: true });
  await page.getByRole('button', { name: 'Mở khóa bằng Thượng Phẩm · 51' }).click();
  await expect(page.locator('body')).toContainText('Văn bản từ backend chương 1.');
  expect(selectedCurrency).toBe('high');
  expect(errors).toEqual([]);
});

test('VIP paywall without premium offers recharge and low unlock at full price', async ({ page }) => {
  await mock(page, true);
  let selectedCurrency = '';
  await page.route('**/rest/v1/rpc/get_chapter_for_reading', (route) => route.fulfill({ json: [{ ...chapters[0], content: null, lock_kind: 'chapter', lock_price_coins: 100 }] }));
  await page.route('**/rest/v1/wallet_accounts?**', (route) => route.fulfill({ json: { user_id: userId, balance_coins: 100, low_spirit_stones: 100, high_spirit_stones: 0 } }));
  await page.route('**/rest/v1/rpc/unlock_chapter_currency', (route) => {
    selectedCurrency = route.request().postDataJSON().p_currency_type;
    return route.fulfill({ status: 400, json: { message: 'INSUFFICIENT_COINS' } });
  });
  await page.goto(`/reader/${bookId}?chapter=1`);
  await expect(page.getByText('Nạp Thượng Phẩm Linh Thạch', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mở khóa bằng Hạ Phẩm · 100' }).click();
  await expect(page.getByText('Số dư loại Linh Thạch đã chọn không đủ để mở khóa nội dung này.', { exact: true })).toBeVisible();
  expect(selectedCurrency).toBe('low');
});

test('author profile opens premium gift packages and submits a gift', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mock(page, true);
  await page.route('**/rest/v1/rpc/get_public_reader_profile', (route) => route.fulfill({ json: [{ ...targetProfile, role: 'author', follower_count: 0, following_count: 0, viewer_follows: false, viewer_muted: false, viewer_blocked: false, profile_public: true, allow_follows: true }] }));
  await page.route('**/rest/v1/authors?**', (route) => route.fulfill({ json: { ...author, user_id: targetUserId } }));
  let giftKey = '';
  await page.route('**/rest/v1/rpc/send_author_gift', (route) => {
    giftKey = route.request().postDataJSON().p_gift_key;
    return route.fulfill({ json: [{ gift_id: 'gift-test', amount_coins: 50, balance_coins: 0, author_earnings_coins: 35, platform_share_coins: 15, already_sent: false }] });
  });
  await page.goto(`/user/${targetUserId}`);
  await page.getByText('Tặng quà tác giả', { exact: true }).click();
  await expect(page.getByText('10 Thượng Phẩm Linh Thạch', { exact: true })).toBeVisible();
  await expect(page.getByText('50 Thượng Phẩm Linh Thạch', { exact: true })).toBeVisible();
  await expect(page.getByText('100 Thượng Phẩm Linh Thạch', { exact: true })).toBeVisible();
  await expect(page.getByText('500 Thượng Phẩm Linh Thạch', { exact: true })).toBeVisible();
  await page.screenshot({ path: '.cache/two-currency-gifts.png', fullPage: true });
  await page.getByText('Tặng Tiên Đan · 50 Thượng Phẩm Linh Thạch', { exact: true }).click();
  await expect(page.getByText(/Đã tặng Tiên Đan cho/)).toBeVisible();
  expect(giftKey).toBe('tien_dan');
  expect(errors).toEqual([]);
});

test('followed update center shows real metadata, home badge, and opens the exact next chapter', async ({ page }) => {
  const writes = await mock(page, true);
  await page.route('**/rest/v1/chapters?**', route => route.fulfill({ json: [1, 2, 3, 5, 8].map(n => ({
    ...chapters[0], content: undefined, chapter_number: n, title: `Chương ${n}`,
    id: `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  })) }));
  await page.route('**/rest/v1/rpc/get_chapter_for_reading', route => {
    writes.push({ table: 'get_chapter_for_reading', method: 'POST', data: route.request().postDataJSON() });
    return route.fulfill({ json: [{ ...chapters[0], chapter_number: 5, content: null, is_vip: true, lock_kind: 'chapter', lock_price_coins: 101 }] });
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let chapterQueries = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/rest/v1/chapters') chapterQueries++; });
  await page.goto('/updates');
  await expect(page.getByText('Bạn đang ở Chương 3 · Mới nhất Chương 8')).toBeVisible();
  await expect(page.getByText('Mới nhất: Chương 8 · Chương mới nhất')).toBeVisible();
  await expect(page.getByText('Phát hành:', { exact: false })).toBeVisible();
  expect(chapterQueries).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: '.cache/phase4r2-updates-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Đọc tiếp', exact: true }).click();
  await expect(page).toHaveURL(/\/reader\/.*chapter=5/);
  await expect.poll(() => writes.some(w => w.table === 'get_chapter_for_reading' && w.data.p_chapter_number === 5)).toBe(true);
  await expect(page.getByText('101 Hạ Phẩm · hoặc 51 Thượng Phẩm', { exact: true })).toBeVisible();
  expect(writes.some(w => /unlock|debit/.test(w.table))).toBe(false);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Cập nhật truyện, 2 chương mới', exact: true })).toBeVisible();
  await expect(page.getByText('Cập nhật truyện theo dõi', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: '.cache/phase4r2-home-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Cập nhật truyện, 2 chương mới', exact: true }).click();
  await expect(page).toHaveURL(/\/updates$/);
  expect(errors).toEqual([]);
});

test('update center handles no progress, caught up, empty chapters, pagination and network retry', async ({ page }) => {
  await mock(page, true);
  let fail = true;
  const offsets: number[] = [];
  await page.route('**/rest/v1/rpc/get_my_followed_book_updates', route => {
    if (fail) return route.fulfill({ status: 500, json: { message: 'network failure' } });
    const offset = Number(route.request().postDataJSON().p_offset);
    offsets.push(offset);
    const rows = offset === 0 ? Array.from({ length: 20 }, (_, i) => ({ ...followedUpdate,
      book_id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      title: `Truyện cập nhật ${i + 1}`,
      ...(i === 0 ? { current_chapter_number: null, next_chapter_number: 5 } : {}),
      ...(i === 1 ? { current_chapter_number: 8, next_chapter_number: null, unread_count: 0, has_updates: false } : {}),
      ...(i === 2 ? { published_count: 0, latest_chapter_number: null, latest_published_at: null, current_chapter_number: null, next_chapter_number: null, unread_count: 0, has_updates: false } : {}),
    })) : [];
    return route.fulfill({ json: rows });
  });
  await page.goto('/updates');
  await expect(page.getByText('Không thể tải cập nhật truyện. Vui lòng thử lại.')).toBeVisible();
  fail = false;
  await page.getByText('Thử lại', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đọc từ đầu', exact: true })).toBeVisible();
  await expect(page.getByText('Đã đọc đến chương mới nhất', { exact: true })).toBeVisible();
  await expect(page.getByText('Chưa có chương đã phát hành', { exact: true })).toBeVisible();
  // React Native's virtualized list renders its footer after scrolling.
  for (let i = 0; i < 15 && !(await page.getByText('Tải thêm', { exact: true }).isVisible()); i++) {
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(100);
  }
  await page.getByText('Tải thêm', { exact: true }).click();
  await expect(page.getByText('Đã hiển thị tất cả truyện đang theo dõi')).toBeVisible();
  expect(offsets).toEqual([0, 20]);
});

test('update center requires login and never substitutes demo followed books', async ({ page }) => {
  await mock(page);
  await page.goto('/updates');
  await expect(page.getByText('Đăng nhập để xem cập nhật')).toBeVisible();
  await expect(page.getByText(book.title, { exact: true })).toHaveCount(0);
});

test('release notifications keep single chapter links and send batches to real unread updates', async ({ page }) => {
  const writes = await mock(page, true);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const notificationRows = [
    { id: '50000000-0000-4000-8000-000000000001', user_id: userId, category: 'release', event_type: 'chapter_published',
      title: 'Truyện theo dõi vừa có chương mới', body: `${book.title} · Chương 1: Nội dung máy chủ 1`,
      action_route: `/reader/${bookId}?chapter=1`, metadata: { book_id: bookId, batch_count: 1 }, read_at: null, created_at: now },
    { id: '50000000-0000-4000-8000-000000000002', user_id: userId, category: 'release', event_type: 'chapter_published',
      title: 'Truyện theo dõi vừa có 5 chương mới', body: `${book.title} vừa có 5 chương mới`,
      action_route: '/updates', metadata: { book_id: bookId, batch_count: 5 }, read_at: null, created_at: now },
  ];
  await page.route('**/rest/v1/notifications?**', route => route.fulfill({ json: notificationRows }));
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/notifications');
    await expect(page.getByText(notificationRows[0].body, { exact: true })).toBeVisible();
    await expect(page.getByText(notificationRows[1].body, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.getByText(notificationRows[1].body, { exact: true }).click();
  await expect(page).toHaveURL(/\/updates$/);
  await expect(page.getByText('Bạn đang ở Chương 3 · Mới nhất Chương 8')).toBeVisible();
  // The release batch count is five, but the Update Center owns the current
  // unread count (two here); notifications never recalculate it.
  await expect(page.getByText('2 chương mới', { exact: true }).first()).toBeVisible();
  expect(writes.some(w => w.table === 'mark_notification_read' && w.data.p_notification_id === notificationRows[1].id)).toBe(true);
  expect(writes.some(w => w.table === 'get_my_followed_book_updates')).toBe(true);
  await page.goto('/notifications');
  await page.getByText(notificationRows[0].body, { exact: true }).click();
  await expect(page).toHaveURL(/\/reader\/.*chapter=1/);
  expect(writes.some(w => /unlock|debit/.test(w.table))).toBe(false);
  expect(errors).toEqual([]);
});

test('creator hub shares author follow with book detail and preserves reader social routes', async ({ page }) => {
  await mock(page, true);
  let authorFollowing = false;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/rest/v1/authors?**', route => route.fulfill({ json: [{ ...author, user_id: targetUserId }] }));
  await page.route('**/rest/v1/author_follows?**', route => {
    const method = route.request().method();
    if (method === 'POST') authorFollowing = true;
    if (method === 'DELETE') authorFollowing = false;
    return route.fulfill({ json: method === 'GET' ? authorFollowing ? { user_id: userId } : null : {} });
  });
  await page.route('**/rest/v1/rpc/get_public_author_hub', route => route.fulfill({ json: [{
    author_id: authorId, pen_name: author.pen_name, bio: 'Hồ sơ sáng tác công khai', avatar_url: null,
    verified: true, followers_count: authorFollowing ? 1 : 0, public_books_count: 1,
    viewer_follows: authorFollowing, viewer_is_author: false, viewer_can_follow: true,
    gift_book_id: bookId, gift_book_title: book.title,
  }] }));
  await page.route('**/rest/v1/rpc/get_public_author_books', route => route.fulfill({ json: [{ ...book, genre: 'Fantasy' }] }));
  await page.goto(`/book/${bookId}`);
  await page.getByText('Theo dõi tác giả', { exact: true }).click();
  await expect.poll(() => authorFollowing).toBe(true);
  await page.getByText(author.pen_name, { exact: true }).last().click();
  await expect(page).toHaveURL(new RegExp(`/creator/${authorId}`));
  await expect(page.getByRole('button', { name: 'Đang theo dõi', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đang theo dõi', exact: true }).click();
  await expect.poll(() => authorFollowing).toBe(false);
  await page.getByRole('button', { name: 'Quay lại' }).click();
  await expect(page.getByText('Theo dõi tác giả', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('public creator catalog paginates on mobile and desktop; anonymous follow requires login', async ({ page }) => {
  await mock(page);
  const offsets: number[] = [];
  await page.route('**/rest/v1/rpc/get_public_author_hub', route => route.fulfill({ json: [{
    author_id: authorId, pen_name: 'Tác giả công khai', bio: 'Tiểu sử tác giả', avatar_url: null,
    verified: true, followers_count: 12, public_books_count: 21,
    viewer_follows: false, viewer_is_author: false, viewer_can_follow: false,
    gift_book_id: null, gift_book_title: null,
  }] }));
  await page.route('**/rest/v1/rpc/get_public_author_books', route => {
    const { p_limit, p_offset } = route.request().postDataJSON();
    expect(p_limit).toBe(20); offsets.push(p_offset);
    return route.fulfill({ json: Array.from({ length: p_offset === 0 ? 20 : 1 }, (_, i) => ({ ...book, id: `catalog-${p_offset+i}`, title: `Truyện công khai ${p_offset+i}`, genre: 'Fantasy' })) });
  });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/creator/${authorId}`);
    await expect(page.getByText('Tác giả công khai', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Chưa có truyện công khai để nhận quà.', { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/creator-profile-${width}.png` });
    await page.getByRole('button', { name: 'Xem thêm truyện' }).click();
    await expect(page.getByText('Đã hiển thị tất cả truyện công khai.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/creator-${width}.png`, fullPage: true });
  }
  expect(offsets).toEqual([0,20,0,20]);
  await page.getByRole('button', { name: 'Theo dõi tác giả' }).click();
  await expect(page).toHaveURL(/\/auth\/login/);
});

test('creator hub handles unavailable author and catalog retry', async ({ page }) => {
  await mock(page);
  await page.route('**/rest/v1/rpc/get_public_author_hub', route => route.fulfill({ json: [] }));
  await page.goto(`/creator/${authorId}`);
  await expect(page.getByText('Không tìm thấy tác giả', { exact: true })).toBeVisible();
  await page.route('**/rest/v1/rpc/get_public_author_hub', route => route.fulfill({ status: 500, json: { message: 'network unavailable' } }));
  await page.reload();
  await expect(page.getByText('Thử lại', { exact: true })).toBeVisible();
});

test('notification settings save new_books independently from chapter releases', async ({ page }) => {
  await mock(page, true);
  let saved: Record<string, unknown> | undefined;
  await page.route('**/rest/v1/notification_preferences?**', route => route.fulfill({ json: {
    user_id: userId, in_app_enabled: true, purchases: true, author_earnings: true,
    payouts: true, comments: true, moderation: true, new_chapters: false,
    new_books: true, system: true, push_enabled: false,
  } }));
  await page.route('**/rest/v1/rpc/update_notification_preferences', route => {
    saved = route.request().postDataJSON();
    return route.fulfill({ json: {} });
  });
  await page.goto('/notifications/settings');
  const row = page.getByText('Truyện mới từ tác giả theo dõi', { exact: true }).locator('..').locator('..');
  await expect(page.getByText('Nhận thông báo khi tác giả bạn theo dõi phát hành truyện mới.', { exact: true })).toBeVisible();
  await row.getByRole('switch').click();
  await expect.poll(() => saved?.p_new_books).toBe(false);
  expect(saved?.p_new_chapters).toBe(false);
  expect(saved?.p_purchases).toBe(true);
  expect(saved?.p_push_enabled).toBe(false);
});
