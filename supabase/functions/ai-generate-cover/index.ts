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
  if (typeof record.b64_json === "string") return { data: record.b64_json, mimeType: String(record.media_type ?? record.mime_type ?? "image/png") };
  if (typeof record.url === "string") {
    const match = record.url.match(/^data:([^;,]+);base64,(.+)$/s);
    if (match) return { data: match[2], mimeType: match[1] || "image/png" };
  }
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

type PromptProvider = "none" | "experiential" | "openai" | "gemini" | "xai" | "deepseek" | "custom";
type ImageProvider = "experiential" | "openai" | "gemini" | "xai" | "custom";

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

  if (input.provider === "experiential") {
    const response = await fetch("https://api.experientiallabs.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + input.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model || "deepseek-v4-flash",
        messages: [
          { role: "system", content: "You are a concise commercial book-cover art director." },
          { role: "user", content: requestText },
        ],
        stream: false,
      }),
    });
    if (!response.ok) {
      const raw = await response.text();
      throw new Error("experiential_prompt_" + response.status + ":" + raw.slice(0, 800));
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("experiential_prompt_empty");
    return text;
  }

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

  if (input.provider === "experiential") {
    // Experiential can return transient 502/503/504 when every route for a
    // model is unavailable. Retry the selected model, then fall back to the
    // much more stable Gemini 2.5 Flash Image route on the same Experiential key.
    const selectedModel = input.model || "gemini-2.5-flash-image";
    const stableModel = "gemini-2.5-flash-image";
    const experimentalModel = "gemini-3.1-flash-lite-image";
    const candidates = [...new Set([selectedModel, stableModel, experimentalModel])];

    let lastStatus = 0;
    let lastCode = "";
    let lastModel = selectedModel;

    for (const model of candidates) {
      const maxAttempts = 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        lastModel = model;
        try {
          const promptBytes = new TextEncoder().encode(input.prompt);
          const promptDigest = await crypto.subtle.digest("SHA-256", promptBytes);
          const promptHash = Array.from(new Uint8Array(promptDigest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
          const retryKey = "chuong-cover-" + model.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 48) + "-" + promptHash.slice(0, 40);
          const response = await fetch("https://api.experientiallabs.ai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + input.apiKey,
              "Content-Type": "application/json",
              "Idempotency-Key": retryKey,
            },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: input.prompt }],
              stream: false,
            }),
          });

          const raw = await response.text();
          lastStatus = response.status;

          if (response.ok) {
            let data: unknown;
            try {
              data = JSON.parse(raw);
            } catch {
              throw new Error("experiential_image_invalid_json");
            }
            const found = findNestedImage(data);
            if (!found) {
              throw new Error("experiential_image_missing_payload");
            }
            return { ...found, revisedPrompt: null, usedModel: model };
          }

          let code = "";
          let refusalReason = "";
          let providerMessage = "";
          try {
            const parsed = JSON.parse(raw) as {
              error?: { code?: string; message?: string; refusal_reason?: string };
            };
            code = parsed.error?.code || "";
            refusalReason = parsed.error?.refusal_reason || "";
            providerMessage = parsed.error?.message || "";
          } catch {}
          lastCode = code;

          if (code === "refusal") {
            const safePrompt = [
              input.prompt,
              "",
              "SAFETY ADAPTATION:",
              "Render any horror, zombie, combat, danger or death-related concept in a strictly non-graphic PG-13 way.",
              "No gore, no blood, no wounds, no corpses, no dismemberment, no visible injury, no explicit attack.",
              "Use atmosphere, silhouettes, distance, dramatic lighting and symbolic danger instead of graphic violence.",
              "Still use only the story title and genre as the story source."
            ].join("\n");
            const safeBytes = new TextEncoder().encode(safePrompt);
            const safeDigest = await crypto.subtle.digest("SHA-256", safeBytes);
            const safeHash = Array.from(new Uint8Array(safeDigest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
            const safeKey = "chuong-cover-safe-" + model.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 40) + "-" + safeHash.slice(0, 36);
            const safeResponse = await fetch("https://api.experientiallabs.ai/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: "Bearer " + input.apiKey,
                "Content-Type": "application/json",
                "Idempotency-Key": safeKey,
              },
              body: JSON.stringify({
                model,
                messages: [{ role: "user", content: safePrompt }],
                stream: false,
              }),
            });
            const safeRaw = await safeResponse.text();
            if (safeResponse.ok) {
              let safeData: unknown;
              try { safeData = JSON.parse(safeRaw); }
              catch { throw new Error("experiential_image_invalid_json"); }
              const safeFound = findNestedImage(safeData);
              if (safeFound) return { ...safeFound, revisedPrompt: safePrompt, usedModel: model };
            }
            let safeCode = "";
            let safeRefusal = "";
            let safeMessage = "";
            try {
              const safeParsed = JSON.parse(safeRaw) as {
                error?: { code?: string; message?: string; refusal_reason?: string };
              };
              safeCode = safeParsed.error?.code || "";
              safeRefusal = safeParsed.error?.refusal_reason || "";
              safeMessage = safeParsed.error?.message || "";
            } catch {}
            console.error("CHUONG_EXPLABS_SAFE_FAIL", JSON.stringify({
              model,
              originalCode: code,
              originalRefusal: refusalReason,
              safeStatus: safeResponse.status,
              safeCode,
              safeRefusal,
              requestId: safeResponse.headers.get("x-request-id")
            }));
            throw new Error(
              "experiential_image_" + safeResponse.status + ":" +
              (safeCode || "refusal") + ":" +
              (safeRefusal || refusalReason || "unspecified") + ":" +
              (safeMessage || providerMessage || "provider_refused").slice(0, 220)
            );
          }

          const retryable =
            response.status === 429 ||
            response.status === 502 ||
            response.status === 503 ||
            response.status === 504 ||
            code === "all_routes_failed" ||
            code === "gateway_draining" ||
            code === "deadline_exceeded";

          if (!retryable) {
            console.error("CHUONG_EXPLABS_GEN_FAIL", JSON.stringify({
              model,
              attempt,
              httpStatus:response.status,
              code,
              requestId:response.headers.get("x-request-id"),
              provider:response.headers.get("x-gateway-provider"),
              routeDepth:response.headers.get("x-gateway-route-depth")
            }));
            throw new Error(
              "experiential_image_" + response.status + ":" +
              (code || "unknown") + ":" +
              (refusalReason || "") + ":" +
              (providerMessage || raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 260)
            );
          }

          console.error("CHUONG_EXPLABS_GEN_RETRY", JSON.stringify({
            model,
            attempt,
            httpStatus:response.status,
            code,
            requestId:response.headers.get("x-request-id")
          }));
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 900 * Math.pow(2, attempt - 1)));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isNetwork = /fetch|network|connection|timed out|timeout/i.test(message);
          const isStructuredFailure =
            message.startsWith("experiential_image_") &&
            !message.includes("_502") &&
            !message.includes("_503") &&
            !message.includes("_504");

          if (isStructuredFailure && !isNetwork) throw error;
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 900 * Math.pow(2, attempt - 1)));
          }
        }
      }
      // Selected route exhausted: continue to the same-key fallback model.
    }

    throw new Error(
      "experiential_upstream_unavailable:" +
      " Experiential không có tuyến tạo ảnh khỏe sau khi thử Gemini 2.5 Flash Image và các model dự phòng. Model cuối: " + lastModel +
      (lastStatus ? " · HTTP " + lastStatus : "") +
      (lastCode ? " · " + lastCode : "")
    );
  }

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
    action?: "check" | "diagnose" | "generate";
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

  const action = body.action || "generate";
  const imageApiKey = (body.imageApiKey || body.apiKey || "").trim();

  if (action === "diagnose") {
    if (!imageApiKey) return reply(400, { ok:false, error:"experiential_api_key_required" });
    const imageModel = body.imageModel?.trim() || "gemini-2.5-flash-image";
    const testPrompt = [
      "Generate exactly one simple vertical book-cover illustration.",
      "Portrait 2:3 composition.",
      "A lone fantasy traveler standing before a distant mountain at sunrise.",
      "No text, no logo, no watermark."
    ].join(" ");

    let providers: unknown = null;
    try {
      const providerRes = await fetch("https://api.experientiallabs.ai/api/models/" + encodeURIComponent(imageModel) + "/providers", {
        method:"GET",
        headers:{ Authorization:"Bearer " + imageApiKey }
      });
      const providerRaw = await providerRes.text();
      try { providers = JSON.parse(providerRaw); } catch { providers = { raw: providerRaw.slice(0,1200) }; }
    } catch (error) {
      providers = { error: error instanceof Error ? error.message : String(error) };
    }

    const digestBytes = new TextEncoder().encode("diagnose|" + imageModel + "|" + testPrompt);
    const digest = await crypto.subtle.digest("SHA-256", digestBytes);
    const digestHex = Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,"0")).join("");
    const idempotencyKey = "chuong-diagnose-" + digestHex.slice(0,40);

    let response: Response;
    try {
      response = await fetch("https://api.experientiallabs.ai/v1/chat/completions", {
        method:"POST",
        headers:{
          Authorization:"Bearer " + imageApiKey,
          "Content-Type":"application/json",
          "Idempotency-Key":idempotencyKey
        },
        body:JSON.stringify({
          model:imageModel,
          messages:[{role:"user",content:testPrompt}],
          stream:false
        })
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("CHUONG_EXPLABS_DIAG_NETWORK", JSON.stringify({imageModel,message}));
      return reply(200,{
        ok:false,
        stage:"network",
        imageModel,
        error:{code:"network_error",message},
        providers
      });
    }

    const raw = await response.text();
    const requestId = response.headers.get("x-request-id");
    const gatewayProvider = response.headers.get("x-gateway-provider");
    const routeDepth = response.headers.get("x-gateway-route-depth");
    const warning = response.headers.get("x-gateway-warning");

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch {}

    if (!response.ok) {
      const err = parsed.error && typeof parsed.error === "object" ? parsed.error as Record<string,unknown> : {};
      const diagnostic = {
        ok:false,
        stage:"upstream",
        imageModel,
        httpStatus:response.status,
        requestId,
        gatewayProvider,
        routeDepth,
        warning,
        error:{
          code:String(err.code || "unknown"),
          type:String(err.type || ""),
          param:err.param ?? null,
          message:String(err.message || raw.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,600))
        },
        providers
      };
      console.error("CHUONG_EXPLABS_DIAG_FAIL", JSON.stringify(diagnostic));
      return reply(200,diagnostic);
    }

    const found = findNestedImage(parsed);
    const choices = Array.isArray(parsed.choices) ? parsed.choices as Array<Record<string,unknown>> : [];
    const firstMessage = choices?.[0]?.message && typeof choices[0].message === "object"
      ? choices[0].message as Record<string,unknown>
      : {};
    const content = typeof firstMessage.content === "string" ? firstMessage.content.slice(0,500) : "";

    const diagnostic = {
      ok:Boolean(found),
      stage:found ? "image_payload" : "response_without_image",
      imageModel,
      httpStatus:response.status,
      requestId,
      gatewayProvider,
      routeDepth,
      warning,
      imagePayloadFound:Boolean(found),
      contentPreview:content,
      responseKeys:Object.keys(parsed).slice(0,40),
      providers
    };
    console.log("CHUONG_EXPLABS_DIAG_OK", JSON.stringify({...diagnostic,providers:undefined}));
    return reply(200,diagnostic);
  }

  if (action === "check") {
    if (!imageApiKey) return reply(400, { error: "experiential_api_key_required" });
    try {
      const [modelResponse, imageCatalogResponse] = await Promise.all([
        fetch("https://api.experientiallabs.ai/v1/models", {
          method: "GET",
          headers: { Authorization: "Bearer " + imageApiKey },
        }),
        fetch("https://api.experientiallabs.ai/api/models?modality=image&sort=preferred&limit=200", {
          method: "GET",
          headers: { Authorization: "Bearer " + imageApiKey },
        }),
      ]);

      const raw = await modelResponse.text();
      if (!modelResponse.ok) {
        return reply(modelResponse.status === 401 || modelResponse.status === 403 ? 401 : 502, {
          ok: false,
          error: "experiential_api_check_failed",
          detail: raw.slice(0, 1000),
          status: modelResponse.status,
        });
      }

      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch {}
      const data = Array.isArray(parsed.data) ? parsed.data as Array<Record<string, unknown>> : [];
      const ids = data.map((item) => String(item.id || "")).filter(Boolean);
      const granted = new Set(ids);

      let imageCatalogRaw = "";
      let imageCatalog: Record<string, unknown> = {};
      try {
        imageCatalogRaw = await imageCatalogResponse.text();
        if (imageCatalogResponse.ok) imageCatalog = JSON.parse(imageCatalogRaw) as Record<string, unknown>;
      } catch {}

      const catalogRows = (
        Array.isArray(imageCatalog.data) ? imageCatalog.data :
        Array.isArray(imageCatalog.models) ? imageCatalog.models :
        Array.isArray(imageCatalog.items) ? imageCatalog.items :
        []
      ) as Array<Record<string, unknown>>;

      const getArray = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
      const imageModels = catalogRows
        .map((row) => {
          const architecture = row.architecture && typeof row.architecture === "object"
            ? row.architecture as Record<string, unknown>
            : {};
          const modalities = row.modalities && typeof row.modalities === "object"
            ? row.modalities as Record<string, unknown>
            : {};
          const id = String(row.slug || row.id || "");
          const name = String(row.display_name || row.name || id);
          const output = [
            ...getArray(row.output_modalities),
            ...getArray(architecture.output_modalities),
            ...getArray(modalities.output),
          ].map((item) => item.toLowerCase());
          const looksImageOutput =
            output.includes("image") ||
            /(?:image|imagen|flux|seedream|recraft|ideogram|stability|stable-diffusion|nano[- ]?banana)/i.test(id + " " + name);
          return {
            id,
            name,
            provider: String(row.provider || row.provider_name || ""),
            category: String(row.category || ""),
            looksImageOutput,
          };
        })
        .filter((item) => item.id && granted.has(item.id) && item.looksImageOutput)
        .map(({ looksImageOutput: _omit, ...item }) => item)
        .slice(0, 120);

      // The public catalog can lag behind a newly granted slug. Keep known
      // image-named granted models as a safe fallback so the picker never empties.
      if (!imageModels.length) {
        for (const id of ids) {
          if (/(?:image|imagen|flux|seedream|recraft|ideogram|stability|stable-diffusion|nano[- ]?banana)/i.test(id)) {
            imageModels.push({ id, name: id, provider: "", category: "" });
          }
          if (imageModels.length >= 120) break;
        }
      }

      const imageModel = body.imageModel?.trim() || "gemini-2.5-flash-image";
      const promptModel = body.promptModel?.trim() || "";
      return reply(200, {
        ok: true,
        provider: "Experiential Labs",
        modelCount: ids.length,
        imageModels,
        imageModel,
        imageModelAvailable: imageModels.some((item) => item.id === imageModel),
        promptModel: promptModel || null,
        promptModelAvailable: promptModel ? ids.includes(promptModel) : null,
        catalogFilterOk: imageCatalogResponse.ok,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "experiential_api_check_failed";
      return reply(502, { ok: false, error: message });
    }
  }

  const bookId = body.bookId?.trim();
  if (!bookId) return reply(400, { error: "book_id_required" });

  const imageProvider: ImageProvider = body.imageProvider || "experiential";
  const imageBaseUrl = body.imageBaseUrl || body.baseUrl || "";
  const imageModel = (
    body.imageModel ||
    body.model ||
    (imageProvider === "experiential" ? "gemini-2.5-flash-image" :
      imageProvider === "xai" ? "grok-imagine-image-2.0" :
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
        promptProvider === "experiential" ? "deepseek-v4-flash" :
        promptProvider === "deepseek" ? "deepseek-v4-flash" :
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
    const match = message.match(/^experiential_image_(\d{3}):([^:]*):([^:]*):(.*)$/s);
    const upstreamStatus = match ? Number(match[1]) : null;
    const upstreamCode = match?.[2] || "";
    const refusalReason = match?.[3] || "";
    const providerMessage = match?.[4] || "";
    console.error("CHUONG_COVER_GENERATION_ERROR", JSON.stringify({
      bookId,
      imageModel,
      upstreamStatus,
      upstreamCode,
      refusalReason,
      message: providerMessage || message
    }));
    const responseStatus =
      upstreamStatus && [400,401,403,409,429].includes(upstreamStatus)
        ? upstreamStatus
        : 502;
    return reply(responseStatus, {
      error: message,
      upstreamStatus,
      upstreamCode: upstreamCode || null,
      refusalReason: refusalReason || null
    });
  }
});
