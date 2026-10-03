import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };

function secretKey() {
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

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = secretKey();
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
    provider?: "google_play" | "app_store";
    productId?: string;
    receipt?: string;
    transactionId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "invalid_json" });
  }

  if (!body.provider || !["google_play", "app_store"].includes(body.provider)) {
    return reply(400, { error: "invalid_provider" });
  }
  if (!body.productId?.trim() || !body.receipt?.trim()) {
    return reply(400, { error: "product_and_receipt_required" });
  }

  const productColumn = body.provider === "google_play" ? "google_product_id" : "apple_product_id";
  const { data: product, error: productError } = await admin
    .from("store_products")
    .select("id,sku,coins,google_product_id,apple_product_id,active")
    .eq(productColumn, body.productId.trim())
    .eq("active", true)
    .maybeSingle();

  if (productError) return reply(500, { error: "catalog_lookup_failed" });
  if (!product) return reply(400, { error: "store_product_not_configured" });

  if (body.provider === "google_play") {
    const configured = Boolean(
      Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") &&
      Deno.env.get("ANDROID_PACKAGE_NAME")
    );
    if (!configured) {
      return reply(503, {
        error: "google_play_verifier_not_configured",
        message: "Google Play credentials are not configured; no Xu was credited.",
        sku: product.sku,
      });
    }
  } else {
    const configured = Boolean(
      Deno.env.get("APPLE_IAP_ISSUER_ID") &&
      Deno.env.get("APPLE_IAP_KEY_ID") &&
      Deno.env.get("APPLE_IAP_PRIVATE_KEY") &&
      Deno.env.get("APPLE_BUNDLE_ID")
    );
    if (!configured) {
      return reply(503, {
        error: "app_store_verifier_not_configured",
        message: "App Store credentials are not configured; no Xu was credited.",
        sku: product.sku,
      });
    }
  }

  // Phase 4D-A intentionally stops here. The credit RPC is service-role only,
  // and must only be called after provider-side verification is implemented.
  // Never trust productId, transactionId or receipt claims from the app itself.
  return reply(501, {
    error: "provider_verifier_pending",
    message: "Provider credentials exist, but receipt verification is not enabled yet; no Xu was credited.",
    provider: body.provider,
    sku: product.sku,
    userId: user.id,
  });
});
