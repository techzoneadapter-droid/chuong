import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyAdmobCallback } from '../_shared/admobSsv.ts';
Deno.serve(async (request: Request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const units = (Deno.env.get('ADMOB_SSV_AD_UNITS') || '').split(',').map(v => v.trim()).filter(Boolean);
  const item = Deno.env.get('ADMOB_SSV_REWARD_ITEM');
  const amount = Deno.env.get('ADMOB_SSV_REWARD_AMOUNT');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const backend = Deno.env.get('SUPABASE_URL');
  if (!units.length || !item || !amount || !key || !backend) return new Response('SSV not configured', { status: 503 });
  try {
    const verified = await verifyAdmobCallback(new URL(request.url), units, item, amount);
    const admin = createClient(backend, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.rpc('credit_verified_rewarded_ad', {
      p_session_id: verified.id, p_transaction_id: verified.transaction, p_timestamp: verified.timestamp,
    });
    if (error) return new Response('Callback not applied', { status: 409 });
    return new Response('OK');
  } catch { return new Response('Callback rejected', { status: 403 }); }
});
