import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual Edge handler with locally generated ECDSA keys.
// No Google callback, remote database or service credential is used.
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
let handler, credits = 0;
const code = ts.transpileModule(readFileSync(new URL('../supabase/functions/admob-ssv/index.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, {
  exports: {}, URLSearchParams, Response, TextEncoder, Uint8Array, atob, AbortSignal,
  crypto: webcrypto,
  fetch: async () => Response.json({ keys: [{ keyId: 123, pem: publicKey.export({ type: 'spki', format: 'pem' }) }] }),
  Deno: { serve: fn => { handler = fn; }, env: { get: name => ({ SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'local-test' })[name] } },
  require: name => {
    if (name.startsWith('jsr:')) return {};
    if (name.startsWith('npm:')) return { createClient: () => ({ rpc: async (name, args) => {
      assert.equal(name, 'confirm_verified_admob_reward');
      assert.equal(args.p_reward_amount, 5);
      credits++;
      return { error: null };
    } }) };
    throw Error(name);
  },
});
const params = new URLSearchParams({
  ad_unit: '2277387891', reward_amount: '5', reward_item: 'stones',
  user_id: '10000000-0000-4000-8000-000000000001',
  custom_data: '20000000-0000-4000-8000-000000000002',
  transaction_id: 'abcdef0123456789', timestamp: String(Date.now()),
});
function signed(content) {
  const signature = sign('sha256', Buffer.from(content), privateKey).toString('base64url');
  return `https://example.invalid/?${content}&signature=${signature}&key_id=123`;
}
const invoke = url => handler(new Request(url));
assert.equal((await invoke(signed(params.toString()))).status, 200);
assert.equal(credits, 1);
assert.equal((await invoke(signed(params.toString()).replace('reward_amount=5', 'reward_amount=10'))).status, 403);
assert.equal((await invoke(signed(params + '&reward_amount=5'))).status, 403);
assert.equal((await invoke('https://example.invalid/?' + 'x'.repeat(8200))).status, 403);
const wrongUnit = new URLSearchParams(params); wrongUnit.set('ad_unit', 'untrusted-unit');
assert.equal((await invoke(signed(wrongUnit.toString()))).status, 400);
const dummy = new URLSearchParams(params); dummy.set('user_id', 'google-dashboard-test');
assert.equal((await invoke(signed(dummy.toString()))).status, 200);
assert.equal((await handler(new Request('https://example.invalid', { method: 'POST' }))).status, 405);
assert.equal(credits, 1, 'only a valid signed, bound reward reaches the database');
console.log('PASS: ECDSA callback, tampering, duplicate/oversized parameters, wrong unit, dashboard test and HTTP method');
