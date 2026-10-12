const KEY_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
let cached: { until: number; keys: Array<{ keyId: number; base64: string }> } | undefined;
function decode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')), c => c.charCodeAt(0));
}
// Google sends ASN.1 DER; WebCrypto accepts IEEE P1363 r||s.
export function derToRaw(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  let offset = 0;
  if (bytes[offset++] !== 0x30 || bytes[offset++] !== bytes.length - 2) throw new Error('invalid_der');
  const result = new Uint8Array(64);
  for (let part = 0; part < 2; part++) {
    if (bytes[offset++] !== 2) throw new Error('invalid_der_integer');
    const size = bytes[offset++];
    if (!size || size > 33 || offset + size > bytes.length || bytes[offset] >= 128) throw new Error('invalid_der_length');
    let value = bytes.slice(offset, offset + size); offset += size;
    if (value.length > 1 && value[0] === 0) {
      if (value[1] < 128) throw new Error('noncanonical_der');
      value = value.slice(1);
    }
    if (value.length > 32) throw new Error('invalid_der_scalar');
    result.set(value, part * 32 + 32 - value.length);
  }
  if (offset !== bytes.length) throw new Error('invalid_der_trailing');
  return result;
}
export async function verifyAdmobCallback(url: URL, units: string[], rewardItem: string, rewardAmount: string) {
  const query = url.search.slice(1);
  if (query.length > 8192) throw new Error('callback_too_large');
  const match = /^(.*)&signature=([^&]+)&key_id=(\d+)$/.exec(query);
  if (!match) throw new Error('invalid_signature_parameters');
  const parameters = url.searchParams;
  for (const name of parameters.keys()) if (parameters.getAll(name).length !== 1) throw new Error('duplicate_parameter');
  if (!cached || cached.until < Date.now()) {
    const response = await fetch(KEY_URL, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('key_server_unavailable');
    const data = await response.json();
    if (!Array.isArray(data.keys) || !data.keys.length) throw new Error('invalid_keys');
    cached = { keys: data.keys, until: Date.now() + 60 * 60 * 1000 };
  }
  const entry = cached.keys.find(k => String(k.keyId) === match[3]);
  if (!entry) { cached = undefined; throw new Error('unknown_key'); }
  const key = await crypto.subtle.importKey('spki', decode(entry.base64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key,
    derToRaw(decode(decodeURIComponent(match[2]))), new TextEncoder().encode(match[1]));
  if (!valid) throw new Error('invalid_signature');
  const id = parameters.get('custom_data') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || parameters.get('user_id') !== id) throw new Error('invalid_session_binding');
  if (!units.includes(parameters.get('ad_unit') || '') || parameters.get('reward_item') !== rewardItem || parameters.get('reward_amount') !== rewardAmount) throw new Error('invalid_reward');
  const timestamp = Number(parameters.get('timestamp'));
  const transaction = parameters.get('transaction_id') || '';
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || !transaction || transaction.length > 256) throw new Error('invalid_transaction');
  return { id, timestamp, transaction };
}
