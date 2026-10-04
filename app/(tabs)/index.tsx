import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  const [recommendError, setRecommendError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState('');
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
    ]).then(([result, progress, personalized]) => {
      if (!active) return;
      setBooks(result.data);
      setSavedProgress(progress);
      setRecommendations(personalized);
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
        <SectionTitle title="Đang thịnh hành" action="Xem tất cả" onPress={() => router.push('/discover')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {books.slice(0, 8).map((book) => <BookCard book={book} key={book.id} />)}
        </ScrollView>

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
            <Text style={styles.authorBody}>Tác giả có thể đăng truyện, quản lý chương, xem phân tích độc giả và kiếm Linh Thạch.</Text>
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
    backgroundColor: 'rgba(255,248,234,.82)',
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
  heroTitle: { color: xianxia.ink, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 25, lineHeight: 32, fontWeight: '600', marginTop: 8 },
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
  quickRealm: { marginHorizontal: 16, marginTop: 16, backgroundColor: 'rgba(255,248,234,.88)', paddingVertical: 10, flexDirection: 'row', borderBottomWidth: 1, borderColor: xianxia.goldSoft },
  quickItem: { flex: 1, alignItems: 'center', paddingHorizontal: 5 },
  quickIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: xianxia.jadeMist, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { color: xianxia.ink, fontSize: 11, fontWeight: '600', marginTop: 7 },
  quickMeta: { color: xianxia.muted, fontSize: 7.5, marginTop: 2, textAlign: 'center' },
  quickDivider: { width: StyleSheet.hairlineWidth, backgroundColor: xianxia.line, marginVertical: 6 },
  sectionHead: { marginTop: 12, marginBottom: 13, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: 'rgba(255,248,234,.88)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, flex: 1, paddingRight: 10 },
  sectionMark: { width: 18, height: 24, borderLeftWidth: 1, borderRightWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  sectionMarkDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: xianxia.cinnabar },
  sectionTitle: { color: xianxia.ink, fontSize: 19, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  sectionSub: { color: xianxia.muted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  seeAll: { color: xianxia.cinnabar, fontSize: 10, fontWeight: '900' },
  row: { paddingLeft: 16, paddingRight: 2, paddingBottom: 12, backgroundColor: 'rgba(255,248,234,.9)' },
  recommendRow: { paddingLeft: 16, paddingRight: 2, paddingBottom: 5 },
  recommendItem: { width: 146, marginRight: 14 },
  reasonRow: { marginTop: 7, minHeight: 30, flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  reasonText: { color: xianxia.muted, fontSize: 8.5, lineHeight: 12, flex: 1 },
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
