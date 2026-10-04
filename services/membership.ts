import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

export const STANDARD_OFFLINE_QUOTA_BYTES = 100 * 1024 * 1024;
export const PREMIUM_OFFLINE_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;

const CACHE_PREFIX = 'chuong:membership:v1:';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type MembershipStatus = {
  plan: 'standard' | 'premium';
  isPremium: boolean;
  showAds: boolean;
  offlineQuotaBytes: number;
  aiTranslation: boolean;
  source: 'guest' | 'server' | 'cache' | 'fallback';
};

type MembershipCache = {
  premium: boolean;
  checkedAt: string;
};

function statusFor(premium: boolean, source: MembershipStatus['source']): MembershipStatus {
  return {
    plan: premium ? 'premium' : 'standard',
    isPremium: premium,
    showAds: !premium,
    offlineQuotaBytes: premium ? PREMIUM_OFFLINE_QUOTA_BYTES : STANDARD_OFFLINE_QUOTA_BYTES,
    aiTranslation: premium,
    source,
  };
}

async function readCache(userId: string) {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MembershipCache;
    if (!parsed.checkedAt || Date.now() - Date.parse(parsed.checkedAt) > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(userId: string, premium: boolean) {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + userId, JSON.stringify({
      premium,
      checkedAt: new Date().toISOString(),
    } satisfies MembershipCache));
  } catch {
    // Membership remains usable for this session even if the local cache is unavailable.
  }
}

export async function getMembershipStatus(userId?: string | null): Promise<MembershipStatus> {
  if (!userId) return statusFor(false, 'guest');

  const cached = await readCache(userId);
  if (!supabase) return cached ? statusFor(cached.premium, 'cache') : statusFor(false, 'fallback');

  try {
    const { data, error } = await supabase.functions.invoke('subscription-verify', {
      body: { action: 'status' },
    });
    if (error) throw error;
    const premium = Boolean(data?.premium);
    await writeCache(userId, premium);
    return statusFor(premium, 'server');
  } catch {
    if (cached) return statusFor(cached.premium, 'cache');
    return statusFor(false, 'fallback');
  }
}
