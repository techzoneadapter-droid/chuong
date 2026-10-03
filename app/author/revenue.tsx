import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { getAuthorForUser } from '../../services/authors';
import { formatRevenueCoins, getAuthorRevenueDashboard, RevenueDashboard, sharePercent } from '../../services/revenue';

export default function AuthorRevenueScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<RevenueDashboard | null>(null);
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
      setData(await getAuthorRevenueDashboard(author.id));
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

  const account = data.account;
  const policyPercent = sharePercent(data.policy?.author_share_bps);
  const netGross = Math.max(0, account.gross_sales_coins - account.refunded_coins);
  const netAuthorEarnings = Math.max(0, account.author_earnings_coins - account.refunded_earnings_coins);

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

      <View style={styles.hero}>
        <Text style={styles.heroKicker}>CÓ THỂ ĐỐI SOÁT</Text>
        <Text style={styles.heroValue}>{formatRevenueCoins(data.availablePayoutCoins)} Linh Thạch</Text>
        <Text style={styles.heroBody}>Số này là phần doanh thu tác giả đã ghi nhận sau hoàn tiền và các khoản đã đối soát. Đây chưa phải số tiền VND thực nhận.</Text>
      </View>
      <Pressable style={styles.payoutCta} onPress={() => router.push('/author/payout')}>
        <View style={styles.payoutCtaIcon}><Ionicons name="cash-outline" size={20} color="#8F1D3F" /></View>
        <View style={{ flex: 1 }}><Text style={styles.payoutCtaTitle}>Yêu cầu rút doanh thu</Text><Text style={styles.payoutCtaBody}>Tạo yêu cầu · KYC/thuế · Theo dõi trạng thái thanh toán</Text></View>
        <Ionicons name="chevron-forward" size={18} color="#8F1D3F" />
      </Pressable>

      <View style={styles.grid}>
        <Metric label="Doanh thu gộp" value={account.gross_sales_coins} />
        <Metric label="Đã hoàn" value={account.refunded_coins} />
        <Metric label="Doanh thu ròng" value={netGross} />
        <Metric label="Phần tác giả" value={netAuthorEarnings} />
        <Metric label="Đã đối soát" value={account.paid_out_coins} />
        <Metric label="Còn đối soát" value={data.availablePayoutCoins} />
      </View>

      <View style={[styles.policy, data.policy ? styles.policyActive : styles.policyInactive]}>
        <Ionicons name={data.policy ? 'pie-chart-outline' : 'alert-circle-outline'} size={20} color="#8F1D3F" />
        <View style={{ flex: 1 }}>
          <Text style={styles.policyTitle}>{data.policy ? `Tỷ lệ tác giả đang áp dụng: ${policyPercent}%` : 'Chưa kích hoạt tỷ lệ chia doanh thu'}</Text>
          <Text style={styles.policyBody}>{data.policy ? 'Mỗi giao dịch mới chụp lại tỷ lệ tại thời điểm mua để lịch sử không bị thay đổi khi chính sách đổi.' : 'Giao dịch vẫn có thể ghi nhận doanh thu gộp, nhưng phần tác giả chưa được phân bổ cho đến khi quản trị kích hoạt chính sách.'}</Text>
          {data.unallocatedGrossCoins !== 0 ? <Text style={styles.unallocated}>Chưa phân bổ theo chính sách: {formatRevenueCoins(data.unallocatedGrossCoins)} Linh Thạch</Text> : null}
        </View>
      </View>

      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Giao dịch gần đây</Text><Text style={styles.sectionMeta}>{data.ledger.length} mục</Text></View>
      {!data.ledger.length ? <EmptyCopy text="Chưa có giao dịch mở khóa hoặc hoàn tiền." /> : data.ledger.map((item) => {
        const sale = item.type === 'sale';
        return <View key={item.id} style={styles.row}>
          <View style={[styles.rowIcon, sale ? styles.saleIcon : styles.refundIcon]}><Ionicons name={sale ? 'trending-up' : 'return-down-back'} size={17} color={sale ? '#47704D' : '#9B2946'} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{item.bookTitle || 'Truyện CHƯƠNG'}</Text>
            <Text style={styles.rowSub}>{item.description || (sale ? 'Mở khóa nội dung' : 'Hoàn tiền')} · {new Date(item.created_at).toLocaleString('vi-VN')}</Text>
            <Text style={styles.rowSub}>Phần tác giả: {item.author_share_bps == null ? 'chưa phân bổ' : `${formatRevenueCoins(item.author_earnings_coins)} Linh Thạch (${sharePercent(item.author_share_bps)}%)`}</Text>
          </View>
          <Text style={[styles.amount, sale ? styles.positive : styles.negative]}>{item.gross_coins > 0 ? '+' : ''}{formatRevenueCoins(item.gross_coins)} Linh Thạch</Text>
        </View>;
      })}

      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Lịch sử đối soát</Text><Text style={styles.sectionMeta}>{data.payouts.length} mục</Text></View>
      {!data.payouts.length ? <EmptyCopy text="Chưa có khoản thanh toán tác giả nào được ghi nhận." /> : data.payouts.map((item) => <View key={item.id} style={styles.row}>
        <View style={[styles.rowIcon, styles.saleIcon]}><Ionicons name="cash-outline" size={17} color="#47704D" /></View>
        <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{formatRevenueCoins(item.amount_coins)} Linh Thạch</Text><Text style={styles.rowSub}>{item.status === 'paid' ? 'Đã ghi nhận thanh toán' : item.status} · {new Date(item.created_at).toLocaleString('vi-VN')}</Text>{item.external_reference ? <Text style={styles.rowSub}>Mã đối soát: {item.external_reference}</Text> : null}</View>
      </View>)}

      <View style={styles.notice}><Ionicons name="information-circle-outline" size={19} color="#8F1D3F" /><Text style={styles.noticeText}>CHƯƠNG hiện chỉ xây sổ doanh thu và đối soát. Chức năng rút tiền thật chưa được bật cho tới khi hoàn thiện chính sách thanh toán, thuế, KYC và phương thức payout.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{formatRevenueCoins(value)} Linh Thạch</Text><Text style={styles.metricLabel}>{label}</Text></View>;
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
