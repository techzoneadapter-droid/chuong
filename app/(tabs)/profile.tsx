import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { getUnreadNotificationCount } from '../../services/notifications';

const menu = [
  ['download-outline', 'Tải xuống', 'Cục bộ'],
  ['color-palette-outline', 'Giao diện & đọc', ''],
  ['settings-outline', 'Cài đặt', '']
] as const;

export default function ProfileScreen() {
  const router = useRouter(); const { user, profile, loading, configured, logout, error, refreshProfile } = useAuth();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!user) {
      setUnreadNotifications(0);
      return () => { active = false; };
    }
    void getUnreadNotificationCount().then((count) => { if (active) setUnreadNotifications(count); });
    return () => { active = false; };
  }, [user]));
  if (loading) return <SafeAreaView style={styles.safe}><LoadingState label="Đang khôi phục phiên đăng nhập…" /></SafeAreaView>;
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.title}>Tôi</Text>
    {error ? <Pressable onPress={refreshProfile}><Text style={styles.demo}>{error} · Thử lại</Text></Pressable> : null}
    {!user ? <View style={styles.guest}>
      <View style={styles.guestIcon}><Ionicons name="person-outline" size={29} color="#8F1D3F" /></View>
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
      <View style={styles.stats}><View><Text style={styles.statValue}>—</Text><Text style={styles.statLabel}>Theo dõi</Text></View><View><Text style={styles.statValue}>—</Text><Text style={styles.statLabel}>Chương tuần</Text></View><View><Text style={styles.statValue}>{profile?.role === 'admin' ? 'Quản trị' : profile?.role === 'author' ? 'Tác giả' : 'Độc giả'}</Text><Text style={styles.statLabel}>Vai trò</Text></View></View>
      <Pressable style={styles.wallet} onPress={() => router.push('/wallet')}>
        <View style={styles.walletIcon}><Ionicons name="wallet-outline" size={20} color="#8F1D3F" /></View>
        <View style={{ flex: 1 }}><Text style={styles.walletTitle}>Ví CHƯƠNG</Text><Text style={styles.walletBody}>Số dư Linh Thạch · Lịch sử giao dịch</Text></View>
        <Ionicons name="chevron-forward" size={18} color="#8F1D3F" />
      </Pressable>
      {profile?.role === 'admin' ? <Pressable style={styles.admin} onPress={() => router.push('/admin')}><Ionicons name="shield-checkmark-outline" size={20} color="#FFFFFF" /><View style={{ flex: 1 }}><Text style={styles.adminTitle}>Trung tâm quản trị</Text><Text style={styles.adminBody}>Kiểm duyệt báo cáo, bản quyền và nội dung.</Text></View><Ionicons name="chevron-forward" size={18} color="#FFFFFF" /></Pressable> : null}
    </>}
    <View style={styles.menu}>
      <Pressable style={styles.row} onPress={() => router.push('/notifications')}>
        <Ionicons name="notifications-outline" size={21} color="#8F1D3F" />
        <Text style={styles.rowLabel}>Thông báo</Text>
        {unreadNotifications > 0 ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</Text></View> : null}
        <Ionicons name="chevron-forward" size={17} color="#B2A6AB" />
      </Pressable>
      {menu.map(([icon, label, value]) => <Pressable
        style={styles.row}
        key={label}
        disabled={label !== 'Tải xuống'}
        onPress={() => label === 'Tải xuống' && router.push('/downloads')}
      >
        <Ionicons name={icon} size={21} color="#8F1D3F" />
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        <Ionicons name="chevron-forward" size={17} color="#B2A6AB" />
      </Pressable>)}
    </View>
    {user ? <Pressable style={styles.logout} onPress={() => logout().catch((cause) => Alert.alert('Không thể đăng xuất', cause instanceof Error ? cause.message : 'Vui lòng thử lại.'))}><Ionicons name="log-out-outline" size={18} color="#8F1D3F" /><Text style={styles.logoutText}>Đăng xuất</Text></Pressable> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' }, page: { padding: 16, paddingBottom: 42, width: '100%', maxWidth: 720, alignSelf: 'center' }, title: { color: '#221A1D', fontSize: 30, fontWeight: '900', marginTop: 8 },
  guest: { marginTop: 20, backgroundColor: '#FFFDFC', borderRadius: 20, borderWidth: 1, borderColor: '#E9DDD6', padding: 20, alignItems: 'center' }, guestIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' }, guestTitle: { color: '#221A1D', fontSize: 17, fontWeight: '900', textAlign: 'center', marginTop: 12 }, guestBody: { color: '#756B6F', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 }, authRow: { flexDirection: 'row', gap: 9, marginTop: 17, width: '100%' }, primary: { flex: 1, height: 45, backgroundColor: '#8F1D3F', borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFF', fontSize: 12, fontWeight: '900' }, secondary: { flex: 1, height: 45, borderWidth: 1, borderColor: '#8F1D3F', borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: '#8F1D3F', fontSize: 12, fontWeight: '900' }, demo: { color: '#9A8E93', fontSize: 9, marginTop: 12 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 }, avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' }, avatarImage: { width: 56, height: 56, borderRadius: 28 }, avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' }, name: { color: '#221A1D', fontSize: 17, fontWeight: '900' }, handle: { color: '#8F1D3F', fontSize: 11, marginTop: 3 }, level: { color: '#756B6F', fontSize: 11, marginTop: 3 }, bio: { color: '#554A4E', fontSize: 12, lineHeight: 18, marginTop: 13 }, stats: { marginTop: 20, padding: 16, backgroundColor: '#FFFDFC', borderRadius: 16, borderWidth: 1, borderColor: '#E9DDD6', flexDirection: 'row', justifyContent: 'space-between' }, statValue: { color: '#221A1D', fontSize: 16, fontWeight: '900', textAlign: 'center' }, statLabel: { color: '#756B6F', fontSize: 10, marginTop: 3, textAlign: 'center' },
  wallet: { marginTop: 14, minHeight: 66, borderRadius: 16, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E9DDD6', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 }, walletIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' }, walletTitle: { color: '#2D2327', fontSize: 13, fontWeight: '900' }, walletBody: { color: '#796D72', fontSize: 10, marginTop: 3 },
  admin: { marginTop: 14, minHeight: 66, borderRadius: 16, backgroundColor: '#8F1D3F', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 }, adminTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' }, adminBody: { color: '#F2CED9', fontSize: 10, marginTop: 3 },
  menu: { marginTop: 14, backgroundColor: '#FFFDFC', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E9DDD6' }, row: { minHeight: 55, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E9DDD6' }, rowLabel: { flex: 1, color: '#221A1D', fontSize: 14, fontWeight: '700' }, rowValue: { color: '#756B6F', fontSize: 12 }, notificationBadge: { minWidth: 24, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' }, notificationBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' }, logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 16, marginTop: 8 }, logoutText: { color: '#8F1D3F', fontSize: 12, fontWeight: '900' }
});
