import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const JSON_HEADERS = { "Content-Type": "application/json" };
const ANDROID_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

type Provider = "google_play" | "app_store";
type SupabaseAdmin = ReturnType<typeof createClient>;

function premiumProduct(provider: Provider) {
  if (provider === "google_play") return Deno.env.get("PREMIUM_GOOGLE_PRODUCT_ID") || "chuong.vip.monthly";
  return Deno.env.get("PREMIUM_APPLE_PRODUCT_ID") || "chuong.vip.monthly";
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
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

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlJson(value: unknown) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function base64UrlToJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
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

async function getGooglePurchase(purchaseToken: string) {
  const packageName = Deno.env.get("ANDROID_PACKAGE_NAME");
  if (!packageName) throw new Error("google_play_not_configured");
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/productsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`google_purchase_lookup_failed_${response.status}`);
  return await response.json() as {
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
}


async function getGoogleSubscription(purchaseToken: string) {
  const packageName = Deno.env.get("ANDROID_PACKAGE_NAME");
  if (!packageName) throw new Error("google_play_not_configured");
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`google_subscription_lookup_failed_${response.status}`);
  return await response.json() as {
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
}

async function upsertGooglePremiumSubscription(
  admin: SupabaseAdmin,
  purchaseToken: string,
  hintedProductId: string,
  metadata: Record<string, unknown>,
) {
  const expectedProduct = premiumProduct("google_play");
  if (hintedProductId !== expectedProduct) return { ignored: true as const };

  const sub = await getGoogleSubscription(purchaseToken);
  const lineItems = (sub.lineItems ?? []).filter((item) => item.productId === expectedProduct);
  if (!lineItems.length) throw new Error("google_subscription_product_mismatch");

  const tokenHash = await sha256Hex(purchaseToken);
  const externalId = `google:${tokenHash}`;
  let userId = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId || null;

  if (!userId) {
    const { data: existing } = await admin
      .from("account_subscriptions")
      .select("user_id")
      .eq("provider", "google_play")
      .eq("external_subscription_id", externalId)
      .maybeSingle();
    userId = existing?.user_id ?? null;
  }
  if (!userId) throw new Error("google_subscription_account_binding_missing");

  const expiryMillis = Math.max(...lineItems.map((item) => Date.parse(item.expiryTime || "") || 0));
  const validState = ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"]
    .includes(sub.subscriptionState || "");
  const active = Boolean(validState && expiryMillis > Date.now());
  const autoRenewEnabled = lineItems.some((item) => item.autoRenewingPlan?.autoRenewEnabled === true);

  const { data: subscription, error } = await admin.rpc("upsert_verified_premium_subscription", {
    p_user_id: userId,
    p_provider: "google_play",
    p_external_subscription_id: externalId,
    p_store_product_id: expectedProduct,
    p_latest_transaction_id: sub.latestOrderId ?? null,
    p_current_period_start: sub.startTime && !Number.isNaN(Date.parse(sub.startTime)) ? sub.startTime : null,
    p_current_period_end: expiryMillis ? new Date(expiryMillis).toISOString() : null,
    p_active: active,
    p_cancel_at_period_end: active && !autoRenewEnabled,
    p_metadata: {
      ...metadata,
      providerState: sub.subscriptionState ?? null,
      acknowledgementState: sub.acknowledgementState ?? null,
      regionCode: sub.regionCode ?? null,
      latestOrderId: sub.latestOrderId ?? null,
      testPurchase: Boolean(sub.testPurchase),
    },
  });
  if (error) throw new Error(`google_subscription_upsert_failed:${error.message}`);
  return { ignored: false as const, subscription, active };
}

let googleJwksCache: { expiresAt: number; keys: Array<Record<string, unknown>> } | null = null;

async function googleJwks() {
  if (googleJwksCache && googleJwksCache.expiresAt > Date.now()) return googleJwksCache.keys;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) throw new Error("google_jwks_unavailable");
  const data = await response.json() as { keys?: Array<Record<string, unknown>> };
  if (!data.keys?.length) throw new Error("google_jwks_empty");
  googleJwksCache = { expiresAt: Date.now() + 30 * 60 * 1000, keys: data.keys };
  return data.keys;
}

async function verifyGooglePushJwt(req: Request) {
  const expectedAudience = Deno.env.get("GOOGLE_PUBSUB_AUDIENCE");
  const expectedEmail = Deno.env.get("GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL");
  if (!expectedAudience || !expectedEmail) throw new Error("google_pubsub_auth_not_configured");

  const raw = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const parts = raw.split(".");
  if (parts.length !== 3) throw new Error("google_pubsub_token_missing");

  const header = base64UrlToJson<{ alg?: string; kid?: string }>(parts[0]);
  const payload = base64UrlToJson<{
    aud?: string | string[];
    exp?: number;
    iss?: string;
    email?: string;
    email_verified?: boolean;
  }>(parts[1]);

  if (header.alg !== "RS256" || !header.kid) throw new Error("google_pubsub_token_header_invalid");
  if (!payload.exp || payload.exp * 1000 <= Date.now()) throw new Error("google_pubsub_token_expired");
  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss || "")) {
    throw new Error("google_pubsub_issuer_invalid");
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(expectedAudience)) throw new Error("google_pubsub_audience_invalid");
  if (payload.email !== expectedEmail || payload.email_verified !== true) {
    throw new Error("google_pubsub_identity_invalid");
  }

  const jwk = (await googleJwks()).find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("google_pubsub_key_not_found");

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk as JsonWebKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    base64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) throw new Error("google_pubsub_signature_invalid");
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

async function fetchAppleTransaction(transactionId: string) {
  const jwt = await createAppleServerJwt();
  const bases = [
    "https://api.storekit.apple.com",
    "https://api.storekit-sandbox.apple.com",
  ];

  for (const base of bases) {
    const response = await fetch(
      `${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    );
    if (response.ok) {
      const data = await response.json() as { signedTransactionInfo?: string };
      if (!data.signedTransactionInfo) throw new Error("apple_signed_transaction_missing");
      const parts = data.signedTransactionInfo.split(".");
      if (parts.length !== 3) throw new Error("apple_transaction_jws_invalid");
      return base64UrlToJson<{
        transactionId?: string;
        originalTransactionId?: string;
        productId?: string;
        bundleId?: string;
        appAccountToken?: string;
        quantity?: number;
        environment?: string;
        purchaseDate?: number;
        expiresDate?: number;
        revocationDate?: number;
        revocationReason?: number;
        type?: string;
      }>(parts[1]);
    }
    if (![400, 404].includes(response.status)) {
      throw new Error(`apple_transaction_lookup_failed_${response.status}`);
    }
  }
  throw new Error("apple_transaction_not_found");
}

async function beginWebhookEvent(
  admin: SupabaseAdmin,
  provider: Provider,
  externalEventId: string,
  eventType: string,
  payloadHash: string,
  metadata: Record<string, unknown>,
) {
  const { data: existing } = await admin
    .from("store_webhook_events")
    .select("id,status,purchase_id")
    .eq("provider", provider)
    .eq("external_event_id", externalEventId)
    .maybeSingle();

  if (existing) return { duplicate: true, row: existing };

  const { data, error } = await admin
    .from("store_webhook_events")
    .insert({
      provider,
      external_event_id: externalEventId,
      event_type: eventType,
      payload_hash: payloadHash,
      metadata,
    })
    .select("id,status,purchase_id")
    .single();

  if (error) {
    const { data: raced } = await admin
      .from("store_webhook_events")
      .select("id,status,purchase_id")
      .eq("provider", provider)
      .eq("external_event_id", externalEventId)
      .maybeSingle();
    if (raced) return { duplicate: true, row: raced };
    throw new Error(`webhook_event_insert_failed:${error.message}`);
  }

  return { duplicate: false, row: data };
}

async function finishWebhookEvent(
  admin: SupabaseAdmin,
  id: string,
  status: "ignored" | "processed" | "failed",
  input?: { purchaseId?: string | null; errorCode?: string | null; metadata?: Record<string, unknown> },
) {
  const patch: Record<string, unknown> = {
    status,
    processed_at: new Date().toISOString(),
  };
  if (input?.purchaseId !== undefined) patch.purchase_id = input.purchaseId;
  if (input?.errorCode !== undefined) patch.error_code = input.errorCode;
  if (input?.metadata) patch.metadata = input.metadata;
  const { error } = await admin.from("store_webhook_events").update(patch).eq("id", id);
  if (error) throw new Error(`webhook_event_update_failed:${error.message}`);
}

async function localPurchase(
  admin: SupabaseAdmin,
  provider: Provider,
  externalTransactionId: string,
) {
  const { data, error } = await admin
    .from("store_purchases")
    .select("id,user_id,state,external_transaction_id,product_id")
    .eq("provider", provider)
    .eq("external_transaction_id", externalTransactionId)
    .maybeSingle();
  if (error) throw new Error(`purchase_lookup_failed:${error.message}`);
  return data;
}

async function processGoogle(req: Request, bodyText: string, body: any, admin: SupabaseAdmin) {
  await verifyGooglePushJwt(req);

  const message = body?.message;
  if (!message?.data || !message?.messageId) {
    return reply(400, { error: "google_pubsub_body_invalid" });
  }

  const decodedText = new TextDecoder().decode(
    Uint8Array.from(atob(message.data), (c) => c.charCodeAt(0)),
  );
  const payload = JSON.parse(decodedText) as {
    packageName?: string;
    eventTimeMillis?: string;
    oneTimeProductNotification?: {
      notificationType?: number;
      purchaseToken?: string;
      sku?: string;
    };
    subscriptionNotification?: {
      notificationType?: number;
      purchaseToken?: string;
      subscriptionId?: string;
    };
    voidedPurchaseNotification?: {
      purchaseToken?: string;
      orderId?: string;
      productType?: number;
      refundType?: number;
    };
    testNotification?: unknown;
  };

  const packageName = Deno.env.get("ANDROID_PACKAGE_NAME");
  if (!packageName || payload.packageName !== packageName) {
    return reply(400, { error: "google_package_mismatch" });
  }

  const payloadHash = await sha256Hex(bodyText);
  let eventType = "google_unknown";
  if (payload.subscriptionNotification) {
    eventType = `subscription_${payload.subscriptionNotification.notificationType ?? "unknown"}`;
  } else if (payload.oneTimeProductNotification) {
    eventType = payload.oneTimeProductNotification.notificationType === 1
      ? "one_time_product_purchased"
      : payload.oneTimeProductNotification.notificationType === 2
        ? "one_time_product_canceled"
        : "one_time_product_other";
  } else if (payload.voidedPurchaseNotification) {
    eventType = "voided_purchase";
  } else if (payload.testNotification) {
    eventType = "test_notification";
  }

  const event = await beginWebhookEvent(
    admin,
    "google_play",
    String(message.messageId),
    eventType,
    payloadHash,
    {
      packageName: payload.packageName,
      eventTimeMillis: payload.eventTimeMillis ?? null,
      publishTime: message.publishTime ?? null,
    },
  );
  if (event.duplicate) return reply(200, { ok: true, duplicate: true });

  try {
    if (payload.testNotification) {
      await finishWebhookEvent(admin, event.row.id, "ignored", {
        metadata: { test: true },
      });
      return reply(200, { ok: true, ignored: true });
    }

    const subscriptionNotice = payload.subscriptionNotification;
    if (subscriptionNotice?.purchaseToken && subscriptionNotice.subscriptionId) {
      const result = await upsertGooglePremiumSubscription(
        admin,
        subscriptionNotice.purchaseToken,
        subscriptionNotice.subscriptionId,
        {
          source: "google_rtdn_subscription",
          eventMessageId: message.messageId,
          notificationType: subscriptionNotice.notificationType ?? null,
          eventTimeMillis: payload.eventTimeMillis ?? null,
        },
      );

      if (result.ignored) {
        await finishWebhookEvent(admin, event.row.id, "ignored", {
          metadata: { action: "non_premium_subscription", subscriptionId: subscriptionNotice.subscriptionId },
        });
        return reply(200, { ok: true, ignored: true });
      }

      await finishWebhookEvent(admin, event.row.id, "processed", {
        metadata: {
          action: result.active ? "premium_active" : "premium_inactive",
          subscriptionId: subscriptionNotice.subscriptionId,
        },
      });
      return reply(200, { ok: true, action: result.active ? "premium_active" : "premium_inactive" });
    }

    const oneTime = payload.oneTimeProductNotification;
    if (oneTime?.purchaseToken && oneTime.sku) {
      const purchase = await getGooglePurchase(oneTime.purchaseToken);
      const state = purchase.purchaseStateContext?.purchaseState;
      const line = purchase.productLineItem?.[0];
      if (!line?.productId || line.productId !== oneTime.sku) throw new Error("google_product_mismatch");

      const quantity = line.productOfferDetails?.quantity ?? 1;
      if (quantity !== 1) throw new Error("google_multi_quantity_not_supported");

      const tokenHash = await sha256Hex(oneTime.purchaseToken);
      const externalTransactionId = purchase.orderId || `google:${tokenHash}`;

      if (state === "PURCHASED" && oneTime.notificationType === 1) {
        const userId = purchase.obfuscatedExternalAccountId;
        if (!userId) throw new Error("google_account_binding_missing");

        const { data: credited, error: creditError } = await admin.rpc(
          "credit_verified_store_purchase",
          {
            p_user_id: userId,
            p_provider: "google_play",
            p_store_product_id: line.productId,
            p_external_transaction_id: externalTransactionId,
            p_receipt_hash: tokenHash,
            p_provider_payload: {
              source: "google_rtdn",
              eventMessageId: message.messageId,
              orderId: purchase.orderId ?? null,
              productId: line.productId,
              regionCode: purchase.regionCode ?? null,
              purchaseCompletionTime: purchase.purchaseCompletionTime ?? null,
              acknowledgementState: purchase.acknowledgementState ?? null,
              consumptionState: line.productOfferDetails?.consumptionState ?? null,
              refundableQuantity: line.productOfferDetails?.refundableQuantity ?? null,
              testPurchase: Boolean(purchase.testPurchaseContext),
            },
          },
        );
        if (creditError) throw new Error(`google_rtdn_credit_failed:${creditError.message}`);

        const local = await localPurchase(admin, "google_play", externalTransactionId);
        await finishWebhookEvent(admin, event.row.id, "processed", {
          purchaseId: local?.id ?? null,
          metadata: {
            action: "credited",
            state,
            productId: line.productId,
            orderId: purchase.orderId ?? null,
          },
        });
        return reply(200, { ok: true, action: "credited", purchase: credited });
      }

      if (state === "CANCELLED" && oneTime.notificationType === 2) {
        const local = await localPurchase(admin, "google_play", externalTransactionId);
        if (!local) {
          await finishWebhookEvent(admin, event.row.id, "ignored", {
            metadata: { action: "cancel_without_local_credit", state, productId: line.productId },
          });
          return reply(200, { ok: true, ignored: true });
        }
        const { error: revokeError } = await admin.rpc("revoke_verified_store_purchase", {
          p_provider: "google_play",
          p_external_transaction_id: externalTransactionId,
          p_reason: "Google Play canceled the one-time purchase",
          p_provider_payload: {
            source: "google_rtdn",
            eventMessageId: message.messageId,
            purchaseState: state,
          },
        });
        if (revokeError) throw new Error(`google_cancel_revoke_failed:${revokeError.message}`);
        await finishWebhookEvent(admin, event.row.id, "processed", {
          purchaseId: local.id,
          metadata: { action: "revoked", state },
        });
        return reply(200, { ok: true, action: "revoked" });
      }

      await finishWebhookEvent(admin, event.row.id, "ignored", {
        metadata: { action: "no_state_change", state: state ?? null },
      });
      return reply(200, { ok: true, ignored: true });
    }

    const voided = payload.voidedPurchaseNotification;
    if (voided?.purchaseToken && voided.orderId) {
      if (voided.productType !== 2) {
        await finishWebhookEvent(admin, event.row.id, "ignored", {
          metadata: { action: "not_one_time_product", productType: voided.productType ?? null },
        });
        return reply(200, { ok: true, ignored: true });
      }

      const purchase = await getGooglePurchase(voided.purchaseToken);
      const line = purchase.productLineItem?.[0];
      if (!line?.productId) throw new Error("google_voided_product_missing");
      const quantity = line.productOfferDetails?.quantity ?? 1;
      if (quantity !== 1) throw new Error("google_multi_quantity_not_supported");
      if (purchase.orderId && purchase.orderId !== voided.orderId) {
        throw new Error("google_voided_order_mismatch");
      }

      const refundableQuantity = line.productOfferDetails?.refundableQuantity;
      if (voided.refundType !== 1 && refundableQuantity !== 0) {
        await finishWebhookEvent(admin, event.row.id, "ignored", {
          metadata: {
            action: "partial_refund_not_applicable",
            refundType: voided.refundType ?? null,
            refundableQuantity: refundableQuantity ?? null,
          },
        });
        return reply(200, { ok: true, ignored: true });
      }

      const local = await localPurchase(admin, "google_play", voided.orderId);
      if (!local) {
        await finishWebhookEvent(admin, event.row.id, "ignored", {
          metadata: { action: "voided_purchase_not_found", orderId: voided.orderId },
        });
        return reply(200, { ok: true, ignored: true });
      }

      const { error: revokeError } = await admin.rpc("revoke_verified_store_purchase", {
        p_provider: "google_play",
        p_external_transaction_id: voided.orderId,
        p_reason: "Google Play voided/refunded the purchase",
        p_provider_payload: {
          source: "google_rtdn",
          eventMessageId: message.messageId,
          refundType: voided.refundType ?? null,
          refundableQuantity: refundableQuantity ?? null,
        },
      });
      if (revokeError) throw new Error(`google_void_revoke_failed:${revokeError.message}`);

      await finishWebhookEvent(admin, event.row.id, "processed", {
        purchaseId: local.id,
        metadata: {
          action: "revoked",
          refundType: voided.refundType ?? null,
          refundableQuantity: refundableQuantity ?? null,
        },
      });
      return reply(200, { ok: true, action: "revoked" });
    }

    await finishWebhookEvent(admin, event.row.id, "ignored", {
      metadata: { action: "unsupported_google_notification" },
    });
    return reply(200, { ok: true, ignored: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "google_event_failed";
    await finishWebhookEvent(admin, event.row.id, "failed", { errorCode: code });
    return reply(500, { error: code });
  }
}

async function processApple(bodyText: string, body: any, admin: SupabaseAdmin) {
  const signedPayload = body?.signedPayload;
  if (!signedPayload || typeof signedPayload !== "string") {
    return reply(400, { error: "apple_signed_payload_required" });
  }

  const outer = signedPayload.split(".");
  if (outer.length !== 3) return reply(400, { error: "apple_notification_jws_invalid" });

  const decoded = base64UrlToJson<{
    notificationType?: string;
    subtype?: string;
    notificationUUID?: string;
    data?: {
      bundleId?: string;
      environment?: string;
      signedTransactionInfo?: string;
    };
  }>(outer[1]);

  const bundleId = Deno.env.get("APPLE_BUNDLE_ID");
  if (!bundleId || decoded.data?.bundleId !== bundleId) {
    return reply(400, { error: "apple_bundle_mismatch" });
  }

  const payloadHash = await sha256Hex(bodyText);
  const externalEventId = decoded.notificationUUID || payloadHash;
  const eventType = decoded.notificationType || "apple_unknown";
  const event = await beginWebhookEvent(
    admin,
    "app_store",
    externalEventId,
    eventType.toLowerCase(),
    payloadHash,
    {
      subtype: decoded.subtype ?? null,
      environment: decoded.data?.environment ?? null,
      bundleId: decoded.data?.bundleId ?? null,
    },
  );
  if (event.duplicate) return reply(200, { ok: true, duplicate: true });

  try {
    const signedTransactionInfo = decoded.data?.signedTransactionInfo;
    if (!signedTransactionInfo) {
      await finishWebhookEvent(admin, event.row.id, "ignored", {
        metadata: { action: "no_transaction_payload", notificationType: eventType },
      });
      return reply(200, { ok: true, ignored: true });
    }

    const txParts = signedTransactionInfo.split(".");
    if (txParts.length !== 3) throw new Error("apple_transaction_jws_invalid");
    const hinted = base64UrlToJson<{ transactionId?: string }>(txParts[1]);
    if (!hinted.transactionId) throw new Error("apple_transaction_id_missing");

    // Security boundary: the incoming JWS is used only as a lookup hint.
    // All state-changing decisions below are based on a fresh authenticated
    // App Store Server API lookup using CHUONG's private server credentials.
    const transaction = await fetchAppleTransaction(hinted.transactionId);
    if (transaction.transactionId !== hinted.transactionId) throw new Error("apple_transaction_mismatch");
    if (transaction.bundleId !== bundleId) throw new Error("apple_bundle_mismatch");
    if ((transaction.quantity ?? 1) !== 1) throw new Error("apple_multi_quantity_not_supported");

    if (/auto.?renewable subscription/i.test(transaction.type || "") && transaction.productId === premiumProduct("app_store")) {
      const externalId = transaction.originalTransactionId || transaction.transactionId || hinted.transactionId;
      let userId = transaction.appAccountToken || null;
      if (!userId) {
        const { data: existing } = await admin
          .from("account_subscriptions")
          .select("user_id")
          .eq("provider", "app_store")
          .eq("external_subscription_id", externalId)
          .maybeSingle();
        userId = existing?.user_id ?? null;
      }
      if (!userId) throw new Error("apple_subscription_account_binding_missing");

      const expiry = Number(transaction.expiresDate || 0);
      const active = Boolean(!transaction.revocationDate && expiry > Date.now());
      const cancelAtPeriodEnd = decoded.notificationType === "DID_CHANGE_RENEWAL_STATUS"
        && decoded.subtype === "AUTO_RENEW_DISABLED";

      const { error: subError } = await admin.rpc("upsert_verified_premium_subscription", {
        p_user_id: userId,
        p_provider: "app_store",
        p_external_subscription_id: externalId,
        p_store_product_id: transaction.productId,
        p_latest_transaction_id: transaction.transactionId ?? hinted.transactionId,
        p_current_period_start: transaction.purchaseDate ? new Date(transaction.purchaseDate).toISOString() : null,
        p_current_period_end: expiry ? new Date(expiry).toISOString() : null,
        p_active: active,
        p_cancel_at_period_end: cancelAtPeriodEnd,
        p_metadata: {
          source: "apple_server_notification_v2_subscription",
          notificationUUID: decoded.notificationUUID ?? null,
          notificationType: decoded.notificationType ?? null,
          subtype: decoded.subtype ?? null,
          environment: transaction.environment ?? null,
        },
      });
      if (subError) throw new Error(`apple_subscription_upsert_failed:${subError.message}`);

      await finishWebhookEvent(admin, event.row.id, "processed", {
        metadata: {
          action: active ? "premium_active" : "premium_inactive",
          originalTransactionId: externalId,
          transactionId: transaction.transactionId ?? hinted.transactionId,
        },
      });
      return reply(200, { ok: true, action: active ? "premium_active" : "premium_inactive" });
    }

    const local = await localPurchase(admin, "app_store", hinted.transactionId);

    if (eventType === "REFUND") {
      if (!transaction.revocationDate) throw new Error("apple_refund_not_confirmed_by_api");
      if (!local) {
        await finishWebhookEvent(admin, event.row.id, "ignored", {
          metadata: { action: "refunded_purchase_not_found", transactionId: hinted.transactionId },
        });
        return reply(200, { ok: true, ignored: true });
      }

      const { error: revokeError } = await admin.rpc("revoke_verified_store_purchase", {
        p_provider: "app_store",
        p_external_transaction_id: hinted.transactionId,
        p_reason: "Apple App Store refunded the purchase",
        p_provider_payload: {
          source: "apple_server_notification_v2",
          notificationUUID: decoded.notificationUUID ?? null,
          environment: transaction.environment ?? null,
          revocationDate: transaction.revocationDate,
          revocationReason: transaction.revocationReason ?? null,
        },
      });
      if (revokeError) throw new Error(`apple_refund_revoke_failed:${revokeError.message}`);

      await finishWebhookEvent(admin, event.row.id, "processed", {
        purchaseId: local.id,
        metadata: {
          action: "revoked",
          transactionId: hinted.transactionId,
          revocationDate: transaction.revocationDate,
        },
      });
      return reply(200, { ok: true, action: "revoked" });
    }

    if (eventType === "REFUND_REVERSED") {
      if (transaction.revocationDate) throw new Error("apple_refund_reversal_not_confirmed_by_api");
      if (!local) {
        await finishWebhookEvent(admin, event.row.id, "ignored", {
          metadata: { action: "refund_reversal_purchase_not_found", transactionId: hinted.transactionId },
        });
        return reply(200, { ok: true, ignored: true });
      }

      const { error: restoreError } = await admin.rpc("restore_revoked_store_purchase", {
        p_provider: "app_store",
        p_external_transaction_id: hinted.transactionId,
        p_reason: "Apple App Store reversed the refund",
        p_provider_payload: {
          source: "apple_server_notification_v2",
          notificationUUID: decoded.notificationUUID ?? null,
          environment: transaction.environment ?? null,
          refundReversed: true,
        },
      });
      if (restoreError) throw new Error(`apple_refund_restore_failed:${restoreError.message}`);

      await finishWebhookEvent(admin, event.row.id, "processed", {
        purchaseId: local.id,
        metadata: { action: "restored", transactionId: hinted.transactionId },
      });
      return reply(200, { ok: true, action: "restored" });
    }

    if (eventType === "CONSUMPTION_REQUEST") {
      await finishWebhookEvent(admin, event.row.id, "ignored", {
        purchaseId: local?.id ?? null,
        metadata: {
          action: "manual_consumption_response_required",
          transactionId: hinted.transactionId,
        },
      });
      return reply(200, { ok: true, ignored: true, reason: "manual_consumption_response_required" });
    }

    await finishWebhookEvent(admin, event.row.id, "ignored", {
      purchaseId: local?.id ?? null,
      metadata: {
        action: "unsupported_apple_notification",
        notificationType: eventType,
        transactionId: hinted.transactionId,
      },
    });
    return reply(200, { ok: true, ignored: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "apple_event_failed";
    await finishWebhookEvent(admin, event.row.id, "failed", { errorCode: code });
    return reply(500, { error: code });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = serviceRoleKey();
  if (!supabaseUrl || !serviceKey) return reply(503, { error: "backend_secret_unavailable" });

  const bodyText = await req.text();
  let body: any;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return reply(400, { error: "invalid_json" });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (body?.message?.data) {
    try {
      return await processGoogle(req, bodyText, body, admin);
    } catch (error) {
      const code = error instanceof Error ? error.message : "google_webhook_rejected";
      return reply(code.includes("not_configured") ? 503 : 401, { error: code });
    }
  }

  if (body?.signedPayload) {
    return await processApple(bodyText, body, admin);
  }

  return reply(400, { error: "unsupported_store_webhook" });
});
