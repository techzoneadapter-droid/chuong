import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const appJson = readJson('app.json');
const packageJson = readJson('package.json');
const easJson = readJson('eas.json');
const expo = appJson.expo ?? {};

const passes = [];
const warnings = [];

function check(condition, message) {
  assert.ok(condition, message);
  passes.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

check(expo.name === 'CHƯƠNG', 'App name is CHƯƠNG');
check(expo.slug === 'chuong', 'Expo slug is stable');
check(expo.scheme === 'chuong', 'Deep-link scheme is configured');
check(/^\d+\.\d+\.\d+$/.test(expo.version ?? ''), 'App version is valid semver');
check(expo.android?.package === 'vn.chuong.app', 'Android application ID is stable');
check(expo.ios?.bundleIdentifier === 'vn.chuong.app', 'iOS bundle identifier is stable');
check(packageJson.main === 'expo-router/entry', 'Expo Router entry is configured');
check(Boolean(packageJson.dependencies?.['expo-router']), 'Expo Router dependency exists');
check(Boolean(packageJson.dependencies?.['expo-notifications']), 'Push notification dependency exists');
check(Boolean(packageJson.dependencies?.['expo-iap']), 'Store billing dependency exists');
check(packageJson.dependencies?.['expo-speech'] === '~14.0.8', 'Expo Speech matches SDK 54 compatible version');
check(Boolean(easJson.build?.preview), 'EAS preview build profile exists');
check(Boolean(easJson.build?.production), 'EAS production build profile exists');
check(easJson.build?.production?.autoIncrement === true, 'Production build auto-increments native build numbers');

const requiredFiles = [
  'app/(tabs)/index.tsx',
  'app/(tabs)/discover.tsx',
  'app/(tabs)/library.tsx',
  'app/(tabs)/profile.tsx',
  'app/book/[id].tsx',
  'app/reader/[bookId].tsx',
  'app/downloads.tsx',
  'app/recommendations.tsx',
  'app/community/index.tsx',
  'app/user/[id].tsx',
  'app/profile/privacy.tsx',
  'app/notifications/index.tsx',
  'app/settings/index.tsx',
  'app/settings/reading.tsx',
  'app/admin/catalog/index.tsx',
  'app/admin/catalog/new.tsx',
  'app/admin/catalog/[bookId].tsx',
  'app/admin/catalog/import.tsx',
  'app/author/books/[bookId]/import.tsx',
  'components/XianxiaBackdrop.tsx',
  'components/Artwork.tsx',
  'constants/xianxia.ts',
  'constants/artwork.ts',
  'assets/xianxia/app-background.jpg',
  'assets/xianxia/icon.png',
  'assets/xianxia/library-banner.png',
  'assets/xianxia/empty-library.png',
  'assets/xianxia/nav-home.png',
  'assets/xianxia/nav-discover.png',
  'assets/xianxia/nav-write.png',
  'assets/xianxia/nav-library.png',
  'assets/xianxia/nav-profile.png',
  'assets/xianxia/lotus.png',
  'assets/xianxia/button-jade.png',
  'assets/xianxia/divider.png',
  'assets/xianxia/badge-vip.png',
  'constants/brand-logo.ts',
  'constants/brand-logo/chunk1.ts',
  'constants/brand-logo/chunk2.ts',
  'constants/brand-logo/chunk3.ts',
  'constants/brand-logo/chunk4.ts',
  'services/adminCatalog.ts',
  'services/adminImport.ts',
  'services/authorImport.ts',
  'services/premiumAi.ts',
  'services/tts.ts',
  'hooks/useTtsPlayer.ts',
  'services/community.ts',
  'services/offlineDownloads.ts',
  'services/offlineSync.ts',
  'services/pushNotifications.ts',
  'services/store.ts',
  'services/analytics.ts',
  'docs/IAP_SETUP.md',
  'docs/PUSH_NOTIFICATIONS.md',
  'docs/OFFLINE_READING.md',
  'docs/READING_ANALYTICS.md',
  'docs/READ_ALOUD.md',
  'supabase/functions/ai-translate-book/index.ts',
  'supabase/migrations/202610040001_phase4n_premium_ai_translation.sql',
  'docs/COMMUNITY_SOCIAL.md',
];
for (const file of requiredFiles) {
  check(existsSync(new URL(file, root)), `Required release surface exists: ${file}`);
}

const homeSource = readFileSync(new URL('app/(tabs)/index.tsx', root), 'utf8');
const artworkSource = readFileSync(new URL('constants/artwork.ts', root), 'utf8');
const artworkComponentSource = readFileSync(new URL('components/Artwork.tsx', root), 'utf8');
const brandLogoSource = readFileSync(new URL('constants/brand-logo.ts', root), 'utf8');
check(homeSource.includes('BrandLockup'), 'Home uses the shared CHƯƠNG brand lockup');
check(!homeSource.includes('artwork.logo'), 'Home does not render the retired raster wordmark');
check(!artworkSource.includes("logo: require"), 'Retired horizontal logo is not registered for runtime use');
check(brandLogoSource.includes('data:image/png;base64'), 'New supplied CHƯƠNG logo is wired into runtime branding');
check(artworkComponentSource.includes("coverUrl"), 'Book covers still support uploaded cover_url values');
check(artworkComponentSource.includes('Chưa có bìa'), 'Missing book covers use a neutral no-cover state');
check(!artworkSource.includes('coverPalace') && !artworkSource.includes('coverBamboo') && !artworkSource.includes('coverArchive'), 'Demo cover assets are not registered at runtime');
check(!homeSource.includes('CHƯỞNG'), 'Home source contains no CHƯỞNG typo');

const ttsSource = readFileSync(new URL('services/tts.ts', root), 'utf8');
const ttsHookSource = readFileSync(new URL('hooks/useTtsPlayer.ts', root), 'utf8');
check(ttsSource.includes("from 'expo-speech'"), 'Read-aloud uses Expo Speech instead of simulated playback');
check(ttsSource.includes('Never fall back to an English/foreign voice'), 'TTS forbids foreign voice fallback for Vietnamese chapters');
check(ttsHookSource.includes('speakTtsSegment') && ttsHookSource.includes('seekBySeconds'), 'TTS controller supports real playback and approximate seeking');

const profileSource = readFileSync(new URL('app/(tabs)/profile.tsx', root), 'utf8');
const readerSource = readFileSync(new URL('app/reader/[bookId].tsx', root), 'utf8');
const settingsSource = readFileSync(new URL('app/settings/reading.tsx', root), 'utf8');
const bulkImportSource = readFileSync(new URL('app/admin/catalog/import.tsx', root), 'utf8');
const readerToolbarSource = readFileSync(new URL('components/ReaderToolbar.tsx', root), 'utf8');
const authorImportSource = readFileSync(new URL('app/author/books/[bookId]/import.tsx', root), 'utf8');
const premiumAiSource = readFileSync(new URL('services/premiumAi.ts', root), 'utf8');
const aiWorkerSource = readFileSync(new URL('supabase/functions/ai-translate-book/index.ts', root), 'utf8');
check(profileSource.includes("'/settings/reading'") && profileSource.includes("'/settings'"), 'Profile settings rows navigate to functional screens');
check(readerSource.includes('pagedContent') && readerSource.includes('goReaderPage'), 'Reader page mode is implemented beyond preview-only UI');
check(settingsSource.includes("reader:settings"), 'Reader appearance settings share the live persistent reader key');
check(bulkImportSource.includes('parseAdminImportFile') && bulkImportSource.includes('importAdminCatalogChapters'), 'Admin bulk import is wired from parsing to chapter creation');
check(!readerToolbarSource.includes("label: 'AI'"), 'Reader toolbar contains no reader-facing AI feature');
check(authorImportSource.includes('AI dịch / làm mượt toàn truyện') && authorImportSource.includes('premium?.premium'), 'AI translation exists only in the author upload workflow and is Premium-gated in UI');
check(premiumAiSource.includes("functions.invoke('ai-translate-book'"), 'Premium AI client calls the server worker');
check(aiWorkerSource.includes('has_active_premium') && aiWorkerSource.includes('AI_TRANSLATE_API_KEY'), 'Server worker re-checks Premium and keeps AI credentials server-side');

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(new URL('.', root).pathname, path).replaceAll('\\', '/');
    if (
      name === 'node_modules' ||
      name === '.git' ||
      name === '.expo' ||
      name === 'dist' ||
      name === '.cache' ||
      rel.startsWith('docs/') ||
      rel.startsWith('tests/') ||
      rel.startsWith('supabase/migrations/') ||
      rel.startsWith('supabase/functions/')
    ) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, files);
    else if (/\.(ts|tsx|js|jsx|json)$/.test(name)) files.push(path);
  }
  return files;
}

const sourceFiles = walk(new URL('.', root).pathname);
const forbidden = [
  { pattern: /sb_secret_[A-Za-z0-9_-]+/g, label: 'Supabase secret key' },
  { pattern: /SUPABASE_SERVICE_ROLE_KEY/g, label: 'Supabase service-role env key' },
  { pattern: /BEGIN PRIVATE KEY/g, label: 'private key material' },
];
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    check(!rule.pattern.test(text), `No ${rule.label} in client source: ${relative(new URL('.', root).pathname, file)}`);
    rule.pattern.lastIndex = 0;
  }
}

warn(Boolean(expo.icon), 'Store icon is not configured in app.json yet.');
warn(Boolean(expo.android?.adaptiveIcon), 'Android adaptive icon is not configured yet.');
warn(Boolean(expo.splash || expo.plugins?.some?.((item) => Array.isArray(item) && item[0] === 'expo-splash-screen')), 'Custom splash screen is not configured yet.');
warn(Boolean(expo.extra?.eas?.projectId), 'Expo/EAS projectId is not linked in app.json yet; native push/build setup still needs the real EAS project.');
warn(expo.version !== '0.1.0', 'Version is still 0.1.0; choose the public store version before production submission.');

console.log(`PASS: ${passes.length} automated release checks`);
if (warnings.length) {
  console.log(`WARN: ${warnings.length} manual release items remain`);
  for (const item of warnings) console.log(`- ${item}`);
} else {
  console.log('WARN: 0 manual release items detected by this static check');
}
