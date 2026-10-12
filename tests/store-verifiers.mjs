import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

function load(path, dependencies, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Request, Response, TextEncoder, TextDecoder,
    URLSearchParams, Error, crypto: webcrypto, btoa, atob, console,
    require: name => { assert.ok(name in dependencies, name); return dependencies[name]; }, ...globals });
  return module.exports;
}
const shared = load('../supabase/functions/_shared/storeEnvironment.ts', {});
const rsa = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign','verify']);
const ec = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign','verify']);
const pem = async key => `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await webcrypto.subtle.exportKey('pkcs8', key)).toString('base64')}\n-----END PRIVATE KEY-----`;
const userId = '10000000-0000-4000-8000-000000000001';
const env = { SUPABASE_URL: 'http://localhost', SUPABASE_SERVICE_ROLE_KEY: 'test-only', IAP_ENVIRONMENT: 'sandbox',
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'fixture@example.test', private_key: await pem(rsa.privateKey) }),
  ANDROID_PACKAGE_NAME: 'vn.chuong.app', APPLE_BUNDLE_ID: 'vn.chuong.app', APPLE_IAP_ISSUER_ID: 'fixture',
  APPLE_IAP_KEY_ID: 'fixture', APPLE_IAP_PRIVATE_KEY: await pem(ec.privateKey), PREMIUM_GOOGLE_PRODUCT_ID: 'vip', PREMIUM_APPLE_PRODUCT_ID: 'vip' };
let providerSandbox = true, credits = 0, authorized = true;
let currentProduct = 'coins', subscription = false;
const urls = [];
const client = {
  auth: { getUser: async () => ({ data: { user: authorized ? { id: userId } : null }, error: null }) },
  rpc: async name => { if (name !== 'has_active_premium') credits++; return { data: name === 'has_active_premium' ? false : {}, error: null }; },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { balance_coins: 100 }, error: null }) }) }) }),
};
const fetch = async url => {
  urls.push(String(url));
  if (String(url).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'fixture-access' });
  if (String(url).includes('androidpublisher.googleapis.com')) return Response.json(subscription ? {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', externalAccountIdentifiers: { obfuscatedExternalAccountId: userId },
    lineItems: [{ productId: currentProduct, expiryTime: new Date(Date.now() + 86400000).toISOString() }],
    ...(providerSandbox ? { testPurchase: {} } : {}),
  } : { purchaseStateContext: { purchaseState: 'PURCHASED' }, obfuscatedExternalAccountId: userId,
    productLineItem: [{ productId: currentProduct }], orderId: 'fixture-order', ...(providerSandbox ? { testPurchaseContext: {} } : {}) });
  const payload = { transactionId: 'fixture-tx', originalTransactionId: 'fixture-tx', appAccountToken: userId,
    productId: currentProduct, bundleId: 'vn.chuong.app', environment: providerSandbox ? 'Sandbox' : 'Production',
    type: subscription ? 'Auto-Renewable Subscription' : 'Consumable', expiresDate: Date.now() + 86400000 };
  return Response.json({ signedTransactionInfo: `fixture.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture` });
};
for (const kind of ['iap-verify', 'subscription-verify']) {
  subscription = kind === 'subscription-verify'; currentProduct = subscription ? 'vip' : 'coins';
  let handler;
  load(`../supabase/functions/${kind}/index.ts`, {
    'jsr:@supabase/functions-js/edge-runtime.d.ts': {}, 'npm:@supabase/supabase-js@2': { createClient: () => client },
    '../_shared/storeEnvironment.ts': shared,
  }, { fetch, Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } } });
  const call = body => handler(new Request('http://localhost/verify', { method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const payload = provider => ({ provider, productId: currentProduct, purchaseToken: 'fixture-token', transactionId: 'fixture-tx' });
  for (const provider of ['google_play', 'app_store']) {
    env.IAP_ENVIRONMENT = 'sandbox'; providerSandbox = true;
    const before = credits;
    assert.equal((await call(payload(provider))).status, 200);
    assert.equal(credits, before + 1);
    providerSandbox = false;
    const mismatch = await call(payload(provider));
    assert.equal(mismatch.status, 400); assert.equal((await mismatch.json()).error, 'store_environment_mismatch');
    assert.equal(credits, before + 1, 'Environment mismatch cannot mutate wallet/entitlement');
    env.IAP_ENVIRONMENT = 'production'; providerSandbox = true;
    assert.equal((await call(payload(provider))).status, 400);
    assert.equal(credits, before + 1);
  }
  delete env.IAP_ENVIRONMENT;
  const status = await (await call({ action: 'status' })).json();
  assert.equal(status.google_play, false); assert.equal(status.app_store, false);
  assert.equal((await call(payload('google_play'))).status, 503);
  authorized = false;
  assert.equal((await call(payload('google_play'))).status, 401); authorized = true;
  console.log(`PASS: ${kind} mock handler auth, configured readiness, sandbox success, cross-environment denial before mutation`);
}
assert.ok(urls.some(url => url.startsWith('https://api.storekit-sandbox.apple.com/')));
assert.ok(urls.some(url => url.startsWith('https://api.storekit.apple.com/')));
console.log('NOTE: mocked store APIs and generated ephemeral keys; no real transactions or deployed Edge runtime');
