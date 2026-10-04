const base = require('./app.json');

const TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

const androidAppId = process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || TEST_ANDROID_APP_ID;
const iosAppId = process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || TEST_IOS_APP_ID;

const plugins = (base.expo.plugins || []).filter((plugin) => {
  const name = Array.isArray(plugin) ? plugin[0] : plugin;
  return name !== 'react-native-google-mobile-ads';
});

plugins.push([
  'react-native-google-mobile-ads',
  {
    androidAppId,
    iosAppId,
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
