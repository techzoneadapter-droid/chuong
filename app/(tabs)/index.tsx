import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookCard } from '../../components/BookCard';
import { EmptyState, LoadingState, RetryState } from '../../components/States';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { xianxia } from '../../constants/xianxia';
import { artwork } from '../../constants/artwork';
import { ArtDivider, ArtIcon, BrandLockup, ButtonArt } from '../../components/Artwork';
import { useAuth } from '../../contexts/AuthContext';
import { books as demoBooks } from '../../data/books';
import { getBooks } from '../../services/books';
import { getLatestReadingProgress } from '../../services/library';
import { getUnreadNotificationCount } from '../../services/notifications';
import {
  getPersonalizedRecommendations,
  hideRecommendation,
  PersonalizedRecommendation,
  recommendationReasonText,
} from '../../services/recommendations';
import { Book, ReadingProgress } from '../../types';
import { getHomeRankingGroups, RankedBook, rankingReason } from '../../services/rankings';

function SectionTitle({ title, action, onPress, subtitle }: { title: string; action?: string; onPress?: () => void; subtitle?: string }) {
  return <View style={styles.sectionHead}>
    <View style={styles.sectionTitleWrap}>
      <ArtIcon source={artwork.lotus} size={26} />
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      </View>
    </View>
    {action ? <Pressable hitSlop={10} onPress={onPress}><Text style={styles.seeAll}>{action}</Text></Pressable> : null}
  </View>;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>(demoBooks);
  const [savedProgress, setSavedProgress] = useState<ReadingProgress | null>(null);
  const [recommendations, setRecommendations] = useState<PersonalizedRecommendation[]>([]);
  const [rankings, setRankings] = useState<{ trending: RankedBook[]; hot: RankedBook[]; newest: RankedBook[]; top: RankedBook[] }>({ trending: [], hot: [], newest: [], top: [] });
  const [recommendError, setRecommendError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    // Always refresh the public catalog when Home regains focus so a newly
    // published/uploaded book appears immediately without restarting the app.
    setReload((value) => value + 1);
    if (!user) {
      setUnreadNotifications(0);
      return () => { active = false; };
    }
    void getUnreadNotificationCount().then((count) => { if (active) setUnreadNotifications(count); });
    return () => { active = false; };
  }, [user]));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    setRecommendError('');

    Promise.all([
      getBooks(),
      getLatestReadingProgress(user?.id),
      getPersonalizedRecommendations(10).catch((cause) => {
        if (active) setRecommendError(cause instanceof Error ? cause.message : 'Không thể tải đề xuất.');
        return [] as PersonalizedRecommendation[];
      }),
      getHomeRankingGroups(8),
    ]).then(([result, progress, personalized, rankingGroups]) => {
      if (!active) return;
      setBooks(result.data);
      setSavedProgress(progress);
      setRecommendations(personalized);
      setRankings(rankingGroups);
    }).catch((cause) => {
      if (active) setLoadError(cause instanceof Error ? cause.message : 'Không thể tải truyện.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [user?.id, reload]);

  if (loading) return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><LoadingState label="Đang mở sơn môn…" /></SafeAreaView>;
  if (loadError) return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><RetryState detail={loadError} onRetry={() => setReload((value) => value + 1)} /></SafeAreaView>;

  const currentBook = books.find((book) => book.id === savedProgress?.bookId) ?? books[0];
  if (!currentBook) {
    return <SafeAreaView style={styles.safe} edges={['top']}>
      <XianxiaBackdrop />
      <View style={styles.emptyHome}>
        <View style={styles.emptyBrand}><BrandLockup /></View>
        <EmptyState title="Chưa có truyện công khai" detail="Kho truyện sẽ xuất hiện sau khi tác giả hoặc quản trị viên công khai nội dung." />
      </View>
    </SafeAreaView>;
  }

  const currentProgress = savedProgress?.bookId === currentBook.id ? savedProgress : null;
  const currentPercent = currentProgress?.progressPercent ?? currentBook.progress;
  const currentChapter = currentProgress?.chapterNumber ?? Math.max(1, Math.floor(currentBook.totalChapters * currentBook.progress / 100));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <XianxiaBackdrop />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <BrandLockup />
          </View>
          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Tìm truyện" style={styles.iconButton} onPress={() => router.push('/discover')}>
              <Ionicons name="search" size={20} color={xianxia.ink} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Thông báo" style={styles.iconButton} onPress={() => router.push('/notifications')}>
              <Ionicons name="notifications-outline" size={20} color={xianxia.ink} />
              {unreadNotifications > 0 ? <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text></View> : null}
            </Pressable>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
          onPress={() => router.push({ pathname: '/book/[id]', params: { id: currentBook.id } })}
        >
          <Image source={artwork.banner} resizeMode="cover" style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%' }]} />
          <View style={styles.heroCopy}>
            <View style={styles.heroTop}>
              <View style={styles.heroKicker}>
                <Ionicons name={currentProgress ? 'bookmark' : 'sparkles'} size={12} color={xianxia.jadeDeep} />
                <Text style={styles.heroEyebrow}>{currentProgress ? 'TIẾP TỤC TU HÀNH' : 'TIÊN ĐỀ CỬ HÔM NAY'}</Text>
              </View>
              <Text style={styles.heroPercent}>{Math.round(currentPercent)}%</Text>
            </View>
            <Text numberOfLines={2} style={styles.heroTitle}>{currentBook.title}</Text>
            <Text numberOfLines={1} style={styles.heroAuthor}>{currentBook.author}</Text>
            <Text style={styles.heroSub}>Chương {currentChapter} / {Math.max(1, currentBook.totalChapters)} · {currentBook.genre}</Text>
            <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, Math.max(0, currentPercent))}%` }]} /></View>
            <Pressable style={styles.continueButton} onPress={() => router.push({ pathname: '/reader/[bookId]', params: { bookId: currentBook.id, chapter: currentChapter } })}>
              <ButtonArt />
              <View style={styles.continueGlyph}><Ionicons name="book-outline" size={16} color={xianxia.goldSoft} /></View>
              <Text style={styles.continueText}>{currentProgress ? 'Đọc tiếp' : 'Bắt đầu đọc'}</Text>
              <Ionicons name="arrow-forward" size={15} color={xianxia.white} />
            </Pressable>
          </View>
        </Pressable>

        <View style={styles.quickRealm}>
          <Pressable style={styles.quickItem} onPress={() => router.push('/discover')}>
            <ArtIcon source={artwork.discover} size={44} />
            <Text style={styles.quickTitle}>Tàng Kinh Các</Text>
            <Text style={styles.quickMeta}>Khám phá kho truyện</Text>
          </Pressable>
          <View style={styles.quickDivider} />
          <Pressable style={styles.quickItem} onPress={() => router.push('/library')}>
            <ArtIcon source={artwork.library} size={44} />
            <Text style={styles.quickTitle}>Tủ Linh Thư</Text>
            <Text style={styles.quickMeta}>Truyện đang theo dõi</Text>
          </Pressable>
          <View style={styles.quickDivider} />
          <Pressable style={styles.quickItem} onPress={() => router.push('/recommendations')}>
            <ArtIcon source={artwork.lotus} size={44} />
            <Text style={styles.quickTitle}>Cơ Duyên</Text>
            <Text style={styles.quickMeta}>Đề cử hợp gu</Text>
          </Pressable>
        </View>

        <ArtDivider />
        {rankings.trending.length ? <>
          <SectionTitle title="Đang thịnh hành" subtitle="Xếp theo dữ liệu đọc 7 ngày: độc giả, quay lại đọc, phiên đọc, hoàn thành chương và thời gian đọc" action="Xem tất cả" onPress={() => router.push({ pathname: '/discover', params: { sort: 'trending' } })} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rankingRow}>
            {rankings.trending.map((item) => <View key={item.book.id} style={styles.rankingItem}><BookCard book={item.book} /><Text numberOfLines={2} style={styles.rankingReason}>#{item.rank} · {rankingReason('trending', item)}</Text></View>)}
          </ScrollView>
        </> : null}

        {rankings.hot.length ? <>
          <SectionTitle title="Hot 48 giờ" subtitle="Chỉ dựa trên mức tăng tương tác 48 giờ gần nhất và lượt theo dõi mới; không dùng số liệu ảo" action="Xem tất cả" onPress={() => router.push({ pathname: '/discover', params: { sort: 'hot' } })} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rankingRow}>
            {rankings.hot.map((item) => <View key={item.book.id} style={styles.rankingItem}><BookCard book={item.book} /><Text numberOfLines={2} style={styles.rankingReason}>#{item.rank} · {rankingReason('hot', item)}</Text></View>)}
          </ScrollView>
        </> : null}

        {rankings.newest.length ? <>
          <SectionTitle title="Truyện mới ra" subtitle="Sắp theo thời điểm chương đầu tiên được xuất bản công khai" action="Xem tất cả" onPress={() => router.push({ pathname: '/discover', params: { sort: 'new' } })} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rankingRow}>
            {rankings.newest.map((item) => <View key={item.book.id} style={styles.rankingItem}><BookCard book={item.book} /><Text numberOfLines={2} style={styles.rankingReason}>#{item.rank} · {rankingReason('new', item)}</Text></View>)}
          </ScrollView>
        </> : null}

        {rankings.top.length ? <>
          <SectionTitle title="Top CHƯƠNG" subtitle="Thành tích toàn thời gian từ lượt đọc, độc giả, theo dõi, hoàn thành chương, thời gian đọc và đánh giá thực tế" action="Xem tất cả" onPress={() => router.push({ pathname: '/discover', params: { sort: 'top' } })} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rankingRow}>
            {rankings.top.map((item) => <View key={item.book.id} style={styles.rankingItem}><BookCard book={item.book} /><Text numberOfLines={2} style={styles.rankingReason}>#{item.rank} · {rankingReason('top', item)}</Text></View>)}
          </ScrollView>
        </> : null}

        <SectionTitle
          title="Cơ duyên dành cho bạn"
          action="Xem tất cả"
          onPress={() => router.push('/recommendations')}
          subtitle={recommendations.some((item) => item.personalized) ? 'Dựa trên hành trình đọc của bạn' : 'Đọc thêm để CHƯƠNG hiểu gu của bạn'}
        />

        {recommendError ? <View style={styles.recommendError}>
          <Text style={styles.recommendErrorText}>{recommendError}</Text>
          <Pressable onPress={() => setReload((value) => value + 1)}><Text style={styles.retryText}>Thử lại</Text></Pressable>
        </View> : null}

        {recommendations.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendRow}>
            {recommendations.map((item) => (
              <View style={styles.recommendItem} key={item.book.id}>
                <BookCard book={item.book} />
                <View style={styles.reasonRow}>
                  <Ionicons name={item.personalized ? 'sparkles' : 'flame-outline'} size={11} color={xianxia.cinnabar} />
                  <Text numberOfLines={2} style={styles.reasonText}>{recommendationReasonText(item)}</Text>
                  {user ? <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={'Ẩn đề xuất ' + item.book.title}
                    hitSlop={8}
                    onPress={async () => {
                      try {
                        await hideRecommendation(item.book.id);
                        setRecommendations((current) => current.filter((entry) => entry.book.id !== item.book.id));
                      } catch (cause) {
                        setRecommendError(cause instanceof Error ? cause.message : 'Không thể ẩn đề xuất.');
                      }
                    }}
                    style={styles.hideRecommend}
                  ><Ionicons name="close" size={13} color={xianxia.muted} /></Pressable> : null}
                </View>
              </View>
            ))}
          </ScrollView>
        ) : !recommendError ? (
          <View style={styles.recommendEmpty}>
            <View style={styles.recommendEmblem}><Ionicons name="sparkles" size={16} color={xianxia.goldSoft} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.recommendTitle}>Cơ duyên chưa hiện rõ</Text>
              <Text style={styles.recommendBody}>Hãy đọc, lưu và theo dõi vài bộ truyện. CHƯƠNG sẽ dần mở ra đề cử đúng khẩu vị của bạn.</Text>
            </View>
          </View>
        ) : null}

        <SectionTitle title="Khai bút nhập đạo" subtitle="Viết truyện, xây độc giả và mở con đường của riêng bạn" />
        <View style={styles.authorBox}>
          <ArtIcon source={artwork.write} size={64} />
          <View style={styles.authorCopy}>
            <Text style={styles.authorTitle}>Một thế giới mới bắt đầu từ chương đầu tiên.</Text>
            <Text style={styles.authorBody}>Tác giả có thể đăng truyện, quản lý chương, xem phân tích độc giả và kiếm Hạ Phẩm Linh Thạch.</Text>
            <Pressable style={styles.authorButton} onPress={() => router.push('/write')}>
              <ButtonArt />
              <Text style={styles.authorButtonText}>Bắt đầu viết</Text>
              <Ionicons name="arrow-forward" size={15} color={xianxia.white} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  page: { paddingBottom: 38, width: '100%', maxWidth: 840, alignSelf: 'center' },
  emptyHome: { flex: 1, paddingTop: 42 },
  emptyBrand: { paddingHorizontal: 20, marginBottom: 12 },
  header: {
    backgroundColor: 'rgba(255,248,234,.96)',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: { flex: 1, minWidth: 0, paddingRight: 12 },
  brandSeal: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: xianxia.gold, backgroundColor: xianxia.cinnabar, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-3deg' }] },
  brandSealText: { color: '#F7E6BA', fontSize: 17, fontWeight: '900' },
  brand: { color: xianxia.ink, fontSize: 23, fontWeight: '900', letterSpacing: 2.1 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(255,253,247,.82)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: xianxia.line, position: 'relative' },
  headerBadge: { position: 'absolute', right: -4, top: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: xianxia.cinnabar, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: xianxia.paper },
  headerBadgeText: { color: xianxia.white, fontSize: 7, fontWeight: '900' },
  hero: { marginHorizontal: 16, minHeight: 310, borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end', paddingTop: 115, borderWidth: 1, borderColor: xianxia.gold },
  pressed: { opacity: .93, transform: [{ scale: .994 }] },
  heroInkOrb: { position: 'absolute', width: 180, height: 180, borderRadius: 90, left: -82, top: -42, backgroundColor: 'rgba(255,255,255,.025)' },
  heroCopy: { padding: 16, backgroundColor: 'rgba(255,248,234,0.94)' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroKicker: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroEyebrow: { color: xianxia.jadeDeep, fontSize: 10, fontWeight: '600' },
  heroPercent: { color: xianxia.jadeDeep, fontSize: 11, fontWeight: '600' },
  heroTitle: { color: '#24231F', fontSize: 24, lineHeight: 31, fontWeight: '800', marginTop: 8 },
  heroAuthor: { color: xianxia.jade, fontSize: 12, fontWeight: '500', marginTop: 4 },
  heroSub: { color: xianxia.inkSoft, fontSize: 11, marginTop: 4 },
  track: { height: 3, borderRadius: 2, backgroundColor: xianxia.line, marginTop: 12, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: xianxia.jade },
  continueButton: { alignSelf: 'flex-start', minHeight: 46, minWidth: 174, marginTop: 12, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  continueGlyph: { width: 27, height: 27, borderRadius: 9, backgroundColor: 'rgba(229,209,163,.10)', alignItems: 'center', justifyContent: 'center' },
  continueText: { color: xianxia.white, fontSize: 12, fontWeight: '900' },
  heroCoverWrap: { width: 105, alignItems: 'flex-end', justifyContent: 'center', zIndex: 3 },
  heroCover: { width: 92, height: 138, borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(229,209,163,.65)', shadowColor: '#000', shadowOpacity: .3, shadowRadius: 9, shadowOffset: { width: 0, height: 6 }, elevation: 7, justifyContent: 'center', padding: 10 },
  heroCoverImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  heroCoverTitle: { color: xianxia.white, fontSize: 14, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
  heroCoverSeal: { position: 'absolute', right: 7, top: 7, width: 22, height: 22, borderRadius: 6, backgroundColor: 'rgba(122,43,34,.84)', borderWidth: 1, borderColor: 'rgba(229,209,163,.7)', alignItems: 'center', justifyContent: 'center' },
  heroCoverSealText: { color: '#F6DDA2', fontSize: 11, fontWeight: '900' },
  quickRealm: { marginHorizontal: 16, marginTop: 16, backgroundColor: 'rgba(255,248,234,.96)', paddingVertical: 10, flexDirection: 'row', borderBottomWidth: 1, borderColor: xianxia.goldSoft },
  quickItem: { flex: 1, alignItems: 'center', paddingHorizontal: 5 },
  quickIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: xianxia.jadeMist, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { color: xianxia.ink, fontSize: 11, fontWeight: '600', marginTop: 7 },
  quickMeta: { color: xianxia.muted, fontSize: 7.5, marginTop: 2, textAlign: 'center' },
  quickDivider: { width: StyleSheet.hairlineWidth, backgroundColor: xianxia.line, marginVertical: 6 },
  sectionHead: { marginTop: 12, marginBottom: 13, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: 'rgba(255,248,234,.88)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, flex: 1, paddingRight: 10 },
  sectionMark: { width: 18, height: 24, borderLeftWidth: 1, borderRightWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  sectionMarkDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: xianxia.cinnabar },
  sectionTitle: { color: '#24231F', fontSize: 18, lineHeight: 23, fontWeight: '800' },
  sectionSub: { color: '#5F5A53', fontSize: 9.2, lineHeight: 14, marginTop: 3, fontWeight: '500' },
  seeAll: { color: xianxia.cinnabar, fontSize: 10, fontWeight: '900' },
  row: { paddingLeft: 16, paddingRight: 2, paddingBottom: 12, backgroundColor: 'rgba(255,248,234,.97)' },
  rankingRow: { paddingLeft: 16, paddingRight: 2, paddingBottom: 9, gap: 10 },
  rankingItem: { width: 146, marginRight: 4 },
  rankingReason: { color: '#4F4A44', fontSize: 8, lineHeight: 12, marginTop: 6, paddingHorizontal: 4, fontWeight: '600' },
  recommendRow: { paddingLeft: 16, paddingRight: 2, paddingBottom: 5 },
  recommendItem: { width: 146, marginRight: 14 },
  reasonRow: { marginTop: 7, minHeight: 30, flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  reasonText: { color: '#4F4A44', fontSize: 8.8, lineHeight: 13, flex: 1, fontWeight: '500' },
  hideRecommend: { padding: 2 },
  recommendError: { marginHorizontal: 16, backgroundColor: '#F5E6E1', borderWidth: 1, borderColor: '#E5C5BA', borderRadius: 15, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  recommendErrorText: { color: xianxia.cinnabar, fontSize: 10, flex: 1 },
  retryText: { color: xianxia.cinnabar, fontSize: 10, fontWeight: '900' },
  recommendEmpty: { marginHorizontal: 16, borderRadius: 20, backgroundColor: 'rgba(255,253,247,.88)', borderWidth: 1, borderColor: xianxia.line, padding: 16, flexDirection: 'row', gap: 13, alignItems: 'center' },
  recommendEmblem: { width: 46, height: 46, borderRadius: 15, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', alignItems: 'center', justifyContent: 'center' },
  recommendEmblemText: { color: xianxia.jadeDeep, fontSize: 22, fontWeight: '900' },
  recommendTitle: { color: xianxia.ink, fontSize: 13, fontWeight: '900' },
  recommendBody: { color: xianxia.muted, fontSize: 9, lineHeight: 14, marginTop: 4 },
  authorBox: { marginHorizontal: 16, minHeight: 160, backgroundColor: 'rgba(255,248,234,.94)', padding: 18, flexDirection: 'row', gap: 12, alignItems: 'center', borderTopWidth: 1, borderColor: xianxia.gold },
  authorSeal: { width: 54, height: 54, borderRadius: 16, borderWidth: 1, borderColor: xianxia.gold, backgroundColor: 'rgba(142,58,49,.84)', alignItems: 'center', justifyContent: 'center', zIndex: 2, marginRight: 15 },
  authorSealText: { color: '#F7E5B8', fontSize: 26, fontWeight: '900' },
  authorCopy: { flex: 1, zIndex: 2 },
  authorTitle: { color: xianxia.ink, fontSize: 16, lineHeight: 23, fontWeight: '600' },
  authorBody: { color: xianxia.inkSoft, fontSize: 11, lineHeight: 17, marginTop: 5 },
  authorButton: { alignSelf: 'flex-start', marginTop: 12, minHeight: 44, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 7 },
  authorButtonText: { color: xianxia.white, fontSize: 10, fontWeight: '900' },
});
