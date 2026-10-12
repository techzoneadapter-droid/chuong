import mobileAds, { AdsConsent } from 'react-native-google-mobile-ads';

let initialization: Promise<boolean> | null = null;
let permitted = false;
const listeners = new Set<() => void>();
export const getAdsConsentSnapshot = () => permitted;
export function subscribeAdsConsent(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(allowed: boolean) {
  permitted = allowed;
  for (const listener of listeners) listener();
}
export async function showAdPrivacyOptions() {
  const info = await AdsConsent.getConsentInfo();
  if (info.privacyOptionsRequirementStatus !== 'REQUIRED') return false;
  const updated = await AdsConsent.showPrivacyOptionsForm();
  initialization = null;
  publish(updated.canRequestAds);
  return true;
}
// Every ad surface waits for UMP, including rewarded ads opened before the bridge.
export function ensureAdsConsent(): Promise<boolean> {
  if (!initialization) initialization = (async () => {
    try { await AdsConsent.gatherConsent(); } catch { /* prior consent may still be valid */ }
    try {
      if (!(await AdsConsent.getConsentInfo()).canRequestAds) return false;
      await mobileAds().initialize();
      return true;
    } catch { return false; }
  })().then(allowed => {
    publish(allowed);
    if (!allowed) initialization = null;
    return allowed;
  });
  return initialization;
}
