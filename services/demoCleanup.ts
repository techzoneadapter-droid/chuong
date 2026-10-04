import AsyncStorage from '@react-native-async-storage/async-storage';
import { removeOfflineBook } from './offlineDownloads';

const CLEANUP_MARKER = 'chuong:retired-demo-cleanup:2026-10-04';

const RETIRED_DEMO_BOOK_IDS = new Set([
  'b1111111-1111-4111-8111-111111111111',
  'b2222222-2222-4222-8222-222222222222',
  'b3333333-3333-4333-8333-333333333333',
  'b4444444-4444-4444-8444-444444444444',
  'kiem-yen-van',
  'thanh-pho-sau-mua',
  'nguoi-giu-ky-uc',
  'he-thong-tiem-nho',
  'trieu-dai-cuoi-cung',
  'hang-thu-bay',
  'tram-thu-phat-song',
  'bep-lua-mua-dong',
  'mat-troi-duoi-day-bien',
  'mua-phuong-nam',
  'hoa-tieu-tren-may',
  'tiem-anh-cuoi-pho',
]);

function isDemoBookId(value: unknown) {
  return typeof value === 'string' && RETIRED_DEMO_BOOK_IDS.has(value);
}

export async function purgeRetiredDemoState() {
  if (await AsyncStorage.getItem(CLEANUP_MARKER)) return;

  for (const bookId of RETIRED_DEMO_BOOK_IDS) {
    await removeOfflineBook(bookId).catch(() => 0);
  }

  const keys = await AsyncStorage.getAllKeys();
  for (const key of keys) {
    if (key.startsWith('chuong:library')) {
      try {
        const raw = await AsyncStorage.getItem(key);
        const rows = raw ? JSON.parse(raw) : [];
        if (Array.isArray(rows)) {
          await AsyncStorage.setItem(key, JSON.stringify(rows.filter((row) => !isDemoBookId(row?.bookId))));
        }
      } catch {}
      continue;
    }

    if (key.startsWith('chuong:bookmarks')) {
      try {
        const raw = await AsyncStorage.getItem(key);
        const rows = raw ? JSON.parse(raw) : [];
        if (Array.isArray(rows)) {
          await AsyncStorage.setItem(key, JSON.stringify(rows.filter((row) => !isDemoBookId(row?.bookId))));
        }
      } catch {}
      continue;
    }

    if (key.startsWith('chuong:reading-progress')) {
      try {
        const raw = await AsyncStorage.getItem(key);
        const rows = raw ? JSON.parse(raw) : {};
        if (rows && typeof rows === 'object' && !Array.isArray(rows)) {
          for (const bookId of Object.keys(rows)) if (isDemoBookId(bookId)) delete rows[bookId];
          await AsyncStorage.setItem(key, JSON.stringify(rows));
        }
      } catch {}
    }
  }

  await AsyncStorage.setItem(CLEANUP_MARKER, new Date().toISOString());
}
