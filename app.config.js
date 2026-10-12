const base = require('./app.json');

const TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

const liveAds = process.env.EXPO_PUBLIC_ADS_MODE === 'production';
const androidAppId = liveAds ? process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || TEST_ANDROID_APP_ID : TEST_ANDROID_APP_ID;
const iosAppId = liveAds ? process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || TEST_IOS_APP_ID : TEST_IOS_APP_ID;

if (process.env.EXPO_PUBLIC_SUPABASE_MODE === 'staging') {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  let hostname = '';
  try { hostname = new URL(url).hostname; } catch { /* invalid staging URL */ }
  let serverKey = Boolean(key?.startsWith('sb_secret_'));
  try { serverKey ||= JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'service_role'; } catch { /* publishable key is not a JWT */ }
  if (!hostname || !key || serverKey || hostname === 'lwchpifeahyuoajeidsa.supabase.co') {
    throw new Error('Release testing requires a separate staging Supabase URL and public key.');
  }
}

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

module.exports = ({ config }) => ({
  ...base.expo,
  ...config,
  plugins,
});
