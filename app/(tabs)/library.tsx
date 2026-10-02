import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { getBooks } from '../../services/books';
import { getLibrary, getReadingProgress, removeFromLibrary, setLibraryStatus } from '../../services/library';
import { Book, LibraryEntry, LibraryStatus, ReadingProgress } from '../../types';

const tabs: { value: LibraryStatus; label: string }[] = [{ value: 'reading', label: 'Đang đọc' }, { value: 'favorite', label: 'Yêu thích' }, { value: 'completed', label: 'Đã hoàn thành' }];

export default function LibraryScreen() {
  const router = useRouter(); const { user } = useAuth(); const [active, setActive] = useState<LibraryStatus>('reading');
  const [entries, setEntries] = useState<LibraryEntry[]>([]); const [bookMap, setBookMap] = useState<Record<string, Book>>({}); const [progressMap, setProgressMap] = useState<Record<string, ReadingProgress | null>>({}); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [library, booksResult] = await Promise.all([getLibrary(user?.id), getBooks()]);
      const map = Object.fromEntries(booksResult.data.map((book) => [book.id, book])); setEntries(library); setBookMap(map);
      const progress = await Promise.all(library.map(async (entry) => [entry.bookId, await getReadingProgress(entry.bookId, user?.id)] as const)); setProgressMap(Object.fromEntries(progress));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải tủ sách.'); }
    finally { setLoading(false); }
  }, [user?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const update = async (bookId: string, status: LibraryStatus) => { setEntries((items) => items.map((item) => item.bookId === bookId ? { ...item, status } : item)); try { await setLibraryStatus(bookId, status, user?.id); } catch { load(); } };
  const remove = async (bookId: string) => { setEntries((items) => items.filter((item) => item.bookId !== bookId)); try { await removeFromLibrary(bookId, user?.id); } catch { load(); } };
  const visible = entries.filter((entry) => entry.status === active);
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.titleRow}><Text style={styles.title}>Tủ sách</Text>{!user ? <Pressable onPress={() => router.push('/auth/login')}><Text style={styles.sync}>Đăng nhập để đồng bộ</Text></Pressable> : null}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{tabs.map((tab) => <Pressable key={tab.value} onPress={() => setActive(tab.value)}><Text style={[styles.tab, active === tab.value && styles.active]}>{tab.label}</Text></Pressable>)}</ScrollView>
    {loading ? <LoadingState label="Đang tải tủ sách…" /> : error ? <View><EmptyState title="Không tải được tủ sách" detail={error} /><Pressable onPress={load}><Text style={styles.retry}>Thử lại</Text></Pressable></View> : visible.length === 0 ? <EmptyState title="Chưa có truyện" detail="Thêm truyện từ trang chi tiết để đọc tiếp ở đây." /> : visible.map((entry) => {
      const book = bookMap[entry.bookId]; if (!book) return null; const progress = progressMap[entry.bookId];
      return <Pressable onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })} style={styles.row} key={entry.bookId}>
        {book.coverUrl ? <Image source={{ uri: book.coverUrl }} style={styles.cover} /> : <View style={[styles.cover, { backgroundColor: book.cover }]}><Text style={styles.coverText}>{book.title[0]}</Text></View>}
        <View style={styles.meta}><View style={styles.bookTop}><Text numberOfLines={1} style={styles.bookTitle}>{book.title}</Text><Pressable hitSlop={10} onPress={() => remove(book.id)}><Ionicons name="close" size={18} color="#9A8E93" /></Pressable></View><Text style={styles.chapter}>{progress ? `Chương ${progress.chapterNumber} · ${Math.round(progress.progressPercent)}% chương` : `${book.totalChapters} chương`}</Text><View style={styles.track}><View style={[styles.fill, { width: `${progress?.progressPercent ?? 0}%` }]} /></View><View style={styles.statuses}>{tabs.map((tab) => <Pressable key={tab.value} onPress={() => update(book.id, tab.value)}><Text style={[styles.status, entry.status === tab.value && styles.statusActive]}>{tab.label}</Text></Pressable>)}</View></View>
      </Pressable>;
    })}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#F8F2E9' }, page: { padding: 16, paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' }, titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { color: '#221A1D', fontSize: 30, fontWeight: '900', marginTop: 8 }, sync: { color: '#8F1D3F', fontSize: 10, fontWeight: '900', marginTop: 8 }, tabs: { gap: 8, marginTop: 18, marginBottom: 10 }, active: { color: '#FFFFFF', backgroundColor: '#8F1D3F' }, tab: { color: '#756B6F', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, fontSize: 12, fontWeight: '700' }, row: { flexDirection: 'row', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#E9DDD6' }, cover: { width: 70, height: 94, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, coverText: { color: '#FFFFFF', fontSize: 29, fontWeight: '900' }, meta: { flex: 1, paddingLeft: 13, justifyContent: 'center' }, bookTop: { flexDirection: 'row', alignItems: 'center', gap: 8 }, bookTitle: { flex: 1, color: '#221A1D', fontSize: 16, fontWeight: '900' }, chapter: { color: '#756B6F', fontSize: 11, marginTop: 4 }, track: { height: 4, backgroundColor: '#E3D9D3', borderRadius: 99, marginTop: 10, overflow: 'hidden' }, fill: { height: 4, backgroundColor: '#8F1D3F' }, statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9 }, status: { color: '#81757A', fontSize: 8, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 99, backgroundColor: '#F2EAE6' }, statusActive: { color: '#8F1D3F', backgroundColor: '#F0E1E5' }, retry: { color: '#8F1D3F', fontWeight: '900', textAlign: 'center' } });
