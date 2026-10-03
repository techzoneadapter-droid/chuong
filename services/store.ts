import { Platform } from 'react-native';
import { requireSupabase } from '../lib/supabase';
import { Tables } from '../types/database';
import { toServiceError } from './errors';

export type StoreProduct = Tables<'store_products'>;
export type StorePurchase = Tables<'store_purchases'>;

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
    throw toServiceError(error, 'Không thể tải các gói CHƯƠNG Xu.');
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
    throw toServiceError(error, 'Không thể tải lịch sử nạp Xu.');
  }
}

export function nativeStoreProvider(): 'google_play' | 'app_store' | null {
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

export async function submitStoreReceipt(input: {
  provider: 'google_play' | 'app_store';
  productId: string;
  receipt: string;
  transactionId?: string;
}) {
  try {
    const { data, error } = await requireSupabase().functions.invoke('iap-verify', {
      body: input,
    });
    if (error) throw error;
    return data;
  } catch (error) {
    throw toServiceError(error, 'Không thể xác minh giao dịch cửa hàng.');
  }
}
