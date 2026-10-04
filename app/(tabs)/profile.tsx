import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState } from '../../components/States';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { xianxia } from '../../constants/xianxia';
import { useAuth } from '../../contexts/AuthContext';
import { useMembership } from '../../hooks/useMembership';
import { getUnreadNotificationCount } from '../../services/notifications';
import { getPublicReaderProfile } from '../../services/community';

const menu = [
  ['download-outline', 'Tải xuống', 'Cục bộ', '/downloads'],
  ['color-palette-outline', 'Giao diện & đọc', '', '/settings/reading'],
  ['settings-outline', 'Cài đặt', '', '/settings']
] as const;

export default function ProfileScreen() {
  const router = useRouter(); const { user, profile, loading, configured, logout, error, refreshProfile } = useAuth();
  const membership = useMembership();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [social, setSocial] = useState<{ followers: number; following: number } | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!user) {
      setUnreadNotifications(0);
      setSocial(null);
      return () => { active = false; };
    }
    void Promise.all([getUnreadNotificationCount(), getPublicReaderProfile(user.id)])
      .then(([count, reader]) => {
        if (!active) return;
        setUnreadNotifications(count);
        setSocial(reader ? { followers: reader.followerCount, following: reader.followingCount } : null);
      })
      .catch(() => { if (active) setSocial(null); });
    return () => { active = false; };
  }, [user]));
  if (loading) return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><LoadingState label="Đang khôi phục phiên đăng nhập…" /></SafeAreaView>;
  return <SafeAreaView style={styles.safe} edges={['top']}><XianxiaBackdrop /><ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>ĐẠO HỮU</Text><Text style={styles.title}>Ta</Text><Text style={styles.subtitle}>Hồ sơ, cộng đồng và hành trình trên CHƯƠNG.</Text></View><View style={styles.headerSeal}><Text style={styles.headerSealText}>我</Text></View></View>
    {error ? <Pressable onPress={refreshProfile}><Text style={styles.demo}>{error} · Thử lại</Text></Pressable> : null}
    {!user ? <View style={styles.guest}>
      <View style={styles.guestIcon}><Ionicons name="person-outline" size={28} color={xianxia.jadeDeep} /></View>
      <Text style={styles.guestTitle}>Đọc tự do, đăng nhập khi cần đồng bộ</Text>
      <Text style={styles.guestBody}>Tủ sách và tiến độ ẩn danh vẫn được lưu trên thiết bị này.</Text>
      <View style={styles.authRow}><Pressable style={styles.primary} onPress={() => router.push('/auth/login')}><Text style={styles.primaryText}>Đăng nhập</Text></Pressable><Pressable style={styles.secondary} onPress={() => router.push('/auth/register')}><Text style={styles.secondaryText}>Đăng ký</Text></Pressable></View>
      {!configured && __DEV__ ? <Text style={styles.demo}>DEMO · Chưa cấu hình Supabase</Text> : null}
    </View> : <>
      <Pressable style={styles.profile} onPress={() => router.push('/profile/edit')}>
        {profile?.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} /> : <View style={styles.avatar}><Text style={styles.avatarText}>{(profile?.displayName ?? user.email ?? 'C')[0].toUpperCase()}</Text></View>}
        <View style={{ flex: 1 }}><Text style={styles.name}>{profile?.displayName || 'Độc giả CHƯƠNG'}</Text><Text style={styles.handle}>{profile?.username ? `@${profile.username}` : user.email}</Text><Text style={styles.level}>Mọt Truyện · Cấp độ demo</Text></View>
        <Ionicons name="create-outline" size={19} color="#756B6F" />
      </Pressable>
      {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
      <View style={styles.stats}><View><Text style={styles.statValue}>{social ? social.followers.toLocaleString('vi-VN') : '—'}</Text><Text style={styles.statLabel}>Người theo dõi</Text></View><View><Text style={styles.statValue}>{social ? social.following.toLocaleString('vi-VN') : '—'}</Text><Text style={styles.statLabel}>Đang theo dõi</Text></View><View><Text style={styles.statValue}>{profile?.role === 'admin' ? 'Quản trị' : profile?.role === 'author' ? 'Tác giả' : 'Độc giả'}</Text><Text style={styles.statLabel}>Vai trò</Text></View></View>
      <Pressable style={styles.wallet} onPress={() => router.push('/wallet')}>
        <View style={styles.walletIcon}><Ionicons name="diamond-outline" size={20} color={xianxia.jadeDeep} /></View>
        <View style={{ flex: 1 }}><Text style={styles.walletTitle}>Ví CHƯƠNG</Text><Text style={styles.walletBody}>Số dư Linh Thạch · Lịch sử giao dịch</Text></View>
        <Ionicons name="chevron-forward" size={18} color={xianxia.jade} />
      </Pressable>
      <Pressable style={[styles.premium, membership.isPremium && styles.premiumActive]} onPress={() => router.push('/premium')}>
        <View style={styles.premiumIcon}><Ionicons name="diamond" size={20} color={xianxia.goldSoft} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.premiumTitle}>{membership.isPremium ? 'CHƯƠNG VIP đang hoạt động' : 'Nâng cấp CHƯƠNG VIP'}</Text>
          <Text style={styles.premiumBody}>{membership.isPremium ? '2 GB offline · không quảng cáo · AI dịch toàn truyện' : 'Tăng offline lên 2 GB · bỏ quảng cáo · mở AI dịch truyện'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={xianxia.goldSoft} />
      </Pressable>
      {profile?.role === 'admin' ? <Pressable style={styles.admin} onPress={() => router.push('/admin')}><View style={styles.adminIcon}><Ionicons name="shield-checkmark-outline" size={20} color={xianxia.goldSoft} /></View><View style={{ flex: 1 }}><Text style={styles.adminTitle}>Trung tâm quản trị</Text><Text style={styles.adminBody}>Kho truyện · kiểm duyệt · vận hành nền tảng.</Text></View><Ionicons name="chevron-forward" size={18} color={xianxia.goldSoft} /></Pressable> : null}
    </>}
    <View style={styles.menu}>
      {user ? <>
        <Pressable style={styles.row} onPress={() => router.push('/community')}>
          <Ionicons name="people-outline" size={21} color={xianxia.jadeDeep} />
          <Text style={styles.rowLabel}>Cộng đồng</Text>
          <Text style={styles.rowValue}>Bảng tin & khám phá</Text>
          <Ionicons name="chevron-forward" size={17} color={xianxia.muted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push({ pathname: '/user/[id]', params: { id: user.id } })}>
          <Ionicons name="person-circle-outline" size={21} color={xianxia.jadeDeep} />
          <Text style={styles.rowLabel}>Hồ sơ công khai</Text>
          <Ionicons name="chevron-forward" size={17} color={xianxia.muted} />
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push('/profile/privacy')}>
          <Ionicons name="shield-checkmark-outline" size={21} color={xianxia.jadeDeep} />
          <Text style={styles.rowLabel}>Quyền riêng tư</Text>
          <Ionicons name="chevron-forward" size={17} color={xianxia.muted} />
        </Pressable>
      </> : null}
      <Pressable style={styles.row} onPress={() => router.push('/notifications')}>
        <Ionicons name="notifications-outline" size={21} color={xianxia.jadeDeep} />
        <Text style={styles.rowLabel}>Thông báo</Text>
        {unreadNotifications > 0 ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</Text></View> : null}
        <Ionicons name="chevron-forward" size={17} color={xianxia.muted} />
      </Pressable>
      {menu.map(([icon, label, value, route]) => <Pressable
        accessibilityRole="button"
        style={styles.row}
        key={label}
        onPress={() => router.push(route)}
      >
        <Ionicons name={icon} size={21} color={xianxia.jadeDeep} />
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        <Ionicons name="chevron-forward" size={17} color={xianxia.muted} />
      </Pressable>)}
    </View>
    {user ? <Pressable style={styles.logout} onPress={() => logout().catch((cause) => Alert.alert('Không thể đăng xuất', cause instanceof Error ? cause.message : 'Vui lòng thử lại.'))}><Ionicons name="log-out-outline" size={18} color={xianxia.jadeDeep} /><Text style={styles.logoutText}>Đăng xuất</Text></Pressable> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  page: { padding: 16, paddingBottom: 42, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  eyebrow: { color: xianxia.cinnabar, fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: xianxia.ink, fontSize: 29, fontWeight: '900', marginTop: 3 },
  subtitle: { color: xianxia.muted, fontSize: 9, marginTop: 4 },
  headerSeal: { width: 43, height: 43, borderRadius: 13, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-3deg' }] },
  headerSealText: { color: '#F4DDA8', fontSize: 19, fontWeight: '900' },
  guest: { marginTop: 20, backgroundColor: 'rgba(255,253,247,.88)', borderRadius: 20, borderWidth: 1, borderColor: xianxia.line, padding: 20, alignItems: 'center' },
  guestIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', alignItems: 'center', justifyContent: 'center' },
  guestTitle: { color: xianxia.ink, fontSize: 17, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  guestBody: { color: xianxia.muted, fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  authRow: { flexDirection: 'row', gap: 9, marginTop: 17, width: '100%' },
  primary: { flex: 1, height: 45, backgroundColor: xianxia.jadeDeep, borderRadius: 13, borderWidth: 1, borderColor: '#496A61', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: xianxia.white, fontSize: 11, fontWeight: '900' },
  secondary: { flex: 1, height: 45, borderWidth: 1, borderColor: '#9CB4A5', backgroundColor: xianxia.jadeMist, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: xianxia.jadeDeep, fontSize: 11, fontWeight: '900' },
  demo: { color: xianxia.cinnabar, fontSize: 9, marginTop: 12 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, borderRadius: 19, backgroundColor: 'rgba(255,253,247,.88)', borderWidth: 1, borderColor: xianxia.line, padding: 13 },
  avatar: { width: 56, height: 56, borderRadius: 17, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: '#496A61', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 56, height: 56, borderRadius: 17 },
  avatarText: { color: xianxia.goldSoft, fontSize: 22, fontWeight: '900' },
  name: { color: xianxia.ink, fontSize: 16, fontWeight: '900' },
  handle: { color: xianxia.jade, fontSize: 10, marginTop: 3, fontWeight: '800' },
  level: { color: xianxia.cinnabar, fontSize: 9, marginTop: 4, fontWeight: '800' },
  bio: { color: xianxia.inkSoft, fontSize: 11, lineHeight: 17, marginTop: 11, paddingHorizontal: 4 },
  stats: { marginTop: 12, padding: 15, backgroundColor: 'rgba(255,253,247,.88)', borderRadius: 17, borderWidth: 1, borderColor: xianxia.line, flexDirection: 'row', justifyContent: 'space-around' },
  statValue: { color: xianxia.jadeDeep, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  statLabel: { color: xianxia.muted, fontSize: 8, marginTop: 3, textAlign: 'center' },
  wallet: { marginTop: 12, minHeight: 66, borderRadius: 16, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  walletIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,253,247,.66)', borderWidth: 1, borderColor: '#C8D6CC', alignItems: 'center', justifyContent: 'center' },
  walletTitle: { color: xianxia.ink, fontSize: 12, fontWeight: '900' },
  walletBody: { color: xianxia.jade, fontSize: 9, marginTop: 3 },
  premium: { marginTop: 12, minHeight: 68, borderRadius: 16, backgroundColor: '#6E1832', borderWidth: 1, borderColor: xianxia.gold, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  premiumActive: { backgroundColor: '#27423B' },
  premiumIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(229,209,163,.11)', borderWidth: 1, borderColor: 'rgba(229,209,163,.35)', alignItems: 'center', justifyContent: 'center' },
  premiumTitle: { color: xianxia.white, fontSize: 12, fontWeight: '900' },
  premiumBody: { color: 'rgba(255,253,248,.66)', fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  admin: { marginTop: 12, minHeight: 70, borderRadius: 17, backgroundColor: '#27423B', borderWidth: 1, borderColor: '#4A685F', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  adminIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(229,209,163,.10)', borderWidth: 1, borderColor: 'rgba(229,209,163,.32)', alignItems: 'center', justifyContent: 'center' },
  adminTitle: { color: xianxia.white, fontSize: 12, fontWeight: '900' },
  adminBody: { color: 'rgba(255,253,248,.65)', fontSize: 9, marginTop: 3 },
  menu: { marginTop: 12, backgroundColor: 'rgba(255,253,247,.90)', borderRadius: 17, overflow: 'hidden', borderWidth: 1, borderColor: xianxia.line },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line },
  rowLabel: { flex: 1, color: xianxia.ink, fontSize: 12, fontWeight: '800' },
  rowValue: { color: xianxia.muted, fontSize: 9 },
  notificationBadge: { minWidth: 24, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: xianxia.cinnabar, alignItems: 'center', justifyContent: 'center' },
  notificationBadgeText: { color: xianxia.white, fontSize: 8, fontWeight: '900' },
  logout: { alignSelf: 'center', minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16, marginTop: 12, borderRadius: 13, borderWidth: 1, borderColor: '#E0C1BA', backgroundColor: '#F7E7E3' },
  logoutText: { color: xianxia.cinnabar, fontSize: 10, fontWeight: '900' },
});
