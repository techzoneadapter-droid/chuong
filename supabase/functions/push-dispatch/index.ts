import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type ClaimedDelivery = {
  delivery_id: string;
  notification_id: string;
  device_id: string;
  user_id: string;
  expo_push_token: string;
  title: string;
  body: string;
  action_route: string | null;
  category: string;
  attempts: number;
};

type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message?: string; details?: { error?: string } };

type ExpoReceipt =
  | { status: "ok"; details?: Record<string, unknown> }
  | { status: "error"; message?: string; details?: { error?: string } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPO_ACCESS_TOKEN = Deno.env.get("EXPO_PUSH_ACCESS_TOKEN")?.trim() || "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonHeaders = { "Content-Type": "application/json" };

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function retryDelayMinutes(attempts: number) {
  if (attempts <= 1) return 1;
  if (attempts === 2) return 2;
  if (attempts === 3) return 5;
  if (attempts === 4) return 15;
  return 60;
}

async function updateDelivery(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase
    .from("push_deliveries")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

async function invalidateDevice(deviceId: string, reason: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("push_devices")
    .update({
      enabled: false,
      invalidated_at: now,
      invalidation_reason: reason.slice(0, 300),
      updated_at: now,
    })
    .eq("id", deviceId);
  if (error) throw error;
}

async function requeueDelivery(row: ClaimedDelivery, code: string, message: string) {
  if (row.attempts >= 6) {
    await updateDelivery(row.delivery_id, {
      status: "failed",
      locked_at: null,
      ticket_error_code: code,
      ticket_error_message: message.slice(0, 1000),
    });
    return;
  }

  const next = new Date(Date.now() + retryDelayMinutes(row.attempts) * 60_000).toISOString();
  await updateDelivery(row.delivery_id, {
    status: "pending",
    locked_at: null,
    next_attempt_at: next,
    ticket_error_code: code,
    ticket_error_message: message.slice(0, 1000),
  });
}

async function sendPendingDeliveries() {
  const { data, error } = await supabase.rpc("claim_push_deliveries", { p_limit: 100 });
  if (error) throw error;

  const rows = (data ?? []) as ClaimedDelivery[];
  if (!rows.length) return { claimed: 0, ticketed: 0, retried: 0, invalid: 0 };

  const messages = rows.map((row) => ({
    to: row.expo_push_token,
    sound: "default",
    title: row.title,
    body: row.body,
    channelId: "chuong-default",
    priority: "high",
    data: {
      notificationId: row.notification_id,
      actionRoute: row.action_route,
      category: row.category,
    },
  }));

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;

  let response: Response;
  try {
    response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await Promise.all(rows.map((row) => requeueDelivery(row, "NETWORK_ERROR", message)));
    return { claimed: rows.length, ticketed: 0, retried: rows.length, invalid: 0 };
  }

  if (!response.ok) {
    const text = (await response.text()).slice(0, 1000);
    await Promise.all(rows.map((row) => requeueDelivery(row, `HTTP_${response.status}`, text)));
    return { claimed: rows.length, ticketed: 0, retried: rows.length, invalid: 0 };
  }

  const payload = await response.json();
  const rawTickets = Array.isArray(payload?.data) ? payload.data : [payload?.data];
  let ticketed = 0;
  let retried = 0;
  let invalid = 0;

  await Promise.all(rows.map(async (row, index) => {
    const ticket = rawTickets[index] as ExpoTicket | undefined;
    if (ticket?.status === "ok" && ticket.id) {
      ticketed += 1;
      await updateDelivery(row.delivery_id, {
        status: "ticketed",
        ticket_id: ticket.id,
        sent_at: new Date().toISOString(),
        locked_at: null,
        ticket_error_code: null,
        ticket_error_message: null,
      });
      return;
    }

    const code = ticket?.status === "error" ? ticket.details?.error || "EXPO_TICKET_ERROR" : "MISSING_EXPO_TICKET";
    const message = ticket?.status === "error" ? ticket.message || code : "Expo Push API did not return a ticket.";

    if (code === "DeviceNotRegistered") {
      invalid += 1;
      await Promise.all([
        updateDelivery(row.delivery_id, {
          status: "invalid_token",
          locked_at: null,
          ticket_error_code: code,
          ticket_error_message: message.slice(0, 1000),
        }),
        invalidateDevice(row.device_id, code),
      ]);
      return;
    }

    retried += 1;
    await requeueDelivery(row, code, message);
  }));

  return { claimed: rows.length, ticketed, retried, invalid };
}

async function checkReceipts() {
  const cutoff = new Date(Date.now() - 45_000).toISOString();
  const { data, error } = await supabase
    .from("push_deliveries")
    .select("id,ticket_id,device_id,attempts")
    .eq("status", "ticketed")
    .is("receipt_checked_at", null)
    .lt("sent_at", cutoff)
    .not("ticket_id", "is", null)
    .order("sent_at", { ascending: true })
    .limit(300);

  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return { checked: 0, delivered: 0, invalid: 0, failed: 0, retried: 0 };

  const ids = rows.map((row) => row.ticket_id).filter(Boolean) as string[];
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;

  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers,
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    return { checked: 0, delivered: 0, invalid: 0, failed: 0, retried: 0 };
  }

  const payload = await response.json();
  const receipts = (payload?.data ?? {}) as Record<string, ExpoReceipt>;
  let delivered = 0;
  let invalid = 0;
  let failed = 0;
  let retried = 0;

  for (const row of rows) {
    if (!row.ticket_id) continue;
    const receipt = receipts[row.ticket_id];
    if (!receipt) continue;

    const now = new Date().toISOString();

    if (receipt.status === "ok") {
      delivered += 1;
      await updateDelivery(row.id, {
        status: "delivered",
        receipt_checked_at: now,
        receipt_status: "ok",
        receipt_error_code: null,
        receipt_error_message: null,
        delivered_at: now,
      });
      continue;
    }

    const code = receipt.details?.error || "EXPO_RECEIPT_ERROR";
    const message = receipt.message || code;

    if (code === "DeviceNotRegistered") {
      invalid += 1;
      await Promise.all([
        updateDelivery(row.id, {
          status: "invalid_token",
          receipt_checked_at: now,
          receipt_status: "error",
          receipt_error_code: code,
          receipt_error_message: message.slice(0, 1000),
        }),
        invalidateDevice(row.device_id, code),
      ]);
      continue;
    }

    if (code === "MessageRateExceeded" && row.attempts < 6) {
      retried += 1;
      const next = new Date(Date.now() + retryDelayMinutes(row.attempts) * 60_000).toISOString();
      await updateDelivery(row.id, {
        status: "pending",
        next_attempt_at: next,
        locked_at: null,
        ticket_id: null,
        sent_at: null,
        receipt_checked_at: now,
        receipt_status: "error",
        receipt_error_code: code,
        receipt_error_message: message.slice(0, 1000),
      });
      continue;
    }

    failed += 1;
    await updateDelivery(row.id, {
      status: "failed",
      receipt_checked_at: now,
      receipt_status: "error",
      receipt_error_code: code,
      receipt_error_message: message.slice(0, 1000),
    });
  }

  return { checked: rows.length, delivered, invalid, failed, retried };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  try {
    const [receipts, send] = await Promise.all([
      checkReceipts(),
      sendPendingDeliveries(),
    ]);
    return reply(200, { ok: true, send, receipts });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error("push-dispatch failed", message);
    return reply(500, { ok: false, error: "push_dispatch_failed" });
  }
});
