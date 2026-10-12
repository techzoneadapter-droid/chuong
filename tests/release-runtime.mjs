import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, URL, URLSearchParams, process,
    require: name => { assert.ok(name in dependencies, name); return dependencies[name]; }, ...globals });
  return module.exports;
}
const links = load('../lib/authRecovery.ts', {});
const environment = load('../supabase/functions/_shared/storeEnvironment.ts', {});
assert.throws(() => environment.requireStoreEnvironment(undefined), /not_configured/);
assert.throws(() => environment.requireStoreEnvironment('auto'), /not_configured/);
assert.throws(() => environment.assertStoreEnvironment('production', true), /mismatch/);
assert.throws(() => environment.assertStoreEnvironment('sandbox', false), /mismatch/);
environment.assertStoreEnvironment('production', false);
environment.assertStoreEnvironment('sandbox', true);
assert.equal(environment.appleStoreBase('sandbox'), 'https://api.storekit-sandbox.apple.com');
assert.equal(links.parseNativeRecoveryUrl('https://evil.example/auth/reset#access_token=a&refresh_token=r'), null);
assert.equal(links.parseNativeRecoveryUrl('chuong://reader/reset#access_token=a&refresh_token=r'), null);
assert.equal(links.parseNativeRecoveryUrl('chuong://auth/reset#access_token=a'), null);
assert.equal(links.parseNativeRecoveryUrl('chuong://auth/reset#access_token=a&refresh_token=r').refreshToken, 'r');
assert.equal(links.parseNativeRecoveryUrl('chuong://auth/reset?code=recovery').code, 'recovery');

let allowed = false, gathers = 0, initializes = 0;
const ads = load('../services/adConsent.native.ts', {
  'react-native-google-mobile-ads': { default: () => ({ initialize: async () => { initializes++; } }),
    AdsConsent: { gatherConsent: async () => { gathers++; }, getConsentInfo: async () => ({ canRequestAds: allowed, privacyOptionsRequirementStatus: 'REQUIRED' }),
      showPrivacyOptionsForm: async () => ({ canRequestAds: false }) } },
});
const one = ads.ensureAdsConsent(), two = ads.ensureAdsConsent();
assert.equal(one, two);
assert.equal(await one, false);
assert.equal(initializes, 0);
allowed = true;
assert.equal(await ads.ensureAdsConsent(), true);
assert.equal(await ads.ensureAdsConsent(), true);
assert.equal(initializes, 1);
assert.equal(gathers, 2);
let observedConsent;
const unsubscribe = ads.subscribeAdsConsent(() => { observedConsent = ads.getAdsConsentSnapshot(); });
assert.equal(await ads.showAdPrivacyOptions(), true);
assert.equal(observedConsent, false, 'Revoked consent propagates to mounted ad surfaces');
unsubscribe();

let purchases = [], failure = null, verified = 0, finished = 0;
const states = [];
const react = { useState: value => { const index = states.length; states.push(value); return [value, next => { states[index] = next; }]; },
  useRef: value => ({ current: value }), useCallback: fn => fn, useMemo: fn => fn(), useEffect: () => {} };
const premium = load('../hooks/usePremiumIap.native.ts', {
  react, 'react-native': { Platform: { OS: 'android' } },
  'expo-iap': { ErrorCode: { UserCancelled: 'cancelled' }, useIAP: () => ({ connected: true, restorePurchases: async () => { if (failure) throw failure; } }),
    getAvailablePurchases: async () => purchases, finishTransaction: async () => { finished++; } },
  '../services/subscriptions': { nativeSubscriptionProvider: () => 'google_play', defaultPremiumProductId: () => 'vip',
    verifyPremiumSubscription: async () => { verified++; return { premium: true }; } },
});
const hook = premium.usePremiumIap('user');
await hook.restore();
assert.equal(states[3], false, 'Empty restore always clears spinner');
assert.match(states[4], /Không tìm thấy/);
purchases = [{ productId: 'vip', id: 'transaction' }];
await hook.restore(); await hook.restore();
assert.equal(verified, 2, 'An explicit restore must revalidate previously handled subscriptions');
assert.equal(finished, 2);
assert.equal(states[3], false);
failure = new Error('Store unavailable'); await hook.restore();
assert.equal(states[3], false);
assert.match(states[4], /Store unavailable/);
console.log('PASS: scoped recovery deep links, shared consent denial/retry, VIP empty/repeated/failed restore');
