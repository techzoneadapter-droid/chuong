import { ErrorCode, finishTransaction, type Product, type Purchase, useIAP } from 'expo-iap';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { getIapVerificationStatus, nativeStoreProvider, productIdForPlatform, submitStorePurchase } from '../services/store';
import { LinhThachIapArgs, LinhThachIapState, NativeStoreProduct } from './iapTypes';

function friendlyPurchaseError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === ErrorCode.UserCancelled) return '';
  const message = error instanceof Error ? error.message : String(error);
  if (/not.?configured|xác minh cửa hàng/i.test(message)) return 'Cổng xác minh cửa hàng chưa được cấu hình. Chưa có Linh Thạch nào bị cộng hoặc trừ.';
  if (/pending/i.test(message)) return 'Giao dịch đang chờ cửa hàng xác nhận. CHƯƠNG sẽ xử lý lại khi giao dịch hoàn tất.';
  return message || 'Không thể hoàn tất giao dịch.';
}

export function useLinhThachIap({ catalog, userId, onCredited }: LinhThachIapArgs): LinhThachIapState {
  const [verifierReady, setVerifierReady] = useState(false);
  const [processingProductId, setProcessingProductId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const provider = nativeStoreProvider();
  const skus = useMemo(
    () => catalog.map(productIdForPlatform).filter((value): value is string => Boolean(value)),
    [catalog],
  );

  const handlePurchase = useCallback(async (purchase: Purchase) => {
    if (!provider) return;
    setProcessingProductId(purchase.productId);
    setError('');
    setSuccess('');
    try {
      const verified = await submitStorePurchase({
        provider,
        productId: purchase.productId,
        purchaseToken: purchase.purchaseToken,
        transactionId: purchase.transactionId || purchase.id,
      });

      await finishTransaction({ purchase, isConsumable: true });
      setSuccess('Nạp Linh Thạch thành công. Số dư đã được đồng bộ.');
      onCredited?.({ balanceCoins: verified.balanceCoins, debtCoins: verified.debtCoins });
    } catch (cause) {
      const message = friendlyPurchaseError(cause);
      if (message) setError(message);
    } finally {
      setProcessingProductId(null);
    }
  }, [onCredited, provider]);

  const iap = useIAP({
    onPurchaseSuccess: (purchase) => {
      void handlePurchase(purchase);
    },
    onPurchaseError: (purchaseError) => {
      const message = friendlyPurchaseError(purchaseError);
      if (message) setError(message);
      setProcessingProductId(null);
    },
  });

  const refreshProducts = useCallback(async () => {
    if (!iap.connected || !skus.length) return;
    try {
      await iap.fetchProducts({ skus, type: 'in-app' });
    } catch (cause) {
      const message = friendlyPurchaseError(cause);
      if (message) setError(message);
    }
  }, [iap.connected, iap.fetchProducts, skus]);

  useEffect(() => {
    let active = true;
    if (!provider) return;
    void getIapVerificationStatus()
      .then((status) => {
        if (active) setVerifierReady(Boolean(status[provider]));
      })
      .catch((cause) => {
        if (active) {
          setVerifierReady(false);
          setError(friendlyPurchaseError(cause));
        }
      });
    return () => { active = false; };
  }, [provider]);

  useEffect(() => {
    void refreshProducts();
  }, [refreshProducts]);

  const productsById = useMemo(() => {
    const map: Record<string, NativeStoreProduct> = {};
    for (const product of iap.products as Product[]) {
      map[product.id] = {
        id: product.id,
        title: product.title,
        displayPrice: product.displayPrice,
      };
    }
    return map;
  }, [iap.products]);

  const buy = useCallback(async (productId: string) => {
    if (!provider || Platform.OS === 'web') return;
    setError('');
    setSuccess('');
    if (!verifierReady) {
      setError('Xác minh thanh toán phía server chưa sẵn sàng. CHƯƠNG chưa cho phép mua để tránh phát sinh giao dịch không được cộng Linh Thạch.');
      return;
    }
    if (!iap.connected) {
      setError('Chưa kết nối được với cửa hàng. Hãy thử lại sau.');
      return;
    }
    setProcessingProductId(productId);
    try {
      await iap.requestPurchase({
        request: {
          apple: { sku: productId, quantity: 1, appAccountToken: userId },
          google: { skus: [productId], obfuscatedAccountId: userId },
        },
        type: 'in-app',
      });
    } catch (cause) {
      const message = friendlyPurchaseError(cause);
      if (message) setError(message);
      setProcessingProductId(null);
    }
  }, [iap.connected, iap.requestPurchase, provider, userId, verifierReady]);

  return {
    supported: Boolean(provider),
    connected: iap.connected,
    verifierReady,
    productsById,
    processingProductId,
    error,
    success,
    refreshProducts,
    buy,
    clearMessage: () => { setError(''); setSuccess(''); },
  };
}
