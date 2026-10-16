// Public AdMob ad-unit identifiers provided by the NVB publisher for CHƯƠNG Android.
// Public identifiers are safe to ship in the app; private financial/admin keys are not.
export const CHUONG_ANDROID_BANNER_ID = 'ca-app-pub-2610920886028786/7045578976';
export const CHUONG_ANDROID_INTERSTITIAL_ID = 'ca-app-pub-2610920886028786/9557201408';
export const CHUONG_ANDROID_REWARDED_ID = 'ca-app-pub-2610920886028786/2277387891';

// Ads must stay off in production until the owner explicitly enables them after
// verified AdMob/store review, ads consent and on-device acceptance testing.
export function realAdsEnabled() {
  return !__DEV__ && process.env.EXPO_PUBLIC_ADMOB_LIVE === 'true';
}
