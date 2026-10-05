import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { getStoreOpsDashboard, StoreOpsDashboard } from '../../services/storeAdmin';

export default function AdminStoreScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<StoreOpsDashboard | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setData(null);
    setError('');
    try {
      setData(await getStoreOpsDashboard());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải trạng thái thanh toán.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && (!user || profile?.role !== 'admin')) router.replace('/(tabs)/profile');
  }, [authLoading, profile?.role, router, user]);

  useEffect(() => {
    if (profile?.role === 'admin') void load();
  }, [load, profile?.role]);

  if (authLoading || (profile?.role === 'admin' && !data && !error)) {
    return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải trung tâm thanh toán…" /></SafeAreaView>;
  }
  if (profile?.role !== 'admin') return null;
  if (error && !data) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;

  const verifier = data?.verifier;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color="#2D2327" />
      </Pressable>
      <Text style={styles.topbarTitle}>Thanh toán & đối soát</Text>
      <View style={styles.backButton} />
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>CHƯƠNG ADMIN</Text>
          <Text style={styles.title}>Thượng Phẩm Linh Thạch & cửa hàng</Text>
        </View>
        <Ionicons name="card-outline" size={31} color="#8F1D3F" />
      </View>
      <Text style={styles.subtitle}>Theo dõi Google Play, App Store, giao dịch Thượng Phẩm Linh Thạch và webhook hoàn tiền/thu hồi sau mua.</Text>

      <Text style={styles.sectionTitle}>Trạng thái kết nối</Text>
      <View style={styles.grid}>
        <ReadyCard label="Google Play" ready={Boolean(verifier?.google_play)} />
        <ReadyCard label="Apple App Store" ready={Boolean(verifier?.app_store)} />
        <ReadyCard label="Google RTDN" ready={Boolean(verifier?.google_pubsub)} />
        <ReadyCard label="Apple Notifications" ready={Boolean(verifier?.apple_notifications)} />
      </View>

      <View style={styles.notice}>
        <Ionicons name="shield-checkmark-outline" size={20} color="#8F1D3F" />
        <Text style={styles.noticeText}>Khi một cổng chưa sẵn sàng, app sẽ khóa luồng mua tương ứng thay vì nhận tiền nhưng không cộng Thượng Phẩm Linh Thạch.</Text>
      </View>

      <Text style={styles.sectionTitle}>Tổng quan</Text>
      <View style={styles.grid}>
        <Metric value={data?.counts.purchases ?? 0} label="Tổng giao dịch" />
        <Metric value={data?.counts.credited ?? 0} label="Đã cộng Thượng Phẩm Linh Thạch" />
        <Metric value={data?.counts.revoked ?? 0} label="Đã thu hồi" />
        <Metric value={data?.counts.webhookFailed ?? 0} label="Webhook lỗi" warning={(data?.counts.webhookFailed ?? 0) > 0} />
      </View>
      <Text style={styles.smallHint}>Webhook đã xử lý thành công: {data?.counts.webhookProcessed ?? 0}</Text>

      <Text style={styles.sectionTitle}>Gói Thượng Phẩm Linh Thạch</Text>
      <View style={styles.listCard}>
        {(data?.products ?? []).map((item, index) => <View key={item.id} style={[styles.row, index > 0 && styles.rowBorder]}>
          <View style={styles.rowIcon}><Ionicons name="diamond-outline" size={18} color="#8F1D3F" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{new Intl.NumberFormat('vi-VN').format(item.coins)} Thượng Phẩm Linh Thạch</Text>
            <Text style={styles.rowSub}>Google: {item.google_product_id || 'chưa cấu hình'}</Text>
            <Text style={styles.rowSub}>Apple: {item.apple_product_id || 'chưa cấu hình'}</Text>
          </View>
          <View style={[styles.badge, item.active ? styles.badgeReady : styles.badgeOff]}>
            <Text style={[styles.badgeText, item.active ? styles.badgeTextReady : styles.badgeTextOff]}>{item.active ? 'Bật' : 'Tắt'}</Text>
          </View>
        </View>)}
      </View>

      <Text style={styles.sectionTitle}>Webhook gần đây</Text>
      {data?.webhookEvents.length ? <View style={styles.listCard}>
        {data.webhookEvents.map((item, index) => <View key={item.id} style={[styles.row, index > 0 && styles.rowBorder]}>
          <StatusDot status={item.status} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{providerLabel(item.provider)} · {eventLabel(item.event_type)}</Text>
            <Text style={styles.rowSub}>{new Date(item.received_at).toLocaleString('vi-VN')}</Text>
            {item.error_code ? <Text style={styles.errorText}>{item.error_code}</Text> : null}
          </View>
          <Text style={styles.statusText}>{statusLabel(item.status)}</Text>
        </View>)}
      </View> : <View style={styles.empty}><Text style={styles.emptyTitle}>Chưa có webhook cửa hàng</Text><Text style={styles.emptyText}>Bình thường nếu chưa chạy sandbox hoặc chưa có giao dịch thật.</Text></View>}

      <Text style={styles.sectionTitle}>Giao dịch gần đây</Text>
      {data?.purchases.length ? <View style={styles.listCard}>
        {data.purchases.map((item, index) => <View key={item.id} style={[styles.row, index > 0 && styles.rowBorder]}>
          <View style={styles.rowIcon}><Ionicons name="receipt-outline" size={18} color="#8F1D3F" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{new Intl.NumberFormat('vi-VN').format(item.coins_granted)} {item.currency_type === 'high' ? 'Thượng Phẩm' : 'Hạ Phẩm'} · {providerLabel(item.provider)}</Text>
            <Text style={styles.rowSub}>{item.external_transaction_id}</Text>
            <Text style={styles.rowSub}>{new Date(item.created_at).toLocaleString('vi-VN')}</Text>
          </View>
          <Text style={item.state === 'revoked' ? styles.errorText : styles.okText}>{purchaseStateLabel(item.state)}</Text>
        </View>)}
      </View> : <View style={styles.empty}><Text style={styles.emptyTitle}>Chưa có giao dịch cửa hàng</Text><Text style={styles.emptyText}>Dữ liệu test trước đó đã được dọn sạch; production vẫn chưa có giao dịch thật.</Text></View>}
    </ScrollView>
  </SafeAreaView>;
}

function ReadyCard({ label, ready }: { label: string; ready: boolean }) {
  return <View style={styles.metric}>
    <Ionicons name={ready ? 'checkmark-circle' : 'time-outline'} size={23} color={ready ? '#47704D' : '#A36A24'} />
    <Text style={styles.metricValueSmall}>{ready ? 'Sẵn sàng' : 'Chưa cấu hình'}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>;
}

function Metric({ value, label, warning = false }: { value: number; label: string; warning?: boolean }) {
  return <View style={styles.metric}>
    <Text style={[styles.metricValue, warning && styles.metricWarning]}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>;
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'processed' ? '#47704D' : status === 'failed' ? '#A12B48' : status === 'ignored' ? '#7C7480' : '#A36A24';
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

function providerLabel(provider: string) {
  return provider === 'google_play' ? 'Google Play' : 'App Store';
}
function statusLabel(status: string) {
  if (status === 'processed') return 'Đã xử lý';
  if (status === 'failed') return 'Lỗi';
  if (status === 'ignored') return 'Bỏ qua';
  return 'Đã nhận';
}
function purchaseStateLabel(status: string) {
  if (status === 'credited') return 'Đã cộng';
  if (status === 'revoked') return 'Đã thu hồi';
  if (status === 'verified') return 'Đã xác minh';
  return status;
}
function eventLabel(type: string) {
  const map: Record<string, string> = {
    one_time_product_purchased: 'Mua hàng',
    one_time_product_canceled: 'Hủy giao dịch',
    voided_purchase: 'Hoàn/thu hồi',
    refund: 'Hoàn tiền',
    refund_reversed: 'Đảo hoàn tiền',
    consumption_request: 'Yêu cầu dữ liệu tiêu thụ',
    test_notification: 'Thông báo test',
  };
  return map[type] || type.replace(/_/g, ' ');
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  topbarTitle: { flex: 1, color: '#251D20', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  page: { padding: 18, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  kicker: { color: '#8F1D3F', fontSize: 11, fontWeight: '900', letterSpacing: 1.35 },
  title: { color: '#221A1D', fontSize: 28, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#756B6F', fontSize: 12, lineHeight: 19, marginTop: 9 },
  sectionTitle: { color: '#2C2226', fontSize: 16, fontWeight: '900', marginTop: 23, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', flexGrow: 1, minHeight: 96, backgroundColor: '#FFFDFC', borderRadius: 16, borderWidth: 1, borderColor: '#E4D8D1', padding: 14 },
  metricValue: { color: '#8F1D3F', fontSize: 27, fontWeight: '900' },
  metricValueSmall: { color: '#2C2226', fontSize: 13, fontWeight: '900', marginTop: 8 },
  metricWarning: { color: '#A12B48' },
  metricLabel: { color: '#756B6F', fontSize: 10, marginTop: 4, fontWeight: '700' },
  smallHint: { color: '#84777C', fontSize: 10, marginTop: 8 },
  notice: { marginTop: 13, borderRadius: 15, backgroundColor: '#F0E1E5', padding: 14, flexDirection: 'row', gap: 10 },
  noticeText: { flex: 1, color: '#65575D', fontSize: 10, lineHeight: 16 },
  listCard: { backgroundColor: '#FFFDFC', borderRadius: 17, borderWidth: 1, borderColor: '#E4D8D1', overflow: 'hidden' },
  row: { minHeight: 72, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4D8D1' },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: '#30262A', fontSize: 11, fontWeight: '900' },
  rowSub: { color: '#85787D', fontSize: 9, lineHeight: 14, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  badgeReady: { backgroundColor: '#E6F1E5' },
  badgeOff: { backgroundColor: '#EEE9EB' },
  badgeText: { fontSize: 9, fontWeight: '900' },
  badgeTextReady: { color: '#47704D' },
  badgeTextOff: { color: '#786F73' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: '#74676C', fontSize: 9, fontWeight: '800' },
  okText: { color: '#47704D', fontSize: 9, fontWeight: '900' },
  errorText: { color: '#A12B48', fontSize: 9, fontWeight: '800', marginTop: 3 },
  empty: { minHeight: 118, borderRadius: 17, borderWidth: 1, borderColor: '#E4D8D1', backgroundColor: '#FFFDFC', alignItems: 'center', justifyContent: 'center', padding: 18 },
  emptyTitle: { color: '#30262A', fontSize: 12, fontWeight: '900' },
  emptyText: { color: '#85787D', fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 4 },
});
