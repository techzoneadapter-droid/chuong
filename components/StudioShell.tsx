import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrandLockup } from './Artwork';
import { xianxia } from '../constants/xianxia';

type StudioNav = 'overview' | 'upload' | 'books';

const nav: { id: StudioNav; label: string; icon: keyof typeof Ionicons.glyphMap; route: string }[] = [
  { id: 'overview', label: 'Tổng quan', icon: 'grid-outline', route: '/studio' },
  { id: 'upload', label: 'Đẩy truyện', icon: 'cloud-upload-outline', route: '/studio/upload' },
  { id: 'books', label: 'Kho truyện', icon: 'library-outline', route: '/studio' },
];

export function StudioShell({
  active,
  title,
  subtitle,
  children,
  actions,
}: {
  active: StudioNav;
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const router = useRouter();

  return <View style={styles.root}>
    <View style={styles.sidebar}>
      <View style={styles.brand}><BrandLockup compact /></View>
      <View style={styles.studioBadge}><Ionicons name="desktop-outline" size={14} color={xianxia.goldSoft} /><Text style={styles.studioBadgeText}>STUDIO QUẢN TRỊ WEB</Text></View>
      <View style={styles.nav}>
        {nav.map((item) => <Pressable
          key={item.id}
          onPress={() => router.push(item.route as never)}
          style={[styles.navItem, active === item.id && styles.navActive]}
        >
          <Ionicons name={item.icon} size={18} color={active === item.id ? xianxia.goldSoft : '#B6C4BE'} />
          <Text style={[styles.navText, active === item.id && styles.navTextActive]}>{item.label}</Text>
        </Pressable>)}
      </View>

      <View style={styles.sidebarSpacer} />

      <Pressable style={styles.sideUtility} onPress={() => router.push('/admin')}>
        <Ionicons name="shield-checkmark-outline" size={17} color="#B6C4BE" />
        <Text style={styles.sideUtilityText}>Quản trị nền tảng</Text>
      </Pressable>
      <Pressable style={styles.sideUtility} onPress={() => router.push('/(tabs)')}>
        <Ionicons name="phone-portrait-outline" size={17} color="#B6C4BE" />
        <Text style={styles.sideUtilityText}>Xem giao diện độc giả</Text>
      </Pressable>
      <Text style={styles.sidebarFoot}>Dữ liệu đồng bộ trực tiếp với app mobile CHƯƠNG.</Text>
    </View>

    <View style={styles.main}>
      <View style={styles.topbar}>
        <View style={styles.topCopy}>
          <Text style={styles.eyebrow}>CHƯƠNG CONTENT STUDIO</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.actions}>{actions}</View>
      </View>

      {Platform.OS !== 'web' ? <View style={styles.webHint}>
        <Ionicons name="information-circle-outline" size={18} color={xianxia.cinnabar} />
        <Text style={styles.webHintText}>Studio này tối ưu cho trình duyệt máy tính. Bạn vẫn có thể dùng trên mobile nhưng bố cục quản trị sẽ phù hợp nhất trên Web.</Text>
      </View> : null}

      <ScrollView style={styles.scroller} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%' as never, backgroundColor: '#F4F0E7', flexDirection: 'row' },
  sidebar: { width: 248, backgroundColor: '#13211E', borderRightWidth: 1, borderRightColor: '#2A3E38', padding: 18, paddingTop: 20 },
  brand: { minHeight: 58, justifyContent: 'center' },
  studioBadge: { alignSelf: 'flex-start', marginTop: 7, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: 'rgba(229,209,163,.08)', borderWidth: 1, borderColor: 'rgba(229,209,163,.28)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  studioBadgeText: { color: xianxia.goldSoft, fontSize: 7.5, fontWeight: '900', letterSpacing: .8 },
  nav: { marginTop: 26, gap: 7 },
  navItem: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  navActive: { backgroundColor: '#24443B', borderWidth: 1, borderColor: '#47665C' },
  navText: { color: '#B6C4BE', fontSize: 10, fontWeight: '800' },
  navTextActive: { color: '#FFF8EA' },
  sidebarSpacer: { flex: 1, minHeight: 30 },
  sideUtility: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 9 },
  sideUtilityText: { color: '#B6C4BE', fontSize: 9, fontWeight: '700' },
  sidebarFoot: { color: '#70837B', fontSize: 7.5, lineHeight: 12, marginTop: 12 },
  main: { flex: 1, minWidth: 0 },
  topbar: { minHeight: 96, paddingHorizontal: 28, paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: '#DDD5C8', backgroundColor: '#FBF8F2', flexDirection: 'row', alignItems: 'center', gap: 18 },
  topCopy: { flex: 1 },
  eyebrow: { color: xianxia.cinnabar, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#251F22', fontSize: 25, lineHeight: 31, fontWeight: '900', marginTop: 3 },
  subtitle: { color: '#756D68', fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scroller: { flex: 1 },
  content: { width: '100%', maxWidth: 1380, alignSelf: 'center', padding: 26, paddingBottom: 60 },
  webHint: { marginHorizontal: 20, marginTop: 14, borderRadius: 12, backgroundColor: '#F6E8E3', borderWidth: 1, borderColor: '#E7CBC3', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  webHintText: { flex: 1, color: '#614C4B', fontSize: 8.5, lineHeight: 13 },
});
