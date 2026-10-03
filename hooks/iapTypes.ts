import { StoreProduct } from '../services/store';

export type NativeStoreProduct = {
  id: string;
  title?: string | null;
  displayPrice?: string | null;
};

export type LinhThachIapArgs = {
  catalog: StoreProduct[];
  userId: string;
  onCredited?: (result: { balanceCoins?: number | null; debtCoins?: number | null }) => void;
};

export type LinhThachIapState = {
  supported: boolean;
  connected: boolean;
  verifierReady: boolean;
  productsById: Record<string, NativeStoreProduct>;
  processingProductId: string | null;
  error: string;
  success: string;
  refreshProducts: () => Promise<void>;
  buy: (productId: string) => Promise<void>;
  clearMessage: () => void;
};
