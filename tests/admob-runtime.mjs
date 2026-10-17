import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const appConfig = readFileSync(new URL('../app.config.js', import.meta.url), 'utf8');
for (const [env, live] of [
  [{}, false],
  [{ EAS_BUILD_PROFILE: 'production' }, false],
  [{ EAS_BUILD_PROFILE: 'development', EXPO_PUBLIC_ADMOB_LIVE: 'true' }, false],
  [{ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_ADMOB_LIVE: 'true' }, true],
]) {
  const module = { exports: {} };
  vm.runInNewContext(appConfig, { module, process: { env }, require: () => ({ expo: { plugins: [] } }) });
  const [, config] = module.exports.expo.plugins[0];
  assert.equal(config.androidAppId, live ? 'ca-app-pub-2610920886028786~8409797383' : 'ca-app-pub-3940256099942544~3347511713');
  assert.equal(config.delayAppMeasurementInit, true);
}

const membershipSource = ts.transpileModule(readFileSync(new URL('../services/membership.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let cache = null, premium = false, offline = false;
const exports = {};
vm.runInNewContext(membershipSource, {
  exports,
  require: name => {
    if (name.includes('asyncWork')) return { createSingleFlight: () => (_key, work) => work() };
    if (name.includes('async-storage')) return { __esModule: true, default: {
      getItem: async () => cache, setItem: async (_, value) => { cache = value; },
    } };
    if (name.includes('supabase')) return { supabase: { functions: { invoke: async () => offline
      ? { error: Error('offline') } : { data: { premium } } } } };
    throw Error(name);
  },
});
assert.equal((await exports.getMembershipStatus()).showAds, true);
premium = true;
assert.equal((await exports.getMembershipStatus('vip')).showAds, false);
offline = true;
assert.equal((await exports.getMembershipStatus('vip')).showAds, false, 'cached VIP remains ad free');
cache = null;
assert.equal((await exports.getMembershipStatus('unknown')).showAds, false, 'unverified account remains ad free');
offline = false; premium = false;
assert.equal((await exports.getMembershipStatus('standard')).showAds, true);
console.log('PASS: sample App IDs by default, explicit live release gate, VIP/cache/offline suppression');

let shown = 0;
const interstitial = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../services/chapterInterstitial.native.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: interstitial, __DEV__: true, Date, process: { env: {} }, require: name => {
  if (name === 'react-native') return { Platform: { OS: 'android' } };
  if (name === './admobUnits') return { realAdsEnabled: () => false };
  if (name === 'react-native-google-mobile-ads') return {
    TestIds: { INTERSTITIAL: 'google-sample' }, AdEventType: { LOADED: 'loaded', ERROR: 'error', CLOSED: 'closed' },
    InterstitialAd: { createForAdRequest: () => {
      const listeners = new Map();
      return { addAdEventListener: (event, listener) => { listeners.set(event, listener); return () => listeners.delete(event); },
        load: () => listeners.get('loaded')?.(), show: () => { shown++; throw Error('native synchronous SDK failure'); } };
    } },
  };
  throw Error(name);
} });
interstitial.allowChapterInterstitials();
for (let index = 0; index < 4; index++) assert.doesNotThrow(() => interstitial.onFinishedChapterAdvance());
assert.equal(shown, 1);
interstitial.disableChapterInterstitials();
for (let index = 0; index < 10; index++) interstitial.onFinishedChapterAdvance();
assert.equal(shown, 1, 'Disabled/VIP ads cannot display');
console.log('PASS: synchronous interstitial SDK failures never escape chapter boundary and disabled ads stay suppressed');
