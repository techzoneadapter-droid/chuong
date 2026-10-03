import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { adminSetRevenueSharePolicy, getRevenuePolicies, RevenuePolicy, sharePercent } from '../../services/revenue';

export default function AdminMonetizationScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [policies, setPolicies] = useState<RevenuePolicy[]>([]);
  const [percent, setPercent] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try { setPolicies(await getRevenuePolicies()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải chính sách.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!authLoading && (!user || profile?.role !== 'admin')) router.replace('/(tabs)/profile');
  }, [authLoading, profile?.role, router, user]);

  useEffect(() => {
    if (profile?.role === 'admin') void load();
  }, [profile?.role]);

  const activate = async () => {
    const value = Number(percent.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setError('Nhập tỷ lệ tác giả từ 0 đến 100%.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await adminSetRevenueSharePolicy({ authorSharePercent: value, note, activate: true });
      setSuccess(`Đã kích hoạt chính sách mới: tác giả nhận ${value}% trên doanh thu Linh Thạch đủ điều kiện.`);
      setPercent('');
      setNote('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể kích hoạt chính sách.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || (loading && !policies.length)) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải chính sách doanh thu…" /></SafeAreaView>;
  if (profile?.role !== 'admin') return null;
  if (error && !policies.length) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={load} /></SafeAreaView>;

  const active = policies.find((item) => item.active);

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.icon} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable>
      <View style={{ flex: 1 }}><Text style={styles.topTitle}>Chính sách doanh thu</Text><Text style={styles.topSub}>CHƯƠNG ADMIN</Text></View>
      <View style={styles.icon} />
    </View>
    <ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.current, active ? styles.currentActive : styles.currentInactive]}>
        <Ionicons name={active ? 'checkmark-circle' : 'alert-circle'} size={28} color="#8F1D3F" />
        <View style={{ flex: 1 }}>
          <Text style={styles.currentTitle}>{active ? `Đang áp dụng: tác giả ${sharePercent(active.author_share_bps)}%` : 'Chưa có chính sách chia doanh thu đang hoạt động'}</Text>
          <Text style={styles.currentBody}>{active ? 'Tỷ lệ này chỉ áp dụng cho giao dịch mới từ thời điểm kích hoạt. Giao dịch cũ giữ nguyên snapshot đã ghi.' : 'Đây là trạng thái an toàn. Doanh thu gộp vẫn được ghi, nhưng không phát sinh phần tác giả có thể đối soát cho đến khi bạn chủ động kích hoạt.'}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Tạo phiên bản chính sách mới</Text>
      <Text style={styles.label}>Tỷ lệ tác giả (%)</Text>
      <TextInput value={percent} onChangeText={setPercent} keyboardType="decimal-pad" placeholder="Ví dụ: 70" placeholderTextColor="#A09498" style={styles.input} />
      <Text style={styles.label}>Ghi chú nội bộ</Text>
      <TextInput value={note} onChangeText={setNote} placeholder="Ví dụ: Chính sách giai đoạn beta" placeholderTextColor="#A09498" style={[styles.input, styles.note]} multiline maxLength={500} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>{success}</Text> : null}
      <Pressable disabled={saving} onPress={activate} style={[styles.button, saving && styles.disabled]}>
        <Ionicons name="shield-checkmark-outline" size={19} color="#FFF" />
        <Text style={styles.buttonText}>{saving ? 'Đang kích hoạt…' : 'Kích hoạt chính sách mới'}</Text>
      </Pressable>

      <View style={styles.warning}>
        <Ionicons name="warning-outline" size={20} color="#8F1D3F" />
        <Text style={styles.warningText}>Không nên thay đổi tỷ lệ chỉ để sửa số liệu quá khứ. Mỗi giao dịch lưu tỷ lệ tại thời điểm mua; hoàn tiền sẽ đảo đúng phần doanh thu của giao dịch gốc.</Text>
      </View>

      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Lịch sử chính sách</Text><Text style={styles.meta}>{policies.length} phiên bản</Text></View>
      {!policies.length ? <View style={styles.empty}><Text style={styles.emptyText}>Chưa có chính sách nào được tạo.</Text></View> : policies.map((item) => <View key={item.id} style={styles.row}>
        <View style={[styles.dot, item.active && styles.dotActive]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Tác giả {sharePercent(item.author_share_bps)}% · Nền tảng {100 - (sharePercent(item.author_share_bps) ?? 0)}%</Text>
          <Text style={styles.rowSub}>{item.active ? 'Đang hoạt động' : item.ended_at ? 'Đã kết thúc' : 'Bản nháp'} · {new Date(item.created_at).toLocaleString('vi-VN')}</Text>
          {item.note ? <Text style={styles.rowSub}>{item.note}</Text> : null}
        </View>
      </View>)}

      <View style={styles.notice}><Ionicons name="cash-outline" size={19} color="#8F1D3F" /><Text style={styles.noticeText}>Màn này chỉ cấu hình cách phân bổ Linh Thạch. Việc quy đổi sang tiền thật, thuế, KYC và payout vẫn chưa được bật tự động.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: '#251D20', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  topSub: { color: '#8F1D3F', fontSize: 9, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginTop: 2 },
  page: { padding: 16, paddingBottom: 44, width: '100%', maxWidth: 760, alignSelf: 'center' },
  current: { borderRadius: 18, padding: 16, flexDirection: 'row', gap: 12, borderWidth: 1 },
  currentActive: { backgroundColor: '#EEF4EC', borderColor: '#CFDECD' },
  currentInactive: { backgroundColor: '#F8E8EB', borderColor: '#E7C9D2' },
  currentTitle: { color: '#2D2327', fontSize: 14, fontWeight: '900' },
  currentBody: { color: '#74686D', fontSize: 10, lineHeight: 16, marginTop: 5 },
  sectionTitle: { color: '#251D20', fontSize: 18, fontWeight: '900', marginTop: 24, marginBottom: 10 },
  label: { color: '#463B40', fontSize: 11, fontWeight: '900', marginTop: 10, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#DDD0C9', borderRadius: 13, backgroundColor: '#FFFDFC', color: '#2D2327', paddingHorizontal: 13, fontSize: 14 },
  note: { minHeight: 90, paddingTop: 13, textAlignVertical: 'top' },
  error: { color: '#A12B48', fontSize: 10, backgroundColor: '#F8E7EC', padding: 10, borderRadius: 10, marginTop: 10 },
  success: { color: '#47704D', fontSize: 10, backgroundColor: '#EDF4EC', padding: 10, borderRadius: 10, marginTop: 10 },
  button: { height: 50, borderRadius: 14, backgroundColor: '#8F1D3F', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14 },
  buttonText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: .55 },
  warning: { marginTop: 13, backgroundColor: '#F0E1E5', borderRadius: 14, padding: 13, flexDirection: 'row', gap: 9 },
  warningText: { flex: 1, color: '#65575D', fontSize: 10, lineHeight: 16 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { color: '#8F1D3F', fontSize: 10, fontWeight: '800', marginTop: 16 },
  row: { minHeight: 70, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E6DAD3', borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#B9ADB1' },
  dotActive: { backgroundColor: '#47704D' },
  rowTitle: { color: '#33282D', fontSize: 12, fontWeight: '900' },
  rowSub: { color: '#81757A', fontSize: 9, lineHeight: 14, marginTop: 3 },
  empty: { minHeight: 80, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E6DAD3', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#81757A', fontSize: 10 },
  notice: { marginTop: 18, backgroundColor: '#F0E1E5', borderRadius: 14, padding: 13, flexDirection: 'row', gap: 9 },
  noticeText: { flex: 1, color: '#65575D', fontSize: 10, lineHeight: 16 },
});
