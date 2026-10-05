import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { ArtIcon } from '../../components/Artwork';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { artwork } from '../../constants/artwork';
import { xianxia } from '../../constants/xianxia';
import { useAuth } from '../../contexts/AuthContext';
import {
  AppNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationCategoryLabel,
} from '../../services/notifications';

export default function NotificationsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth/login');
      return;
    }

    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setItems(await getNotifications({ unreadOnly: filter === 'unread', limit: 150 }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải thông báo.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, filter, router, user]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const unreadCount = useMemo(() => items.filter((item) => !item.read_at).length, [items]);

  const openItem = async (item: AppNotification) => {
    try {
      if (!item.read_at) await markNotificationRead(item.id);
    } catch {
      // Reading should not block navigation.
    }
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: entry.read_at || new Date().toISOString() } : entry));
    if (item.action_route) router.push(item.action_route as never);
  };

  const markAll = async () => {
    setBusy(true);
    setError('');
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đánh dấu tất cả đã đọc.');
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || (loading && !items.length && !error)) {
    return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><LoadingState label="Đang tải thông báo…" /></SafeAreaView>;
  }
  if (!user) return null;
  if (error && !items.length) {
    return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;
  }

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={21} color={xianxia.ink} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.topTitle}>Thông báo</Text>
        <Text style={styles.topSub}>{unreadCount ? String(unreadCount) + ' chưa đọc' : 'Bạn đã đọc hết'}</Text>
      </View>
      <Pressable style={styles.iconButton} onPress={() => router.push('/notifications/settings')}>
        <Ionicons name="settings-outline" size={20} color={xianxia.jadeDeep} />
      </Pressable>
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.filterRow}>
        <Pressable onPress={() => setFilter('all')} style={[styles.filter, filter === 'all' && styles.filterActive]}>
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>Tất cả</Text>
        </Pressable>
        <Pressable onPress={() => setFilter('unread')} style={[styles.filter, filter === 'unread' && styles.filterActive]}>
          <Text style={[styles.filterText, filter === 'unread' && styles.filterTextActive]}>Chưa đọc</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable disabled={busy || unreadCount === 0} onPress={() => { void markAll(); }}>
          <Text style={[styles.markAll, (busy || unreadCount === 0) && styles.markAllDisabled]}>Đọc tất cả</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!items.length ? <View style={styles.empty}>
        <ArtIcon source={artwork.lotus} size={76} />
        <View style={styles.emptyIcon}><Ionicons name="notifications-outline" size={28} color={xianxia.jadeDeep} /></View>
        <Text style={styles.emptyTitle}>{filter === 'unread' ? 'Không còn thông báo chưa đọc' : 'Chưa có thông báo'}</Text>
        <Text style={styles.emptyBody}>Chương mới, doanh thu, Hạ Phẩm · Thượng Phẩm, bình luận, kiểm duyệt và thanh toán tác giả sẽ xuất hiện tại đây.</Text>
      </View> : items.map((item) => <Pressable key={item.id} onPress={() => { void openItem(item); }} style={[styles.item, !item.read_at && styles.itemUnread]}>
        <View style={[styles.categoryIcon, categoryStyle(item.category).background]}>
          <Ionicons name={categoryStyle(item.category).icon} size={20} color={categoryStyle(item.category).color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.itemHead}>
            <Text style={styles.category}>{notificationCategoryLabel(item.category)}</Text>
            <Text style={styles.time}>{formatNotificationTime(item.created_at)}</Text>
          </View>
          <Text style={[styles.itemTitle, !item.read_at && styles.itemTitleUnread]}>{item.title}</Text>
          <Text style={styles.itemBody}>{item.body}</Text>
        </View>
        {!item.read_at ? <View style={styles.unreadDot} /> : item.action_route ? <Ionicons name="chevron-forward" size={16} color={xianxia.muted} /> : null}
      </Pressable>)}
    </ScrollView>
  </SafeAreaView>;
}

function categoryStyle(category: string): { icon: keyof typeof Ionicons.glyphMap; color: string; background: object } {
  if (category === 'purchase') return { icon: 'diamond-outline', color: '#8F1D3F', background: { backgroundColor: '#F1E2E7' } };
  if (category === 'author_earnings') return { icon: 'stats-chart-outline', color: '#47704D', background: { backgroundColor: '#E8F0E7' } };
  if (category === 'payout') return { icon: 'cash-outline', color: '#9B6A22', background: { backgroundColor: '#F6EFE3' } };
  if (category === 'comment') return { icon: 'chatbubble-ellipses-outline', color: '#4D668C', background: { backgroundColor: '#E8EDF4' } };
  if (category === 'moderation') return { icon: 'shield-checkmark-outline', color: '#8F1D3F', background: { backgroundColor: '#F8E7EC' } };
  if (category === 'release') return { icon: 'book-outline', color: '#315247', background: { backgroundColor: '#E4EFE8' } };
  return { icon: 'sparkles-outline', color: '#6D6570', background: { backgroundColor: '#EEE9EB' } };
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Vừa xong';
  if (diff < hour) return String(Math.floor(diff / minute)) + ' phút';
  if (diff < day) return String(Math.floor(diff / hour)) + ' giờ';
  if (diff < 7 * day) return String(Math.floor(diff / day)) + ' ngày';
  return date.toLocaleDateString('vi-VN');
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(244,235,216,.90)' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: xianxia.ink, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  topSub: { color: xianxia.muted, fontSize: 9, textAlign: 'center', marginTop: 2 },
  page: { padding: 14, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  filterRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  filter: { minHeight: 34, borderRadius: 999, borderWidth: 1, borderColor: xianxia.line, backgroundColor: 'rgba(255,248,234,.92)', paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  filterActive: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.gold },
  filterText: { color: xianxia.inkSoft, fontSize: 10, fontWeight: '800' },
  filterTextActive: { color: xianxia.goldSoft },
  markAll: { color: xianxia.cinnabar, fontSize: 10, fontWeight: '900' },
  markAllDisabled: { opacity: .4 },
  error: { color: xianxia.danger, backgroundColor: '#F5E5E1', borderWidth: 1, borderColor: '#E2C2BA', padding: 10, borderRadius: 10, fontSize: 10, marginBottom: 10 },
  item: { minHeight: 88, borderRadius: 16, borderWidth: 1, borderColor: xianxia.line, backgroundColor: 'rgba(255,248,234,.94)', padding: 12, marginBottom: 9, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemUnread: { borderColor: '#9EB7A7', backgroundColor: '#F4F5E9' },
  categoryIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  category: { color: xianxia.cinnabar, fontSize: 8, fontWeight: '900', letterSpacing: .5, textTransform: 'uppercase' },
  time: { color: xianxia.muted, fontSize: 8 },
  itemTitle: { color: xianxia.inkSoft, fontSize: 12, fontWeight: '800', marginTop: 5 },
  itemTitleUnread: { color: xianxia.ink, fontWeight: '900' },
  itemBody: { color: xianxia.muted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: xianxia.cinnabar, marginTop: 4 },
  empty: { minHeight: 300, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', alignItems: 'center', justifyContent: 'center', marginTop: -8 },
  emptyTitle: { color: xianxia.ink, fontSize: 16, fontWeight: '900', marginTop: 14 },
  emptyBody: { color: xianxia.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 6 },
});
