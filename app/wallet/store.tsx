import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { formatCoins } from '../../services/wallet';
import { getStoreProducts, nativeStoreProvider, productIdForPlatform, StoreProduct } from '../../services/store';

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
      setError(cause instanceof Error ? cause.message : 'Không thể tải các gói Xu.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth/login');
  }, [authLoading, router, user]);

  useEffect(() => {
    if (user) void load();
  }, [load, user]);

  if (authLoading || (loading && user)) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải cửa hàng Xu…" /></SafeAreaView>;
  if (!user) return null;
  if (error && !items.length) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;

  const provider = nativeStoreProvider();
  const isWeb = Platform.OS === 'web';

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2E2428" /></Pressable>
      <Text style={styles.topTitle}>Nạp CHƯƠNG Xu</Text>
      <View style={styles.iconButton} />
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>CHƯƠNG XU</Text>
        <Text style={styles.title}>Chọn gói Xu</Text>
        <Text style={styles.subtitle}>Xu dùng để mở khóa truyện và chương VIP. Giá tiền thật sẽ do Google Play hoặc App Store hiển thị theo cửa hàng của người dùng.</Text>
      </View>

      {isWeb ? <View style={styles.webNotice}>
        <Ionicons name="desktop-outline" size={20} color="#8F1D3F" />
        <Text style={styles.webNoticeText}>Vibaocode đang chạy bản web nên chỉ xem được catalog. Thanh toán thật chỉ bật trong build Android/iOS sau khi nối native billing và xác minh receipt phía server.</Text>
      </View> : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.grid}>
        {items.map((item) => {
          const productId = productIdForPlatform(item);
          return <View key={item.id} style={styles.card}>
            <View style={styles.coinCircle}><Ionicons name="diamond-outline" size={23} color="#8F1D3F" /></View>
            <Text style={styles.coins}>{formatCoins(item.coins)} Xu</Text>
            <Text style={styles.productId}>{productId || 'Chưa cấu hình product ID'}</Text>
            <Pressable disabled style={styles.disabledButton}>
              <Text style={styles.disabledButtonText}>{provider ? 'Đang chờ native billing' : 'Chỉ khả dụng trên Android/iOS'}</Text>
            </Pressable>
          </View>;
        })}
      </View>

      {!items.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>Chưa có gói Xu đang hoạt động</Text><Text style={styles.emptyBody}>Quản trị cần cấu hình product catalog trước khi phát hành.</Text></View> : null}

      <View style={styles.safety}>
        <Ionicons name="shield-checkmark-outline" size={21} color="#8F1D3F" />
        <Text style={styles.safetyText}>App không tự cộng Xu sau khi bấm mua. Receipt phải được xác minh phía server trước; cùng một transaction không thể được cộng hai lần.</Text>
      </View>

      <View style={styles.safety}>
        <Ionicons name="return-down-back-outline" size={21} color="#8F1D3F" />
        <Text style={styles.safetyText}>Nếu cửa hàng hoàn/hủy giao dịch sau này, hệ thống có cơ chế thu hồi Xu và ghi nhận phần thiếu thành nợ Xu thay vì cho số dư âm.</Text>
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
  error: { color: '#A12B48', backgroundColor: '#F8E7EC', padding: 10, borderRadius: 10, fontSize: 10, marginTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 15 },
  card: { width: '48%', flexGrow: 1, minHeight: 180, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', borderRadius: 17, padding: 15, alignItems: 'center' },
  coinCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  coins: { color: '#2B2226', fontSize: 20, fontWeight: '900', marginTop: 10 },
  productId: { color: '#8C7F84', fontSize: 8, textAlign: 'center', marginTop: 6, minHeight: 24 },
  disabledButton: { width: '100%', minHeight: 39, borderRadius: 11, backgroundColor: '#EADFE2', alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingHorizontal: 8 },
  disabledButtonText: { color: '#9B8990', fontSize: 9, fontWeight: '800', textAlign: 'center' },
  empty: { minHeight: 140, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 18, marginTop: 15 },
  emptyTitle: { color: '#2D2327', fontSize: 14, fontWeight: '900' },
  emptyBody: { color: '#81757A', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 5 },
  safety: { marginTop: 12, backgroundColor: '#F0E1E5', borderRadius: 14, padding: 13, flexDirection: 'row', gap: 9 },
  safetyText: { flex: 1, color: '#65575D', fontSize: 10, lineHeight: 16 },
});
