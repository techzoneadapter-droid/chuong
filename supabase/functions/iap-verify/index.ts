import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };
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

function providerReady(provider: Provider) {
  if (provider === "google_play") {
    return Boolean(
      Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") &&
      Deno.env.get("ANDROID_PACKAGE_NAME")
    );
  }
  return Boolean(
    Deno.env.get("APPLE_IAP_ISSUER_ID") &&
    Deno.env.get("APPLE_IAP_KEY_ID") &&
    Deno.env.get("APPLE_IAP_PRIVATE_KEY") &&
    Deno.env.get("APPLE_BUNDLE_ID")
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
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
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
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      new TextEncoder().encode(signingInput),
    ),
  );
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
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("google_play_service_account_invalid");
  }

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

async function createAppleServerJwt() {
  const issuerId = Deno.env.get("APPLE_IAP_ISSUER_ID");
  const keyId = Deno.env.get("APPLE_IAP_KEY_ID");
  const privateKey = Deno.env.get("APPLE_IAP_PRIVATE_KEY");
  const bundleId = Deno.env.get("APPLE_BUNDLE_ID");
  if (!issuerId || !keyId || !privateKey || !bundleId) {
    throw new Error("app_store_not_configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "ES256", kid: keyId, typ: "JWT" });
  const payload = base64UrlJson({
    iss: issuerId,
    iat: now,
    exp: now + 900,
    aud: "appstoreconnect-v1",
    bid: bundleId,
  });
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(signingInput),
    ),
  );
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

async function verifyGooglePurchase(input: {
  userId: string;
  productId: string;
  purchaseToken: string;
}) {
  const packageName = Deno.env.get("ANDROID_PACKAGE_NAME");
  if (!packageName) throw new Error("google_play_not_configured");

  const accessToken = await getGoogleAccessToken();
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/productsv2/tokens/${encodeURIComponent(input.purchaseToken)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`google_purchase_lookup_failed_${response.status}`);
  }

  const purchase = await response.json() as {
    purchaseStateContext?: { purchaseState?: string };
    productLineItem?: Array<{
      productId?: string;
      productOfferDetails?: {
        quantity?: number;
        refundableQuantity?: number;
        consumptionState?: string;
      };
    }>;
    orderId?: string;
    obfuscatedExternalAccountId?: string;
    regionCode?: string;
    purchaseCompletionTime?: string;
    acknowledgementState?: string;
    testPurchaseContext?: unknown;
  };

  if (purchase.purchaseStateContext?.purchaseState !== "PURCHASED") {
    throw new Error(
      purchase.purchaseStateContext?.purchaseState === "PENDING"
        ? "google_purchase_pending"
        : "google_purchase_not_purchased",
    );
  }

  const lines = purchase.productLineItem ?? [];
  if (lines.length !== 1 || lines[0]?.productId !== input.productId) {
    throw new Error("google_product_mismatch");
  }
  const quantity = lines[0]?.productOfferDetails?.quantity ?? 1;
  if (quantity !== 1) throw new Error("google_multi_quantity_not_supported");

  if (purchase.obfuscatedExternalAccountId !== input.userId) {
    throw new Error("google_account_binding_mismatch");
  }

  const tokenHash = await sha256Hex(input.purchaseToken);
  return {
    externalTransactionId: purchase.orderId || `google:${tokenHash}`,
    receiptHash: tokenHash,
    payload: {
      orderId: purchase.orderId ?? null,
      productId: input.productId,
      regionCode: purchase.regionCode ?? null,
      purchaseCompletionTime: purchase.purchaseCompletionTime ?? null,
      acknowledgementState: purchase.acknowledgementState ?? null,
      consumptionState: lines[0]?.productOfferDetails?.consumptionState ?? null,
      refundableQuantity: lines[0]?.productOfferDetails?.refundableQuantity ?? null,
      testPurchase: Boolean(purchase.testPurchaseContext),
    },
  };
}

async function fetchAppleTransaction(transactionId: string, jwt: string) {
  const urls = [
    "https://api.storekit.apple.com",
    "https://api.storekit-sandbox.apple.com",
  ];

  let lastStatus = 0;
  for (const base of urls) {
    const response = await fetch(
      `${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    );
    lastStatus = response.status;
    if (response.ok) {
      const data = await response.json() as { signedTransactionInfo?: string };
      if (!data.signedTransactionInfo) throw new Error("apple_signed_transaction_missing");
      return data.signedTransactionInfo;
    }
    if (![400, 404].includes(response.status)) {
      throw new Error(`apple_transaction_lookup_failed_${response.status}`);
    }
  }
  throw new Error(`apple_transaction_not_found_${lastStatus}`);
}

async function verifyApplePurchase(input: {
  userId: string;
  productId: string;
  transactionId: string;
}) {
  const bundleId = Deno.env.get("APPLE_BUNDLE_ID");
  if (!bundleId) throw new Error("app_store_not_configured");

  const jwt = await createAppleServerJwt();
  const signedTransactionInfo = await fetchAppleTransaction(input.transactionId, jwt);
  const parts = signedTransactionInfo.split(".");
  if (parts.length !== 3) throw new Error("apple_transaction_jws_invalid");

  const payload = base64UrlToJson<{
    transactionId?: string;
    originalTransactionId?: string;
    productId?: string;
    bundleId?: string;
    appAccountToken?: string;
    quantity?: number;
    environment?: string;
    purchaseDate?: number;
    signedDate?: number;
    revocationDate?: number;
    type?: string;
    storefront?: string;
  }>(parts[1]);

  if (payload.transactionId !== input.transactionId) throw new Error("apple_transaction_mismatch");
  if (payload.productId !== input.productId) throw new Error("apple_product_mismatch");
  if (payload.bundleId !== bundleId) throw new Error("apple_bundle_mismatch");
  if (payload.appAccountToken !== input.userId) throw new Error("apple_account_binding_mismatch");
  if ((payload.quantity ?? 1) !== 1) throw new Error("apple_multi_quantity_not_supported");
  if (payload.revocationDate) throw new Error("apple_transaction_revoked");
  if (payload.type && payload.type.toLowerCase() !== "consumable") {
    throw new Error("apple_product_not_consumable");
  }

  return {
    externalTransactionId: payload.transactionId,
    receiptHash: await sha256Hex(signedTransactionInfo),
    payload: {
      transactionId: payload.transactionId,
      originalTransactionId: payload.originalTransactionId ?? null,
      productId: payload.productId,
      environment: payload.environment ?? null,
      purchaseDate: payload.purchaseDate ?? null,
      signedDate: payload.signedDate ?? null,
      storefront: payload.storefront ?? null,
      type: payload.type ?? null,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = serviceRoleKey();
  if (!supabaseUrl || !serviceKey) return reply(503, { error: "backend_secret_unavailable" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return reply(401, { error: "auth_required" });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const user = userData.user;
  if (userError || !user) return reply(401, { error: "invalid_session" });

  let body: {
    action?: "status" | "verify";
    provider?: Provider;
    productId?: string;
    purchaseToken?: string;
    transactionId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "invalid_json" });
  }

  if (body.action === "status") {
    return reply(200, {
      google_play: providerReady("google_play"),
      app_store: providerReady("app_store"),
      google_pubsub: Boolean(
        Deno.env.get("GOOGLE_PUBSUB_AUDIENCE") &&
        Deno.env.get("GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL")
      ),
      apple_notifications: providerReady("app_store"),
    });
  }

  if (!body.provider || !["google_play", "app_store"].includes(body.provider)) {
    return reply(400, { error: "invalid_provider" });
  }
  if (!body.productId?.trim()) return reply(400, { error: "product_id_required" });
  if (!providerReady(body.provider)) {
    return reply(503, {
      error: body.provider === "google_play"
        ? "google_play_verifier_not_configured"
        : "app_store_verifier_not_configured",
      message: "Xác minh cửa hàng chưa được cấu hình; không có Linh Thạch nào được cộng.",
    });
  }

  try {
    const verified = body.provider === "google_play"
      ? await verifyGooglePurchase({
          userId: user.id,
          productId: body.productId.trim(),
          purchaseToken: body.purchaseToken?.trim() || (() => { throw new Error("purchase_token_required"); })(),
        })
      : await verifyApplePurchase({
          userId: user.id,
          productId: body.productId.trim(),
          transactionId: body.transactionId?.trim() || (() => { throw new Error("transaction_id_required"); })(),
        });

    const { data: credited, error: creditError } = await admin.rpc(
      "credit_verified_store_purchase",
      {
        p_user_id: user.id,
        p_provider: body.provider,
        p_store_product_id: body.productId.trim(),
        p_external_transaction_id: verified.externalTransactionId,
        p_receipt_hash: verified.receiptHash,
        p_provider_payload: verified.payload,
      },
    );

    if (creditError) throw new Error(`wallet_credit_failed:${creditError.message}`);

    const { data: wallet } = await admin
      .from("wallet_accounts")
      .select("balance_coins,debt_coins")
      .eq("user_id", user.id)
      .single();

    return reply(200, {
      verified: true,
      credited: true,
      purchase: credited,
      balanceCoins: wallet?.balance_coins ?? null,
      debtCoins: wallet?.debt_coins ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "verification_failed";
    const pending = message.includes("pending");
    return reply(pending ? 409 : 400, {
      error: message,
      verified: false,
      credited: false,
    });
  }
});
