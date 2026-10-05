import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

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

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = serviceRoleKey();
  if (!supabaseUrl || !serviceKey) return reply(503, { error: "backend_secret_unavailable" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(401, { error: "auth_required" });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return reply(401, { error: "invalid_session" });

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) return reply(500, { error: profileError.message });
  if (profile?.role !== "admin") return reply(403, { error: "admin_required" });

  let body: {
    bookId?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    extraPrompt?: string;
  };
  try { body = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }

  const bookId = body.bookId?.trim();
  const apiKey = body.apiKey?.trim();
  const baseUrl = (body.baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = body.model?.trim() || "gpt-image-1";
  if (!bookId) return reply(400, { error: "book_id_required" });
  if (!apiKey) return reply(400, { error: "api_key_required" });

  const { data: book, error: bookError } = await admin
    .from("books")
    .select("id,title,description")
    .eq("id", bookId)
    .maybeSingle();
  if (bookError) return reply(500, { error: bookError.message });
  if (!book) return reply(404, { error: "book_not_found" });

  const { data: genres } = await admin.from("book_genres").select("genre").eq("book_id", bookId).limit(5);
  const genre = (genres ?? []).map((row) => row.genre).filter(Boolean).join(", ") || "tiểu thuyết";

  const prompt = [
    "Create a premium vertical Vietnamese web-novel cover illustration.",
    "Aspect ratio exactly 2:3, composed for 1024x1536 mobile book cover.",
    `Story title for visual inspiration: "${book.title}".`,
    `Genre: ${genre}.`,
    "Infer the imagery, atmosphere, protagonist archetype and setting from the title and genre.",
    "Cinematic, highly detailed, polished commercial illustration, strong focal subject, dramatic depth and lighting.",
    "Do NOT render any title, letters, typography, logo, watermark, frame, UI or readable text in the image.",
    "Keep important faces/subjects away from extreme edges so the cover crops safely on mobile.",
    body.extraPrompt?.trim() ? `Additional art direction: ${body.extraPrompt.trim()}` : "",
  ].filter(Boolean).join("\n");

  try {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, size: "1024x1536", n: 1 }),
    });

    if (!response.ok) {
      const raw = await response.text();
      return reply(502, { error: "image_provider_error", detail: raw.slice(0, 1000), status: response.status });
    }

    const data = await response.json() as {
      data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
    };
    const first = data.data?.[0];
    if (!first) return reply(502, { error: "image_provider_empty" });

    if (first.b64_json) {
      return reply(200, {
        imageBase64: first.b64_json,
        mimeType: "image/png",
        width: 1024,
        height: 1536,
        prompt,
        revisedPrompt: first.revised_prompt ?? null,
      });
    }

    if (first.url) {
      const imageResponse = await fetch(first.url);
      if (!imageResponse.ok) return reply(502, { error: "generated_image_download_failed" });
      const bytes = new Uint8Array(await imageResponse.arrayBuffer());
      const mimeType = imageResponse.headers.get("content-type") || "image/png";
      return reply(200, {
        imageBase64: bytesToBase64(bytes),
        mimeType,
        width: 1024,
        height: 1536,
        prompt,
        revisedPrompt: first.revised_prompt ?? null,
      });
    }

    return reply(502, { error: "image_provider_missing_payload" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "image_generation_failed";
    return reply(500, { error: message });
  }
});
