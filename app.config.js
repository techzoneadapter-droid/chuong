const base = require('./app.json');

const TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

// Public publisher App ID for NVB/CHƯƠNG. Preview builds keep the official Google sample ID.
const NVB_ANDROID_APP_ID = 'ca-app-pub-2610920886028786~8409797383';
const liveAds = process.env.EXPO_PUBLIC_ADMOB_LIVE === 'true' && process.env.EAS_BUILD_PROFILE === 'production';
const androidAppId = liveAds ? process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || NVB_ANDROID_APP_ID : TEST_ANDROID_APP_ID;
const iosAppId = liveAds ? process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || TEST_IOS_APP_ID : TEST_IOS_APP_ID;

const plugins = (base.expo.plugins || []).filter((plugin) => {
  const name = Array.isArray(plugin) ? plugin[0] : plugin;
  return name !== 'react-native-google-mobile-ads';
});

plugins.push([
  'react-native-google-mobile-ads',
  {
    androidAppId,
    iosAppId,
    delayAppMeasurementInit: true,
    userTrackingUsageDescription: 'CHƯƠNG sử dụng mã nhận dạng quảng cáo để hiển thị và đo lường quảng cáo khi người dùng chọn gói Thường.',
  },
]);

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    plugins,
  },
};
