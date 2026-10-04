import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArtDivider, ArtIcon, BrandLockup, ButtonArt } from '../../components/Artwork';
import { EmptyState, LoadingState, RetryState } from '../../components/States';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { artwork } from '../../constants/artwork';
import { xianxia } from '../../constants/xianxia';
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

  if (authLoading || (loading && user)) return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><LoadingState label="Đang mở Linh Khố…" /></SafeAreaView>;
  if (!user) return null;
  if (error && !wallet) return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={() => router.back()} style={styles.iconButton}><Ionicons name="arrow-back" size={21} color={xianxia.ink} /></Pressable>
      <View style={styles.topCopy}><Text style={styles.topKicker}>LINH KHỐ</Text><Text style={styles.topTitle}>Ví CHƯƠNG</Text></View>
      <View style={styles.iconButton} />
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={xianxia.jadeDeep} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      {error ? <Pressable onPress={() => load()}><Text style={styles.error}>{error} · Chạm để thử lại</Text></Pressable> : null}

      <View style={styles.brandCard}>
        <BrandLockup compact inverse showTagline={false} />
        <Text style={styles.brandCardNote}>Linh Thạch dùng để mở khóa nội dung VIP và được quản lý bằng sổ cái giao dịch.</Text>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroOrnament}><ArtIcon source={artwork.lotus} size={64} /></View>
        <Text style={styles.heroKicker}>SỐ DƯ KHẢ DỤNG</Text>
        <View style={styles.balanceRow}>
          <Text style={styles.balance}>{formatCoins(wallet?.balance_coins ?? 0)}</Text>
          <View style={styles.coin}><Ionicons name="diamond-outline" size={14} color={xianxia.goldSoft} /><Text style={styles.coinText}>Linh Thạch</Text></View>
        </View>
        <Text style={styles.heroNote}>Dùng Linh Thạch để mở khóa truyện và chương VIP trên CHƯƠNG.</Text>
        <Pressable style={styles.buyButton} onPress={() => router.push('/wallet/store')}>
          <ButtonArt />
          <Ionicons name="add-circle-outline" size={18} color={xianxia.goldSoft} />
          <Text style={styles.buyButtonText}>Nạp Linh Thạch</Text>
          <Ionicons name="arrow-forward" size={16} color={xianxia.white} />
        </Pressable>
        <Text style={styles.storeNote}>Thanh toán thật chỉ hoạt động trên build Android/iOS đã kết nối native billing.</Text>
      </View>

      {wallet?.debt_coins ? <View style={styles.debtNotice}>
        <Ionicons name="warning-outline" size={20} color={xianxia.cinnabar} />
        <Text style={styles.debtNoticeText}>Tài khoản đang có {formatCoins(wallet.debt_coins)} Linh Thạch cần bù do giao dịch cửa hàng bị hoàn/hủy. Các lần nạp tiếp theo sẽ ưu tiên bù khoản này trước khi cộng vào số dư khả dụng.</Text>
      </View> : null}

      <View style={styles.metrics}>
        <Metric label="Đã nhận" value={(wallet?.lifetime_credited ?? 0) - (wallet?.lifetime_reversed ?? 0)} icon="arrow-down-circle-outline" />
        <Metric label="Đã sử dụng" value={wallet?.lifetime_spent ?? 0} icon="arrow-up-circle-outline" />
      </View>

      <ArtDivider width={220} />
      <View style={styles.sectionHead}>
        <View><Text style={styles.sectionKicker}>SỔ LINH THẠCH</Text><Text style={styles.sectionTitle}>Lịch sử giao dịch</Text></View>
        <Text style={styles.sectionMeta}>{items.length ? `${items.length} giao dịch` : 'Chưa có'}</Text>
      </View>

      {!items.length ? <View style={styles.emptyWrap}><EmptyState title="Chưa có giao dịch Linh Thạch" detail="Khi bạn nạp hoặc sử dụng Linh Thạch, lịch sử sẽ xuất hiện tại đây." /></View> : items.map((item) => <TransactionRow key={item.id} item={item} />)}

      <View style={styles.safety}>
        <View style={styles.safetyIcon}><Ionicons name="shield-checkmark-outline" size={20} color={xianxia.jadeDeep} /></View>
        <Text style={styles.safetyText}>Số dư được quản lý bằng sổ cái bất biến. Ứng dụng không thể tự cộng Linh Thạch; các lần nạp chỉ được ghi nhận sau khi biên lai cửa hàng được xác minh.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function Metric({ label, value, icon }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap }) {
  return <View style={styles.metric}>
    <View style={styles.metricIcon}><Ionicons name={icon} size={19} color={xianxia.jadeDeep} /></View>
    <Text style={styles.metricValue}>{formatCoins(value)} Linh Thạch</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>;
}

function TransactionRow({ item }: { item: WalletTransaction }) {
  const credit = item.amount_coins > 0;
  return <View style={styles.tx}>
    <View style={[styles.txIcon, credit ? styles.creditIcon : styles.debitIcon]}>
      <Ionicons name={credit ? 'arrow-down' : 'arrow-up'} size={17} color={credit ? '#46724C' : xianxia.cinnabar} />
    </View>
    <View style={styles.txCopy}>
      <Text style={styles.txTitle}>{walletTransactionLabel(item.type)}</Text>
      <Text style={styles.txDesc}>{item.description || new Date(item.created_at).toLocaleString('vi-VN')}</Text>
      {item.description ? <Text style={styles.txDate}>{new Date(item.created_at).toLocaleString('vi-VN')}</Text> : null}
    </View>
    <View style={styles.txAmountWrap}>
      <Text style={[styles.txAmount, credit ? styles.creditText : styles.debitText]}>{credit ? '+' : ''}{formatCoins(item.amount_coins)} Linh Thạch</Text>
      <Text style={styles.txBalance}>Còn {formatCoins(item.balance_after)}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(244,235,216,.90)' },
  topCopy: { flex: 1, alignItems: 'center' },
  topKicker: { color: xianxia.cinnabar, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.3 },
  topTitle: { color: xianxia.ink, fontSize: 17, fontWeight: '900', marginTop: 2 },
  iconButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  page: { padding: 16, paddingBottom: 46, width: '100%', maxWidth: 720, alignSelf: 'center' },
  error: { color: xianxia.danger, backgroundColor: '#F8E7E1', borderWidth: 1, borderColor: '#E7C9BF', padding: 10, borderRadius: 12, fontSize: 10, marginBottom: 10 },
  brandCard: { minHeight: 72, borderRadius: 17, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#23443A', borderWidth: 1, borderColor: '#4B6C61', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brandCardNote: { flex: 1, maxWidth: 270, color: 'rgba(255,253,248,.62)', fontSize: 8.5, lineHeight: 13, textAlign: 'right' },
  hero: { position: 'relative', overflow: 'hidden', marginTop: 12, backgroundColor: '#173F35', borderRadius: 22, borderWidth: 1, borderColor: xianxia.gold, padding: 20 },
  heroOrnament: { position: 'absolute', right: 10, top: 6, opacity: .36 },
  heroKicker: { color: xianxia.goldSoft, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  balance: { color: xianxia.white, fontSize: 40, fontWeight: '900', letterSpacing: -.8 },
  coin: { backgroundColor: 'rgba(185,137,69,.16)', borderWidth: 1, borderColor: 'rgba(229,209,163,.45)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  coinText: { color: xianxia.goldSoft, fontSize: 10, fontWeight: '900' },
  heroNote: { color: 'rgba(255,253,248,.72)', fontSize: 11, lineHeight: 17, marginTop: 9, maxWidth: 420 },
  buyButton: { position: 'relative', overflow: 'hidden', marginTop: 18, minHeight: 48, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buyButtonText: { flex: 1, textAlign: 'center', color: xianxia.white, fontSize: 11, fontWeight: '900' },
  storeNote: { color: 'rgba(255,253,248,.52)', fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 8 },
  debtNotice: { marginTop: 12, backgroundColor: '#F4E4DE', borderWidth: 1, borderColor: '#E2C5BA', borderRadius: 14, padding: 13, flexDirection: 'row', gap: 9 },
  debtNoticeText: { flex: 1, color: '#76544E', fontSize: 9.5, lineHeight: 15 },
  metrics: { flexDirection: 'row', gap: 10, marginTop: 14 },
  metric: { flex: 1, backgroundColor: 'rgba(255,248,234,.92)', borderWidth: 1, borderColor: xianxia.line, borderRadius: 16, padding: 14 },
  metricIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B9CBBF', alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: xianxia.ink, fontSize: 15, fontWeight: '900', marginTop: 8 },
  metricLabel: { color: xianxia.muted, fontSize: 9, marginTop: 3 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4, marginBottom: 10 },
  sectionKicker: { color: xianxia.cinnabar, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: xianxia.ink, fontSize: 18, fontWeight: '900', marginTop: 2 },
  sectionMeta: { color: xianxia.jade, fontSize: 9, fontWeight: '800' },
  emptyWrap: { minHeight: 160, justifyContent: 'center', backgroundColor: 'rgba(255,248,234,.74)', borderRadius: 16, borderWidth: 1, borderColor: xianxia.line },
  tx: { minHeight: 78, backgroundColor: 'rgba(255,248,234,.92)', borderWidth: 1, borderColor: xianxia.line, borderRadius: 15, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 11 },
  txIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  creditIcon: { backgroundColor: '#E3EEE4' },
  debitIcon: { backgroundColor: '#F4E4DE' },
  txCopy: { flex: 1 },
  txTitle: { color: xianxia.ink, fontSize: 11, fontWeight: '900' },
  txDesc: { color: xianxia.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  txDate: { color: '#9A8F86', fontSize: 7.5, marginTop: 3 },
  txAmountWrap: { alignItems: 'flex-end' },
  txAmount: { fontSize: 11, fontWeight: '900' },
  creditText: { color: '#47704D' },
  debitText: { color: xianxia.cinnabar },
  txBalance: { color: '#9A8E82', fontSize: 7.5, marginTop: 4 },
  safety: { marginTop: 18, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', borderRadius: 15, padding: 13, flexDirection: 'row', gap: 10 },
  safetyIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,253,248,.72)', alignItems: 'center', justifyContent: 'center' },
  safetyText: { flex: 1, color: '#53675F', fontSize: 9, lineHeight: 15 },
});
