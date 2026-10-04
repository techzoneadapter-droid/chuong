import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

type JobRow = {
  id: string;
  user_id: string;
  book_id: string;
  status: string;
  genre: string;
  total_chapters: number;
  completed_chapters: number;
  last_chapter_number: number | null;
  error_message: string | null;
};

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

function providerConfig() {
  const baseUrl = (Deno.env.get("AI_TRANSLATE_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
  const apiKey = Deno.env.get("AI_TRANSLATE_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
  const model = Deno.env.get("AI_TRANSLATE_MODEL") || "";
  const provider = Deno.env.get("AI_TRANSLATE_PROVIDER") || "openai-compatible";
  return { baseUrl, apiKey, model, provider, ready: Boolean(apiKey && model) };
}

function cleanJson(raw: string) {
  return raw.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/i, "").trim();
}

function splitChapterContent(content: string, maxChars = 12000) {
  const paragraphs = content.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      pushCurrent();
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        chunks.push(paragraph.slice(offset, offset + maxChars).trim());
      }
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars) pushCurrent();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  pushCurrent();
  return chunks.length ? chunks : [content.trim()];
}

async function translatePiece(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  genre: string;
  title: string;
  content: string;
  part: number;
  totalParts: number;
}) {
  const system = [
    "Bạn là biên tập viên/biên dịch tiểu thuyết tiếng Việt chuyên nghiệp.",
    "Nhiệm vụ: chuyển TOÀN BỘ nội dung đầu vào thành tiếng Việt tự nhiên, mạch lạc, đúng văn phong thể loại.",
    `Thể loại: ${input.genre || "tiểu thuyết"}.`,
    "Nếu đầu vào là tiếng Trung/Anh/ngôn ngữ khác: dịch đầy đủ sang tiếng Việt.",
    "Nếu đầu vào là bản convert tiếng Việt thô: biên tập lại thành tiếng Việt văn học tự nhiên.",
    "Giữ nhất quán tên riêng, cảnh giới, công pháp, địa danh, cách xưng hô và thuật ngữ.",
    "Không tóm tắt, không bỏ câu/đoạn, không thêm tình tiết, không đổi ngôi kể.",
    "Giữ cấu trúc đoạn văn và dấu hội thoại hợp lý.",
    `Đây là phần ${input.part}/${input.totalParts} của cùng một chương; phải giữ văn phong và thuật ngữ nhất quán với toàn chương.`,
    "Chỉ trả JSON hợp lệ dạng {\"title\":\"...\",\"content\":\"...\"}.",
  ].join("\n");

  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({
            title: input.title,
            part: input.part,
            totalParts: input.totalParts,
            content: input.content,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ai_provider_${response.status}:${body.slice(0, 500)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("ai_empty_response");

  let parsed: { title?: string; content?: string };
  try {
    parsed = JSON.parse(cleanJson(raw));
  } catch {
    throw new Error("ai_invalid_json");
  }

  const title = String(parsed.title || input.title).trim();
  const content = String(parsed.content || "").trim();
  if (!title || content.length < Math.min(50, Math.max(10, input.content.trim().length * .2))) {
    throw new Error("ai_result_too_short");
  }
  return { title, content };
}

async function translateChapter(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  genre: string;
  title: string;
  content: string;
}) {
  const chunks = splitChapterContent(input.content);
  let translatedTitle = input.title;
  const translatedChunks: string[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const translated = await translatePiece({
      ...input,
      title: translatedTitle,
      content: chunks[index],
      part: index + 1,
      totalParts: chunks.length,
    });
    if (index === 0) translatedTitle = translated.title;
    translatedChunks.push(translated.content);
  }

  return {
    title: translatedTitle,
    content: translatedChunks.join("\n\n"),
  };
}

async function premiumFor(admin: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await admin.rpc("has_active_premium", { p_user_id: userId });
  if (error) throw error;
  return Boolean(data);
}

async function loadOwnedBook(admin: ReturnType<typeof createClient>, userId: string, bookId: string) {
  const { data: author, error: authorError } = await admin
    .from("authors")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (authorError) throw authorError;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;

  const query = admin
    .from("books")
    .select("id,title,genre,author_id")
    .eq("id", bookId);

  if (profile?.role !== "admin") {
    if (!author?.id) return null;
    query.eq("author_id", author.id);
  }

  const { data: book, error } = await query.maybeSingle();
  if (error) throw error;
  return book;
}

async function jobForUser(admin: ReturnType<typeof createClient>, userId: string, jobId: string) {
  const { data, error } = await admin
    .from("ai_translation_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as JobRow | null;
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

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return reply(401, { error: "invalid_session" });

  let body: { action?: string; bookId?: string; genre?: string; jobId?: string };
  try { body = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }

  const config = providerConfig();

  try {
    const premium = await premiumFor(admin, user.id);
    if (body.action === "status") {
      return reply(200, {
        premium,
        providerReady: config.ready,
        provider: config.provider,
        model: config.model || null,
      });
    }

    if (!premium) {
      return reply(403, {
        error: "premium_required",
        message: "AI dịch toàn truyện chỉ dành cho tài khoản CHƯƠNG Premium đang hoạt động.",
      });
    }
    if (!config.ready) {
      return reply(503, {
        error: "ai_provider_not_configured",
        message: "Máy chủ chưa cấu hình nhà cung cấp AI dịch truyện.",
      });
    }

    if (body.action === "start") {
      const bookId = body.bookId?.trim();
      if (!bookId) return reply(400, { error: "book_id_required" });
      const book = await loadOwnedBook(admin, user.id, bookId);
      if (!book) return reply(404, { error: "book_not_owned" });

      const { count, error: countError } = await admin
        .from("chapters")
        .select("id", { count: "exact", head: true })
        .eq("book_id", bookId);
      if (countError) throw countError;
      if (!count) return reply(409, { error: "book_has_no_chapters" });

      const { data: job, error: jobError } = await admin
        .from("ai_translation_jobs")
        .insert({
          user_id: user.id,
          book_id: bookId,
          status: "queued",
          source_language: "auto",
          target_language: "vi",
          genre: body.genre?.trim() || book.genre || "Tiểu thuyết",
          provider: config.provider,
          model: config.model,
          total_chapters: count,
          completed_chapters: 0,
        })
        .select("*")
        .single();
      if (jobError) throw jobError;
      return reply(200, { job });
    }

    if (body.action === "step") {
      const jobId = body.jobId?.trim();
      if (!jobId) return reply(400, { error: "job_id_required" });
      const job = await jobForUser(admin, user.id, jobId);
      if (!job) return reply(404, { error: "job_not_found" });
      if (job.status === "completed") return reply(200, { job });
      if (job.status === "cancelled") return reply(409, { error: "job_cancelled", job });

      const book = await loadOwnedBook(admin, user.id, job.book_id);
      if (!book) return reply(404, { error: "book_not_owned" });

      const { data: revisions, error: revisionsError } = await admin
        .from("ai_translation_revisions")
        .select("chapter_id")
        .eq("job_id", job.id);
      if (revisionsError) throw revisionsError;
      const done = new Set((revisions ?? []).map((item) => item.chapter_id));

      const { data: chapters, error: chaptersError } = await admin
        .from("chapters")
        .select("id,chapter_number,title,content")
        .eq("book_id", job.book_id)
        .order("chapter_number");
      if (chaptersError) throw chaptersError;

      const next = (chapters ?? []).find((item) => !done.has(item.id));
      if (!next) {
        const { data: completed, error: completedError } = await admin
          .from("ai_translation_jobs")
          .update({
            status: "completed",
            completed_chapters: job.total_chapters,
            completed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", job.id)
          .select("*")
          .single();
        if (completedError) throw completedError;
        return reply(200, { job: completed });
      }

      await admin
        .from("ai_translation_jobs")
        .update({
          status: "processing",
          started_at: job.status === "queued" ? new Date().toISOString() : undefined,
          error_message: null,
        })
        .eq("id", job.id);

      try {
        const translated = await translateChapter({
          ...config,
          genre: job.genre,
          title: next.title,
          content: next.content || "",
        });

        const { error: revisionError } = await admin
          .from("ai_translation_revisions")
          .insert({
            job_id: job.id,
            chapter_id: next.id,
            original_title: next.title,
            original_content: next.content || "",
            translated_title: translated.title,
            translated_content: translated.content,
          });
        if (revisionError) throw revisionError;

        const { error: chapterError } = await admin
          .from("chapters")
          .update({
            title: translated.title,
            content: translated.content,
            updated_at: new Date().toISOString(),
          })
          .eq("id", next.id);
        if (chapterError) throw chapterError;

        const completedChapters = Math.min(job.total_chapters, job.completed_chapters + 1);
        const finished = completedChapters >= job.total_chapters;
        const { data: updated, error: updateError } = await admin
          .from("ai_translation_jobs")
          .update({
            status: finished ? "completed" : "processing",
            completed_chapters: completedChapters,
            last_chapter_number: next.chapter_number,
            completed_at: finished ? new Date().toISOString() : null,
            error_message: null,
          })
          .eq("id", job.id)
          .select("*")
          .single();
        if (updateError) throw updateError;
        return reply(200, { job: updated });
      } catch (translationError) {
        const message = translationError instanceof Error ? translationError.message : "ai_translation_failed";
        const { data: failed } = await admin
          .from("ai_translation_jobs")
          .update({ status: "failed", error_message: message })
          .eq("id", job.id)
          .select("*")
          .single();
        return reply(502, { error: message, job: failed });
      }
    }

    return reply(400, { error: "invalid_action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    return reply(500, { error: message });
  }
});
