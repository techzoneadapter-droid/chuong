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
function cleanBaseUrl(value: string, fallback: string) {
  return (value.trim() || fallback).replace(/\/$/, "");
}
function findNestedImage(value: unknown): { data: string; mimeType: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const mime = String(record.mime_type ?? record.mimeType ?? "");
  const data = typeof record.data === "string" ? record.data : null;
  if (data && mime.startsWith("image/")) return { data, mimeType: mime };
  if (typeof record.b64_json === "string") return { data: record.b64_json, mimeType: "image/png" };
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findNestedImage(item);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = findNestedImage(child);
      if (found) return found;
    }
  }
  return null;
}
async function fetchImageUrl(url: string) {
  const imageResponse = await fetch(url);
  if (!imageResponse.ok) throw new Error("generated_image_download_failed");
  const bytes = new Uint8Array(await imageResponse.arrayBuffer());
  return {
    data: bytesToBase64(bytes),
    mimeType: imageResponse.headers.get("content-type") || "image/png",
  };
}

type PromptProvider = "none" | "openai" | "gemini" | "xai" | "deepseek" | "custom";
type ImageProvider = "openai" | "gemini" | "xai" | "custom";

async function improvePrompt(input: {
  provider: PromptProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  title: string;
  genre: string;
  draft: string;
}) {
  if (input.provider === "none") return input.draft;
  if (!input.apiKey) throw new Error("prompt_api_key_required");

  const requestText = [
    "Bạn là art director chuyên bìa tiểu thuyết mạng.",
    "Hãy viết lại prompt tạo ảnh bìa dưới đây thành MỘT prompt tiếng Anh giàu hình ảnh, thương mại, bám sát tên truyện/thể loại.",
    "Không thêm chữ/tựa/logo vào ảnh. Tỷ lệ bìa 2:3 dọc. Chỉ trả prompt cuối cùng, không giải thích.",
    "Tên truyện: " + input.title,
    "Thể loại: " + input.genre,
    "Chỉ được dùng tên truyện và thể loại làm dữ liệu nội dung. Không suy luận từ mô tả, tag hoặc dữ liệu nào khác.",
    "Prompt nền:",
    input.draft,
  ].filter(Boolean).join("\n");

  if (input.provider === "gemini") {
    const baseUrl = cleanBaseUrl(input.baseUrl, "https://generativelanguage.googleapis.com/v1beta");
    const response = await fetch(baseUrl + "/models/" + encodeURIComponent(input.model || "gemini-3.1-flash") + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": input.apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: requestText }] }] }),
    });
    if (!response.ok) {
      const raw = await response.text();
      throw new Error("prompt_provider_" + response.status + ":" + raw.slice(0, 500));
    }
    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();
    if (!text) throw new Error("prompt_provider_empty");
    return text;
  }

  const fallbackBase =
    input.provider === "xai" ? "https://api.x.ai/v1" :
    input.provider === "deepseek" ? "https://api.deepseek.com" :
    "https://api.openai.com/v1";
  const baseUrl = cleanBaseUrl(input.baseUrl, fallbackBase);
  const response = await fetch(baseUrl + "/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + input.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.35,
      messages: [
        { role: "system", content: "You are a concise commercial book-cover art director." },
        { role: "user", content: requestText },
      ],
    }),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error("prompt_provider_" + response.status + ":" + raw.slice(0, 500));
  }
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("prompt_provider_empty");
  return text.trim();
}

async function generateImage(input: {
  provider: ImageProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
}) {
  if (!input.apiKey) throw new Error("image_api_key_required");

  if (input.provider === "gemini") {
    const baseUrl = cleanBaseUrl(input.baseUrl, "https://generativelanguage.googleapis.com/v1beta");
    const response = await fetch(baseUrl + "/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": input.apiKey },
      body: JSON.stringify({
        model: input.model || "gemini-3.1-flash-image",
        input: [{ type: "text", text: input.prompt }],
        response_format: {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: "2:3",
          image_size: "1K",
        },
      }),
    });
    if (!response.ok) {
      const raw = await response.text();
      throw new Error("image_provider_" + response.status + ":" + raw.slice(0, 900));
    }
    const data = await response.json();
    const found = findNestedImage(data);
    if (!found) throw new Error("image_provider_missing_payload");
    return { ...found, revisedPrompt: null };
  }

  const fallbackBase = input.provider === "xai" ? "https://api.x.ai/v1" : "https://api.openai.com/v1";
  const baseUrl = cleanBaseUrl(input.baseUrl, fallbackBase);
  const body: Record<string, unknown> = { model: input.model, prompt: input.prompt, n: 1 };
  if (input.provider === "xai") {
    body.aspect_ratio = "2:3";
    body.resolution = "1k";
  } else {
    body.size = "1024x1536";
  }

  const response = await fetch(baseUrl + "/images/generations", {
    method: "POST",
    headers: { Authorization: "Bearer " + input.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error("image_provider_" + response.status + ":" + raw.slice(0, 900));
  }
  const data = await response.json() as {
    data?: Array<{ b64_json?: string; url?: string; mime_type?: string; revised_prompt?: string }>;
  };
  const first = data.data?.[0];
  if (!first) throw new Error("image_provider_empty");
  if (first.b64_json) {
    return { data: first.b64_json, mimeType: first.mime_type || "image/png", revisedPrompt: first.revised_prompt ?? null };
  }
  if (first.url) {
    const downloaded = await fetchImageUrl(first.url);
    return { ...downloaded, revisedPrompt: first.revised_prompt ?? null };
  }
  const nested = findNestedImage(data);
  if (nested) return { ...nested, revisedPrompt: first.revised_prompt ?? null };
  throw new Error("image_provider_missing_payload");
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
    imageProvider?: ImageProvider;
    imageApiKey?: string;
    imageBaseUrl?: string;
    imageModel?: string;
    promptProvider?: PromptProvider;
    promptApiKey?: string;
    promptBaseUrl?: string;
    promptModel?: string;
    extraPrompt?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
  try { body = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }

  const bookId = body.bookId?.trim();
  if (!bookId) return reply(400, { error: "book_id_required" });

  const imageProvider: ImageProvider = body.imageProvider || "openai";
  const imageApiKey = (body.imageApiKey || body.apiKey || "").trim();
  const imageBaseUrl = body.imageBaseUrl || body.baseUrl || "";
  const imageModel = (
    body.imageModel ||
    body.model ||
    (imageProvider === "xai" ? "grok-imagine-image-2.0" :
      imageProvider === "gemini" ? "gemini-3.1-flash-image" : "gpt-image-2")
  ).trim();
  const promptProvider: PromptProvider = body.promptProvider || "none";

  const { data: book, error: bookError } = await admin
    .from("books")
    .select("id,title")
    .eq("id", bookId)
    .maybeSingle();
  if (bookError) return reply(500, { error: bookError.message });
  if (!book) return reply(404, { error: "book_not_found" });

  const { data: genres } = await admin.from("book_genres").select("genre").eq("book_id", bookId).limit(5);
  const genre = (genres ?? []).map((row) => row.genre).filter(Boolean).join(", ") || "tiểu thuyết";

  const draftPrompt = [
    "Create a premium vertical Vietnamese web-novel cover illustration.",
    "FINAL COVER FORMAT IS LOCKED: exact 2:3 portrait composition, prepared for 1024 x 1536 pixels.",
    "Use ONLY these story signals:",
    "Title: \"" + book.title + "\".",
    "Genre: \"" + genre + "\".",
    "Infer the most suitable main subject, environment, costume, mood and visual motif ONLY from the title and genre.",
    "Commercial mobile-reading-app cover artwork, strong single focal subject, cinematic depth, polished lighting and detail.",
    "No title text, no letters, no typography, no logo, no watermark, no UI, no frame, no readable text anywhere.",
    "Keep faces and important subjects inside the center safe area so a strict 2:3 crop remains usable.",
  ].join("\n");

  try {
    const finalPrompt = await improvePrompt({
      provider: promptProvider,
      apiKey: body.promptApiKey?.trim() || "",
      baseUrl: body.promptBaseUrl || "",
      model: body.promptModel?.trim() || (
        promptProvider === "deepseek" ? "deepseek-flash" :
        promptProvider === "xai" ? "grok-4.7" :
        promptProvider === "gemini" ? "gemini-3.1-flash" :
        "gpt-6-luna"
      ),
      title: book.title,
      genre,
      draft: draftPrompt,
    });

    const generated = await generateImage({
      provider: imageProvider,
      apiKey: imageApiKey,
      baseUrl: imageBaseUrl,
      model: imageModel,
      prompt: finalPrompt,
    });

    return reply(200, {
      imageBase64: generated.data,
      mimeType: generated.mimeType,
      width: 1024,
      height: 1536,
      prompt: finalPrompt,
      revisedPrompt: generated.revisedPrompt,
      provider: imageProvider,
      model: imageModel,
      promptProvider,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "image_generation_failed";
    return reply(502, { error: message });
  }
});
