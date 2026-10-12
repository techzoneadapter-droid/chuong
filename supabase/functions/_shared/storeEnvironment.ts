export function requireStoreEnvironment(value: string | undefined): 'sandbox' | 'production' {
  if (value !== 'sandbox' && value !== 'production') throw new Error('iap_environment_not_configured');
  return value;
}

export function appleStoreBase(value: string | undefined) {
  return requireStoreEnvironment(value) === 'sandbox'
    ? 'https://api.storekit-sandbox.apple.com'
    : 'https://api.storekit.apple.com';
}

export function assertStoreEnvironment(value: string | undefined, sandbox: boolean) {
  if ((requireStoreEnvironment(value) === 'sandbox') !== sandbox) throw new Error('store_environment_mismatch');
}
