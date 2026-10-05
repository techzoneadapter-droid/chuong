import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { getAdminDashboardCounts } from '../../services/moderation';

type Counts = { open: number; reviewing: number; resolved: number; rejected: number };

export default function AdminHomeScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState('');
  const load = async () => {
    setError('');
    try { setCounts(await getAdminDashboardCounts()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu quản trị.'); }
  };
  useEffect(() => {
    if (!authLoading && (!user || profile?.role !== 'admin')) router.replace('/(tabs)/profile');
  }, [authLoading, profile?.role, router, user]);
  useEffect(() => { if (profile?.role === 'admin') void load(); }, [profile?.role]);

  if (authLoading || (profile?.role === 'admin' && !counts && !error)) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải trung tâm quản trị…" /></SafeAreaView>;
  if (profile?.role !== 'admin') return null;
  if (error) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={load} /></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.backButton} onPress={() => router.replace('/(tabs)/profile')}>
        <Ionicons name="arrow-back" size={22} color="#2D2327" />
      </Pressable>
      <Text style={styles.topbarTitle}>Trung tâm quản trị</Text>
      <View style={styles.backButton} />
    </View>
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}><View><Text style={styles.kicker}>CHƯƠNG ADMIN</Text><Text style={styles.title}>Kiểm duyệt & an toàn</Text></View><Ionicons name="shield-checkmark" size={32} color="#8F1D3F" /></View>
      <Text style={styles.subtitle}>Theo dõi báo cáo, vi phạm bản quyền và trạng thái nội dung trên nền tảng.</Text>
      <View style={styles.grid}>
        <Metric value={counts?.open ?? 0} label="Báo cáo mới" tone="#8F1D3F" />
        <Metric value={counts?.reviewing ?? 0} label="Đang xem xét" tone="#9B6A22" />
        <Metric value={counts?.resolved ?? 0} label="Đã xử lý" tone="#47704D" />
        <Metric value={counts?.rejected ?? 0} label="Không vi phạm" tone="#6D6570" />
      </View>
      <Pressable style={styles.studioCard} onPress={() => router.push('/studio')}>
        <View style={styles.studioIcon}><Ionicons name="desktop-outline" size={22} color="#F1D89A" /></View>
        <View style={{ flex: 1 }}><Text style={styles.studioTitle}>CHƯƠNG Content Studio</Text><Text style={styles.studioBody}>Web app riêng để đẩy truyện, quản lý bìa, metadata, trạng thái và chương dùng trực tiếp trong app mobile.</Text></View>
        <Ionicons name="open-outline" size={19} color="#F1D89A" />
      </Pressable>
      <Pressable style={styles.primary} onPress={() => router.push('/admin/reports')}>
        <Ionicons name="flag-outline" size={21} color="#FFF" />
        <View style={{ flex: 1 }}><Text style={styles.primaryTitle}>Hàng đợi báo cáo</Text><Text style={styles.primaryBody}>Xem xét bản quyền, spam, quấy rối và các báo cáo khác.</Text></View>
        <Ionicons name="chevron-forward" size={20} color="#FFF" />
      </Pressable>
      <Pressable style={styles.catalogCard} onPress={() => router.push('/admin/catalog')}>
        <View style={styles.catalogIcon}><Ionicons name="library-outline" size={21} color="#E5D1A3" /></View>
        <View style={{ flex: 1 }}><Text style={styles.catalogTitle}>Tàng Kinh Các · Kho truyện</Text><Text style={styles.catalogBody}>Admin thêm truyện, tải bìa, gắn tác giả hiển thị và nhập nhiều chương để mở rộng kho nội dung.</Text></View>
        <Ionicons name="chevron-forward" size={20} color="#E5D1A3" />
      </Pressable>
      <Pressable style={styles.secondaryCard} onPress={() => router.push('/admin/monetization')}>
        <Ionicons name="pie-chart-outline" size={21} color="#8F1D3F" />
        <View style={{ flex: 1 }}><Text style={styles.secondaryTitle}>Chính sách doanh thu</Text><Text style={styles.secondaryBody}>Cấu hình tỷ lệ chia doanh thu theo phiên bản, không sửa ngược giao dịch cũ.</Text></View>
        <Ionicons name="chevron-forward" size={20} color="#8F1D3F" />
      </Pressable>
      <Pressable style={styles.secondaryCard} onPress={() => router.push('/admin/store')}>
        <Ionicons name="card-outline" size={21} color="#8F1D3F" />
        <View style={{ flex: 1 }}><Text style={styles.secondaryTitle}>Thanh toán & đối soát</Text><Text style={styles.secondaryBody}>Google Play, App Store, Thượng Phẩm, webhook hoàn tiền và trạng thái xác minh.</Text></View>
        <Ionicons name="chevron-forward" size={20} color="#8F1D3F" />
      </Pressable>
      <Pressable style={styles.secondaryCard} onPress={() => router.push('/admin/payouts')}>
        <Ionicons name="cash-outline" size={21} color="#8F1D3F" />
        <View style={{ flex: 1 }}><Text style={styles.secondaryTitle}>Thanh toán tác giả</Text><Text style={styles.secondaryBody}>Duyệt yêu cầu rút, KYC/thuế và ghi nhận mã thanh toán thực tế.</Text></View>
        <Ionicons name="chevron-forward" size={20} color="#8F1D3F" />
      </Pressable>
      <Pressable style={styles.secondaryCard} onPress={() => router.push('/admin/push')}>
        <Ionicons name="notifications-outline" size={21} color="#8F1D3F" />
        <View style={{ flex: 1 }}><Text style={styles.secondaryTitle}>Hệ thống Push</Text><Text style={styles.secondaryBody}>Thiết bị, hàng đợi gửi, token lỗi, Expo ticket/receipt và worker tự động.</Text></View>
        <Ionicons name="chevron-forward" size={20} color="#8F1D3F" />
      </Pressable>
      <View style={styles.notice}><Ionicons name="information-circle-outline" size={20} color="#8F1D3F" /><Text style={styles.noticeText}>Mọi thao tác ẩn, từ chối hoặc khôi phục nội dung đều được ghi vào nhật ký kiểm duyệt trong database.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

function Metric({ value, label, tone }: { value: number; label: string; tone: string }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, { color: tone }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  topbarTitle: { flex: 1, color: '#251D20', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  page: { padding: 18, paddingBottom: 44, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  kicker: { color: '#8F1D3F', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#221A1D', fontSize: 29, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#756B6F', fontSize: 13, lineHeight: 20, marginTop: 9 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  metric: { width: '48%', minHeight: 92, backgroundColor: '#FFFDFC', borderRadius: 16, borderWidth: 1, borderColor: '#E4D8D1', padding: 15 },
  metricValue: { fontSize: 28, fontWeight: '900' },
  metricLabel: { color: '#756B6F', fontSize: 11, marginTop: 3, fontWeight: '700' },
  studioCard: { marginTop: 18, minHeight: 88, borderRadius: 18, padding: 15, backgroundColor: '#17312B', borderWidth: 1, borderColor: '#C7A95D', flexDirection: 'row', alignItems: 'center', gap: 13 },
  studioIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(241,216,154,.10)', borderWidth: 1, borderColor: 'rgba(241,216,154,.30)', alignItems: 'center', justifyContent: 'center' },
  studioTitle: { color: '#FFF8EA', fontSize: 14, fontWeight: '900' },
  studioBody: { color: 'rgba(255,248,234,.66)', fontSize: 10, lineHeight: 15, marginTop: 3 },
  primary: { marginTop: 10, minHeight: 82, borderRadius: 18, padding: 16, backgroundColor: '#8F1D3F', flexDirection: 'row', alignItems: 'center', gap: 13 },
  primaryTitle: { color: '#FFF', fontSize: 15, fontWeight: '900' },
  primaryBody: { color: '#F2CED9', fontSize: 11, lineHeight: 16, marginTop: 3 },
  catalogCard: { marginTop: 10, minHeight: 86, borderRadius: 18, padding: 15, backgroundColor: '#27463F', borderWidth: 1, borderColor: '#47665E', flexDirection: 'row', alignItems: 'center', gap: 13 },
  catalogIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(229,209,163,.10)', borderWidth: 1, borderColor: 'rgba(229,209,163,.32)', alignItems: 'center', justifyContent: 'center' },
  catalogTitle: { color: '#FFFDF8', fontSize: 14, fontWeight: '900' },
  catalogBody: { color: 'rgba(255,253,248,.66)', fontSize: 10, lineHeight: 15, marginTop: 3 },
  secondaryCard: { marginTop: 10, minHeight: 78, borderRadius: 18, padding: 15, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E4D8D1', flexDirection: 'row', alignItems: 'center', gap: 13 },
  secondaryTitle: { color: '#2D2327', fontSize: 14, fontWeight: '900' },
  secondaryBody: { color: '#756B6F', fontSize: 10, lineHeight: 15, marginTop: 3 },
  notice: { marginTop: 16, borderRadius: 15, backgroundColor: '#F0E1E5', padding: 14, flexDirection: 'row', gap: 10 },
  noticeText: { flex: 1, color: '#65575D', fontSize: 11, lineHeight: 17 },
});
