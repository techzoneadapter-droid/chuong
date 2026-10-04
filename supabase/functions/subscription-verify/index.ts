import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const ANDROID_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

type Provider = "google_play" | "app_store";

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function serviceRoleKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return null;
  }
}

function premiumProduct(provider: Provider) {
  if (provider === "google_play") return Deno.env.get("PREMIUM_GOOGLE_PRODUCT_ID") || "chuong.vip.monthly";
  return Deno.env.get("PREMIUM_APPLE_PRODUCT_ID") || "chuong.vip.monthly";
}

function providerReady(provider: Provider) {
  if (provider === "google_play") {
    return Boolean(Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") && Deno.env.get("ANDROID_PACKAGE_NAME"));
  }
  return Boolean(
    Deno.env.get("APPLE_IAP_ISSUER_ID")
    && Deno.env.get("APPLE_IAP_KEY_ID")
    && Deno.env.get("APPLE_IAP_PRIVATE_KEY")
    && Deno.env.get("APPLE_BUNDLE_ID")
  );
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlJson(value: unknown) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlToJson<T>(value: string): T {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function pemToBytes(pem: string) {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function createGoogleAssertion(serviceAccount: {
  client_email: string;
  private_key: string;
  token_uri?: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    iss: serviceAccount.client_email,
    scope: ANDROID_SCOPE,
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput),
  ));
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

async function getGoogleAccessToken() {
  const raw = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("google_play_not_configured");
  const serviceAccount = JSON.parse(raw) as {
    client_email: string;
    private_key: string;
    token_uri?: string;
  };
  if (!serviceAccount.client_email || !serviceAccount.private_key) throw new Error("google_play_service_account_invalid");

  const assertion = await createGoogleAssertion(serviceAccount);
  const tokenUri = serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`google_oauth_failed_${response.status}`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("google_oauth_token_missing");
  return data.access_token;
}

async function verifyGoogleSubscription(input: {
  userId: string;
  productId: string;
  purchaseToken: string;
}) {
  const packageName = Deno.env.get("ANDROID_PACKAGE_NAME");
  if (!packageName) throw new Error("google_play_not_configured");
  if (input.productId !== premiumProduct("google_play")) throw new Error("google_subscription_product_mismatch");

  const accessToken = await getGoogleAccessToken();
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(input.purchaseToken)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`google_subscription_lookup_failed_${response.status}`);

  const sub = await response.json() as {
    subscriptionState?: string;
    acknowledgementState?: string;
    latestOrderId?: string;
    startTime?: string;
    regionCode?: string;
    testPurchase?: unknown;
    externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
    lineItems?: Array<{
      productId?: string;
      expiryTime?: string;
      autoRenewingPlan?: { autoRenewEnabled?: boolean };
    }>;
  };

  if (sub.externalAccountIdentifiers?.obfuscatedExternalAccountId !== input.userId) {
    throw new Error("google_subscription_account_binding_mismatch");
  }

  const lines = (sub.lineItems ?? []).filter((item) => item.productId === input.productId);
  if (!lines.length) throw new Error("google_subscription_line_item_missing");

  const expiryMillis = Math.max(...lines.map((item) => Date.parse(item.expiryTime || "") || 0));
  const currentPeriodEnd = expiryMillis ? new Date(expiryMillis).toISOString() : null;
  const currentPeriodStart = sub.startTime && !Number.isNaN(Date.parse(sub.startTime)) ? sub.startTime : null;
  const validState = ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"]
    .includes(sub.subscriptionState || "");
  const active = Boolean(validState && expiryMillis > Date.now());
  const autoRenewEnabled = lines.some((item) => item.autoRenewingPlan?.autoRenewEnabled === true);
  const tokenHash = await sha256Hex(input.purchaseToken);

  return {
    active,
    externalSubscriptionId: `google:${tokenHash}`,
    latestTransactionId: sub.latestOrderId || null,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: active && !autoRenewEnabled,
    metadata: {
      source: "subscription_verify",
      providerState: sub.subscriptionState ?? null,
      acknowledgementState: sub.acknowledgementState ?? null,
      regionCode: sub.regionCode ?? null,
      latestOrderId: sub.latestOrderId ?? null,
      testPurchase: Boolean(sub.testPurchase),
    },
  };
}

async function createAppleServerJwt() {
  const issuerId = Deno.env.get("APPLE_IAP_ISSUER_ID");
  const keyId = Deno.env.get("APPLE_IAP_KEY_ID");
  const privateKey = Deno.env.get("APPLE_IAP_PRIVATE_KEY");
  const bundleId = Deno.env.get("APPLE_BUNDLE_ID");
  if (!issuerId || !keyId || !privateKey || !bundleId) throw new Error("app_store_not_configured");

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "ES256", kid: keyId, typ: "JWT" });
  const payload = base64UrlJson({ iss: issuerId, iat: now, exp: now + 900, aud: "appstoreconnect-v1", bid: bundleId });
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  ));
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

async function fetchAppleTransaction(transactionId: string, jwt: string) {
  for (const base of ["https://api.storekit.apple.com", "https://api.storekit-sandbox.apple.com"]) {
    const response = await fetch(
      `${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    );
    if (response.ok) {
      const data = await response.json() as { signedTransactionInfo?: string };
      if (!data.signedTransactionInfo) throw new Error("apple_signed_transaction_missing");
      return data.signedTransactionInfo;
    }
    if (![400, 404].includes(response.status)) throw new Error(`apple_transaction_lookup_failed_${response.status}`);
  }
  throw new Error("apple_transaction_not_found");
}

async function verifyAppleSubscription(input: {
  userId: string;
  productId: string;
  transactionId: string;
}) {
  const bundleId = Deno.env.get("APPLE_BUNDLE_ID");
  if (!bundleId) throw new Error("app_store_not_configured");
  if (input.productId !== premiumProduct("app_store")) throw new Error("apple_subscription_product_mismatch");

  const jwt = await createAppleServerJwt();
  const signed = await fetchAppleTransaction(input.transactionId, jwt);
  const parts = signed.split(".");
  if (parts.length !== 3) throw new Error("apple_transaction_jws_invalid");
  const payload = base64UrlToJson<{
    transactionId?: string;
    originalTransactionId?: string;
    productId?: string;
    bundleId?: string;
    appAccountToken?: string;
    type?: string;
    purchaseDate?: number;
    expiresDate?: number;
    revocationDate?: number;
    environment?: string;
    storefront?: string;
  }>(parts[1]);

  if (payload.transactionId !== input.transactionId) throw new Error("apple_transaction_mismatch");
  if (payload.productId !== input.productId) throw new Error("apple_subscription_product_mismatch");
  if (payload.bundleId !== bundleId) throw new Error("apple_bundle_mismatch");
  if (payload.appAccountToken !== input.userId) throw new Error("apple_subscription_account_binding_mismatch");
  if (payload.revocationDate) throw new Error("apple_subscription_revoked");
  if (payload.type && !/auto.?renewable subscription/i.test(payload.type)) throw new Error("apple_product_not_subscription");

  const expiry = Number(payload.expiresDate || 0);
  const active = expiry > Date.now();

  return {
    active,
    externalSubscriptionId: payload.originalTransactionId || payload.transactionId || input.transactionId,
    latestTransactionId: payload.transactionId || input.transactionId,
    currentPeriodStart: payload.purchaseDate ? new Date(payload.purchaseDate).toISOString() : null,
    currentPeriodEnd: expiry ? new Date(expiry).toISOString() : null,
    cancelAtPeriodEnd: false,
    metadata: {
      source: "subscription_verify",
      environment: payload.environment ?? null,
      storefront: payload.storefront ?? null,
      transactionId: payload.transactionId ?? null,
      originalTransactionId: payload.originalTransactionId ?? null,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = serviceRoleKey();
  if (!supabaseUrl || !serviceKey) return reply(503, { error: "backend_secret_unavailable" });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(401, { error: "auth_required" });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return reply(401, { error: "invalid_session" });

  let body: {
    action?: "status" | "verify";
    provider?: Provider;
    productId?: string;
    purchaseToken?: string;
    transactionId?: string;
  };
  try { body = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }

  const { data: premiumData } = await admin.rpc("has_active_premium", { p_user_id: user.id });
  const premium = Boolean(premiumData);

  if (body.action === "status") {
    return reply(200, {
      premium,
      google_play: providerReady("google_play"),
      app_store: providerReady("app_store"),
      googleProductId: premiumProduct("google_play"),
      appleProductId: premiumProduct("app_store"),
    });
  }

  if (!body.provider || !["google_play", "app_store"].includes(body.provider)) {
    return reply(400, { error: "invalid_provider" });
  }
  if (!providerReady(body.provider)) return reply(503, { error: "subscription_verifier_not_configured" });

  const productId = body.productId?.trim();
  if (!productId) return reply(400, { error: "product_id_required" });

  try {
    const verified = body.provider === "google_play"
      ? await verifyGoogleSubscription({
          userId: user.id,
          productId,
          purchaseToken: body.purchaseToken?.trim() || (() => { throw new Error("purchase_token_required"); })(),
        })
      : await verifyAppleSubscription({
          userId: user.id,
          productId,
          transactionId: body.transactionId?.trim() || (() => { throw new Error("transaction_id_required"); })(),
        });

    const { data: subscription, error: subError } = await admin.rpc("upsert_verified_premium_subscription", {
      p_user_id: user.id,
      p_provider: body.provider,
      p_external_subscription_id: verified.externalSubscriptionId,
      p_store_product_id: productId,
      p_latest_transaction_id: verified.latestTransactionId,
      p_current_period_start: verified.currentPeriodStart,
      p_current_period_end: verified.currentPeriodEnd,
      p_active: verified.active,
      p_cancel_at_period_end: verified.cancelAtPeriodEnd,
      p_metadata: verified.metadata,
    });
    if (subError) throw new Error(`subscription_upsert_failed:${subError.message}`);

    return reply(200, {
      verified: true,
      premium: verified.active,
      subscription,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "subscription_verification_failed";
    return reply(400, { error: message, verified: false, premium: false });
  }
});
