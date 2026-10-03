import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { useLinhThachIap } from '../../hooks/useLinhThachIap';
import { getStoreProducts, productIdForPlatform, StoreProduct } from '../../services/store';
import { formatCoins } from '../../services/wallet';

export default function WalletStoreScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setItems(await getStoreProducts());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải các gói Linh Thạch.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const iap = useLinhThachIap({
    catalog: items,
    userId: user?.id ?? '',
    onCredited: () => {
      void load(true);
    },
  });

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth/login');
  }, [authLoading, router, user]);

  useEffect(() => {
    if (user) void load();
  }, [load, user]);

  const refreshAll = useCallback(async () => {
    await load(true);
    await iap.refreshProducts();
  }, [iap, load]);

  if (authLoading || (loading && user)) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải cửa hàng Linh Thạch…" /></SafeAreaView>;
  if (!user) return null;
  if (error && !items.length) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;

  const isWeb = Platform.OS === 'web';

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2E2428" /></Pressable>
      <Text style={styles.topTitle}>Nạp Linh Thạch</Text>
      <View style={styles.iconButton} />
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refreshAll(); }} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>LINH THẠCH</Text>
        <Text style={styles.title}>Chọn gói Linh Thạch</Text>
        <Text style={styles.subtitle}>Linh Thạch dùng để mở khóa truyện và chương VIP. Giá thanh toán thật được lấy trực tiếp từ Google Play hoặc App Store trên thiết bị của người dùng.</Text>
      </View>

      {isWeb ? <View style={styles.webNotice}>
        <Ionicons name="desktop-outline" size={20} color="#8F1D3F" />
        <Text style={styles.webNoticeText}>Vibaocode đang chạy bản web nên chỉ xem được catalog. Luồng mua thật chỉ chạy trong build Android/iOS có native billing.</Text>
      </View> : <View style={[styles.runtime, iap.verifierReady && iap.connected ? styles.runtimeReady : styles.runtimeWaiting]}>
        <Ionicons name={iap.verifierReady && iap.connected ? 'checkmark-circle-outline' : 'time-outline'} size={20} color="#8F1D3F" />
        <View style={{ flex: 1 }}>
          <Text style={styles.runtimeTitle}>{iap.verifierReady && iap.connected ? 'Cửa hàng đã sẵn sàng' : 'Đang chuẩn bị thanh toán'}</Text>
          <Text style={styles.runtimeBody}>
            {!iap.verifierReady
              ? 'Server chưa có đủ thông tin xác minh của cửa hàng nên nút mua được khóa an toàn.'
              : !iap.connected
                ? 'Đang kết nối Google Play / App Store trên thiết bị.'
                : 'Giao dịch chỉ được hoàn tất sau khi server xác minh và cộng Linh Thạch thành công.'}
          </Text>
        </View>
      </View>}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {iap.error ? <Text style={styles.error}>{iap.error}</Text> : null}
      {iap.success ? <Text style={styles.success}>{iap.success}</Text> : null}

      <View style={styles.grid}>
        {items.map((item) => {
          const productId = productIdForPlatform(item);
          const nativeProduct = productId ? iap.productsById[productId] : undefined;
          const processing = Boolean(productId && iap.processingProductId === productId);
          const canBuy = Boolean(
            !isWeb &&
            productId &&
            nativeProduct &&
            iap.supported &&
            iap.connected &&
            iap.verifierReady &&
            !processing
          );

          let buttonText = 'Chỉ khả dụng trên Android/iOS';
          if (!isWeb) {
            if (!iap.verifierReady) buttonText = 'Chờ cấu hình xác minh';
            else if (!iap.connected) buttonText = 'Đang kết nối cửa hàng';
            else if (!nativeProduct) buttonText = 'Đang đồng bộ giá';
            else if (processing) buttonText = 'Đang xử lý…';
            else buttonText = nativeProduct.displayPrice ? `Mua · ${nativeProduct.displayPrice}` : 'Mua Linh Thạch';
          }

          return <View key={item.id} style={styles.card}>
            <View style={styles.coinCircle}><Ionicons name="diamond-outline" size={23} color="#8F1D3F" /></View>
            <Text style={styles.coins}>{formatCoins(item.coins)} Linh Thạch</Text>
            <Text style={styles.storePrice}>{nativeProduct?.displayPrice || (isWeb ? 'Giá hiển thị trên cửa hàng' : 'Đang tải giá cửa hàng')}</Text>
            <Text style={styles.productId}>{productId || 'Chưa cấu hình product ID'}</Text>
            <Pressable
              disabled={!canBuy}
              onPress={() => { if (productId) void iap.buy(productId); }}
              style={[styles.buyButton, !canBuy && styles.disabledButton]}
            >
              <Text style={[styles.buyButtonText, !canBuy && styles.disabledButtonText]}>{buttonText}</Text>
            </Pressable>
          </View>;
        })}
      </View>

      {!items.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>Chưa có gói Linh Thạch đang hoạt động</Text><Text style={styles.emptyBody}>Quản trị cần cấu hình product catalog trước khi phát hành.</Text></View> : null}

      <View style={styles.safety}>
        <Ionicons name="shield-checkmark-outline" size={21} color="#8F1D3F" />
        <Text style={styles.safetyText}>App không tự cộng Linh Thạch sau khi bấm mua. Google Play/App Store phải xác nhận giao dịch ở server, sau đó hệ thống mới cộng số dư và mới finish/consume giao dịch trên thiết bị.</Text>
      </View>

      <View style={styles.safety}>
        <Ionicons name="return-down-back-outline" size={21} color="#8F1D3F" />
        <Text style={styles.safetyText}>Nếu cửa hàng hoàn hoặc thu hồi giao dịch, hệ thống có cơ chế thu hồi Linh Thạch và ghi nhận phần thiếu thành nợ Linh Thạch thay vì cho số dư âm.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  topTitle: { color: '#221A1D', fontSize: 17, fontWeight: '900' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  page: { padding: 16, paddingBottom: 46, width: '100%', maxWidth: 760, alignSelf: 'center' },
  hero: { backgroundColor: '#741632', borderRadius: 22, padding: 20 },
  kicker: { color: '#EFC5D1', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#FFF', fontSize: 28, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#E8C3CF', fontSize: 11, lineHeight: 17, marginTop: 7 },
  webNotice: { marginTop: 13, backgroundColor: '#F1E4E8', borderRadius: 14, padding: 13, flexDirection: 'row', gap: 9 },
  webNoticeText: { flex: 1, color: '#65575D', fontSize: 10, lineHeight: 16 },
  runtime: { marginTop: 13, borderRadius: 14, padding: 13, flexDirection: 'row', gap: 9, borderWidth: 1 },
  runtimeReady: { backgroundColor: '#EDF4EC', borderColor: '#CBDDC9' },
  runtimeWaiting: { backgroundColor: '#F1E4E8', borderColor: '#E4CDD4' },
  runtimeTitle: { color: '#34282D', fontSize: 11, fontWeight: '900' },
  runtimeBody: { color: '#75696E', fontSize: 9, lineHeight: 14, marginTop: 3 },
  error: { color: '#A12B48', backgroundColor: '#F8E7EC', padding: 10, borderRadius: 10, fontSize: 10, marginTop: 12 },
  success: { color: '#47704D', backgroundColor: '#EDF4EC', padding: 10, borderRadius: 10, fontSize: 10, marginTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 15 },
  card: { width: '48%', flexGrow: 1, minHeight: 204, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', borderRadius: 17, padding: 15, alignItems: 'center' },
  coinCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  coins: { color: '#2B2226', fontSize: 20, fontWeight: '900', marginTop: 10 },
  storePrice: { color: '#8F1D3F', fontSize: 11, fontWeight: '900', textAlign: 'center', marginTop: 5, minHeight: 17 },
  productId: { color: '#8C7F84', fontSize: 8, textAlign: 'center', marginTop: 5, minHeight: 22 },
  buyButton: { width: '100%', minHeight: 39, borderRadius: 11, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center', marginTop: 9, paddingHorizontal: 8 },
  buyButtonText: { color: '#FFF', fontSize: 9, fontWeight: '900', textAlign: 'center' },
  disabledButton: { backgroundColor: '#EADFE2' },
  disabledButtonText: { color: '#9B8990' },
  empty: { minHeight: 140, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 18, marginTop: 15 },
  emptyTitle: { color: '#2D2327', fontSize: 14, fontWeight: '900' },
  emptyBody: { color: '#81757A', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 5 },
  safety: { marginTop: 12, backgroundColor: '#F0E1E5', borderRadius: 14, padding: 13, flexDirection: 'row', gap: 9 },
  safetyText: { flex: 1, color: '#65575D', fontSize: 10, lineHeight: 16 },
});
