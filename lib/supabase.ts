import './urlPolyfill';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { Database } from '../types/database';

// Supabase publishable keys are designed for browser/mobile/public source.
// RLS remains the security boundary. Environment variables can override these
// defaults for staging or future key rotation without changing app code.
const PRODUCTION_SUPABASE_URL = 'https://lwchpifeahyuoajeidsa.supabase.co';
const PRODUCTION_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dItrQ5tEdt3J-peHAqauzQ_VPnRVu0l';

const forceDemoMode = process.env.EXPO_PUBLIC_SUPABASE_MODE?.trim().toLowerCase() === 'demo';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || PRODUCTION_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || PRODUCTION_SUPABASE_PUBLISHABLE_KEY;

function validUrl(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = Boolean(
  !forceDemoMode && validUrl(supabaseUrl) && supabasePublishableKey
);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabasePublishableKey, {
      global: {
        fetch: async (input, init) => {
          const controller = new AbortController();
          const cancel = () => controller.abort();
          if (init?.signal?.aborted) cancel();
          else init?.signal?.addEventListener('abort', cancel, { once: true });
          const timer = setTimeout(cancel, 15000);
          try {
            return await fetch(input, { ...init, signal: controller.signal });
          } finally {
            clearTimeout(timer);
            init?.signal?.removeEventListener('abort', cancel);
          }
        },
      },
      auth: {
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    const error = new Error('Supabase đang tắt. Ứng dụng đang ở chế độ demo.');
    error.name = 'BackendUnavailableError';
    throw error;
  }
  return supabase;
}
