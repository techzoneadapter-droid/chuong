import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChapterRow } from '../../../components/ChapterRow';
import { EmptyState, LoadingState, RetryState } from '../../../components/States';
import { getBook as getDemoBook } from '../../../data/books';
import { getBookById } from '../../../services/books';
import { getChaptersByBook } from '../../../services/chapters';
import { Book, Chapter, ChapterAccess } from '../../../types';

type Filter = 'all' | ChapterAccess;

export default function ChapterListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [book, setBook] = useState<Book>(() => getDemoBook(id));
  const [sourceChapters, setSourceChapters] = useState<Chapter[]>(() => getDemoBook(id).chapters);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let active = true; setLoading(true); setError('');
    getBookById(id).then(async (bookResult) => {
      if (!bookResult.data) return;
      const chaptersResult = await getChaptersByBook(bookResult.data.id);
      if (!active) return; setBook({ ...bookResult.data, chapters: chaptersResult.data }); setSourceChapters(chaptersResult.data);
    }).catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : 'Không thể tải chương.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, reload]);

  const chapters = useMemo(() => {
    const search = query.trim().toLowerCase().replace('chương', '').trim();
    const filtered = sourceChapters.filter((chapter) => {
      const matchesQuery = !search || String(chapter.number).includes(search) || chapter.title.toLowerCase().includes(search);
      const matchesFilter = filter === 'all' || chapter.access === filter;
      return matchesQuery && matchesFilter;
    });
    return newestFirst ? [...filtered].reverse() : filtered;
  }, [sourceChapters, query, filter, newestFirst]);

  const openChapter = (chapter: number) => router.push({ pathname: '/reader/[bookId]', params: { bookId: book.id, chapter } });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2E2428" /></Pressable>
        <View style={styles.headerCopy}><Text numberOfLines={1} style={styles.title}>Danh sách chương</Text><Text numberOfLines={1} style={styles.subtitle}>{book.title} · {book.totalChapters} chương</Text></View>
      </View>
      <View style={styles.controls}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color="#80747A" />
          <TextInput value={query} onChangeText={setQuery} placeholder="Tìm số hoặc tên chương…" placeholderTextColor="#9C9296" style={styles.input} inputMode="search" />
          {query ? <Pressable onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color="#A3989C" /></Pressable> : null}
        </View>
        <View style={styles.filterLine}>
          <View style={styles.chips}>
            {([['all', 'Tất cả'], ['free', 'Miễn phí'], ['vip', 'VIP']] as const).map(([value, label]) => (
              <Pressable key={value} style={[styles.chip, filter === value && styles.chipActive]} onPress={() => setFilter(value)}><Text style={[styles.chipText, filter === value && styles.chipTextActive]}>{label}</Text></Pressable>
            ))}
          </View>
          <Pressable style={styles.sort} onPress={() => setNewestFirst((value) => !value)}><Ionicons name="swap-vertical" size={15} color="#8F1D3F" /><Text style={styles.sortText}>{newestFirst ? 'Mới nhất' : 'Cũ nhất'}</Text></Pressable>
        </View>
        <Text style={styles.result}>{chapters.length} chương</Text>
      </View>
      {loading ? <LoadingState label="Đang tải danh sách chương…" /> : error ? <RetryState title="Không tải được chương" detail={error} onRetry={() => setReload((value) => value + 1)} /> : <FlatList
        data={chapters}
        keyExtractor={(item) => String(item.number)}
        renderItem={({ item }) => <ChapterRow chapter={item} onPress={() => openChapter(item.number)} />}
        contentContainerStyle={[styles.list, chapters.length === 0 && styles.emptyList]}
        ListEmptyComponent={<EmptyState title="Không tìm thấy chương" detail="Thử đổi từ khóa hoặc bộ lọc." />}
        showsVerticalScrollIndicator={false}
        initialNumToRender={18}
      />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  header: { height: 67, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0D4CD' },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E4D8D2', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, marginLeft: 12 },
  title: { color: '#271D21', fontSize: 19, fontWeight: '900' },
  subtitle: { color: '#7D7176', fontSize: 11, marginTop: 2 },
  controls: { paddingHorizontal: 16, paddingTop: 14, maxWidth: 720, width: '100%', alignSelf: 'center' },
  search: { height: 48, borderRadius: 14, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E0D4CD', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 9 },
  input: { flex: 1, color: '#2D2327', fontSize: 14, paddingVertical: 0 },
  filterLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 },
  chips: { flexDirection: 'row', gap: 6, flexShrink: 1 },
  chip: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#D8CBC5' },
  chipActive: { backgroundColor: '#8F1D3F', borderColor: '#8F1D3F' },
  chipText: { color: '#756A6F', fontSize: 10, fontWeight: '800' },
  chipTextActive: { color: '#FFFFFF' },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7 },
  sortText: { color: '#8F1D3F', fontSize: 10, fontWeight: '900' },
  result: { color: '#8A7E83', fontSize: 10, marginTop: 11, marginBottom: 3 },
  list: { paddingHorizontal: 16, paddingBottom: 35, maxWidth: 720, width: '100%', alignSelf: 'center' },
  emptyList: { flexGrow: 1, justifyContent: 'center' }
});
