import { ErrorCode, finishTransaction, type Product, type Purchase, useIAP } from 'expo-iap';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { PremiumIapState, PremiumNativeProduct } from './premiumIapTypes';
import {
  defaultPremiumProductId,
  getSubscriptionRuntimeStatus,
  nativeSubscriptionProvider,
  verifyPremiumSubscription,
} from '../services/subscriptions';

function friendly(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === ErrorCode.UserCancelled) return '';
  const message = error instanceof Error ? error.message : String(error);
  if (/not.?configured|verifier|xác minh/i.test(message)) return 'Cổng xác minh thuê bao chưa sẵn sàng. Không có quyền VIP nào được cấp.';
  if (/pending/i.test(message)) return 'Giao dịch đang chờ cửa hàng xác nhận.';
  return message || 'Không thể hoàn tất thuê bao VIP.';
}

export function usePremiumIap(userId: string, onVerified?: () => void): PremiumIapState {
  const provider = nativeSubscriptionProvider();
  const [productId, setProductId] = useState(defaultPremiumProductId(provider));
  const [verifierReady, setVerifierReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const handled = useRef(new Set<string>());

  const verify = useCallback(async (purchase: Purchase, restored = false) => {
    if (!provider || !userId || purchase.productId !== productId) return;
    const identity = String(purchase.transactionId || purchase.id || purchase.purchaseToken || '');
    if (identity && handled.current.has(identity)) return;
    if (identity) handled.current.add(identity);

    setProcessing(!restored);
    setError('');
    setSuccess('');
    try {
      const result = await verifyPremiumSubscription({
        provider,
        productId: purchase.productId,
        purchaseToken: purchase.purchaseToken,
        transactionId: purchase.transactionId || purchase.id,
      });
      if (!result.premium) throw new Error('Thuê bao đã hết hạn hoặc chưa có hiệu lực.');
      await finishTransaction({ purchase, isConsumable: false });
      setSuccess(restored ? 'Đã khôi phục CHƯƠNG VIP.' : 'CHƯƠNG VIP đã được kích hoạt.');
      onVerified?.();
    } catch (cause) {
      if (identity) handled.current.delete(identity);
      const message = friendly(cause);
      if (message) setError(message);
    } finally {
      setProcessing(false);
    }
  }, [onVerified, productId, provider, userId]);

  const iap = useIAP({
    onPurchaseSuccess: (purchase) => { void verify(purchase, false); },
    onPurchaseError: (purchaseError) => {
      const message = friendly(purchaseError);
      if (message) setError(message);
      setProcessing(false);
    },
  });

  const refresh = useCallback(async () => {
    if (!provider) return;
    setError('');
    try {
      const status = await getSubscriptionRuntimeStatus();
      const id = provider === 'google_play' ? status.googleProductId : status.appleProductId;
      setProductId(id);
      setVerifierReady(provider === 'google_play' ? status.googlePlayReady : status.appStoreReady);
      if (iap.connected && id) await iap.fetchProducts({ skus: [id], type: 'subs' });
    } catch (cause) {
      setVerifierReady(false);
      const message = friendly(cause);
      if (message) setError(message);
    }
  }, [iap.connected, iap.fetchProducts, provider]);

  useEffect(() => { void refresh(); }, [refresh]);

  const rawProduct = useMemo(() => {
    const subs = ((iap as unknown as { subscriptions?: Product[] }).subscriptions ?? []) as Product[];
    return subs.find((item) => item.id === productId) ?? null;
  }, [iap, productId]);

  const product = useMemo<PremiumNativeProduct | null>(() => rawProduct ? {
    id: rawProduct.id,
    title: rawProduct.title,
    displayPrice: rawProduct.displayPrice,
  } : null, [rawProduct]);

  const buy = useCallback(async () => {
    if (!provider || Platform.OS === 'web' || !userId) return;
    setError('');
    setSuccess('');
    if (!verifierReady) {
      setError('Server chưa có đủ khóa xác minh Google Play / App Store nên nút mua VIP được khóa an toàn.');
      return;
    }
    if (!iap.connected) {
      setError('Chưa kết nối được cửa hàng trên thiết bị.');
      return;
    }
    if (!rawProduct) {
      setError('Chưa lấy được gói VIP từ cửa hàng. Kiểm tra Product ID và trạng thái gói trong console.');
      return;
    }

    const androidOffers = (
      (rawProduct as unknown as { subscriptionOfferDetailsAndroid?: Array<{ offerToken?: string }> })
        .subscriptionOfferDetailsAndroid ?? []
    )
      .filter((offer) => Boolean(offer.offerToken))
      .map((offer) => ({ sku: productId, offerToken: String(offer.offerToken) }));

    setProcessing(true);
    try {
      await iap.requestPurchase({
        request: {
          apple: { sku: productId, appAccountToken: userId },
          google: {
            skus: [productId],
            ...(androidOffers.length ? { subscriptionOffers: androidOffers } : {}),
            obfuscatedAccountId: userId,
          },
        },
        type: 'subs',
      } as never);
    } catch (cause) {
      const message = friendly(cause);
      if (message) setError(message);
      setProcessing(false);
    }
  }, [iap.connected, iap.requestPurchase, productId, provider, rawProduct, userId, verifierReady]);

  const restore = useCallback(async () => {
    if (!provider || !userId) return;
    setRestoring(true);
    setError('');
    setSuccess('');
    try {
      await iap.restorePurchases();
      await iap.getAvailablePurchases();
    } catch (cause) {
      const message = friendly(cause);
      if (message) setError(message);
      setRestoring(false);
    }
  }, [iap.getAvailablePurchases, iap.restorePurchases, provider, userId]);

  useEffect(() => {
    if (!restoring) return;
    const purchases = ((iap as unknown as { availablePurchases?: Purchase[] }).availablePurchases ?? []) as Purchase[];
    const subscription = purchases.find((item) => item.productId === productId);
    if (!subscription) return;
    void verify(subscription, true).finally(() => setRestoring(false));
  }, [iap, productId, restoring, verify]);

  return {
    supported: Boolean(provider),
    connected: iap.connected,
    verifierReady,
    productId,
    product,
    processing,
    restoring,
    error,
    success,
    refresh,
    buy,
    restore,
    clearMessage: () => { setError(''); setSuccess(''); },
  };
}
