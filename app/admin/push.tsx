import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { AdminPushDashboard, getAdminPushDashboard } from '../../services/pushAdmin';

export default function AdminPushScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<AdminPushDashboard | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setData(null);
    setError('');
    try {
      setData(await getAdminPushDashboard());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải hệ thống push.');
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

  const deviceMap = useMemo(() => new Map((data?.devices ?? []).map((device) => [device.id, device])), [data?.devices]);

  if (authLoading || (profile?.role === 'admin' && !data && !error)) {
    return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải hệ thống push…" /></SafeAreaView>;
  }
  if (profile?.role !== 'admin') return null;
  if (error && !data) {
    return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;
  }
  if (!data) return null;

  const problemDeliveries = data.deliveries.filter((item) => item.status === 'failed' || item.status === 'invalid_token').slice(0, 30);

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.backButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable>
      <Text style={styles.topbarTitle}>Hệ thống Push</Text>
      <Pressable style={styles.backButton} onPress={() => { void load(true); }}><Ionicons name="refresh" size={20} color="#8F1D3F" /></Pressable>
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>CHƯƠNG ADMIN</Text>
          <Text style={styles.title}>Push Android / iOS</Text>
        </View>
        <Ionicons name="notifications-outline" size={32} color="#8F1D3F" />
      </View>
      <Text style={styles.subtitle}>Theo dõi thiết bị đăng ký, hàng đợi gửi, Expo ticket/receipt và worker chạy tự động.</Text>

      <View style={[styles.runtime, data.runtime.cron_active ? styles.runtimeGood : styles.runtimeBad]}>
        <Ionicons name={data.runtime.cron_active ? 'checkmark-circle' : 'alert-circle'} size={22} color={data.runtime.cron_active ? '#47704D' : '#A12B48'} />
        <View style={{ flex: 1 }}>
          <Text style={styles.runtimeTitle}>{data.runtime.cron_active ? 'Worker tự động đang bật' : 'Worker tự động đang tắt'}</Text>
          <Text style={styles.runtimeBody}>
            Chạy mỗi phút · Lần gần nhất: {data.runtime.last_run_status || 'chưa có dữ liệu'}
            {data.runtime.last_run_started_at ? ' · ' + new Date(data.runtime.last_run_started_at).toLocaleString('vi-VN') : ''}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        <Metric value={data.counts.devicesEnabled} label="Thiết bị hoạt động" tone="#47704D" />
        <Metric value={data.counts.devicesInvalid} label="Thiết bị đã vô hiệu" tone="#8A6D75" />
        <Metric value={data.counts.pending + data.counts.processing} label="Đang chờ gửi" tone="#9B6A22" />
        <Metric value={data.counts.delivered} label="Đã xác nhận giao" tone="#47704D" />
        <Metric value={data.counts.ticketed} label="Chờ receipt" tone="#5D668C" />
        <Metric value={data.counts.failed + data.counts.invalidToken} label="Lỗi / token chết" tone="#A12B48" />
      </View>

      <View style={styles.notice}>
        <Ionicons name="shield-checkmark-outline" size={20} color="#8F1D3F" />
        <Text style={styles.noticeText}>Token lỗi DeviceNotRegistered được tự động tắt. Worker retry lỗi tạm thời, nhưng không tạo thêm notification mới hoặc gửi nội dung ngoài Inbox.</Text>
      </View>

      <Text style={styles.sectionTitle}>Thiết bị gần đây</Text>
      {!data.devices.length ? <Empty text="Chưa có thiết bị Android/iOS đăng ký push." /> : <View style={styles.listCard}>
        {data.devices.slice(0, 30).map((device, index) => <View key={device.id} style={[styles.row, index > 0 && styles.rowBorder]}>
          <View style={styles.rowIcon}><Ionicons name={device.platform === 'ios' ? 'logo-apple' : 'logo-android'} size={19} color="#8F1D3F" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{device.device_label || (device.platform === 'ios' ? 'Thiết bị iOS' : 'Thiết bị Android')}</Text>
            <Text style={styles.rowSub}>App {device.app_version || '—'} · {new Date(device.last_seen_at).toLocaleString('vi-VN')}</Text>
            {device.invalidation_reason ? <Text style={styles.errorText}>{device.invalidation_reason}</Text> : null}
          </View>
          <Text style={device.enabled ? styles.okText : styles.offText}>{device.enabled ? 'Hoạt động' : 'Đã tắt'}</Text>
        </View>)}
      </View>}

      <Text style={styles.sectionTitle}>Lỗi gửi gần đây</Text>
      {!problemDeliveries.length ? <Empty text="Chưa có lỗi push cần xử lý." /> : <View style={styles.listCard}>
        {problemDeliveries.map((item, index) => {
          const device = deviceMap.get(item.device_id);
          return <View key={item.id} style={[styles.row, index > 0 && styles.rowBorder]}>
            <View style={[styles.rowIcon, styles.errorIcon]}><Ionicons name="warning-outline" size={19} color="#A12B48" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.status === 'invalid_token' ? 'Token không còn hợp lệ' : 'Gửi push thất bại'}</Text>
              <Text style={styles.rowSub}>{device?.device_label || device?.platform || 'Thiết bị'} · thử {item.attempts} lần</Text>
              <Text style={styles.errorText}>{item.receipt_error_code || item.ticket_error_code || 'UNKNOWN_ERROR'}</Text>
            </View>
            <Text style={styles.time}>{new Date(item.updated_at).toLocaleDateString('vi-VN')}</Text>
          </View>;
        })}
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

function Metric({ value, label, tone }: { value: number; label: string; tone: string }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, { color: tone }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Ionicons name="checkmark-circle-outline" size={25} color="#8F1D3F" /><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  topbarTitle: { flex: 1, color: '#251D20', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  page: { padding: 18, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  kicker: { color: '#8F1D3F', fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: '#221A1D', fontSize: 28, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#756B6F', fontSize: 11, lineHeight: 18, marginTop: 8 },
  runtime: { marginTop: 16, borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center' },
  runtimeGood: { backgroundColor: '#EDF4EC', borderColor: '#D5E3D3' },
  runtimeBad: { backgroundColor: '#F8E7EC', borderColor: '#E8C8D1' },
  runtimeTitle: { color: '#30262A', fontSize: 12, fontWeight: '900' },
  runtimeBody: { color: '#756B6F', fontSize: 9, lineHeight: 14, marginTop: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 14 },
  metric: { width: '31%', flexGrow: 1, minHeight: 88, borderRadius: 15, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E4D8D1', padding: 13 },
  metricValue: { fontSize: 24, fontWeight: '900' },
  metricLabel: { color: '#756B6F', fontSize: 9, lineHeight: 13, marginTop: 4, fontWeight: '700' },
  notice: { marginTop: 13, borderRadius: 14, backgroundColor: '#F0E1E5', padding: 13, flexDirection: 'row', gap: 9 },
  noticeText: { flex: 1, color: '#65575D', fontSize: 9, lineHeight: 15 },
  sectionTitle: { color: '#2C2226', fontSize: 17, fontWeight: '900', marginTop: 22, marginBottom: 9 },
  listCard: { backgroundColor: '#FFFDFC', borderRadius: 16, borderWidth: 1, borderColor: '#E4D8D1', overflow: 'hidden' },
  row: { minHeight: 68, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4D8D1' },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  errorIcon: { backgroundColor: '#F8E7EC' },
  rowTitle: { color: '#30262A', fontSize: 11, fontWeight: '900' },
  rowSub: { color: '#85787D', fontSize: 9, lineHeight: 14, marginTop: 2 },
  okText: { color: '#47704D', fontSize: 8, fontWeight: '900' },
  offText: { color: '#8A6D75', fontSize: 8, fontWeight: '900' },
  errorText: { color: '#A12B48', fontSize: 8, marginTop: 2, fontWeight: '800' },
  time: { color: '#9A8E93', fontSize: 8 },
  empty: { minHeight: 96, borderRadius: 16, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E4D8D1', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 15 },
  emptyText: { color: '#81757A', fontSize: 10, textAlign: 'center' },
});
