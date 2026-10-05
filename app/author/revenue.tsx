import { AuthorGiftDashboard } from '../../components/AuthorGiftDashboard';
import { spiritCurrencyLabel } from '../../services/spiritStones';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { getAuthorForUser } from '../../services/authors';
import { formatVnd, getVndDashboard, VndDashboard } from '../../services/vndRevenue';

export default function AuthorRevenueScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<VndDashboard | null>(null);
  const [penName, setPenName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

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
      setPenName(author.penName);
      setData(await getVndDashboard(author.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải doanh thu.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, router, user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading && !data) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải doanh thu tác giả…" /></SafeAreaView>;
  if (error && !data) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;
  if (!data) return null;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.icon} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable>
      <View style={{ flex: 1 }}><Text style={styles.topTitle}>Doanh thu tác giả</Text><Text style={styles.topSub}>{penName}</Text></View>
      <Pressable style={styles.icon} onPress={() => load(true)}><Ionicons name="refresh" size={20} color="#8F1D3F" /></Pressable>
    </View>
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <AuthorGiftDashboard />
      {!data.policy.high_stone_value_vnd ? <Text style={styles.error}>Chưa cấu hình tỷ giá thanh toán</Text> : null}
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>TỔNG DOANH THU</Text>
        <Text style={styles.heroValue}>{formatVnd(data.total_vnd)}</Text>
        <Text style={styles.heroBody}>Doanh thu đã chốt bằng VND. App VIP không tạo doanh thu tác giả.</Text>
      </View>
      <Pressable style={styles.payoutCta} onPress={() => router.push('/author/payout')}>
        <View style={styles.payoutCtaIcon}><Ionicons name="cash-outline" size={20} color="#8F1D3F" /></View>
        <View style={{ flex: 1 }}><Text style={styles.payoutCtaTitle}>Yêu cầu rút doanh thu</Text><Text style={styles.payoutCtaBody}>Tạo yêu cầu · KYC/thuế · Theo dõi trạng thái thanh toán</Text></View>
        <Ionicons name="chevron-forward" size={18} color="#8F1D3F" />
      </Pressable>

      <View style={styles.grid}>
        <Metric label="Có thể rút" value={data.available_payout_vnd} />
        <Metric label="Đã thanh toán" value={data.paid_vnd} />
        <Metric label="Đang giữ cho yêu cầu rút" value={data.reserved_vnd} />
        <Metric label="Mở khóa chương" value={data.breakdown.chapter_unlock ?? 0} />
        <Metric label="Mở khóa cả truyện" value={data.breakdown.book_unlock ?? 0} />
        <Metric label="Quà độc giả" value={data.breakdown.author_gift ?? 0} />
      </View>
      <View style={[styles.policy, styles.policyActive]}><View style={{ flex: 1 }}>
        <Text style={styles.policyTitle}>Đang đối soát · {data.pending_count} giao dịch</Text>
        <Text style={styles.policyBody}>Hạ Phẩm chờ đối soát: {Number(data.pending_low_stones).toLocaleString('vi-VN')}. Giá trị VND chưa chốt; chưa tính vào Có thể rút.</Text>
        {data.debt_vnd > 0 ? <Text style={styles.unallocated}>Điều chỉnh sau hoàn tiền: {formatVnd(data.debt_vnd)}</Text> : null}
      </View></View>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Giao dịch gần đây</Text><Text style={styles.sectionMeta}>{data.ledger.length} mục</Text></View>
      {!data.ledger.length ? <EmptyCopy text="Chưa có giao dịch mở khóa, quà tặng hoặc hoàn tiền." /> : data.ledger.map((item) => <View key={item.id} style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{item.author_earnings_vnd == null ? 'Đang đối soát' : `${item.author_earnings_vnd >= 0 ? '+' : ''}${formatVnd(item.author_earnings_vnd)}`}</Text>
          <Text style={styles.rowSub}>{item.description || (item.source_type === 'author_gift' ? 'Quà độc giả' : item.source_type === 'book_unlock' ? 'Mở khóa cả truyện' : 'Mở khóa chương')}</Text>
          <Text style={styles.rowSub}>{spiritCurrencyLabel(item.currency_type)} · {new Date(item.created_at).toLocaleString('vi-VN')}{item.settlement_status === 'legacy_pending_settlement' ? ' · Dữ liệu cũ chờ đối soát' : ''}</Text>
        </View>
      </View>)}

    </ScrollView>
  </SafeAreaView>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{formatVnd(value)}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function EmptyCopy({ text }: { text: string }) {
  return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: '#251D20', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  topSub: { color: '#81757A', fontSize: 9, textAlign: 'center', marginTop: 2 },
  page: { padding: 16, paddingBottom: 44, width: '100%', maxWidth: 760, alignSelf: 'center' },
  error: { color: '#A12B48', fontSize: 10, backgroundColor: '#F7E7EC', padding: 10, borderRadius: 10, marginBottom: 10 },
  hero: { backgroundColor: '#741632', borderRadius: 22, padding: 21 },
  heroKicker: { color: '#EFC5D1', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  heroValue: { color: '#FFF', fontSize: 36, fontWeight: '900', marginTop: 7 },
  heroBody: { color: '#E9C5D0', fontSize: 11, lineHeight: 17, marginTop: 8, maxWidth: 520 },
  payoutCta: { marginTop: 12, minHeight: 66, borderRadius: 16, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E4D8D1', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  payoutCtaIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  payoutCtaTitle: { color: '#2D2327', fontSize: 12, fontWeight: '900' },
  payoutCtaBody: { color: '#81757A', fontSize: 9, marginTop: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  metric: { width: '48%', flexGrow: 1, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', borderRadius: 15, padding: 14 },
  metricValue: { color: '#2B2226', fontSize: 16, fontWeight: '900' },
  metricLabel: { color: '#7D7176', fontSize: 10, marginTop: 4 },
  policy: { marginTop: 14, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 10, borderWidth: 1 },
  policyActive: { backgroundColor: '#F1E8E4', borderColor: '#E1D1CB' },
  policyInactive: { backgroundColor: '#F8E8EB', borderColor: '#E7C9D2' },
  policyTitle: { color: '#33282D', fontSize: 12, fontWeight: '900' },
  policyBody: { color: '#74686D', fontSize: 10, lineHeight: 16, marginTop: 4 },
  unallocated: { color: '#8F1D3F', fontSize: 10, fontWeight: '800', marginTop: 7 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 8 },
  sectionTitle: { color: '#241C20', fontSize: 18, fontWeight: '900' },
  sectionMeta: { color: '#8F1D3F', fontSize: 10, fontWeight: '800' },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E7DBD4', borderRadius: 14, padding: 11, marginBottom: 8 },
  rowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  saleIcon: { backgroundColor: '#EDF4EC' },
  refundIcon: { backgroundColor: '#F8E7EB' },
  rowTitle: { color: '#33282D', fontSize: 12, fontWeight: '900' },
  rowSub: { color: '#81757A', fontSize: 9, lineHeight: 14, marginTop: 3 },
  amount: { fontSize: 11, fontWeight: '900' },
  positive: { color: '#47704D' },
  negative: { color: '#A12B48' },
  empty: { minHeight: 88, borderRadius: 14, borderWidth: 1, borderColor: '#E7DBD4', backgroundColor: '#FFFDFC', alignItems: 'center', justifyContent: 'center', padding: 15 },
  emptyText: { color: '#81757A', fontSize: 10, textAlign: 'center' },
  notice: { marginTop: 18, borderRadius: 15, backgroundColor: '#F0E1E5', padding: 14, flexDirection: 'row', gap: 9 },
  noticeText: { flex: 1, color: '#65575D', fontSize: 10, lineHeight: 16 },
});
