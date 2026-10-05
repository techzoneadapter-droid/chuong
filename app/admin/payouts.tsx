import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { formatRevenueCoins } from '../../services/revenue';
import {
  AdminPayoutQueueItem,
  adminMarkPayoutPaid,
  adminReviewPayout,
  adminSetPayoutCompliance,
  complianceStatusLabel,
  getAdminPayoutQueue,
  payoutStatusLabel,
} from '../../services/payouts';

export default function AdminPayoutsScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [items, setItems] = useState<AdminPayoutQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState('');
  const [references, setReferences] = useState<Record<string, string>>({});

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setItems(await getAdminPayoutQueue());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải yêu cầu thanh toán.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && (!user || profile?.role !== 'admin')) router.replace('/(tabs)/profile');
  }, [authLoading, profile?.role, router, user]);

  useEffect(() => {
    if (profile?.role === 'admin') void load();
  }, [load, profile?.role]);

  const counts = useMemo(() => ({
    pending: items.filter((item) => item.status === 'pending').length,
    approved: items.filter((item) => item.status === 'approved').length,
    paid: items.filter((item) => item.status === 'paid').length,
    cancelled: items.filter((item) => item.status === 'cancelled').length,
  }), [items]);

  const run = async (id: string, action: () => Promise<unknown>, message: string) => {
    setBusyId(id);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(message);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xử lý yêu cầu.');
    } finally {
      setBusyId('');
    }
  };

  if (authLoading || (loading && !items.length && !error)) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải hàng đợi thanh toán…" /></SafeAreaView>;
  if (profile?.role !== 'admin') return null;
  if (error && !items.length) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.backButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable>
      <Text style={styles.topbarTitle}>Thanh toán tác giả</Text>
      <Pressable style={styles.backButton} onPress={() => load(true)}><Ionicons name="refresh" size={20} color="#8F1D3F" /></Pressable>
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>CHƯƠNG ADMIN</Text>
          <Text style={styles.title}>Yêu cầu rút doanh thu</Text>
        </View>
        <Ionicons name="cash-outline" size={31} color="#8F1D3F" />
      </View>
      <Text style={styles.subtitle}>Duyệt KYC/thuế, giữ trạng thái yêu cầu và chỉ ghi nhận “Đã thanh toán” sau khi bạn có mã giao dịch thực tế bên ngoài.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>{success}</Text> : null}

      <View style={styles.grid}>
        <Metric value={counts.pending} label="Chờ duyệt" tone="#9B6A22" />
        <Metric value={counts.approved} label="Đã duyệt" tone="#6D6570" />
        <Metric value={counts.paid} label="Đã thanh toán" tone="#47704D" />
        <Metric value={counts.cancelled} label="Đã hủy" tone="#A12B48" />
      </View>

      <View style={styles.notice}>
        <Ionicons name="information-circle-outline" size={20} color="#8F1D3F" />
        <Text style={styles.noticeText}>“KYC đạt”, “Thuế đạt/không yêu cầu” là trạng thái do quản trị xác nhận sau khi kiểm tra hồ sơ thật. App không tự đánh dấu đạt.</Text>
      </View>

      <Text style={styles.sectionTitle}>Hàng đợi</Text>
      {!items.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>Chưa có yêu cầu rút</Text><Text style={styles.emptyText}>Yêu cầu mới từ tác giả sẽ xuất hiện tại đây.</Text></View> : items.map((item) => {
        const payoutProfile = item.payoutProfile;
        const busy = busyId === item.id;
        const canApprove = item.status === 'pending'
          && payoutProfile?.kyc_status === 'verified'
          && (payoutProfile.tax_status === 'verified' || payoutProfile.tax_status === 'not_required')
          && Boolean(payoutProfile.destination_label);
        const reference = references[item.id] || '';

        return <View key={item.id} style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{item.penName.slice(0, 1).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.author}>{item.penName}</Text>
              <Text style={styles.amount}>{formatRevenueCoins(item.amount_coins)} đơn vị đối soát</Text>
              <Text style={styles.rowSub}>{new Date(item.requested_at).toLocaleString('vi-VN')}</Text>
            </View>
            <StatusPill status={item.status} />
          </View>

          <View style={styles.infoBox}>
            <InfoLine label="Phương thức" value={payoutProfile?.payout_method || 'Chưa thiết lập'} />
            <InfoLine label="Nơi nhận" value={payoutProfile?.destination_label || 'Chưa thiết lập'} />
            <InfoLine label="KYC" value={complianceStatusLabel(payoutProfile?.kyc_status)} />
            <InfoLine label="Thuế" value={complianceStatusLabel(payoutProfile?.tax_status)} />
          </View>

          {item.status === 'pending' ? <>
            <Text style={styles.actionTitle}>Xác minh hồ sơ</Text>
            <View style={styles.actionRow}>
              <ActionButton
                label="KYC đạt"
                icon="person-circle-outline"
                disabled={busy}
                onPress={() => run(item.id, () => adminSetPayoutCompliance({
                  authorId: item.author_id,
                  kycStatus: 'verified',
                  taxStatus: payoutProfile?.tax_status || 'not_submitted',
                  note: 'KYC được quản trị xác minh',
                }), 'Đã cập nhật KYC.')}
              />
              <ActionButton
                label="Thuế đạt"
                icon="document-text-outline"
                disabled={busy}
                onPress={() => run(item.id, () => adminSetPayoutCompliance({
                  authorId: item.author_id,
                  kycStatus: payoutProfile?.kyc_status || 'not_submitted',
                  taxStatus: 'verified',
                  note: 'Thông tin thuế được quản trị xác minh',
                }), 'Đã cập nhật trạng thái thuế.')}
              />
              <ActionButton
                label="Không yêu cầu thuế"
                icon="remove-circle-outline"
                disabled={busy}
                onPress={() => run(item.id, () => adminSetPayoutCompliance({
                  authorId: item.author_id,
                  kycStatus: payoutProfile?.kyc_status || 'not_submitted',
                  taxStatus: 'not_required',
                  note: 'Quản trị đánh dấu không yêu cầu hồ sơ thuế cho lần xử lý này',
                }), 'Đã cập nhật trạng thái thuế.')}
              />
            </View>

            <View style={styles.reviewRow}>
              <Pressable
                disabled={!canApprove || busy}
                onPress={() => run(item.id, () => adminReviewPayout({ payoutId: item.id, action: 'approve', note: 'Đã kiểm tra hồ sơ và duyệt yêu cầu' }), 'Đã duyệt yêu cầu rút.')}
                style={[styles.approveButton, (!canApprove || busy) && styles.disabled]}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                <Text style={styles.approveText}>Duyệt yêu cầu</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => run(item.id, () => adminReviewPayout({ payoutId: item.id, action: 'cancel', note: 'Quản trị từ chối/hủy yêu cầu' }), 'Đã hủy yêu cầu rút.')}
                style={[styles.cancelButton, busy && styles.disabled]}
              >
                <Text style={styles.cancelText}>Hủy</Text>
              </Pressable>
            </View>
            {!canApprove ? <Text style={styles.help}>Để duyệt: cần KYC đạt, thuế đạt/không yêu cầu và tác giả đã lưu nơi nhận.</Text> : null}
          </> : null}

          {item.status === 'approved' ? <View style={styles.payArea}>
            <Text style={styles.actionTitle}>Ghi nhận thanh toán thực tế</Text>
            <TextInput
              value={reference}
              onChangeText={(value) => setReferences((prev) => ({ ...prev, [item.id]: value }))}
              style={styles.input}
              placeholder="Mã giao dịch / mã đối soát"
              placeholderTextColor="#A2959A"
              maxLength={160}
            />
            <Pressable
              disabled={reference.trim().length < 3 || busy}
              onPress={() => run(item.id, () => adminMarkPayoutPaid({
                payoutId: item.id,
                externalReference: reference,
                note: 'Đã xác nhận thanh toán ngoài hệ thống',
              }), 'Đã ghi nhận thanh toán tác giả.')}
              style={[styles.paidButton, (reference.trim().length < 3 || busy) && styles.disabled]}
            >
              <Ionicons name="checkmark-done-outline" size={18} color="#FFF" />
              <Text style={styles.paidText}>Đánh dấu đã thanh toán</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => run(item.id, () => adminReviewPayout({ payoutId: item.id, action: 'cancel', note: 'Hủy trước khi thanh toán' }), 'Đã hủy yêu cầu rút.')}
              style={[styles.linkButton, busy && styles.disabled]}
            >
              <Text style={styles.linkText}>Hủy yêu cầu trước khi chuyển tiền</Text>
            </Pressable>
          </View> : null}

          {item.status === 'paid' && item.external_reference ? <View style={styles.paidBox}>
            <Ionicons name="checkmark-circle" size={20} color="#47704D" />
            <View style={{ flex: 1 }}><Text style={styles.paidBoxTitle}>Đã thanh toán</Text><Text style={styles.rowSub}>Mã đối soát: {item.external_reference}</Text></View>
          </View> : null}

          {item.review_note ? <Text style={styles.reviewNote}>Ghi chú: {item.review_note}</Text> : null}
        </View>;
      })}
    </ScrollView>
  </SafeAreaView>;
}

function Metric({ value, label, tone }: { value: number; label: string; tone: string }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, { color: tone }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function StatusPill({ status }: { status: AdminPayoutQueueItem['status'] }) {
  const good = status === 'paid';
  const bad = status === 'cancelled';
  return <View style={[styles.pill, good ? styles.pillGood : bad ? styles.pillBad : styles.pillWait]}>
    <Text style={[styles.pillText, good ? styles.pillTextGood : bad ? styles.pillTextBad : styles.pillTextWait]}>{payoutStatusLabel(status)}</Text>
  </View>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoLine}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

function ActionButton({ label, icon, disabled, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; disabled: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.actionButton, disabled && styles.disabled]}>
    <Ionicons name={icon} size={16} color="#8F1D3F" />
    <Text style={styles.actionButtonText}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  topbarTitle: { flex: 1, color: '#251D20', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  page: { padding: 18, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  kicker: { color: '#8F1D3F', fontSize: 11, fontWeight: '900', letterSpacing: 1.35 },
  title: { color: '#221A1D', fontSize: 27, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#756B6F', fontSize: 12, lineHeight: 19, marginTop: 9 },
  error: { color: '#A12B48', backgroundColor: '#F8E7EC', padding: 10, borderRadius: 10, fontSize: 10, marginTop: 12 },
  success: { color: '#47704D', backgroundColor: '#EDF4EC', padding: 10, borderRadius: 10, fontSize: 10, marginTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  metric: { width: '48%', minHeight: 88, backgroundColor: '#FFFDFC', borderRadius: 15, borderWidth: 1, borderColor: '#E4D8D1', padding: 14 },
  metricValue: { fontSize: 26, fontWeight: '900' },
  metricLabel: { color: '#756B6F', fontSize: 10, marginTop: 3, fontWeight: '700' },
  notice: { marginTop: 13, borderRadius: 15, backgroundColor: '#F0E1E5', padding: 14, flexDirection: 'row', gap: 10 },
  noticeText: { flex: 1, color: '#65575D', fontSize: 10, lineHeight: 16 },
  sectionTitle: { color: '#2C2226', fontSize: 18, fontWeight: '900', marginTop: 23, marginBottom: 10 },
  empty: { minHeight: 120, borderRadius: 17, borderWidth: 1, borderColor: '#E4D8D1', backgroundColor: '#FFFDFC', alignItems: 'center', justifyContent: 'center', padding: 18 },
  emptyTitle: { color: '#30262A', fontSize: 12, fontWeight: '900' },
  emptyText: { color: '#85787D', fontSize: 10, marginTop: 4 },
  card: { backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E4D8D1', borderRadius: 18, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  author: { color: '#30262A', fontSize: 13, fontWeight: '900' },
  amount: { color: '#8F1D3F', fontSize: 15, fontWeight: '900', marginTop: 3 },
  rowSub: { color: '#85787D', fontSize: 9, lineHeight: 14, marginTop: 3 },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  pillGood: { backgroundColor: '#E6F1E5' },
  pillBad: { backgroundColor: '#F8E7EC' },
  pillWait: { backgroundColor: '#F6EFE3' },
  pillText: { fontSize: 8, fontWeight: '900' },
  pillTextGood: { color: '#47704D' },
  pillTextBad: { color: '#A12B48' },
  pillTextWait: { color: '#9B6A22' },
  infoBox: { marginTop: 12, borderRadius: 13, backgroundColor: '#F8F2E9', padding: 11 },
  infoLine: { minHeight: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  infoLabel: { color: '#86797E', fontSize: 9 },
  infoValue: { color: '#372C31', fontSize: 9, fontWeight: '800', textAlign: 'right', flex: 1 },
  actionTitle: { color: '#30262A', fontSize: 11, fontWeight: '900', marginTop: 13, marginBottom: 8 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  actionButton: { minHeight: 36, borderRadius: 10, borderWidth: 1, borderColor: '#DFC9D0', backgroundColor: '#FFF8FA', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionButtonText: { color: '#8F1D3F', fontSize: 8, fontWeight: '900' },
  reviewRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  approveButton: { flex: 1, minHeight: 42, borderRadius: 12, backgroundColor: '#8F1D3F', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  approveText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  cancelButton: { minWidth: 78, minHeight: 42, borderRadius: 12, backgroundColor: '#F8E7EC', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#A12B48', fontSize: 10, fontWeight: '900' },
  help: { color: '#9B6A22', fontSize: 9, lineHeight: 14, marginTop: 7 },
  payArea: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4D8D1', paddingTop: 1 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#DDD0C9', borderRadius: 12, backgroundColor: '#FFF', color: '#2D2327', paddingHorizontal: 12, fontSize: 11 },
  paidButton: { minHeight: 44, borderRadius: 12, backgroundColor: '#47704D', marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  paidText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  linkButton: { alignItems: 'center', paddingVertical: 10 },
  linkText: { color: '#A12B48', fontSize: 9, fontWeight: '800' },
  paidBox: { marginTop: 12, borderRadius: 12, backgroundColor: '#EDF4EC', padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  paidBoxTitle: { color: '#47704D', fontSize: 10, fontWeight: '900' },
  reviewNote: { color: '#766A6F', fontSize: 9, lineHeight: 14, marginTop: 8 },
  disabled: { opacity: .48 },
});
