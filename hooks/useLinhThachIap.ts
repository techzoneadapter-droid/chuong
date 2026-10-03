import { LinhThachIapArgs, LinhThachIapState } from './iapTypes';

export function useLinhThachIap(_args: LinhThachIapArgs): LinhThachIapState {
  return {
    supported: false,
    connected: false,
    verifierReady: false,
    productsById: {},
    processingProductId: null,
    error: '',
    success: '',
    refreshProducts: async () => {},
    buy: async () => {},
    clearMessage: () => {},
  };
}
