import { PremiumIapState } from './premiumIapTypes';
import { defaultPremiumProductId } from '../services/subscriptions';

export function usePremiumIap(_userId: string, _onVerified?: () => void): PremiumIapState {
  return {
    supported: false,
    connected: false,
    verifierReady: false,
    productId: defaultPremiumProductId(null),
    product: null,
    processing: false,
    restoring: false,
    error: '',
    success: '',
    refresh: async () => {},
    buy: async () => {},
    restore: async () => {},
    clearMessage: () => {},
  };
}
