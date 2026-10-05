import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FollowedUpdateCard } from '../components/FollowedUpdateCard';
import { EmptyState, LoadingState, RetryState } from '../components/States';
import { XianxiaBackdrop } from '../components/XianxiaBackdrop';
import { xianxia } from '../constants/xianxia';
import { useAuth } from '../contexts/AuthContext';
import { FollowedBookUpdate, getFollowedBookUpdates, getFollowedUpdateBadge } from '../services/followedUpdates';

const PAGE_SIZE = 20;

export default function UpdatesScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<FollowedBookUpdate[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const offset = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    busy.current = false; offset.current = 0;
    setItems([]); setTotal(null); setHasMore(false); setLoadingMore(false);
    setError(''); setMoreError('');
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const [rows, badge] = await Promise.all([getFollowedBookUpdates(PAGE_SIZE), getFollowedUpdateBadge()]);
      if (request !== generation.current) return;
      offset.current = rows.length;
      setItems(rows); setTotal(badge.unread_chapters); setHasMore(rows.length === PAGE_SIZE);
    } catch {
      if (request === generation.current) setError('Không thể tải cập nhật truyện. Vui lòng thử lại.');
    } finally { if (request === generation.current) setLoading(false); }
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { ++generation.current; };
  }, [refresh]));

  const loadMore = async () => {
    if (busy.current || loading || !hasMore || !user) return;
    busy.current = true; setLoadingMore(true); setMoreError('');
    const request = generation.current;
    try {
      const rows = await getFollowedBookUpdates(PAGE_SIZE, offset.current);
      if (request !== generation.current) return;
      offset.current += rows.length;
      setItems((old) => [...old, ...rows.filter((row) => !old.some((item) => item.book_id === row.book_id))]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch { if (request === generation.current) setMoreError('Không thể tải thêm truyện.'); }
    finally { if (request === generation.current) { busy.current = false; setLoadingMore(false); } }
  };

  return <SafeAreaView style={styles.safe}>
    <XianxiaBackdrop />
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" hitSlop={12} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
        <Ionicons name="arrow-back" size={24} color={xianxia.ink} />
      </Pressable>
      <View style={{ flex: 1 }}><Text style={styles.title}>Cập nhật truyện</Text><Text style={styles.subtitle}>Chương mới từ những truyện bạn đang theo dõi</Text></View>
    </View>
    {authLoading ? <LoadingState /> : !user ? <View>
      <EmptyState title="Đăng nhập để xem cập nhật" detail="Theo dõi truyện yêu thích để xem chương mới và tiếp tục đọc." />
      <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.push('/auth/login')}><Text style={styles.actionText}>Đăng nhập</Text></Pressable>
    </View> : loading ? <LoadingState label="Đang tải cập nhật truyện…" /> : error ? <RetryState detail={error} onRetry={() => void refresh()} /> : <FlatList
      data={items} keyExtractor={(item) => item.book_id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <FollowedUpdateCard item={item} />}
      refreshing={loading} onRefresh={() => void refresh()}
      ListHeaderComponent={total != null ? <Text style={styles.subtitle}>{total} chương mới</Text> : null}
      ListEmptyComponent={<EmptyState title="Chưa có truyện đang theo dõi" detail="Theo dõi truyện công khai để nhận cập nhật tại đây." />}
      ListFooterComponent={loadingMore ? <LoadingState label="Đang tải thêm…" /> : moreError ? <RetryState detail={moreError} onRetry={() => void loadMore()} /> : hasMore ?
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => void loadMore()}><Text style={styles.actionText}>Tải thêm</Text></Pressable> : items.length ?
          <Text style={styles.end}>Đã hiển thị tất cả truyện đang theo dõi</Text> : null}
    />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18 },
  title: { color: xianxia.ink, fontSize: 22, fontWeight: '900' },
  subtitle: { color: xianxia.muted, fontSize: 13, lineHeight: 20 },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  action: { padding: 14, alignItems: 'center' },
  actionText: { color: xianxia.jadeDeep, fontWeight: '800', fontSize: 15 },
  end: { color: xianxia.muted, textAlign: 'center', padding: 16, fontSize: 12 },
});
