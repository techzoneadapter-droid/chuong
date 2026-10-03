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

      if (fn === 'get_unread_notification_count') return route.fulfill({ json: 0 });

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
      table === 'chapters' ? chapters :
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

  await page.getByText('AI', { exact: true }).click();
  await page.getByText('Convert chuẩn', { exact: false }).click();

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

  await page.getByText('Khám phá độc giả', { exact: true }).click();
  await expect(page.getByText('Bạn đọc thử nghiệm', { exact: true })).toBeVisible();

  await page.getByText('Theo dõi', { exact: true }).click();
  await expect(page.getByText('Đang theo dõi', { exact: true })).toBeVisible();
  await expect.poll(() => writes.filter((item) => item.table === 'set_reader_follow').length).toBe(1);

  await page.getByText('Bạn đọc thử nghiệm', { exact: true }).click();
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
