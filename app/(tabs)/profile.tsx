import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const menu = [
  ['wallet-outline', 'Ví CHƯƠNG', '1.150 Xu'],
  ['notifications-outline', 'Thông báo', ''],
  ['download-outline', 'Tải xuống', '312 MB'],
  ['color-palette-outline', 'Giao diện & đọc', ''],
  ['settings-outline', 'Cài đặt', '']
];

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.page}>
        <Text style={styles.title}>Tôi</Text>
        <View style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.avatarText}>C</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>Độc giả CHƯƠNG</Text>
            <Text style={styles.level}>Mọt Truyện · Cấp 8</Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color="#756B6F" />
        </View>
        <View style={styles.stats}>
          <View><Text style={styles.statValue}>36</Text><Text style={styles.statLabel}>Theo dõi</Text></View>
          <View><Text style={styles.statValue}>128</Text><Text style={styles.statLabel}>Chương tuần</Text></View>
          <View><Text style={styles.statValue}>7</Text><Text style={styles.statLabel}>Huy hiệu</Text></View>
        </View>
        <View style={styles.menu}>
          {menu.map(([icon, label, value]) => (
            <View style={styles.row} key={label}>
              <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={21} color="#8F1D3F" />
              <Text style={styles.rowLabel}>{label}</Text>
              {value ? <Text style={styles.rowValue}>{value}</Text> : null}
              <Ionicons name="chevron-forward" size={17} color="#B2A6AB" />
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  page: { padding: 16 },
  title: { color: '#221A1D', fontSize: 30, fontWeight: '900', marginTop: 8 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  name: { color: '#221A1D', fontSize: 17, fontWeight: '900' },
  level: { color: '#756B6F', fontSize: 12, marginTop: 4 },
  stats: { marginTop: 20, padding: 16, backgroundColor: '#FFFDFC', borderRadius: 16, borderWidth: 1, borderColor: '#E9DDD6', flexDirection: 'row', justifyContent: 'space-between' },
  statValue: { color: '#221A1D', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  statLabel: { color: '#756B6F', fontSize: 10, marginTop: 3, textAlign: 'center' },
  menu: { marginTop: 14, backgroundColor: '#FFFDFC', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E9DDD6' },
  row: { minHeight: 55, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E9DDD6' },
  rowLabel: { flex: 1, color: '#221A1D', fontSize: 14, fontWeight: '700' },
  rowValue: { color: '#756B6F', fontSize: 12 }
});
