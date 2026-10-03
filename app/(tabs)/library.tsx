import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState } from '../../components/States';
import { XianxiaBackdrop, XianxiaCoverArt } from '../../components/XianxiaBackdrop';
import { xianxia } from '../../constants/xianxia';
import { useAuth } from '../../contexts/AuthContext';
import { getBooks } from '../../services/books';
import { getChaptersByBook } from '../../services/chapters';
import { getLibrary, getReadingProgress, removeFromLibrary, setLibraryStatus, mergeLocalLibrary } from '../../services/library';
import { Book, LibraryEntry, LibraryStatus, ReadingProgress } from '../../types';

const tabs: { value: LibraryStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'reading', label: 'Đang đọc', icon: 'book-outline' },
  { value: 'favorite', label: 'Yêu thích', icon: 'heart-outline' },
  { value: 'completed', label: 'Đã viên mãn', icon: 'checkmark-done-outline' },
];

export default function LibraryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [active, setActive] = useState<LibraryStatus>('reading');
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [bookMap, setBookMap] = useState<Record<string, Book>>({});
  const [progressMap, setProgressMap] = useState<Record<string, ReadingProgress | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [library, booksResult] = await Promise.all([getLibrary(user?.id), getBooks()]);
      const map = Object.fromEntries(booksResult.data.map((book) => [book.id, book]));
      await Promise.all(library.map(async (entry) => {
        const book = map[entry.bookId];
        if (book) {
          const chapters = await getChaptersByBook(book.id);
          map[book.id] = { ...book, chapters: chapters.data, totalChapters: chapters.data.length };
        }
      }));
      setEntries(library);
      setBookMap(map);
      const progress = await Promise.all(library.map(async (entry) => [entry.bookId, await getReadingProgress(entry.bookId, user?.id)] as const));
      setProgressMap(Object.fromEntries(progress));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải tủ sách.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const update = async (bookId: string, status: LibraryStatus) => {
    setEntries((items) => items.map((item) => item.bookId === bookId ? { ...item, status } : item));
    try { await setLibraryStatus(bookId, status, user?.id); } catch { void load(); }
  };

  const remove = async (bookId: string) => {
    setEntries((items) => items.filter((item) => item.bookId !== bookId));
    try { await removeFromLibrary(bookId, user?.id); } catch { void load(); }
  };

  const visible = entries.filter((entry) => entry.status === active);

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>TỦ LINH THƯ</Text>
          <Text style={styles.title}>Tủ sách</Text>
          <Text style={styles.subtitle}>Giữ lại những thế giới bạn đang đồng hành.</Text>
        </View>
        <View style={styles.headerSeal}><Text style={styles.headerSealText}>书</Text></View>
      </View>

      {!user ? <Pressable style={styles.syncCard} onPress={() => router.push('/auth/login')}>
        <View style={styles.syncIcon}><Ionicons name="cloud-outline" size={20} color={xianxia.jadeDeep} /></View>
        <View style={{ flex: 1 }}><Text style={styles.syncTitle}>Đăng nhập để đồng bộ</Text><Text style={styles.syncBody}>Mang tủ sách và tiến độ đọc sang thiết bị khác.</Text></View>
        <Ionicons name="chevron-forward" size={17} color={xianxia.jade} />
      </Pressable> : <Pressable style={styles.syncCard} onPress={async () => {
        try { await mergeLocalLibrary(user.id); await load(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể nhập tủ sách.'); }
      }}>
        <View style={styles.syncIcon}><Ionicons name="cloud-done-outline" size={20} color={xianxia.jadeDeep} /></View>
        <View style={{ flex: 1 }}><Text style={styles.syncTitle}>Đồng bộ linh thư</Text><Text style={styles.syncBody}>Nhập dữ liệu trên thiết bị và giữ nguyên dữ liệu đám mây.</Text></View>
        <Ionicons name="sync-outline" size={17} color={xianxia.jade} />
      </Pressable>}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tabs.map((tab) => {
          const selected = active === tab.value;
          return <Pressable key={tab.value} onPress={() => setActive(tab.value)} style={[styles.tab, selected && styles.tabActive]}>
            <Ionicons name={tab.icon} size={14} color={selected ? xianxia.goldSoft : xianxia.jade} />
            <Text style={[styles.tabText, selected && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>;
        })}
      </ScrollView>

      {loading ? <LoadingState label="Đang mở Tủ Linh Thư…" />
        : error ? <View><EmptyState title="Không tải được tủ sách" detail={error} /><Pressable style={styles.retryButton} onPress={load}><Text style={styles.retry}>Thử lại</Text></Pressable></View>
        : visible.length === 0 ? <EmptyState title="Tủ này còn trống" detail="Thêm truyện từ trang chi tiết để hành trình đọc xuất hiện tại đây." />
        : <View style={styles.books}>{visible.map((entry) => {
          const book = bookMap[entry.bookId];
          if (!book) return <View key={entry.bookId} style={styles.missingRow}><Text style={styles.chapter}>Truyện không còn công khai.</Text><Pressable onPress={() => remove(entry.bookId)}><Text style={styles.removeText}>Xóa khỏi tủ</Text></Pressable></View>;
          const progress = progressMap[entry.bookId];
          const overall = progress ? Math.min(100, ((Math.max(0, book.chapters.findIndex((chapter) => chapter.number === progress.chapterNumber))) + progress.progressPercent / 100) / Math.max(1, book.totalChapters) * 100) : 0;
          return <Pressable onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]} key={entry.bookId}>
            <View style={styles.coverFrame}>
              <View style={[styles.cover, { backgroundColor: book.cover || xianxia.jadeDeep }]}>
                <XianxiaCoverArt compact />
                {book.coverUrl ? <Image source={{ uri: book.coverUrl }} style={styles.coverImage} /> : <Text numberOfLines={3} style={styles.coverText}>{book.title}</Text>}
                <View style={styles.coverSeal}><Text style={styles.coverSealText}>藏</Text></View>
              </View>
            </View>
            <View style={styles.meta}>
              <View style={styles.bookTop}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={styles.bookTitle}>{book.title}</Text>
                  <Text numberOfLines={1} style={styles.author}>{book.author} · {book.genre}</Text>
                </View>
                <Pressable hitSlop={10} style={styles.closeButton} onPress={() => remove(book.id)}><Ionicons name="close" size={16} color={xianxia.muted} /></Pressable>
              </View>
              <Text style={styles.chapter}>{progress ? `Chương ${progress.chapterNumber} · ${Math.round(progress.progressPercent)}% chương` : `${book.totalChapters} chương`}</Text>
              <View style={styles.track}><View style={[styles.fill, { width: `${overall}%` }]} /></View>
              <View style={styles.readRow}>
                <Pressable style={styles.readButton} onPress={() => router.push({ pathname: '/reader/[bookId]', params: { bookId: book.id, chapter: progress?.chapterNumber ?? 1 } })}>
                  <Ionicons name="book-outline" size={14} color={xianxia.goldSoft} /><Text style={styles.readText}>Đọc tiếp</Text>
                </Pressable>
                <Text style={styles.percent}>{Math.round(overall)}%</Text>
              </View>
              <View style={styles.statuses}>{tabs.map((tab) => <Pressable key={tab.value} onPress={() => update(book.id, tab.value)}><Text style={[styles.status, entry.status === tab.value && styles.statusActive]}>{tab.label}</Text></Pressable>)}</View>
            </View>
          </Pressable>;
        })}</View>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  page: { padding: 16, paddingBottom: 42, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  eyebrow: { color: xianxia.cinnabar, fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: xianxia.ink, fontSize: 29, fontWeight: '900', marginTop: 3 },
  subtitle: { color: xianxia.muted, fontSize: 9, marginTop: 4 },
  headerSeal: { width: 43, height: 43, borderRadius: 13, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '3deg' }] },
  headerSealText: { color: '#F4DDA8', fontSize: 20, fontWeight: '900' },
  syncCard: { minHeight: 66, marginTop: 17, borderRadius: 17, backgroundColor: 'rgba(255,253,247,.88)', borderWidth: 1, borderColor: xianxia.line, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', alignItems: 'center', justifyContent: 'center' },
  syncTitle: { color: xianxia.ink, fontSize: 11, fontWeight: '900' },
  syncBody: { color: xianxia.muted, fontSize: 8, lineHeight: 12, marginTop: 3 },
  tabs: { gap: 8, marginTop: 18, marginBottom: 10, paddingRight: 8 },
  tab: { minHeight: 38, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: xianxia.line, backgroundColor: 'rgba(255,253,247,.82)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabActive: { backgroundColor: xianxia.jadeDeep, borderColor: '#496A61' },
  tabText: { color: xianxia.inkSoft, fontSize: 9.5, fontWeight: '800' },
  tabTextActive: { color: xianxia.white },
  books: { gap: 10, marginTop: 2 },
  row: { minHeight: 154, borderRadius: 19, backgroundColor: 'rgba(255,253,247,.90)', borderWidth: 1, borderColor: xianxia.line, padding: 11, flexDirection: 'row', gap: 12, shadowColor: '#5A5148', shadowOpacity: .04, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  pressed: { opacity: .82, transform: [{ scale: .997 }] },
  coverFrame: { padding: 2, alignSelf: 'flex-start', borderRadius: 14, backgroundColor: xianxia.goldSoft },
  cover: { width: 78, height: 116, borderRadius: 12, overflow: 'hidden', justifyContent: 'center', padding: 8 },
  coverImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  coverText: { color: xianxia.white, fontSize: 11, lineHeight: 14, fontWeight: '900', textAlign: 'center', zIndex: 2 },
  coverSeal: { position: 'absolute', right: 5, top: 5, width: 19, height: 19, borderRadius: 6, backgroundColor: 'rgba(132,50,41,.82)', borderWidth: 1, borderColor: 'rgba(229,209,163,.7)', alignItems: 'center', justifyContent: 'center' },
  coverSealText: { color: '#F3D99D', fontSize: 8, fontWeight: '900' },
  meta: { flex: 1, justifyContent: 'center' },
  bookTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  bookTitle: { color: xianxia.ink, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  author: { color: xianxia.jade, fontSize: 8.5, fontWeight: '800', marginTop: 3 },
  closeButton: { width: 28, height: 28, borderRadius: 9, backgroundColor: '#F0EBE2', alignItems: 'center', justifyContent: 'center' },
  chapter: { color: xianxia.muted, fontSize: 9, marginTop: 6 },
  track: { height: 4, backgroundColor: '#E3D9CC', borderRadius: 99, marginTop: 8, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: xianxia.gold },
  readRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  readButton: { minHeight: 32, borderRadius: 10, paddingHorizontal: 10, backgroundColor: xianxia.jadeDeep, flexDirection: 'row', alignItems: 'center', gap: 5 },
  readText: { color: xianxia.white, fontSize: 8.5, fontWeight: '900' },
  percent: { color: xianxia.gold, fontSize: 8.5, fontWeight: '900' },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  status: { color: xianxia.muted, fontSize: 7, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 99, backgroundColor: '#F0EBE2' },
  statusActive: { color: xianxia.jadeDeep, backgroundColor: xianxia.jadeMist },
  missingRow: { borderRadius: 15, borderWidth: 1, borderColor: xianxia.line, backgroundColor: 'rgba(255,253,247,.85)', padding: 14 },
  removeText: { color: xianxia.cinnabar, fontSize: 9, fontWeight: '900', marginTop: 5 },
  retryButton: { alignSelf: 'center', marginTop: -18, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 11, backgroundColor: xianxia.jadeMist },
  retry: { color: xianxia.jadeDeep, fontWeight: '900', textAlign: 'center', fontSize: 10 },
});
