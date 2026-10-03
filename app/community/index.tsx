import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import {
  CommunityActivity,
  ReaderSearchItem,
  getCommunityFeed,
  searchPublicReaders,
  setReaderFollow,
} from '../../services/community';

type Mode = 'feed' | 'discover';

export default function CommunityScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('feed');
  const [feed, setFeed] = useState<CommunityActivity[]>([]);
  const [readers, setReaders] = useState<ReaderSearchItem[]>([]);
  const [query, setQuery] = useState('');
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingReaders, setLoadingReaders] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [pendingFollow, setPendingFollow] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    if (!user) {
      setFeed([]);
      setLoadingFeed(false);
      return;
    }
    setLoadingFeed(true);
    try {
      setFeed(await getCommunityFeed(50));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải bảng tin.');
    } finally {
      setLoadingFeed(false);
    }
  }, [user]);

  const loadReaders = useCallback(async (value = query) => {
    setLoadingReaders(true);
    try {
      setReaders(await searchPublicReaders(value.trim(), 30));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải độc giả.');
    } finally {
      setLoadingReaders(false);
    }
  }, [query]);

  useFocusEffect(useCallback(() => {
    void loadFeed();
    void loadReaders('');
  }, [loadFeed, loadReaders]));

  useEffect(() => {
    const timer = setTimeout(() => { void loadReaders(query); }, 300);
    return () => clearTimeout(timer);
  }, [query, loadReaders]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadFeed(), loadReaders(query)]);
    setRefreshing(false);
  };

  const toggleFollow = async (reader: ReaderSearchItem) => {
    if (!user) return router.push('/auth/login');
    if (pendingFollow) return;
    const next = !reader.viewerFollows;
    setPendingFollow(reader.id);
    setReaders((items) => items.map((item) => item.id === reader.id ? {
      ...item,
      viewerFollows: next,
      followerCount: Math.max(0, item.followerCount + (next ? 1 : -1)),
    } : item));
    try {
      await setReaderFollow(reader.id, next);
      if (next) await loadFeed();
    } catch (cause) {
      setReaders((items) => items.map((item) => item.id === reader.id ? reader : item));
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật theo dõi.');
    } finally {
      setPendingFollow(null);
    }
  };

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color="#2D2327" />
      </Pressable>
      <Text style={styles.topTitle}>Cộng đồng</Text>
      <Pressable style={styles.iconButton} onPress={() => { void refresh(); }}>
        <Ionicons name="refresh" size={20} color="#8F1D3F" />
      </Pressable>
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.tabs}>
        <Pressable onPress={() => setMode('feed')} style={[styles.tab, mode === 'feed' && styles.tabActive]}>
          <Ionicons name="people-outline" size={17} color={mode === 'feed' ? '#FFF' : '#8F1D3F'} />
          <Text style={[styles.tabText, mode === 'feed' && styles.tabTextActive]}>Bảng tin</Text>
        </Pressable>
        <Pressable onPress={() => setMode('discover')} style={[styles.tab, mode === 'discover' && styles.tabActive]}>
          <Ionicons name="search-outline" size={17} color={mode === 'discover' ? '#FFF' : '#8F1D3F'} />
          <Text style={[styles.tabText, mode === 'discover' && styles.tabTextActive]}>Khám phá độc giả</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {mode === 'feed' ? <>
        {!user ? <View style={styles.guestCard}>
          <View style={styles.heroIcon}><Ionicons name="people" size={26} color="#8F1D3F" /></View>
          <Text style={styles.guestTitle}>Bảng tin dành cho người bạn theo dõi</Text>
          <Text style={styles.guestBody}>Đăng nhập để xem đánh giá và bình luận công khai từ những độc giả bạn chọn theo dõi.</Text>
          <Pressable style={styles.primary} onPress={() => router.push('/auth/login')}><Text style={styles.primaryText}>Đăng nhập</Text></Pressable>
        </View> : loadingFeed ? <LoadingState label="Đang tải bảng tin cộng đồng…" /> : feed.length === 0 ? <View>
          <EmptyState title="Bảng tin còn trống" detail="Theo dõi một vài độc giả ở mục Khám phá để thấy hoạt động công khai của họ tại đây." />
          <Pressable style={styles.secondaryCta} onPress={() => setMode('discover')}><Text style={styles.secondaryCtaText}>Khám phá độc giả</Text></Pressable>
        </View> : feed.map((item) => <ActivityCard key={item.activityType + ':' + item.activityId} item={item} onUser={() => router.push({ pathname: '/user/[id]', params: { id: item.actorUserId } })} onBook={() => router.push({ pathname: '/book/[id]', params: { id: item.bookId } })} />)}
      </> : <>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#8A7E82" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm theo tên hoặc @username"
            placeholderTextColor="#A2979B"
            style={styles.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query ? <Pressable onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color="#A2979B" /></Pressable> : null}
        </View>

        {loadingReaders ? <LoadingState label="Đang tìm độc giả…" /> : readers.length === 0 ? <EmptyState title="Chưa tìm thấy độc giả" detail="Thử tên hiển thị hoặc username khác." /> : readers.map((reader) => <View key={reader.id} style={styles.readerCard}>
          <Pressable style={styles.readerMain} onPress={() => router.push({ pathname: '/user/[id]', params: { id: reader.id } })}>
            {reader.avatarUrl ? <Image source={{ uri: reader.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{(reader.displayName || reader.username || 'C')[0].toUpperCase()}</Text></View>}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.readerName}>{reader.displayName || reader.username || 'Độc giả CHƯƠNG'}</Text>
              <Text style={styles.readerMeta}>{reader.username ? '@' + reader.username + ' · ' : ''}{reader.followerCount.toLocaleString('vi-VN')} người theo dõi</Text>
              {reader.bio ? <Text numberOfLines={2} style={styles.readerBio}>{reader.bio}</Text> : null}
            </View>
          </Pressable>
          <Pressable disabled={pendingFollow === reader.id} onPress={() => { void toggleFollow(reader); }} style={[styles.followButton, reader.viewerFollows && styles.followingButton]}>
            <Text style={[styles.followText, reader.viewerFollows && styles.followingText]}>{reader.viewerFollows ? 'Đang theo dõi' : 'Theo dõi'}</Text>
          </Pressable>
        </View>)}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

function ActivityCard({ item, onUser, onBook }: { item: CommunityActivity; onUser: () => void; onBook: () => void }) {
  const name = item.actorName || 'Độc giả CHƯƠNG';
  return <View style={styles.activityCard}>
    <View style={styles.activityTop}>
      <Pressable onPress={onUser}>
        {item.actorAvatarUrl ? <Image source={{ uri: item.actorAvatarUrl }} style={styles.activityAvatar} /> : <View style={styles.activityAvatarFallback}><Text style={styles.activityAvatarText}>{name[0]?.toUpperCase() || 'C'}</Text></View>}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Pressable onPress={onUser}><Text style={styles.activityName}>{name}</Text></Pressable>
        <Text style={styles.activityMeta}>{item.activityType === 'review' ? 'đã đánh giá' : 'đã bình luận'} · {new Date(item.createdAt).toLocaleString('vi-VN')}</Text>
      </View>
      <View style={styles.kindBadge}><Ionicons name={item.activityType === 'review' ? 'star-outline' : 'chatbubble-outline'} size={14} color="#8F1D3F" /></View>
    </View>
    <Pressable onPress={onBook}>
      <Text style={styles.bookLink}>{item.bookTitle}</Text>
      {item.rating ? <Text style={styles.stars}>{'★'.repeat(Math.max(1, Math.min(5, item.rating)))}</Text> : null}
      <Text numberOfLines={5} style={styles.activityBody}>{item.body || (item.rating ? 'Chỉ chấm điểm, không viết cảm nhận.' : '')}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { height: 58, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', color: '#251D20', fontSize: 17, fontWeight: '900' },
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 48 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: { flex: 1, height: 42, borderRadius: 13, borderWidth: 1, borderColor: '#DCCEC7', backgroundColor: '#FFFDFC', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  tabActive: { backgroundColor: '#8F1D3F', borderColor: '#8F1D3F' },
  tabText: { color: '#8F1D3F', fontSize: 11, fontWeight: '900' },
  tabTextActive: { color: '#FFF' },
  error: { color: '#A12B48', backgroundColor: '#F7E7EC', borderRadius: 12, padding: 10, fontSize: 10, marginBottom: 10 },
  guestCard: { marginTop: 8, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', borderRadius: 20, padding: 22, alignItems: 'center' },
  heroIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  guestTitle: { color: '#2B2226', fontSize: 17, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  guestBody: { color: '#796D72', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 7 },
  primary: { height: 44, paddingHorizontal: 28, borderRadius: 13, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  primaryText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  secondaryCta: { alignSelf: 'center', marginTop: 10, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#8F1D3F' },
  secondaryCtaText: { color: '#8F1D3F', fontSize: 10, fontWeight: '900' },
  searchBox: { height: 46, borderRadius: 14, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E2D5CE', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  searchInput: { flex: 1, color: '#2D2327', fontSize: 12, outlineStyle: 'none' } as never,
  readerCard: { backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', borderRadius: 16, padding: 12, marginBottom: 9 },
  readerMain: { flexDirection: 'row', gap: 11, alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontWeight: '900', fontSize: 17 },
  readerName: { color: '#2B2226', fontSize: 13, fontWeight: '900' },
  readerMeta: { color: '#8F1D3F', fontSize: 9, marginTop: 3 },
  readerBio: { color: '#7A6E73', fontSize: 9, lineHeight: 13, marginTop: 5 },
  followButton: { alignSelf: 'flex-end', marginTop: 10, minWidth: 96, height: 34, borderRadius: 11, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' },
  followingButton: { backgroundColor: '#F0E1E5', borderWidth: 1, borderColor: '#D8BAC3' },
  followText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  followingText: { color: '#8F1D3F' },
  activityCard: { backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', borderRadius: 17, padding: 14, marginBottom: 10 },
  activityTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activityAvatar: { width: 42, height: 42, borderRadius: 21 },
  activityAvatarFallback: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' },
  activityAvatarText: { color: '#FFF', fontSize: 15, fontWeight: '900' },
  activityName: { color: '#2B2226', fontSize: 12, fontWeight: '900' },
  activityMeta: { color: '#8A7E82', fontSize: 8, marginTop: 3 },
  kindBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  bookLink: { color: '#8F1D3F', fontSize: 12, fontWeight: '900', marginTop: 11 },
  stars: { color: '#B9842E', fontSize: 12, letterSpacing: 1, marginTop: 5 },
  activityBody: { color: '#4F4448', fontSize: 11, lineHeight: 17, marginTop: 7 },
});
