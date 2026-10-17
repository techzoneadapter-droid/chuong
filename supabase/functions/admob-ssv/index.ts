import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const KEY_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
const ADMOB_REWARDED_AD_UNIT = "2277387891";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let cached: { expires: number; keys: Array<{ keyId: number; pem: string }> } | null = null;

function decodeBase64Url(input: string) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), c => c.charCodeAt(0));
}

// Google signs with ASN.1 DER ECDSA. WebCrypto verifies P-256 using 64-byte P1363.
function derToP1363(der: Uint8Array) {
  let index = 0;
  const length = () => {
    const first = der[index++];
    if (first === undefined) throw Error("truncated_der");
    if (first < 128) return first;
    const n = first & 0x7f;
    if (!n || n > 2) throw Error("bad_der_length");
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (der[index] === undefined) throw Error("truncated_der_length");
      v = v * 256 + der[index++];
    }
    return v;
  };
  if (der[index++] !== 0x30) throw Error("not_der_signature");
  const sequenceLength = length();
  if (sequenceLength !== der.length - index) throw Error("bad_der_sequence");
  const parseInt32 = () => {
    if (der[index++] !== 0x02) throw Error("bad_der_integer");
    const n = length();
    const value = der.slice(index, index + n);
    index += n;
    if (!n || n > 33 || value.length !== n) throw Error("bad_der_integer_length");
    // The extra 0 byte is only allowed to keep a positive integer positive.
    const stripped = value[0] === 0 ? value.slice(1) : value;
    if (stripped.length > 32 || !stripped.length) throw Error("bad_der_integer_value");
    const output = new Uint8Array(32);
    output.set(stripped, 32 - stripped.length);
    return output;
  };
  const r = parseInt32();
  const s = parseInt32();
  if (index !== der.length) throw Error("trailing_der_bytes");
  const result = new Uint8Array(64);
  result.set(r);
  result.set(s, 32);
  return result;
}
function spki(pem: string) {
  const body = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  return Uint8Array.from(atob(body), c => c.charCodeAt(0));
}
async function googleKeys() {
  if (cached && cached.expires > Date.now()) return cached.keys;
  const response = await fetch(KEY_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw Error("google_keys_unavailable");
  const json = await response.json();
  if (!Array.isArray(json?.keys)) throw Error("google_keys_invalid");
  const keys = json.keys.map((k: { keyId: number; pem: string }) => ({
    keyId: Number(k.keyId), pem: String(k.pem),
  })).filter((k: { keyId: number; pem: string }) => Number.isSafeInteger(k.keyId) && k.pem.includes("BEGIN PUBLIC KEY"));
  if (!keys.length) throw Error("google_keys_empty");
  cached = { keys, expires: Date.now() + 60 * 60 * 1000 };
  return keys;
}
async function verifySignedCallback(url: string) {
  // Do not reorder, decode or reconstruct the Google-signed content.
  const query = url.split("?").slice(1).join("?");
  if (query.length > 8192) return null;
  const parameters = new URLSearchParams(query);
  for (const name of parameters.keys()) {
    if (parameters.getAll(name).length !== 1) return null;
  }
  const parts = query.match(/^(.+)&signature=([^&]+)&key_id=(\d+)$/);
  if (!parts) return null;
  const [, content, encodedSignature, keyId] = parts;
  const key = (await googleKeys()).find(k => String(k.keyId) === keyId);
  if (!key) { cached = null; throw Error("unknown_google_key"); }
  const imported = await crypto.subtle.importKey(
    "spki", spki(key.pem), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    imported,
    derToP1363(decodeBase64Url(decodeURIComponent(encodedSignature))),
    new TextEncoder().encode(content),
  );
  return valid ? new URLSearchParams(content) : null;
}
function serviceRoleKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const obj = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return obj.default || Object.values(obj)[0] || null;
  } catch { return null; }
}

Deno.serve(async (request) => {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  try {
    const payload = await verifySignedCallback(request.url);
    if (!payload) return new Response("Invalid Google signature", { status: 403 });
    const adUnit = payload.get("ad_unit") || "";
    const amount = payload.get("reward_amount") || "";
    if (![ADMOB_REWARDED_AD_UNIT, "ca-app-pub-2610920886028786/" + ADMOB_REWARDED_AD_UNIT].includes(adUnit) || amount !== "5") {
      return new Response("Unexpected AdMob unit or amount", { status: 400 });
    }
    const userId = payload.get("user_id") || "";
    const ticket = payload.get("custom_data") || "";
    const transactionId = payload.get("transaction_id") || "";
    const timestamp = payload.get("timestamp") || "";
    // AdMob's Verify URL button can use a test user_id/custom_data. An authenticated
    // test proves signature transport but never awards an actual user's wallet.
    if (!UUID.test(userId) || !UUID.test(ticket)) {
      return new Response("Verified callback; no reward ticket", { status: 200 });
    }
    if (!/^[a-f0-9]{10,100}$/i.test(transactionId) || !/^\d{12,16}$/.test(timestamp)) {
      return new Response("Invalid callback fields", { status: 400 });
    }
    const key = serviceRoleKey();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!key || !supabaseUrl) return new Response("Service unavailable", { status: 503 });
    const client = createClient(supabaseUrl, key, { auth: { persistSession: false } });
    const { error } = await client.rpc("confirm_verified_admob_reward", {
      p_ticket: ticket,
      p_user_id: userId,
      p_transaction_id: transactionId,
      p_ad_unit: adUnit,
      p_reward_amount: 5,
      p_timestamp_ms: Number(timestamp),
    });
    if (error) {
      // Invalid or expired tickets must never mint coins. Avoid echoing database
      // error details, UIDs or transaction IDs to the untrusted requestor.
      return new Response("Reward not accepted", { status: 400 });
    }
    return new Response("OK", { status: 200 });
  } catch {
    // Temporary Google-key failures can be retried by AdMob. Invalid signatures
    // still cannot reach the DB without passing cryptographic verification.
    return new Response("Unable to verify Google callback", { status: 503 });
  }
});
