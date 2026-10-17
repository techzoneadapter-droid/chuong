import { mapConcurrent } from '../../lib/asyncWork';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState } from '../../components/States';
import { ArtIcon, AssetBookCover, ButtonArt } from '../../components/Artwork';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { xianxia } from '../../constants/xianxia';
import { artwork } from '../../constants/artwork';
import { useAuth } from '../../contexts/AuthContext';
import { getBooksByIds } from '../../services/books';
import { getChaptersByBook } from '../../services/chapters';
import { getLibrary, getReadingProgressForBooks, removeFromLibrary, setLibraryStatus, mergeLocalLibrary } from '../../services/library';
import { Book, LibraryEntry, LibraryStatus, ReadingProgress } from '../../types';

const tabs: { value: LibraryStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'reading', label: 'Đang đọc', icon: 'book-outline' },
  { value: 'favorite', label: 'Yêu thích', icon: 'heart-outline' },
  { value: 'completed', label: 'Đã viên mãn', icon: 'checkmark-done-outline' },
];

export default function LibraryScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [active, setActive] = useState<LibraryStatus>('reading');
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [bookMap, setBookMap] = useState<Record<string, Book>>({});
  const [chapterOrdinals, setChapterOrdinals] = useState<Record<string, number>>({});
  const [progressMap, setProgressMap] = useState<Record<string, ReadingProgress | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (authLoading) return;
    const request = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const library = await getLibrary(user?.id);
      if (request !== requestId.current) return;
      const ids = [...new Set(library.map((entry) => entry.bookId))];
      const batches = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => ids.slice(index * 100, index * 100 + 100));
      const [bookGroups, progress] = await Promise.all([
        mapConcurrent(batches, 2, (batch) => getBooksByIds(batch)),
        getReadingProgressForBooks(ids, user?.id),
      ]);
      if (request !== requestId.current) return;
      const map = Object.fromEntries(bookGroups.flat().filter((book) => !book.visibility || (book.visibility === 'public' && book.backendStatus !== 'draft')).map((book) => [book.id, book]));
      const ordinals: Record<string, number> = {};
      await mapConcurrent(library, 3, async (entry) => {
        if (request !== requestId.current) return;
        const book = map[entry.bookId];
        if (book) {
          const chapters = await getChaptersByBook(book.id);
          ordinals[book.id] = Math.max(0, chapters.data.findIndex((chapter) => chapter.number === progress[book.id]?.chapterNumber));
          map[book.id] = { ...book, chapters: [], totalChapters: chapters.data.length };
        }
      });
      if (request !== requestId.current) return;
      setEntries(library);
      setBookMap(map);
      setProgressMap(progress);
      setChapterOrdinals(ordinals);
    } catch (cause) {
      if (request !== requestId.current) return;
      setError(cause instanceof Error ? cause.message : 'Không thể tải tủ sách.');
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [user?.id, authLoading]);

  useFocusEffect(useCallback(() => { void load(); return () => { ++requestId.current; }; }, [load]));

  const update = useCallback(async (bookId: string, status: LibraryStatus) => {
    setEntries((items) => items.map((item) => item.bookId === bookId ? { ...item, status } : item));
    try { await setLibraryStatus(bookId, status, user?.id); } catch { void load(); }
  }, [user?.id, load]);

  const remove = useCallback(async (bookId: string) => {
    setEntries((items) => items.filter((item) => item.bookId !== bookId));
    try { await removeFromLibrary(bookId, user?.id); } catch { void load(); }
  }, [user?.id, load]);

  const visible = useMemo(() => entries.filter((entry) => entry.status === active), [entries, active]);

  const renderEntry = useCallback(({ item: entry }: { item: LibraryEntry }) => <LibraryBookRow
    entry={entry} book={bookMap[entry.bookId]} progress={progressMap[entry.bookId]}
    chapterOrdinal={chapterOrdinals[entry.bookId] ?? 0} remove={remove} update={update}
  />, [bookMap, progressMap, chapterOrdinals, remove, update]);

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <FlatList
      data={loading || error ? [] : visible}
      keyExtractor={(entry) => entry.bookId}
      renderItem={renderEntry}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
      initialNumToRender={5} maxToRenderPerBatch={4} windowSize={5} removeClippedSubviews={false}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListHeaderComponent={<View style={{ paddingBottom: !loading && !error && visible.length ? 2 : 0 }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>TỦ LINH THƯ</Text>
          <Text style={styles.title}>Tủ sách</Text>
          <Text style={styles.subtitle}>Giữ lại những thế giới bạn đang đồng hành.</Text>
        </View>
        <View style={styles.headerSeal}><Ionicons name="library-outline" size={19} color={xianxia.goldSoft} /></View>
      </View>

      <Pressable style={styles.syncCard} accessibilityRole="button" onPress={() => router.push('/updates')}>
        <View style={styles.syncIcon}><Ionicons name="book-outline" size={20} color={xianxia.jadeDeep} /></View>
        <View style={{ flex: 1 }}><Text style={styles.syncTitle}>Cập nhật truyện theo dõi</Text><Text style={styles.syncBody}>Xem chương mới và tiếp tục đọc.</Text></View>
        <Ionicons name="chevron-forward" size={18} color={xianxia.jadeDeep} />
      </Pressable>

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

      </View>}
      ListEmptyComponent={loading ? <LoadingState label="Đang mở Tủ Linh Thư…" />
        : error ? <View><EmptyState title="Không tải được tủ sách" detail={error} /><Pressable style={styles.retryButton} onPress={load}><Text style={styles.retry}>Thử lại</Text></Pressable></View>
        : <EmptyState title="Tủ này còn trống" detail="Thêm truyện từ trang chi tiết để hành trình đọc xuất hiện tại đây." />}
      ListFooterComponent={
      <View style={styles.explorePanel}>
        <Image source={artwork.banner} resizeMode="cover" style={styles.exploreImage} />
        <View style={styles.exploreShade} />
        <View style={styles.exploreCopy}>
          <ArtIcon source={artwork.discover} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={styles.exploreTitle}>Khám phá thêm thế giới mới</Text>
            <Text style={styles.exploreBody}>Tàng Kinh Các luôn có những linh quyển mới để bạn tiếp tục hành trình.</Text>
          </View>
          <Pressable style={styles.exploreButton} onPress={() => router.push('/discover')}>
            <ButtonArt />
            <Text style={styles.exploreButtonText}>Khám phá</Text>
          </Pressable>
        </View>
      </View>
      }
    />
  </SafeAreaView>;
}

const LibraryBookRow = memo(function LibraryBookRow({ entry, book, progress, chapterOrdinal, remove, update }: {
  entry: LibraryEntry; book?: Book; progress?: ReadingProgress | null; chapterOrdinal: number;
  remove: (bookId: string) => Promise<void>; update: (bookId: string, status: LibraryStatus) => Promise<void>;
}) {
  const router = useRouter();
  if (!book) return <View key={entry.bookId} style={styles.missingRow}><Text style={styles.chapter}>Truyện không còn công khai.</Text><Pressable onPress={() => remove(entry.bookId)}><Text style={styles.removeText}>Xóa khỏi tủ</Text></Pressable></View>;
  const overall = progress ? Math.min(100, ((chapterOrdinal) + progress.progressPercent / 100) / Math.max(1, book.totalChapters) * 100) : 0;
  return <Pressable onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })} style={({ pressed }) => [styles.row, pressed && styles.pressed]} key={entry.bookId}>
    <View style={styles.coverFrame}>
      <View style={styles.cover}>
        <AssetBookCover bookId={book.id} title={book.title} coverUrl={book.coverUrl} style={StyleSheet.absoluteFillObject} />
        <View pointerEvents="none" style={styles.coverShade} />
        <View style={styles.coverSeal}><Ionicons name="bookmark-outline" size={13} color={xianxia.goldSoft} /></View>
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
          <ButtonArt />
          <Ionicons name="book-outline" size={14} color={xianxia.goldSoft} /><Text style={styles.readText}>Đọc tiếp</Text>
        </Pressable>
        <Text style={styles.percent}>{Math.round(overall)}%</Text>
      </View>
      <View style={styles.statuses}>{tabs.map((tab) => <Pressable key={tab.value} onPress={() => update(book.id, tab.value)}><Text style={[styles.status, entry.status === tab.value && styles.statusActive]}>{tab.label}</Text></Pressable>)}</View>
    </View>
  </Pressable>;
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  page: { padding: 16, paddingBottom: 42, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, padding: 12, backgroundColor: 'rgba(255,248,234,.9)' },
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
  cover: { width: 78, height: 116, borderRadius: 8, overflow: 'hidden', justifyContent: 'center', borderWidth: 1, borderColor: xianxia.gold },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,24,22,.08)' },
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
  readButton: { minHeight: 36, minWidth: 96, borderRadius: 10, paddingHorizontal: 11, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  readText: { color: xianxia.white, fontSize: 8.5, fontWeight: '900' },
  percent: { color: xianxia.gold, fontSize: 8.5, fontWeight: '900' },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  status: { color: xianxia.muted, fontSize: 7, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 99, backgroundColor: '#F0EBE2' },
  statusActive: { color: xianxia.jadeDeep, backgroundColor: xianxia.jadeMist },
  missingRow: { borderRadius: 15, borderWidth: 1, borderColor: xianxia.line, backgroundColor: 'rgba(255,253,247,.85)', padding: 14 },
  removeText: { color: xianxia.cinnabar, fontSize: 9, fontWeight: '900', marginTop: 5 },
  retryButton: { alignSelf: 'center', marginTop: -18, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 11, backgroundColor: xianxia.jadeMist },
  retry: { color: xianxia.jadeDeep, fontWeight: '900', textAlign: 'center', fontSize: 10 },
  explorePanel: { marginTop: 22, minHeight: 150, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: xianxia.gold, backgroundColor: xianxia.jadeDeep },
  exploreImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  exploreShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,43,37,.48)' },
  exploreCopy: { minHeight: 150, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  exploreTitle: { color: xianxia.white, fontSize: 13, fontWeight: '900' },
  exploreBody: { color: 'rgba(255,253,248,.72)', fontSize: 8.5, lineHeight: 13, marginTop: 4 },
  exploreButton: { width: 88, height: 36, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  exploreButtonText: { color: xianxia.white, fontSize: 8.5, fontWeight: '900' },
});
