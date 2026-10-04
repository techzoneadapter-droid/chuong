import { Platform } from 'react-native';
import { requireSupabase } from '../lib/supabase';
import { toServiceError } from './errors';

export type SubscriptionProvider = 'google_play' | 'app_store';

export type SubscriptionRuntimeStatus = {
  premium: boolean;
  googlePlayReady: boolean;
  appStoreReady: boolean;
  googleProductId: string;
  appleProductId: string;
};

export type VerifiedSubscription = {
  verified: boolean;
  premium: boolean;
  subscription?: Record<string, unknown> | null;
};

export function nativeSubscriptionProvider(): SubscriptionProvider | null {
  if (Platform.OS === 'android') return 'google_play';
  if (Platform.OS === 'ios') return 'app_store';
  return null;
}

export function defaultPremiumProductId(provider: SubscriptionProvider | null) {
  if (provider === 'google_play') {
    return process.env.EXPO_PUBLIC_PREMIUM_GOOGLE_PRODUCT_ID || 'chuong.vip.monthly';
  }
  if (provider === 'app_store') {
    return process.env.EXPO_PUBLIC_PREMIUM_APPLE_PRODUCT_ID || 'chuong.vip.monthly';
  }
  return process.env.EXPO_PUBLIC_PREMIUM_GOOGLE_PRODUCT_ID
    || process.env.EXPO_PUBLIC_PREMIUM_APPLE_PRODUCT_ID
    || 'chuong.vip.monthly';
}

export async function getSubscriptionRuntimeStatus(): Promise<SubscriptionRuntimeStatus> {
  try {
    const { data, error } = await requireSupabase().functions.invoke('subscription-verify', {
      body: { action: 'status' },
    });
    if (error) throw error;
    return {
      premium: Boolean(data?.premium),
      googlePlayReady: Boolean(data?.google_play),
      appStoreReady: Boolean(data?.app_store),
      googleProductId: String(data?.googleProductId || process.env.EXPO_PUBLIC_PREMIUM_GOOGLE_PRODUCT_ID || 'chuong.vip.monthly'),
      appleProductId: String(data?.appleProductId || process.env.EXPO_PUBLIC_PREMIUM_APPLE_PRODUCT_ID || 'chuong.vip.monthly'),
    };
  } catch (error) {
    throw toServiceError(error, 'Không thể kiểm tra cổng thuê bao VIP.');
  }
}

export async function verifyPremiumSubscription(input: {
  provider: SubscriptionProvider;
  productId: string;
  purchaseToken?: string | null;
  transactionId?: string | null;
}): Promise<VerifiedSubscription> {
  try {
    const { data, error } = await requireSupabase().functions.invoke('subscription-verify', {
      body: {
        action: 'verify',
        provider: input.provider,
        productId: input.productId,
        purchaseToken: input.purchaseToken || undefined,
        transactionId: input.transactionId || undefined,
      },
    });
    if (error) throw error;
    if (!data?.verified) throw new Error(data?.error || 'Thuê bao chưa được cửa hàng xác minh.');
    return {
      verified: true,
      premium: Boolean(data?.premium),
      subscription: data?.subscription ?? null,
    };
  } catch (error) {
    throw toServiceError(error, 'Không thể xác minh thuê bao VIP.');
  }
}
