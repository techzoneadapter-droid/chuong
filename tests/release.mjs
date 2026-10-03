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
  'docs/COMMUNITY_SOCIAL.md',
];
for (const file of requiredFiles) {
  check(existsSync(new URL(file, root)), `Required release surface exists: ${file}`);
}

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
      rel.startsWith('supabase/migrations/')
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
