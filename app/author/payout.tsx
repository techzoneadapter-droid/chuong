import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { getAuthorForUser } from '../../services/authors';
import { formatRevenueCoins } from '../../services/revenue';
import {
  AuthorPayoutWorkspace,
  cancelAuthorPayout,
  complianceStatusLabel,
  createPayoutIdempotencyKey,
  getAuthorPayoutWorkspace,
  payoutStatusLabel,
  requestAuthorPayout,
  updateAuthorPayoutProfile,
} from '../../services/payouts';

export default function AuthorPayoutScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [authorId, setAuthorId] = useState('');
  const [penName, setPenName] = useState('');
  const [data, setData] = useState<AuthorPayoutWorkspace | null>(null);
  const [method, setMethod] = useState('manual_bank');
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth/login');
      return;
    }
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const author = await getAuthorForUser(user.id);
      if (!author) {
        router.replace('/author/onboarding');
        return;
      }
      setAuthorId(author.id);
      setPenName(author.penName);
      const workspace = await getAuthorPayoutWorkspace(author.id);
      setData(workspace);
      setMethod(workspace.profile?.payout_method || 'manual_bank');
      setDestination(workspace.profile?.destination_label || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải yêu cầu rút doanh thu.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, router, user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const amountNumber = useMemo(() => Number(amount.replace(/[^d]/g, '')) || 0, [amount]);
  const canRequest = Boolean(data && amountNumber > 0 && amountNumber <= data.requestableCoins && destination.trim().length >= 3);

  const saveProfile = async () => {
    setSavingProfile(true);
    setError('');
    setSuccess('');
    try {
      await updateAuthorPayoutProfile({ payoutMethod: method, destinationLabel: destination });
      setSuccess('Đã lưu phương thức nhận thanh toán.');
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu phương thức nhận.');
    } finally {
      setSavingProfile(false);
    }
  };

  const submit = async () => {
    if (!authorId || !canRequest) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await requestAuthorPayout({
        amountCoins: amountNumber,
        note,
        idempotencyKey: createPayoutIdempotencyKey(authorId),
      });
      setAmount('');
      setNote('');
      setSuccess('Đã gửi yêu cầu rút. Quản trị sẽ kiểm tra KYC, thuế và phương thức thanh toán trước khi duyệt.');
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể gửi yêu cầu rút.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id: string) => {
    setError('');
    setSuccess('');
    try {
      await cancelAuthorPayout(id);
      setSuccess('Đã hủy yêu cầu rút.');
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể hủy yêu cầu.');
    }
  };

  if (loading && !data) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải yêu cầu thanh toán…" /></SafeAreaView>;
  if (error && !data) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;
  if (!data) return null;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.icon} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable>
      <View style={{ flex: 1 }}><Text style={styles.topTitle}>Rút doanh thu</Text><Text style={styles.topSub}>{penName}</Text></View>
      <Pressable style={styles.icon} onPress={() => load(true)}><Ionicons name="refresh" size={20} color="#8F1D3F" /></Pressable>
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>{success}</Text> : null}

      <View style={styles.hero}>
        <Text style={styles.heroKicker}>CÓ THỂ YÊU CẦU</Text>
        <Text style={styles.heroValue}>{formatRevenueCoins(data.requestableCoins)} Linh Thạch</Text>
        <Text style={styles.heroBody}>Đã giữ chỗ cho yêu cầu đang chờ/đã duyệt: {formatRevenueCoins(data.reservedCoins)} Linh Thạch.</Text>
      </View>

      <Text style={styles.sectionTitle}>Hồ sơ thanh toán</Text>
      <View style={styles.statusGrid}>
        <StatusBox label="KYC" value={complianceStatusLabel(data.profile?.kyc_status)} ready={data.profile?.kyc_status === 'verified'} />
        <StatusBox label="Thuế" value={complianceStatusLabel(data.profile?.tax_status)} ready={data.profile?.tax_status === 'verified' || data.profile?.tax_status === 'not_required'} />
      </View>

      <Text style={styles.label}>Phương thức nhận</Text>
      <TextInput value={method} onChangeText={setMethod} style={styles.input} placeholder="Ví dụ: manual_bank" placeholderTextColor="#A2959A" />
      <Text style={styles.help}>Giai đoạn hiện tại chỉ lưu nhãn phương thức. Không nhập số tài khoản đầy đủ, CCCD hoặc dữ liệu nhạy cảm vào đây.</Text>

      <Text style={styles.label}>Nhãn nhận tiền</Text>
      <TextInput value={destination} onChangeText={setDestination} style={styles.input} placeholder="Ví dụ: MB Bank •••• 1234" placeholderTextColor="#A2959A" maxLength={160} />
      <Pressable disabled={savingProfile} onPress={saveProfile} style={[styles.secondaryButton, savingProfile && styles.disabled]}>
        <Ionicons name="save-outline" size={18} color="#8F1D3F" />
        <Text style={styles.secondaryButtonText}>{savingProfile ? 'Đang lưu…' : 'Lưu phương thức nhận'}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Tạo yêu cầu rút</Text>
      <Text style={styles.label}>Số Linh Thạch</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="number-pad"
        style={styles.input}
        placeholder={`Tối đa ${formatRevenueCoins(data.requestableCoins)}`}
        placeholderTextColor="#A2959A"
      />
      <Text style={styles.label}>Ghi chú cho quản trị</Text>
      <TextInput value={note} onChangeText={setNote} style={[styles.input, styles.textarea]} multiline placeholder="Không bắt buộc" placeholderTextColor="#A2959A" maxLength={500} />

      <Pressable disabled={!canRequest || submitting} onPress={submit} style={[styles.primaryButton, (!canRequest || submitting) && styles.disabled]}>
        <Ionicons name="cash-outline" size={19} color="#FFF" />
        <Text style={styles.primaryButtonText}>{submitting ? 'Đang gửi…' : 'Gửi yêu cầu rút'}</Text>
      </Pressable>

      <View style={styles.notice}>
        <Ionicons name="shield-checkmark-outline" size={20} color="#8F1D3F" />
        <Text style={styles.noticeText}>Gửi yêu cầu không đồng nghĩa tiền đã được chuyển. Quản trị phải duyệt, kiểm tra KYC/thuế và ghi nhận mã thanh toán thực tế trước khi trạng thái chuyển thành “Đã thanh toán”.</Text>
      </View>

      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Lịch sử yêu cầu</Text><Text style={styles.meta}>{data.payouts.length} mục</Text></View>
      {!data.payouts.length ? <View style={styles.empty}><Text style={styles.emptyText}>Chưa có yêu cầu rút nào.</Text></View> : data.payouts.map((item) => <View key={item.id} style={styles.row}>
        <View style={[styles.rowIcon, item.status === 'paid' ? styles.iconOk : item.status === 'cancelled' ? styles.iconBad : styles.iconWait]}>
          <Ionicons name={item.status === 'paid' ? 'checkmark' : item.status === 'cancelled' ? 'close' : 'time-outline'} size={17} color={item.status === 'paid' ? '#47704D' : item.status === 'cancelled' ? '#A12B48' : '#9B6A22'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{formatRevenueCoins(item.amount_coins)} Linh Thạch · {payoutStatusLabel(item.status)}</Text>
          <Text style={styles.rowSub}>{new Date(item.requested_at).toLocaleString('vi-VN')}</Text>
          {item.external_reference ? <Text style={styles.rowSub}>Mã thanh toán: {item.external_reference}</Text> : null}
          {item.review_note ? <Text style={styles.rowSub}>Quản trị: {item.review_note}</Text> : null}
        </View>
        {item.status === 'pending' ? <Pressable onPress={() => { void cancel(item.id); }} style={styles.cancelButton}><Text style={styles.cancelText}>Hủy</Text></Pressable> : null}
      </View>)}
    </ScrollView>
  </SafeAreaView>;
}

function StatusBox({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return <View style={styles.statusBox}>
    <Ionicons name={ready ? 'checkmark-circle' : 'alert-circle-outline'} size={20} color={ready ? '#47704D' : '#9B6A22'} />
    <Text style={styles.statusValue}>{value}</Text>
    <Text style={styles.statusLabel}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: '#251D20', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  topSub: { color: '#81757A', fontSize: 9, textAlign: 'center', marginTop: 2 },
  page: { padding: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  error: { color: '#A12B48', backgroundColor: '#F8E7EC', padding: 10, borderRadius: 10, fontSize: 10, marginBottom: 10 },
  success: { color: '#47704D', backgroundColor: '#EDF4EC', padding: 10, borderRadius: 10, fontSize: 10, marginBottom: 10 },
  hero: { backgroundColor: '#741632', borderRadius: 22, padding: 21 },
  heroKicker: { color: '#EFC5D1', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  heroValue: { color: '#FFF', fontSize: 33, fontWeight: '900', marginTop: 7 },
  heroBody: { color: '#E9C5D0', fontSize: 10, lineHeight: 16, marginTop: 7 },
  sectionTitle: { color: '#2C2226', fontSize: 18, fontWeight: '900', marginTop: 23, marginBottom: 10 },
  statusGrid: { flexDirection: 'row', gap: 10 },
  statusBox: { width: '48%', flexGrow: 1, minHeight: 90, borderRadius: 15, borderWidth: 1, borderColor: '#E4D8D1', backgroundColor: '#FFFDFC', padding: 13 },
  statusValue: { color: '#30262A', fontSize: 12, fontWeight: '900', marginTop: 7 },
  statusLabel: { color: '#81757A', fontSize: 9, marginTop: 3 },
  label: { color: '#463B40', fontSize: 11, fontWeight: '900', marginTop: 12, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#DDD0C9', borderRadius: 13, backgroundColor: '#FFFDFC', color: '#2D2327', paddingHorizontal: 13, fontSize: 13 },
  textarea: { minHeight: 82, paddingTop: 12, textAlignVertical: 'top' },
  help: { color: '#8A7C81', fontSize: 9, lineHeight: 14, marginTop: 6 },
  secondaryButton: { height: 45, borderRadius: 13, borderWidth: 1, borderColor: '#D7BEC6', backgroundColor: '#FFFDFC', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 11 },
  secondaryButtonText: { color: '#8F1D3F', fontSize: 11, fontWeight: '900' },
  primaryButton: { height: 50, borderRadius: 14, backgroundColor: '#8F1D3F', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14 },
  primaryButtonText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: .5 },
  notice: { marginTop: 13, backgroundColor: '#F0E1E5', borderRadius: 14, padding: 13, flexDirection: 'row', gap: 9 },
  noticeText: { flex: 1, color: '#65575D', fontSize: 10, lineHeight: 16 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { color: '#8F1D3F', fontSize: 10, fontWeight: '800', marginTop: 16 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E7DBD4', borderRadius: 14, padding: 11, marginBottom: 8 },
  rowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  iconOk: { backgroundColor: '#EDF4EC' },
  iconBad: { backgroundColor: '#F8E7EB' },
  iconWait: { backgroundColor: '#F6EFE3' },
  rowTitle: { color: '#33282D', fontSize: 11, fontWeight: '900' },
  rowSub: { color: '#81757A', fontSize: 9, lineHeight: 14, marginTop: 3 },
  cancelButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: '#F8E7EC' },
  cancelText: { color: '#A12B48', fontSize: 9, fontWeight: '900' },
  empty: { minHeight: 88, borderRadius: 14, borderWidth: 1, borderColor: '#E7DBD4', backgroundColor: '#FFFDFC', alignItems: 'center', justifyContent: 'center', padding: 15 },
  emptyText: { color: '#81757A', fontSize: 10 },
});
