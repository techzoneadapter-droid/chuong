import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ButtonArt } from '../components/Artwork';
import { XianxiaBackdrop } from '../components/XianxiaBackdrop';
import { xianxia } from '../constants/xianxia';
import { useAuth } from '../contexts/AuthContext';
import { useMembership } from '../hooks/useMembership';
import { usePremiumIap } from '../hooks/usePremiumIap';
import { formatOfflineBytes, PREMIUM_OFFLINE_QUOTA_BYTES, STANDARD_OFFLINE_QUOTA_BYTES } from '../services/offlineDownloads';

const benefits = [
  ['cloud-download-outline', '2 GB tải truyện offline', 'Gói Thường giới hạn 100 MB; VIP tăng lên 2 GB.'],
  ['ban-outline', 'Không quảng cáo', 'Ẩn toàn bộ vị trí quảng cáo dành cho người dùng gói Thường.'],
  ['sparkles-outline', 'AI dịch toàn truyện', 'Tác giả VIP có thể AI dịch/làm mượt bản convert theo đúng thể loại truyện.'],
  ['shield-checkmark-outline', 'Quyền VIP kiểm tra ở server', 'Không chỉ ẩn/hiện giao diện; quyền VIP được xác minh lại ở backend.'],
] as const;

export default function PremiumScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const membership = useMembership();
  const billing = usePremiumIap(user?.id ?? '', () => { void membership.refresh(); });
  const isWeb = Platform.OS === 'web';
  const canBuy = Boolean(user && !membership.isPremium && !isWeb && billing.supported && billing.connected && billing.verifierReady && billing.product && !billing.processing);

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable style={styles.icon} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={xianxia.ink} /></Pressable>
      <View style={styles.topCopy}><Text style={styles.kicker}>CHƯƠNG VIP</Text><Text style={styles.topTitle}>Đặc quyền đọc & sáng tác</Text></View>
      <View style={styles.icon} />
    </View>

    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.crown}><Ionicons name="diamond" size={28} color={xianxia.goldSoft} /></View>
        <Text style={styles.heroKicker}>{membership.isPremium ? 'VIP ĐANG HOẠT ĐỘNG' : 'NÂNG CẤP CHƯƠNG VIP'}</Text>
        <Text style={styles.heroTitle}>{membership.isPremium ? 'Bạn đang dùng trọn bộ đặc quyền.' : 'Đọc thoải mái hơn, sáng tác mạnh hơn.'}</Text>
        <Text style={styles.heroBody}>VIP tập trung vào ba lợi ích rõ ràng: nhiều dung lượng offline hơn, không quảng cáo và AI dịch toàn truyện cho tác giả.</Text>
        <View style={styles.planPills}>
          <View style={styles.planPill}><Text style={styles.planPillLabel}>THƯỜNG</Text><Text style={styles.planPillValue}>{formatOfflineBytes(STANDARD_OFFLINE_QUOTA_BYTES)}</Text></View>
          <Ionicons name="arrow-forward" size={18} color={xianxia.goldSoft} />
          <View style={[styles.planPill, styles.planPillVip]}><Text style={styles.planPillLabelVip}>VIP</Text><Text style={styles.planPillValueVip}>{formatOfflineBytes(PREMIUM_OFFLINE_QUOTA_BYTES)}</Text></View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Quyền lợi VIP</Text>
      <View style={styles.list}>
        {benefits.map(([icon, title, body]) => <View style={styles.benefit} key={title}>
          <View style={styles.benefitIcon}><Ionicons name={icon} size={20} color={xianxia.jadeDeep} /></View>
          <View style={{ flex: 1 }}><Text style={styles.benefitTitle}>{title}</Text><Text style={styles.benefitBody}>{body}</Text></View>
          <Ionicons name="checkmark-circle" size={20} color="#527058" />
        </View>)}
      </View>

      <View style={styles.compare}>
        <View style={styles.compareHead}><Text style={styles.compareFeature}>Quyền lợi</Text><Text style={styles.comparePlan}>Thường</Text><Text style={styles.comparePlan}>VIP</Text></View>
        <CompareRow label="Offline" standard="100 MB" premium="2 GB" />
        <CompareRow label="Quảng cáo" standard="Có" premium="Không" />
        <CompareRow label="AI dịch truyện" standard="Không" premium="Có" />
      </View>

      {membership.isPremium ? <View style={styles.activeCard}>
        <Ionicons name="checkmark-circle" size={22} color="#527058" />
        <View style={{ flex: 1 }}><Text style={styles.activeTitle}>CHƯƠNG VIP đang hoạt động</Text><Text style={styles.activeBody}>Quảng cáo đã tắt và quota offline sẽ tự chuyển thành 2 GB trên thiết bị.</Text></View>
      </View> : !user ? <Pressable style={styles.primary} onPress={() => router.push('/auth/login')}>
        <ButtonArt />
        <Ionicons name="log-in-outline" size={18} color={xianxia.goldSoft} />
        <Text style={styles.primaryText}>Đăng nhập để nâng cấp</Text>
      </Pressable> : <View style={styles.purchaseCard}>
        <Text style={styles.purchaseTitle}>Tài khoản hiện tại: Gói Thường</Text>
        <Text style={styles.purchaseBody}>
          {isWeb
            ? 'Vibaocode đang chạy bản Web. Mua thuê bao thật chỉ mở trong build Android/iOS có Google Play Billing hoặc StoreKit.'
            : !billing.verifierReady
              ? 'Server chưa có đủ khóa xác minh cửa hàng nên CHƯƠNG khóa mua an toàn để tránh trừ tiền mà không cấp VIP.'
              : !billing.connected
                ? 'Đang kết nối với cửa hàng trên thiết bị.'
                : billing.product
                  ? `Gói đang nhận từ cửa hàng: ${billing.product.title || 'CHƯƠNG VIP'} · ${billing.product.displayPrice || 'giá do cửa hàng hiển thị'}.`
                  : `Chưa tìm thấy Product ID “${billing.productId}” trên cửa hàng. Hãy tạo đúng gói thuê bao trong Google Play Console / App Store Connect.`}
        </Text>

        {billing.error ? <Text style={styles.billingError}>{billing.error}</Text> : null}
        {billing.success ? <Text style={styles.billingSuccess}>{billing.success}</Text> : null}

        <Pressable disabled={!canBuy} style={[styles.primary, !canBuy && styles.primaryDisabled]} onPress={() => { void billing.buy(); }}>
          <ButtonArt />
          <Ionicons name="diamond-outline" size={18} color={xianxia.goldSoft} />
          <Text style={styles.primaryText}>
            {billing.processing
              ? 'Đang xử lý…'
              : billing.product?.displayPrice
                ? `Đăng ký VIP · ${billing.product.displayPrice}`
                : isWeb
                  ? 'Mua trên Android / iOS'
                  : 'Đăng ký CHƯƠNG VIP'}
          </Text>
        </Pressable>

        {!isWeb ? <Pressable disabled={billing.restoring} style={styles.restore} onPress={() => { void billing.restore(); }}>
          <Ionicons name="refresh-outline" size={16} color={xianxia.jadeDeep} />
          <Text style={styles.restoreText}>{billing.restoring ? 'Đang khôi phục…' : 'Khôi phục giao dịch VIP'}</Text>
        </Pressable> : null}
      </View>}

      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={19} color={xianxia.cinnabar} />
        <Text style={styles.noteText}>Hạ Phẩm và Thượng Phẩm Linh Thạch tách biệt với thuê bao VIP. Số dư ví không thay thế thuê bao VIP.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function CompareRow({ label, standard, premium }: { label: string; standard: string; premium: string }) {
  return <View style={styles.compareRow}><Text style={styles.compareFeature}>{label}</Text><Text style={styles.compareValue}>{standard}</Text><Text style={styles.compareVip}>{premium}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { minHeight: 62, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(244,235,216,.92)' },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  topCopy: { flex: 1, alignItems: 'center' },
  kicker: { color: xianxia.cinnabar, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  topTitle: { color: xianxia.ink, fontSize: 16, fontWeight: '900', marginTop: 2 },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, paddingBottom: 48 },
  hero: { borderRadius: 23, padding: 20, backgroundColor: '#27423B', borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center' },
  crown: { width: 58, height: 58, borderRadius: 18, backgroundColor: 'rgba(229,209,163,.11)', borderWidth: 1, borderColor: 'rgba(229,209,163,.48)', alignItems: 'center', justifyContent: 'center' },
  heroKicker: { color: xianxia.goldSoft, fontSize: 8.5, fontWeight: '900', letterSpacing: 1.3, marginTop: 12 },
  heroTitle: { color: xianxia.white, fontSize: 24, lineHeight: 30, textAlign: 'center', fontWeight: '900', marginTop: 6 },
  heroBody: { color: 'rgba(255,253,248,.68)', fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 7, maxWidth: 430 },
  planPills: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16 },
  planPill: { minWidth: 86, borderRadius: 13, padding: 9, backgroundColor: 'rgba(255,255,255,.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', alignItems: 'center' },
  planPillVip: { backgroundColor: 'rgba(229,209,163,.12)', borderColor: xianxia.gold },
  planPillLabel: { color: 'rgba(255,255,255,.55)', fontSize: 7, fontWeight: '900' },
  planPillValue: { color: '#FFF', fontSize: 12, fontWeight: '900', marginTop: 2 },
  planPillLabelVip: { color: xianxia.goldSoft, fontSize: 7, fontWeight: '900' },
  planPillValueVip: { color: xianxia.goldSoft, fontSize: 12, fontWeight: '900', marginTop: 2 },
  sectionTitle: { color: xianxia.ink, fontSize: 18, fontWeight: '900', marginTop: 22, marginBottom: 10 },
  list: { gap: 8 },
  benefit: { minHeight: 72, borderRadius: 16, padding: 12, backgroundColor: 'rgba(255,253,247,.91)', borderWidth: 1, borderColor: xianxia.line, flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitIcon: { width: 41, height: 41, borderRadius: 13, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', alignItems: 'center', justifyContent: 'center' },
  benefitTitle: { color: xianxia.ink, fontSize: 11.5, fontWeight: '900' },
  benefitBody: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  compare: { marginTop: 20, borderRadius: 17, borderWidth: 1, borderColor: xianxia.line, backgroundColor: 'rgba(255,253,247,.92)', overflow: 'hidden' },
  compareHead: { minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1E9DD' },
  compareRow: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: xianxia.line },
  compareFeature: { flex: 1.4, color: xianxia.ink, fontSize: 9, fontWeight: '900' },
  comparePlan: { flex: 1, color: xianxia.muted, fontSize: 8, fontWeight: '900', textAlign: 'center' },
  compareValue: { flex: 1, color: xianxia.muted, fontSize: 9, fontWeight: '800', textAlign: 'center' },
  compareVip: { flex: 1, color: xianxia.jadeDeep, fontSize: 9, fontWeight: '900', textAlign: 'center' },
  activeCard: { minHeight: 70, marginTop: 18, borderRadius: 16, padding: 13, backgroundColor: '#E8F1E8', borderWidth: 1, borderColor: '#C8D9C7', flexDirection: 'row', gap: 10, alignItems: 'center' },
  activeTitle: { color: '#35583B', fontSize: 11, fontWeight: '900' },
  activeBody: { color: '#627464', fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  purchaseCard: { marginTop: 18, borderRadius: 17, padding: 14, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: xianxia.line },
  purchaseTitle: { color: xianxia.ink, fontSize: 12, fontWeight: '900' },
  purchaseBody: { color: xianxia.muted, fontSize: 9, lineHeight: 14, marginTop: 5 },
  billingError: { color: xianxia.danger, backgroundColor: '#F5E5E1', borderRadius: 10, padding: 9, fontSize: 8.5, lineHeight: 13, marginTop: 10 },
  billingSuccess: { color: '#47704D', backgroundColor: '#E8F3EC', borderRadius: 10, padding: 9, fontSize: 8.5, lineHeight: 13, marginTop: 10 },
  primary: { position: 'relative', overflow: 'hidden', minHeight: 52, borderRadius: 14, paddingHorizontal: 16, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#FFF8EA', fontSize: 10.5, fontWeight: '900' },
  primaryDisabled: { opacity: .48 },
  restore: { minHeight: 42, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: '#B8CBBF', backgroundColor: xianxia.jadeMist, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  restoreText: { color: xianxia.jadeDeep, fontSize: 9, fontWeight: '900' },
  note: { marginTop: 13, borderRadius: 14, padding: 12, backgroundColor: '#F4E5E1', borderWidth: 1, borderColor: '#E6CBC4', flexDirection: 'row', gap: 9 },
  noteText: { flex: 1, color: xianxia.inkSoft, fontSize: 8.5, lineHeight: 13 },
});
