import './urlPolyfill';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { Database } from '../types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

function validUrl(value?: string) {
  if (!value) return false;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname); } catch { return false; }
}
export const isSupabaseConfigured = Boolean(validUrl(supabaseUrl) && supabaseAnonKey);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl!, supabaseAnonKey!, {
      global: { fetch: async (input, init) => {
        const controller = new AbortController();
        const cancel = () => controller.abort();
        if (init?.signal?.aborted) cancel(); else init?.signal?.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(cancel, 15000);
        try { return await fetch(input, { ...init, signal: controller.signal }); }
        finally { clearTimeout(timer); init?.signal?.removeEventListener('abort', cancel); }
      } },
      auth: {
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web'
      }
    })
  : null;

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    const error = new Error('Supabase chưa được cấu hình. Ứng dụng đang ở chế độ demo.');
    error.name = 'BackendUnavailableError';
    throw error;
  }
  return supabase;
}
