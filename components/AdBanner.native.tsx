import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { useMembership } from '../hooks/useMembership';
import { xianxia } from '../constants/xianxia';
import { ensureAdsConsent, getAdsConsentSnapshot, subscribeAdsConsent } from '../services/adConsent.native';

function configuredBannerId() {
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID || '';
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID || '';
  return '';
}

export function AdBanner({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  const membership = useMembership();
  const [failed, setFailed] = useState(false);
  const consented = useSyncExternalStore(subscribeAdsConsent, getAdsConsentSnapshot, getAdsConsentSnapshot);

  useEffect(() => {
    if (!membership.loading && membership.showAds) {
      void ensureAdsConsent();
    }
  }, [membership.loading, membership.showAds]);

  if (membership.loading || !membership.showAds || !consented) return null;

  const productionId = configuredBannerId();
  const unitId = __DEV__ || process.env.EXPO_PUBLIC_ADS_MODE !== 'production' || !productionId ? TestIds.BANNER : productionId;

  if (failed) {
    return (
      <View style={[styles.fallback, dark && styles.fallbackDark, compact && styles.compact]}>
        <Text style={[styles.fallbackLabel, dark && styles.fallbackLabelDark]}>QUẢNG CÁO</Text>
        <Text style={[styles.fallbackText, dark && styles.fallbackTextDark]}>Quảng cáo tạm thời chưa tải được.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 52, marginVertical: 10, alignItems: 'center', justifyContent: 'center' },
  compact: { marginVertical: 7 },
  fallback: { minHeight: 58, marginVertical: 10, borderRadius: 13, padding: 10, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#DECFC7', alignItems: 'center', justifyContent: 'center' },
  fallbackDark: { backgroundColor: '#222522', borderColor: '#4E514B' },
  fallbackLabel: { color: xianxia.cinnabar, fontSize: 6.5, fontWeight: '900', letterSpacing: .7 },
  fallbackLabelDark: { color: xianxia.goldSoft },
  fallbackText: { color: xianxia.muted, fontSize: 8, marginTop: 3 },
  fallbackTextDark: { color: '#AAA59C' },
});
