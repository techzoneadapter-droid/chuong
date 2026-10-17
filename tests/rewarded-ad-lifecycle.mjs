import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../services/rewardedAds.native.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
async function scenario(events, expected) {
  const listeners = new Map();
  let timeout, timerCleared = false, settled = false;
  const sdk = {
    __esModule: true, default: () => ({ initialize: async () => {} }),
    AdsConsent: { getConsentInfo: async () => ({ canRequestAds: true }) },
    AdEventType: { CLOSED: 'closed', ERROR: 'error' },
    RewardedAdEventType: { LOADED: 'loaded', EARNED_REWARD: 'earned' },
    TestIds: { REWARDED: 'test-unit' },
    RewardedAd: { createForAdRequest: unit => {
      assert.equal(unit, 'test-unit');
      return {
        addAdEventListener: (event, fn) => { listeners.set(event, fn); return () => listeners.delete(event); },
        show: async () => {}, load: () => {},
      };
    } },
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports, __DEV__: true, process: { env: {} },
    setTimeout: fn => { timeout = fn; return 1; },
    clearTimeout: () => { timerCleared = true; },
    require: name => {
      if (name === 'expo-constants') return { __esModule: true, default: { appOwnership: 'standalone' } };
      if (name === 'react-native') return { Platform: { OS: 'android' } };
      if (name === './admobUnits') return { realAdsEnabled: () => false };
      if (name === 'react-native-google-mobile-ads') return sdk;
      throw Error(name);
    },
  });
  const result = exports.showDailyRewardedAd('user', 'ticket').then(value => { settled = true; return value; });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  for (const event of events) {
    if (event === 'timeout') timeout();
    else if (event === 'long-video') {
      assert.equal(timerCleared, true, 'loading timeout cancelled after load');
      assert.equal(settled, false, 'wait for video close before returning to app');
    } else listeners.get(event)?.();
    await Promise.resolve();
  }
  assert.equal(await result, expected);
  assert.equal(listeners.size, 0, 'SDK listeners cleaned up');
}
await scenario(['loaded', 'long-video', 'earned', 'long-video', 'closed'], 'earned');
await scenario(['loaded', 'closed'], 'closed');
await scenario(['timeout'], 'unavailable');
await scenario(['error'], 'unavailable');
console.log('PASS: long video, reward then close, early close, load timeout and SDK error');
