import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { formatCoins, getWallet, getWalletTransactions, WalletAccount, WalletTransaction, walletTransactionLabel } from '../../services/wallet';

export default function WalletScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [wallet, setWallet] = useState<WalletAccount | null>(null);
  const [items, setItems] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!user) return;
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [account, transactions] = await Promise.all([
        getWallet(user.id),
        getWalletTransactions(user.id),
      ]);
      setWallet(account);
      setItems(transactions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải Ví CHƯƠNG.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth/login');
  }, [authLoading, router, user]);

  useEffect(() => {
    if (user) void load();
  }, [load, user]);

  if (authLoading || (loading && user)) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải Ví CHƯƠNG…" /></SafeAreaView>;
  if (!user) return null;
  if (error && !wallet) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable onPress={() => router.back()} style={styles.iconButton}><Ionicons name="arrow-back" size={22} color="#2E2428" /></Pressable>
      <Text style={styles.topTitle}>Ví CHƯƠNG</Text>
      <View style={styles.iconButton} />
    </View>
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      {error ? <Pressable onPress={() => load()}><Text style={styles.error}>{error} · Chạm để thử lại</Text></Pressable> : null}

      <View style={styles.hero}>
        <Text style={styles.heroKicker}>SỐ DƯ KHẢ DỤNG</Text>
        <View style={styles.balanceRow}>
          <Text style={styles.balance}>{formatCoins(wallet?.balance_coins ?? 0)}</Text>
          <View style={styles.coin}><Text style={styles.coinText}>Xu</Text></View>
        </View>
        <Text style={styles.heroNote}>CHƯƠNG Xu dùng để mở khóa truyện và chương VIP trên nền tảng.</Text>
        <Pressable style={styles.buyButton} onPress={() => router.push('/wallet/store')}>
          <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
          <Text style={styles.buyButtonText}>Nạp CHƯƠNG Xu</Text>
        </Pressable>
        <Text style={styles.storeNote}>Catalog đã sẵn sàng; thanh toán thật chỉ hoạt động trong build Android/iOS sau khi kết nối native billing.</Text>
      </View>

      {wallet?.debt_coins ? <View style={styles.debtNotice}>
        <Ionicons name="warning-outline" size={20} color="#8F1D3F" />
        <Text style={styles.debtNoticeText}>Tài khoản đang có {formatCoins(wallet.debt_coins)} Xu cần bù do giao dịch cửa hàng bị hoàn/hủy. Các lần nạp tiếp theo sẽ ưu tiên bù khoản này trước khi cộng vào số dư khả dụng.</Text>
      </View> : null}

      <View style={styles.metrics}>
        <Metric label="Đã nhận" value={(wallet?.lifetime_credited ?? 0) - (wallet?.lifetime_reversed ?? 0)} icon="arrow-down-circle-outline" />
        <Metric label="Đã sử dụng" value={wallet?.lifetime_spent ?? 0} icon="arrow-up-circle-outline" />
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Lịch sử giao dịch</Text>
        <Text style={styles.sectionMeta}>{items.length ? `${items.length} giao dịch` : 'Chưa có'}</Text>
      </View>

      {!items.length ? <View style={styles.emptyWrap}><EmptyState title="Chưa có giao dịch Xu" /></View> : items.map((item) => <TransactionRow key={item.id} item={item} />)}

      <View style={styles.safety}>
        <Ionicons name="shield-checkmark-outline" size={20} color="#8F1D3F" />
        <Text style={styles.safetyText}>Số dư được quản lý bằng sổ cái giao dịch bất biến. Ứng dụng không thể tự cộng Xu; các lần nạp sau này chỉ được ghi nhận sau khi biên lai cửa hàng được xác minh.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function Metric({ label, value, icon }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap }) {
  return <View style={styles.metric}>
    <Ionicons name={icon} size={20} color="#8F1D3F" />
    <Text style={styles.metricValue}>{formatCoins(value)} Xu</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>;
}

function TransactionRow({ item }: { item: WalletTransaction }) {
  const credit = item.amount_coins > 0;
  return <View style={styles.tx}>
    <View style={[styles.txIcon, credit ? styles.creditIcon : styles.debitIcon]}>
      <Ionicons name={credit ? 'arrow-down' : 'arrow-up'} size={17} color={credit ? '#46724C' : '#9B2946'} />
    </View>
    <View style={styles.txCopy}>
      <Text style={styles.txTitle}>{walletTransactionLabel(item.type)}</Text>
      <Text style={styles.txDesc}>{item.description || new Date(item.created_at).toLocaleString('vi-VN')}</Text>
      {item.description ? <Text style={styles.txDate}>{new Date(item.created_at).toLocaleString('vi-VN')}</Text> : null}
    </View>
    <View style={styles.txAmountWrap}>
      <Text style={[styles.txAmount, credit ? styles.creditText : styles.debitText]}>{credit ? '+' : ''}{formatCoins(item.amount_coins)} Xu</Text>
      <Text style={styles.txBalance}>Còn {formatCoins(item.balance_after)}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  topTitle: { color: '#221A1D', fontSize: 18, fontWeight: '900' },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  page: { padding: 16, paddingBottom: 46, width: '100%', maxWidth: 720, alignSelf: 'center' },
  error: { color: '#A12B48', backgroundColor: '#F8E7EC', padding: 10, borderRadius: 10, fontSize: 11, marginBottom: 10 },
  hero: { backgroundColor: '#741632', borderRadius: 24, padding: 22 },
  heroKicker: { color: '#EFC5D1', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  balance: { color: '#FFFFFF', fontSize: 40, fontWeight: '900', letterSpacing: -.8 },
  coin: { backgroundColor: '#A92A50', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  coinText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  heroNote: { color: '#ECCBD5', fontSize: 12, lineHeight: 18, marginTop: 9, maxWidth: 420 },
  buyButton: { marginTop: 18, height: 46, borderRadius: 13, backgroundColor: '#A92A50', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  buyButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  storeNote: { color: '#CFA9B5', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 8 },
  debtNotice: { marginTop: 12, backgroundColor: '#F8E7EC', borderRadius: 14, padding: 13, flexDirection: 'row', gap: 9 },
  debtNoticeText: { flex: 1, color: '#7C5360', fontSize: 10, lineHeight: 16 },
  metrics: { flexDirection: 'row', gap: 10, marginTop: 14 },
  metric: { flex: 1, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E4D8D1', borderRadius: 16, padding: 15 },
  metricValue: { color: '#2C2226', fontSize: 17, fontWeight: '900', marginTop: 8 },
  metricLabel: { color: '#83777B', fontSize: 10, marginTop: 3 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 10 },
  sectionTitle: { color: '#221A1D', fontSize: 18, fontWeight: '900' },
  sectionMeta: { color: '#8F1D3F', fontSize: 10, fontWeight: '800' },
  emptyWrap: { minHeight: 160, justifyContent: 'center' },
  tx: { minHeight: 78, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E7DCD5', borderRadius: 15, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 11 },
  txIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  creditIcon: { backgroundColor: '#EDF5EC' },
  debitIcon: { backgroundColor: '#FAE9EE' },
  txCopy: { flex: 1 },
  txTitle: { color: '#33282D', fontSize: 12, fontWeight: '900' },
  txDesc: { color: '#74686D', fontSize: 10, lineHeight: 15, marginTop: 3 },
  txDate: { color: '#9A8F93', fontSize: 8, marginTop: 3 },
  txAmountWrap: { alignItems: 'flex-end' },
  txAmount: { fontSize: 12, fontWeight: '900' },
  creditText: { color: '#47704D' },
  debitText: { color: '#9B2946' },
  txBalance: { color: '#9A8E92', fontSize: 8, marginTop: 4 },
  safety: { marginTop: 18, backgroundColor: '#F0E1E5', borderRadius: 15, padding: 14, flexDirection: 'row', gap: 10 },
  safetyText: { flex: 1, color: '#65575D', fontSize: 10, lineHeight: 16 },
});
