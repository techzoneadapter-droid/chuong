import { Platform } from 'react-native';
import { AdEventType, InterstitialAd, TestIds } from 'react-native-google-mobile-ads';
import { CHUONG_ANDROID_INTERSTITIAL_ID, realAdsEnabled } from './admobUnits';

// Never block chapter navigation while an ad is being fetched. Only show
// at a natural NEXT-chapter boundary after the reader has finished the chapter.
const CHAPTERS_PER_AD = 4;
const MIN_AD_INTERVAL_MS = 10 * 60 * 1000;
let eligibleTransitions = 0;
let lastShownAt = 0;
let allowed = false;
let loaded = false;
let instance: InterstitialAd | null = null;
let releaseListeners: Array<() => void> = [];

function unitId() {
  if (__DEV__) return TestIds.INTERSTITIAL;
  if (!realAdsEnabled()) return '';
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID || CHUONG_ANDROID_INTERSTITIAL_ID;
  }
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID || '';
  return '';
}

function resetInstance() {
  for (const fn of releaseListeners) fn();
  releaseListeners = [];
  instance = null;
  loaded = false;
}

function preload() {
  if (!allowed || instance || !unitId()) return;
  try {
    const ad = InterstitialAd.createForAdRequest(unitId(), {
      requestNonPersonalizedAdsOnly: true,
    });
    instance = ad;
    releaseListeners = [
      ad.addAdEventListener(AdEventType.LOADED, () => { loaded = true; }),
      ad.addAdEventListener(AdEventType.ERROR, () => { resetInstance(); }),
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        resetInstance();
        if (allowed) preload();
      }),
    ];
    ad.load();
  } catch {
    resetInstance();
  }
}

export function allowChapterInterstitials() {
  allowed = true;
  preload();
}

export function disableChapterInterstitials() {
  allowed = false;
  eligibleTransitions = 0;
  resetInstance();
}

export function onFinishedChapterAdvance() {
  if (!allowed) return;
  eligibleTransitions += 1;
  if (eligibleTransitions < CHAPTERS_PER_AD) return;
  if (Date.now() - lastShownAt < MIN_AD_INTERVAL_MS) return;
  if (!loaded || !instance) { preload(); return; }
  const ad = instance;
  loaded = false;
  eligibleTransitions = 0;
  lastShownAt = Date.now();
  // This is intentionally fire-and-forget; reading always continues even if
  // the OS, network or ads SDK refuses to display the ad.
  const failed = () => {
    resetInstance();
    if (allowed) preload();
  };
  try { void ad.show().catch(failed); } catch { failed(); }
}
