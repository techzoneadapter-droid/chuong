import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMembership } from '../hooks/useMembership';
import { xianxia } from '../constants/xianxia';

export function AdBanner({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  const router = useRouter();
  const membership = useMembership();

  if (membership.loading || !membership.showAds) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Quảng cáo dành cho gói thường"
      onPress={() => router.push('/premium')}
      style={[styles.card, dark && styles.cardDark, compact && styles.compact]}
    >
      <View style={styles.badge}><Text style={styles.badgeText}>QUẢNG CÁO</Text></View>
      <View style={styles.copy}>
        <Text style={[styles.title, dark && styles.titleDark]}>Gói Thường có quảng cáo</Text>
        <Text style={[styles.body, dark && styles.bodyDark]}>Vị trí quảng cáo đã được bật. Nâng cấp CHƯƠNG VIP để đọc không quảng cáo.</Text>
      </View>
      <Ionicons name="diamond-outline" size={19} color={dark ? xianxia.goldSoft : xianxia.cinnabar} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 70,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#DECFC7',
    backgroundColor: '#FFFDFC',
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginVertical: 12,
  },
  compact: { minHeight: 60, marginVertical: 8 },
  cardDark: { backgroundColor: '#222522', borderColor: '#4E514B' },
  badge: { borderRadius: 6, backgroundColor: '#EEE3DE', paddingHorizontal: 6, paddingVertical: 4 },
  badgeText: { color: xianxia.cinnabar, fontSize: 6.5, fontWeight: '900', letterSpacing: .7 },
  copy: { flex: 1 },
  title: { color: xianxia.ink, fontSize: 10.5, fontWeight: '900' },
  titleDark: { color: '#F2E8D8' },
  body: { color: xianxia.muted, fontSize: 8, lineHeight: 12, marginTop: 3 },
  bodyDark: { color: '#AAA59C' },
});
