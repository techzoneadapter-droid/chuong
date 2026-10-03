import { Platform } from 'react-native';
import { requireSupabase } from '../lib/supabase';
import { Tables } from '../types/database';
import { toServiceError } from './errors';

export type StoreProduct = Tables<'store_products'>;
export type StorePurchase = Tables<'store_purchases'>;
export type StoreProvider = 'google_play' | 'app_store';
export type IapVerificationStatus = { google_play: boolean; app_store: boolean };
export type VerifiedStorePurchaseResponse = {
  verified: boolean;
  credited: boolean;
  balanceCoins?: number | null;
  debtCoins?: number | null;
  purchase?: StorePurchase | StorePurchase[] | null;
};

export async function getStoreProducts(): Promise<StoreProduct[]> {
  try {
    const { data, error } = await requireSupabase()
      .from('store_products')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .order('coins');
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    throw toServiceError(error, 'Không thể tải các gói Linh Thạch.');
  }
}

export async function getMyStorePurchases(userId: string, limit = 50): Promise<StorePurchase[]> {
  try {
    const { data, error } = await requireSupabase()
      .from('store_purchases')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100)));
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    throw toServiceError(error, 'Không thể tải lịch sử nạp Linh Thạch.');
  }
}

export function nativeStoreProvider(): StoreProvider | null {
  if (Platform.OS === 'android') return 'google_play';
  if (Platform.OS === 'ios') return 'app_store';
  return null;
}

export function productIdForPlatform(product: StoreProduct) {
  const provider = nativeStoreProvider();
  if (provider === 'google_play') return product.google_product_id;
  if (provider === 'app_store') return product.apple_product_id;
  return product.google_product_id || product.apple_product_id;
}

export async function getIapVerificationStatus(): Promise<IapVerificationStatus> {
  try {
    const { data, error } = await requireSupabase().functions.invoke('iap-verify', {
      body: { action: 'status' },
    });
    if (error) throw error;
    return {
      google_play: Boolean(data?.google_play),
      app_store: Boolean(data?.app_store),
    };
  } catch (error) {
    throw toServiceError(error, 'Không thể kiểm tra trạng thái xác minh cửa hàng.');
  }
}

export async function submitStorePurchase(input: {
  provider: StoreProvider;
  productId: string;
  purchaseToken?: string | null;
  transactionId?: string | null;
}): Promise<VerifiedStorePurchaseResponse> {
  try {
    const { data, error } = await requireSupabase().functions.invoke('iap-verify', {
      body: {
        action: 'verify',
        provider: input.provider,
        productId: input.productId,
        purchaseToken: input.purchaseToken || undefined,
        transactionId: input.transactionId || undefined,
      },
    });
    if (error) throw error;
    if (!data?.verified || !data?.credited) {
      throw new Error(data?.error || 'Giao dịch chưa được cửa hàng xác minh.');
    }
    return data as VerifiedStorePurchaseResponse;
  } catch (error) {
    throw toServiceError(error, 'Không thể xác minh giao dịch cửa hàng.');
  }
}
