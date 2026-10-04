export type PremiumNativeProduct = {
  id: string;
  title?: string | null;
  displayPrice?: string | null;
};

export type PremiumIapState = {
  supported: boolean;
  connected: boolean;
  verifierReady: boolean;
  productId: string;
  product: PremiumNativeProduct | null;
  processing: boolean;
  restoring: boolean;
  error: string;
  success: string;
  refresh: () => Promise<void>;
  buy: () => Promise<void>;
  restore: () => Promise<void>;
  clearMessage: () => void;
};
