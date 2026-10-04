import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandLockup } from '../../components/Artwork';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { xianxia } from '../../constants/xianxia';
import { useAuth } from '../../contexts/AuthContext';

type Item = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  route: '/settings/reading' | '/notifications/settings' | '/profile/privacy' | '/downloads' | '/profile/edit';
  auth?: boolean;
};

const items: Item[] = [
  { icon: 'book-outline', title: 'Giao diện & đọc', detail: 'Cỡ chữ, phông chữ, nền đọc, lề và chế độ lật trang.', route: '/settings/reading' },
  { icon: 'notifications-outline', title: 'Thông báo', detail: 'Inbox, bình luận, giao dịch, hệ thống và push Android/iOS.', route: '/notifications/settings', auth: true },
  { icon: 'shield-checkmark-outline', title: 'Quyền riêng tư', detail: 'Hồ sơ công khai, kệ sách, hoạt động, theo dõi và chặn.', route: '/profile/privacy', auth: true },
  { icon: 'cloud-download-outline', title: 'Tải xuống', detail: 'Quản lý các truyện và chương đã lưu để đọc offline.', route: '/downloads' },
  { icon: 'person-circle-outline', title: 'Hồ sơ tài khoản', detail: 'Tên hiển thị, username, avatar và giới thiệu.', route: '/profile/edit', auth: true },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const open = (item: Item) => {
    if (item.auth && !user) {
      router.push('/auth/login');
      return;
    }
    router.push(item.route);
  };

  const signOut = () => {
    Alert.alert('Đăng xuất khỏi CHƯƠNG?', 'Dữ liệu đọc offline trên thiết bị vẫn được giữ.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: () => { void logout(); } },
    ]);
  };

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={21} color={xianxia.ink} />
      </Pressable>
      <View style={styles.topCopy}><Text style={styles.kicker}>THIẾT LẬP</Text><Text style={styles.topTitle}>Cài đặt</Text></View>
      <View style={styles.back} />
    </View>

    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.brandCard}>
        <BrandLockup compact />
        <Text style={styles.brandNote}>Tất cả tùy chọn dưới đây đều mở được và lưu thay đổi thật, không còn là mục demo.</Text>
      </View>

      <Text style={styles.section}>ỨNG DỤNG & ĐỌC</Text>
      <View style={styles.card}>
        {items.map((item, index) => <Pressable
          key={item.title}
          accessibilityRole="button"
          onPress={() => open(item)}
          style={[styles.row, index < items.length - 1 && styles.rowBorder]}
        >
          <View style={styles.icon}><Ionicons name={item.icon} size={20} color={xianxia.jadeDeep} /></View>
          <View style={styles.copy}><Text style={styles.title}>{item.title}</Text><Text style={styles.detail}>{item.detail}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={xianxia.muted} />
        </Pressable>)}
      </View>

      <View style={styles.tip}>
        <Ionicons name="information-circle-outline" size={19} color={xianxia.jadeDeep} />
        <Text style={styles.tipText}>Thiết lập đọc được lưu trên thiết bị và được dùng ngay khi mở Reader. Bạn có thể chỉnh lại nhanh ngay trong thanh công cụ khi đang đọc.</Text>
      </View>

      {user ? <Pressable style={styles.logout} onPress={signOut}>
        <Ionicons name="log-out-outline" size={18} color={xianxia.cinnabar} />
        <Text style={styles.logoutText}>Đăng xuất</Text>
      </Pressable> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { minHeight: 64, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(244,235,216,.90)' },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  topCopy: { flex: 1, alignItems: 'center' },
  kicker: { color: xianxia.cinnabar, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.2 },
  topTitle: { color: xianxia.ink, fontSize: 18, fontWeight: '900', marginTop: 2 },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, paddingBottom: 48 },
  brandCard: { borderRadius: 18, padding: 14, backgroundColor: 'rgba(255,248,234,.94)', borderWidth: 1, borderColor: xianxia.line },
  brandNote: { color: xianxia.muted, fontSize: 9, lineHeight: 14, marginTop: 8 },
  section: { color: xianxia.cinnabar, fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 22, marginBottom: 8 },
  card: { borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(255,248,234,.95)', borderWidth: 1, borderColor: xianxia.line },
  row: { minHeight: 76, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line },
  icon: { width: 39, height: 39, borderRadius: 12, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#BCD0C1', alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { color: xianxia.ink, fontSize: 12, fontWeight: '900' },
  detail: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  tip: { marginTop: 14, borderRadius: 14, padding: 12, flexDirection: 'row', gap: 9, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF' },
  tipText: { flex: 1, color: xianxia.inkSoft, fontSize: 9, lineHeight: 15 },
  logout: { alignSelf: 'center', minHeight: 42, paddingHorizontal: 18, borderRadius: 13, borderWidth: 1, borderColor: '#E0C1BA', backgroundColor: '#F7E7E3', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18 },
  logoutText: { color: xianxia.cinnabar, fontSize: 10, fontWeight: '900' },
});
