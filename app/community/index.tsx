import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState, RetryState } from '../../components/States';
import { ArtIcon, ButtonArt } from '../../components/Artwork';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { artwork } from '../../constants/artwork';
import { xianxia } from '../../constants/xianxia';
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
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={21} color={xianxia.ink} />
      </Pressable>
      <Text style={styles.topTitle}>Cộng đồng</Text>
      <Pressable style={styles.iconButton} onPress={() => { void refresh(); }}>
        <Ionicons name="refresh" size={20} color={xianxia.jadeDeep} />
      </Pressable>
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.tabs}>
        <Pressable onPress={() => setMode('feed')} style={[styles.tab, mode === 'feed' && styles.tabActive]}>
          <Ionicons name="people-outline" size={17} color={mode === 'feed' ? xianxia.goldSoft : xianxia.jadeDeep} />
          <Text style={[styles.tabText, mode === 'feed' && styles.tabTextActive]}>Bảng tin</Text>
        </Pressable>
        <Pressable onPress={() => setMode('discover')} style={[styles.tab, mode === 'discover' && styles.tabActive]}>
          <Ionicons name="search-outline" size={17} color={mode === 'discover' ? xianxia.goldSoft : xianxia.jadeDeep} />
          <Text style={[styles.tabText, mode === 'discover' && styles.tabTextActive]}>Khám phá độc giả</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {mode === 'feed' ? <>
        {!user ? <View style={styles.guestCard}>
          <ArtIcon source={artwork.lotus} size={64} />
          <View style={styles.heroIcon}><Ionicons name="people" size={24} color={xianxia.jadeDeep} /></View>
          <Text style={styles.guestTitle}>Bảng tin dành cho người bạn theo dõi</Text>
          <Text style={styles.guestBody}>Đăng nhập để xem đánh giá và bình luận công khai từ những độc giả bạn chọn theo dõi.</Text>
          <Pressable style={styles.primary} onPress={() => router.push('/auth/login')}><ButtonArt /><Text style={styles.primaryText}>Đăng nhập</Text></Pressable>
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
      <View style={styles.kindBadge}><Ionicons name={item.activityType === 'review' ? 'star-outline' : 'chatbubble-outline'} size={14} color={xianxia.cinnabar} /></View>
    </View>
    <Pressable onPress={onBook}>
      <Text style={styles.bookLink}>{item.bookTitle}</Text>
      {item.rating ? <Text style={styles.stars}>{'★'.repeat(Math.max(1, Math.min(5, item.rating)))}</Text> : null}
      <Text numberOfLines={5} style={styles.activityBody}>{item.body || (item.rating ? 'Chỉ chấm điểm, không viết cảm nhận.' : '')}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { height: 58, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(244,235,216,.90)' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', color: xianxia.ink, fontSize: 17, fontWeight: '900' },
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 48 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: { flex: 1, height: 42, borderRadius: 13, borderWidth: 1, borderColor: xianxia.line, backgroundColor: 'rgba(255,248,234,.92)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  tabActive: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.gold },
  tabText: { color: xianxia.jadeDeep, fontSize: 11, fontWeight: '900' },
  tabTextActive: { color: xianxia.goldSoft },
  error: { color: xianxia.danger, backgroundColor: '#F5E5E1', borderWidth: 1, borderColor: '#E2C2BA', borderRadius: 12, padding: 10, fontSize: 10, marginBottom: 10 },
  guestCard: { marginTop: 8, backgroundColor: 'rgba(255,248,234,.94)', borderWidth: 1, borderColor: xianxia.line, borderRadius: 20, padding: 22, alignItems: 'center' },
  heroIcon: { width: 50, height: 50, borderRadius: 15, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', alignItems: 'center', justifyContent: 'center', marginTop: -9 },
  guestTitle: { color: xianxia.ink, fontSize: 17, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  guestBody: { color: xianxia.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 7 },
  primary: { position: 'relative', overflow: 'hidden', minWidth: 140, height: 44, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  primaryText: { color: xianxia.white, fontSize: 11, fontWeight: '900' },
  secondaryCta: { alignSelf: 'center', marginTop: 10, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#99B0A2', backgroundColor: xianxia.jadeMist },
  secondaryCtaText: { color: xianxia.jadeDeep, fontSize: 10, fontWeight: '900' },
  searchBox: { height: 46, borderRadius: 14, backgroundColor: 'rgba(255,248,234,.94)', borderWidth: 1, borderColor: xianxia.line, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  searchInput: { flex: 1, color: xianxia.ink, fontSize: 12, outlineStyle: 'none' } as never,
  readerCard: { backgroundColor: 'rgba(255,248,234,.94)', borderWidth: 1, borderColor: xianxia.line, borderRadius: 16, padding: 12, marginBottom: 9 },
  readerMain: { flexDirection: 'row', gap: 11, alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 15 },
  avatarFallback: { width: 48, height: 48, borderRadius: 15, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: xianxia.goldSoft, fontWeight: '900', fontSize: 17 },
  readerName: { color: xianxia.ink, fontSize: 13, fontWeight: '900' },
  readerMeta: { color: xianxia.jade, fontSize: 9, marginTop: 3 },
  readerBio: { color: xianxia.muted, fontSize: 9, lineHeight: 13, marginTop: 5 },
  followButton: { alignSelf: 'flex-end', marginTop: 10, minWidth: 96, height: 34, borderRadius: 11, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: '#496A61', alignItems: 'center', justifyContent: 'center' },
  followingButton: { backgroundColor: xianxia.jadeMist, borderColor: '#B8CBBF' },
  followText: { color: xianxia.white, fontSize: 9, fontWeight: '900' },
  followingText: { color: xianxia.jadeDeep },
  activityCard: { backgroundColor: 'rgba(255,248,234,.94)', borderWidth: 1, borderColor: xianxia.line, borderRadius: 17, padding: 14, marginBottom: 10 },
  activityTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activityAvatar: { width: 42, height: 42, borderRadius: 13 },
  activityAvatarFallback: { width: 42, height: 42, borderRadius: 13, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center' },
  activityAvatarText: { color: xianxia.goldSoft, fontSize: 15, fontWeight: '900' },
  activityName: { color: xianxia.ink, fontSize: 12, fontWeight: '900' },
  activityMeta: { color: xianxia.muted, fontSize: 8, marginTop: 3 },
  kindBadge: { width: 32, height: 32, borderRadius: 10, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#BCD0C1', alignItems: 'center', justifyContent: 'center' },
  bookLink: { color: xianxia.jadeDeep, fontSize: 12, fontWeight: '900', marginTop: 11 },
  stars: { color: xianxia.gold, fontSize: 12, letterSpacing: 1, marginTop: 5 },
  activityBody: { color: xianxia.inkSoft, fontSize: 11, lineHeight: 17, marginTop: 7 },
});
