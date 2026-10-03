import { requireSupabase } from '../lib/supabase';
import { Tables } from '../types/database';
import { getIapVerificationStatus, IapVerificationStatus } from './store';
import { toServiceError } from './errors';

export type StoreWebhookEvent = Tables<'store_webhook_events'>;
export type StorePurchase = Tables<'store_purchases'>;
export type StoreProduct = Tables<'store_products'>;

export type StoreOpsDashboard = {
  verifier: IapVerificationStatus;
  products: StoreProduct[];
  purchases: StorePurchase[];
  webhookEvents: StoreWebhookEvent[];
  counts: {
    purchases: number;
    credited: number;
    revoked: number;
    webhookFailed: number;
    webhookProcessed: number;
  };
};

export async function getStoreOpsDashboard(): Promise<StoreOpsDashboard> {
  const client = requireSupabase();
  try {
    const [
      verifier,
      productsRes,
      purchasesRes,
      eventsRes,
      purchasesCount,
      creditedCount,
      revokedCount,
      webhookFailedCount,
      webhookProcessedCount,
    ] = await Promise.all([
      getIapVerificationStatus().catch(() => ({
        google_play: false,
        app_store: false,
        google_pubsub: false,
        apple_notifications: false,
      })),
      client.from('store_products').select('*').order('sort_order'),
      client.from('store_purchases').select('*').order('created_at', { ascending: false }).limit(25),
      client.from('store_webhook_events').select('*').order('received_at', { ascending: false }).limit(40),
      client.from('store_purchases').select('id', { count: 'exact', head: true }),
      client.from('store_purchases').select('id', { count: 'exact', head: true }).eq('state', 'credited'),
      client.from('store_purchases').select('id', { count: 'exact', head: true }).eq('state', 'revoked'),
      client.from('store_webhook_events').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      client.from('store_webhook_events').select('id', { count: 'exact', head: true }).eq('status', 'processed'),
    ]);

    if (productsRes.error) throw productsRes.error;
    if (purchasesRes.error) throw purchasesRes.error;
    if (eventsRes.error) throw eventsRes.error;
    if (purchasesCount.error) throw purchasesCount.error;
    if (creditedCount.error) throw creditedCount.error;
    if (revokedCount.error) throw revokedCount.error;
    if (webhookFailedCount.error) throw webhookFailedCount.error;
    if (webhookProcessedCount.error) throw webhookProcessedCount.error;

    return {
      verifier,
      products: productsRes.data ?? [],
      purchases: purchasesRes.data ?? [],
      webhookEvents: eventsRes.data ?? [],
      counts: {
        purchases: purchasesCount.count ?? 0,
        credited: creditedCount.count ?? 0,
        revoked: revokedCount.count ?? 0,
        webhookFailed: webhookFailedCount.count ?? 0,
        webhookProcessed: webhookProcessedCount.count ?? 0,
      },
    };
  } catch (error) {
    throw toServiceError(error, 'Không thể tải trạng thái thanh toán cửa hàng.');
  }
}
