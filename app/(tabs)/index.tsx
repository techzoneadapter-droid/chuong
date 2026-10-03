import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookCard } from '../../components/BookCard';
import { EmptyState, LoadingState, RetryState } from '../../components/States';
import { books as demoBooks } from '../../data/books';
import { useAuth } from '../../contexts/AuthContext';
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
  if (loading) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải truyện…" /></SafeAreaView>;
  if (loadError) return <SafeAreaView style={styles.safe}><RetryState detail={loadError} onRetry={() => setReload((value) => value + 1)} /></SafeAreaView>;
  const currentBook = books.find((book) => book.id === savedProgress?.bookId) ?? books[0];
  if (!currentBook) return <SafeAreaView style={styles.safe} edges={['top']}><View style={styles.emptyHome}><Text style={styles.brand}>CHƯƠNG</Text><EmptyState title="Chưa có truyện công khai" detail={loadError || 'Nội dung sẽ xuất hiện sau khi tác giả xuất bản truyện.'} /></View></SafeAreaView>;
  const currentProgress = savedProgress?.bookId === currentBook.id ? savedProgress : null;
  const currentPercent = currentProgress?.progressPercent ?? currentBook.progress;
  const currentChapter = currentProgress?.chapterNumber ?? Math.max(1, Math.floor(currentBook.totalChapters * currentBook.progress / 100));
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>CHƯƠNG</Text>
            <Text style={styles.tagline}>Mỗi chương, một thế giới.</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.iconButton} onPress={() => router.push('/discover')}>
              <Ionicons name="search" size={21} color="#221A1D" />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => router.push('/notifications')}>
              <Ionicons name="notifications-outline" size={21} color="#221A1D" />
              {unreadNotifications > 0 ? <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text></View> : null}
            </Pressable>
          </View>
        </View>

        <Pressable style={({ pressed }) => [styles.hero, pressed && styles.pressed]} onPress={() => router.push({ pathname: '/book/[id]', params: { id: currentBook.id } })}>
          <View style={styles.heroTop}>
            <Text style={styles.heroEyebrow}>{currentProgress ? 'ĐANG ĐỌC GẦN NHẤT' : 'NỔI BẬT'}</Text>
            <Text style={styles.heroPercent}>{Math.round(currentPercent)}%</Text>
          </View>
          <Text style={styles.heroTitle}>{currentBook.title}</Text>
          <Text style={styles.heroSub}>{currentBook.author} · Chương {currentChapter} / {currentBook.totalChapters}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${currentPercent}%` }]} />
          </View>
          <Pressable style={styles.continueButton} onPress={() => router.push({ pathname: '/reader/[bookId]', params: { bookId: currentBook.id, chapter: currentChapter } })}>
            <Ionicons name="book-outline" size={18} color="#FFFFFF" />
            <Text style={styles.continueText}>{currentProgress ? 'Đọc tiếp' : 'Bắt đầu đọc'}</Text>
          </Pressable>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🔥 Hot hôm nay</Text>
          <Text style={styles.seeAll} onPress={() => router.push('/discover')}>Xem tất cả</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {books.slice(0, 6).map((book) => <BookCard book={book} key={book.id} />)}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Dành cho bạn</Text>
            <Text style={styles.sectionSub}>
              {recommendations.some((item) => item.personalized)
                ? 'Dựa trên truyện, thể loại và tác giả bạn thực sự tương tác.'
                : 'Đề xuất nổi bật. Đọc và theo dõi thêm để CHƯƠNG hiểu gu của bạn.'}
            </Text>
          </View>
          <Text style={styles.seeAll} onPress={() => router.push('/recommendations')}>Xem tất cả</Text>
        </View>

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
                  <Ionicons name={item.personalized ? 'sparkles' : 'flame-outline'} size={12} color="#8F1D3F" />
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
                  >
                    <Ionicons name="close" size={14} color="#9B8E93" />
                  </Pressable> : null}
                </View>
              </View>
            ))}
          </ScrollView>
        ) : !recommendError ? (
          <View style={styles.recommend}>
            <View style={styles.recommendText}>
              <Text style={styles.recommendKicker}>TUYỂN CHỌN RIÊNG</Text>
              <Text style={styles.recommendTitle}>CHƯƠNG đang học gu đọc của bạn.</Text>
              <Text style={styles.recommendBody}>Đọc, thêm vào tủ sách hoặc theo dõi tác giả để nhận đề xuất chính xác hơn.</Text>
            </View>
            <Ionicons name="sparkles" size={36} color="#8F1D3F" />
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tác giả Việt</Text>
          <Text style={styles.seeAll} onPress={() => router.push('/write')}>Xem thêm</Text>
        </View>

        <View style={styles.authorBox}>
          <Text style={styles.authorTitle}>Viết câu chuyện của riêng bạn</Text>
          <Text style={styles.authorBody}>Đăng truyện, theo dõi độc giả và xây dựng cộng đồng người đọc.</Text>
          <Pressable style={styles.authorButton} onPress={() => router.push('/write')}>
            <Text style={styles.authorButtonText}>Bắt đầu viết</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  page: { paddingBottom: 36 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  brand: { color: '#8F1D3F', fontSize: 25, fontWeight: '900', letterSpacing: 1.3 },
  tagline: { color: '#756B6F', fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFDFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E9DDD6',
    position: 'relative'
  },
  headerBadge: { position: 'absolute', right: -3, top: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#8F1D3F', paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#F8F2E9' },
  headerBadgeText: { color: '#FFF', fontSize: 7, fontWeight: '900' },
  hero: {
    marginHorizontal: 16,
    backgroundColor: '#66152F',
    borderRadius: 24,
    padding: 20,
    minHeight: 196
  },
  pressed: { opacity: 0.9 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between' },
  heroEyebrow: { color: '#E9C6D1', fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  heroPercent: { color: '#E9C6D1', fontSize: 12, fontWeight: '800' },
  heroTitle: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 22 },
  heroSub: { color: '#E9C6D1', fontSize: 13, marginTop: 5 },
  track: { height: 5, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.18)', marginTop: 20 },
  fill: { height: 5, borderRadius: 99, backgroundColor: '#FFFFFF' },
  continueButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    backgroundColor: '#8F1D3F',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999
  },
  continueText: { color: '#FFFFFF', fontWeight: '800' },
  sectionHeader: {
    marginTop: 28,
    paddingHorizontal: 16,
    marginBottom: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sectionTitle: { color: '#221A1D', fontSize: 20, fontWeight: '900' },
  sectionSub: { color: '#82757B', fontSize: 9, lineHeight: 13, marginTop: 3, paddingRight: 10 },
  seeAll: { color: '#8F1D3F', fontSize: 12, fontWeight: '800' },
  row: { paddingLeft: 16, paddingRight: 4 },
  recommendRow: { paddingLeft: 16, paddingRight: 4 },
  recommendItem: { width: 154 },
  reasonRow: { width: 140, minHeight: 36, flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 5, paddingRight: 2 },
  reasonText: { flex: 1, color: '#786B70', fontSize: 8, lineHeight: 12, fontWeight: '700' },
  hideRecommend: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EAE6', marginTop: -3 },
  recommendError: { marginHorizontal: 16, borderRadius: 14, backgroundColor: '#F8E7EC', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recommendErrorText: { flex: 1, color: '#8F1D3F', fontSize: 10, lineHeight: 14 },
  retryText: { color: '#8F1D3F', fontSize: 10, fontWeight: '900' },
  recommend: {
    marginHorizontal: 16,
    backgroundColor: '#F0E1E5',
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  recommendText: { flex: 1 },
  recommendKicker: { color: '#8F1D3F', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  recommendTitle: { color: '#221A1D', fontSize: 18, lineHeight: 24, fontWeight: '900', marginTop: 6 },
  recommendBody: { color: '#756B6F', fontSize: 12, lineHeight: 18, marginTop: 5 },
  authorBox: {
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 22,
    backgroundColor: '#FFFDFC',
    borderWidth: 1,
    borderColor: '#E9DDD6'
  },
  authorTitle: { color: '#221A1D', fontSize: 19, fontWeight: '900' },
  authorBody: { color: '#756B6F', fontSize: 13, lineHeight: 20, marginTop: 6 },
  authorButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 15,
    backgroundColor: '#8F1D3F',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12
  },
  authorButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 }
  ,emptyHome: { flex: 1, padding: 20 }
});
