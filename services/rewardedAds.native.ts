import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { CHUONG_ANDROID_REWARDED_ID, realAdsEnabled } from './admobUnits';
import mobileAds, {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
  AdsConsent,
} from 'react-native-google-mobile-ads';

export type RewardedAdResult = 'earned' | 'closed' | 'unavailable';

let initialized = false;

function productionUnitId() {
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID?.trim() || CHUONG_ANDROID_REWARDED_ID;
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS?.trim() || '';
  return '';
}

export function rewardedAdsAvailable() {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return false;
  if (Constants.appOwnership === 'expo') return false;
  return __DEV__ || (realAdsEnabled() && Boolean(productionUnitId()));
}

export async function showDailyRewardedAd(userId: string, ticket: string): Promise<RewardedAdResult> {
  if (!userId || !ticket) return 'unavailable';
  if (!rewardedAdsAvailable()) return 'unavailable';

  // Only load after Google's UMP consent gate allows requests.
  if (!__DEV__) {
    const consent = await AdsConsent.getConsentInfo().catch(() => null);
    if (!consent?.canRequestAds) return 'unavailable';
  }
  if (!initialized) {
    await mobileAds().initialize();
    initialized = true;
  }

  const adUnitId = __DEV__ ? TestIds.REWARDED : productionUnitId();
  if (!adUnitId) return 'unavailable';

  const rewarded = RewardedAd.createForAdRequest(adUnitId, {
    requestNonPersonalizedAdsOnly: true,
    serverSideVerificationOptions: { userId, customData: ticket },
  });

  return await new Promise<RewardedAdResult>((resolve) => {
    let settled = false;
    let earned = false;
    const finish = (result: RewardedAdResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribeLoaded();
      unsubscribeEarned();
      unsubscribeClosed();
      unsubscribeError();
      resolve(result);
    };

    const unsubscribeLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      // The timeout covers loading only. A valid video may last over 20 seconds.
      clearTimeout(timer);
      void rewarded.show().catch(() => finish('unavailable'));
    });
    const unsubscribeEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earned = true;
    });
    const unsubscribeClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      finish(earned ? 'earned' : 'closed');
    });
    const unsubscribeError = rewarded.addAdEventListener(AdEventType.ERROR, () => {
      finish('unavailable');
    });
    const timer = setTimeout(() => finish('unavailable'), 20000);

    rewarded.load();
  });
}
