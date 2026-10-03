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
import { getReadingProgress } from '../../services/library';
import { getUnreadNotificationCount } from '../../services/notifications';
import { Book, ReadingProgress } from '../../types';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>(demoBooks);
  const [savedProgress, setSavedProgress] = useState<ReadingProgress | null>(null);
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
    let active = true; setLoading(true); setLoadError('');
    getBooks().then(async (result) => {
      if (!active) return; setBooks(result.data);
      if (result.data.length === 0) return;
      const progress = await getReadingProgress(result.data[0].id, user?.id); if (active) setSavedProgress(progress);
    }).catch((cause) => { if (active) setLoadError(cause instanceof Error ? cause.message : 'Không thể tải truyện.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, reload]);
  if (loading) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải truyện…" /></SafeAreaView>;
  if (loadError) return <SafeAreaView style={styles.safe}><RetryState detail={loadError} onRetry={() => setReload((value) => value + 1)} /></SafeAreaView>;
  const currentBook = books[0];
  if (!currentBook) return <SafeAreaView style={styles.safe} edges={['top']}><View style={styles.emptyHome}><Text style={styles.brand}>CHƯƠNG</Text><EmptyState title="Chưa có truyện công khai" detail={loadError || 'Nội dung sẽ xuất hiện sau khi tác giả xuất bản truyện.'} /></View></SafeAreaView>;
  const currentPercent = savedProgress?.progressPercent ?? currentBook.progress;
  const currentChapter = savedProgress?.chapterNumber ?? Math.max(1, Math.floor(currentBook.totalChapters * currentBook.progress / 100));
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
            <Text style={styles.heroEyebrow}>ĐANG ĐỌC</Text>
            <Text style={styles.heroPercent}>{Math.round(currentPercent)}%</Text>
          </View>
          <Text style={styles.heroTitle}>{currentBook.title}</Text>
          <Text style={styles.heroSub}>{currentBook.author} · Chương {currentChapter} / {currentBook.totalChapters}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${currentPercent}%` }]} />
          </View>
          <Pressable style={styles.continueButton} onPress={() => router.push({ pathname: '/reader/[bookId]', params: { bookId: currentBook.id, chapter: currentChapter } })}>
            <Ionicons name="book-outline" size={18} color="#FFFFFF" />
            <Text style={styles.continueText}>Đọc tiếp</Text>
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
          <Text style={styles.sectionTitle}>Dành cho bạn</Text>
          <Text style={styles.seeAll} onPress={() => router.push('/discover')}>Khám phá</Text>
        </View>

        <View style={styles.recommend}>
          <View style={styles.recommendText}>
            <Text style={styles.recommendKicker}>TUYỂN CHỌN RIÊNG</Text>
            <Text style={styles.recommendTitle}>Truyện hợp gu của bạn sẽ xuất hiện ở đây.</Text>
            <Text style={styles.recommendBody}>
              Sau khi đọc vài chương, CHƯƠNG sẽ cá nhân hóa đề xuất theo thể loại và tác giả bạn yêu thích.
            </Text>
          </View>
          <Ionicons name="sparkles" size={36} color="#8F1D3F" />
        </View>

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
  seeAll: { color: '#8F1D3F', fontSize: 12, fontWeight: '800' },
  row: { paddingLeft: 16, paddingRight: 4 },
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
