import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState, RetryState } from '../../components/States';
import { AssetBookCover, VipArt } from '../../components/Artwork';
import { XianxiaBackdrop } from '../../components/XianxiaBackdrop';
import { xianxia } from '../../constants/xianxia';
import {
  addSearchHistory,
  clearSearchHistory,
  DiscoveryAccess,
  DiscoverySort,
  DiscoveryStatus,
  getDiscoveryGenres,
  getSearchHistory,
  GenreCount,
  removeSearchHistory,
  searchDiscovery,
} from '../../services/discovery';
import { Book } from '../../types';

const accessOptions: { value: DiscoveryAccess; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'free', label: 'Miễn phí' },
  { value: 'vip', label: 'VIP' },
];

const statusOptions: { value: DiscoveryStatus; label: string }[] = [
  { value: 'all', label: 'Mọi trạng thái' },
  { value: 'ongoing', label: 'Đang ra' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'paused', label: 'Tạm dừng' },
];

const sortOptions: { value: DiscoverySort; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'relevance', label: 'Liên quan', icon: 'sparkles-outline' },
  { value: 'popular', label: 'Phổ biến', icon: 'flame-outline' },
  { value: 'newest', label: 'Mới cập nhật', icon: 'time-outline' },
  { value: 'rating', label: 'Đánh giá', icon: 'star-outline' },
];

export default function DiscoverScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [access, setAccess] = useState<DiscoveryAccess>('all');
  const [status, setStatus] = useState<DiscoveryStatus>('all');
  const [sort, setSort] = useState<DiscoverySort>('popular');
  const [genres, setGenres] = useState<GenreCount[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState<'supabase' | 'demo'>('supabase');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    void Promise.all([getDiscoveryGenres(30), getSearchHistory()])
      .then(([genreRows, searchHistory]) => {
        setGenres(genreRows);
        setHistory(searchHistory);
      })
      .catch(() => undefined);
  }, [reload]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 320);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setSort(query.trim() ? 'relevance' : 'popular');
  }, [hasQuery]);

  useEffect(() => {
    let active = true;
    if (!refreshing) setLoading(true);
    setError('');

    void searchDiscovery({
      query: debouncedQuery,
      genre,
      access,
      status,
      sort,
      limit: 40,
    }).then((result) => {
      if (!active) return;
      setBooks(result.books);
      setTotal(result.total);
      setMode(result.mode);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Không thể tải khám phá.');
    }).finally(() => {
      if (active) {
        setLoading(false);
        setRefreshing(false);
      }
    });

    return () => { active = false; };
  }, [debouncedQuery, genre, access, status, sort, reload]);

  const activeFilters = useMemo(() => {
    let count = 0;
    if (genre) count += 1;
    if (access !== 'all') count += 1;
    if (status !== 'all') count += 1;
    return count;
  }, [access, genre, status]);

  const submitSearch = async () => {
    if (!query.trim()) return;
    setHistory(await addSearchHistory(query));
  };

  const useHistory = async (term: string) => {
    setQuery(term);
    setHistory(await addSearchHistory(term));
  };

  const resetFilters = () => {
    setGenre(null);
    setAccess('all');
    setStatus('all');
  };

  const refresh = () => {
    setRefreshing(true);
    setReload((value) => value + 1);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <XianxiaBackdrop />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>TÀNG KINH CÁC</Text>
            <Text style={styles.title}>Khám phá</Text>
            <Text style={styles.headerSub}>Tìm cơ duyên giữa ngàn thế giới.</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{mode === 'demo' ? 'Demo' : 'Dữ liệu thật'}</Text>
          </View>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={20} color="#756B6F" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => { void submitSearch(); }}
            returnKeyType="search"
            autoCorrect={false}
            placeholder="Tên truyện, tác giả, thể loại, từ khóa..."
            placeholderTextColor="#9B9195"
            style={styles.input}
          />
          {query ? <Pressable style={styles.clearSearch} onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={20} color="#A6999E" />
          </Pressable> : null}
        </View>
        <Text style={styles.searchHint}>Có thể tìm không dấu: “kiem yen”, “thanh pho”, “kinh di”…</Text>

        {!hasQuery && history.length ? <View style={styles.historyBlock}>
          <View style={styles.sectionHead}>
            <Text style={styles.smallHeading}>Tìm gần đây</Text>
            <Pressable onPress={() => { void clearSearchHistory().then(() => setHistory([])); }}>
              <Text style={styles.clearHistory}>Xóa hết</Text>
            </Pressable>
          </View>
          <View style={styles.historyWrap}>
            {history.map((term) => <View key={term} style={styles.historyChip}>
              <Pressable onPress={() => { void useHistory(term); }} style={styles.historyMain}>
                <Ionicons name="time-outline" size={14} color="#8F1D3F" />
                <Text numberOfLines={1} style={styles.historyText}>{term}</Text>
              </Pressable>
              <Pressable onPress={() => { void removeSearchHistory(term).then(setHistory); }} style={styles.historyRemove}>
                <Ionicons name="close" size={14} color="#9A8E93" />
              </Pressable>
            </View>)}
          </View>
        </View> : null}

        <View style={styles.sectionHead}>
          <Text style={styles.heading}>Thể loại</Text>
          {activeFilters ? <Pressable onPress={resetFilters}><Text style={styles.reset}>Đặt lại ({activeFilters})</Text></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
          <FilterChip label="Tất cả" active={!genre} onPress={() => setGenre(null)} />
          {genres.map((item) => <FilterChip
            key={item.genre}
            label={item.genre + ' · ' + item.count}
            active={genre === item.genre}
            onPress={() => setGenre(genre === item.genre ? null : item.genre)}
          />)}
        </ScrollView>

        <Text style={styles.filterLabel}>Quyền đọc</Text>
        <View style={styles.chips}>
          {accessOptions.map((item) => <FilterChip key={item.value} label={item.label} active={access === item.value} onPress={() => setAccess(item.value)} />)}
        </View>

        <Text style={styles.filterLabel}>Trạng thái</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
          {statusOptions.map((item) => <FilterChip key={item.value} label={item.label} active={status === item.value} onPress={() => setStatus(item.value)} />)}
        </ScrollView>

        <View style={styles.sectionHead}>
          <Text style={styles.heading}>{hasQuery ? 'Kết quả tìm kiếm' : '🔥 BXH nổi bật'}</Text>
          {!loading && !error ? <Text style={styles.resultCount}>{total} truyện</Text> : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
          {sortOptions
            .filter((item) => hasQuery || item.value !== 'relevance')
            .map((item) => <Pressable key={item.value} style={[styles.sortChip, sort === item.value && styles.sortChipActive]} onPress={() => setSort(item.value)}>
              <Ionicons name={item.icon} size={14} color={sort === item.value ? '#FFF' : '#8F1D3F'} />
              <Text style={[styles.sortText, sort === item.value && styles.sortTextActive]}>{item.label}</Text>
            </Pressable>)}
        </ScrollView>

        {loading ? <View style={styles.stateBox}><LoadingState label={hasQuery ? 'Đang tìm truyện…' : 'Đang xếp hạng truyện…'} /></View>
          : error ? <RetryState title="Không tải được Khám phá" detail={error} onRetry={() => setReload((value) => value + 1)} />
          : books.length === 0 ? <EmptyState title="Không tìm thấy truyện" detail="Thử từ khóa ngắn hơn hoặc bỏ bớt bộ lọc." />
          : <View style={styles.results}>
            {books.map((book, index) => <DiscoveryBookRow key={book.id} book={book} rank={!hasQuery && sort === 'popular' ? index + 1 : undefined} onOpen={() => {
              if (query.trim()) void submitSearch();
              router.push({ pathname: '/book/[id]', params: { id: book.id } });
            }} />)}
          </View>}

        <View style={styles.infoCard}>
          <Ionicons name="analytics-outline" size={24} color="#8F1D3F" />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>BXH dùng tín hiệu thật</Text>
            <Text style={styles.infoBody}>Phổ biến được tính từ lượt đọc, lượt theo dõi, đánh giá và độ mới. Không chèn số liệu giả để đẩy truyện.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </Pressable>;
}

function DiscoveryBookRow({ book, rank, onOpen }: { book: Book; rank?: number; onOpen: () => void }) {
  return <Pressable onPress={onOpen} style={({ pressed }) => [styles.bookRow, pressed && styles.pressed]}>
    {rank ? <View style={[styles.rank, rank <= 3 && styles.rankTop]}><Text style={[styles.rankText, rank <= 3 && styles.rankTextTop]}>{rank}</Text></View> : null}
    <View style={styles.cover}>
      <AssetBookCover bookId={book.id} title={book.title} coverUrl={book.coverUrl} style={StyleSheet.absoluteFillObject} />
      <View pointerEvents="none" style={styles.coverShade} />
      <Text style={styles.coverBrand}>CHƯƠNG</Text>
      <View style={styles.coverSeal}><Ionicons name="sparkles-outline" size={15} color={xianxia.goldSoft} /></View>
    </View>
    <View style={styles.bookInfo}>
      <View style={styles.bookTitleRow}>
        <Text numberOfLines={2} style={styles.bookTitle}>{book.title}</Text>
        {book.isVip ? <VipArt width={48} /> : null}
      </View>
      <Text numberOfLines={1} style={styles.author}>{book.author}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.genre}>{book.genre}</Text>
        <View style={styles.metaItem}><Ionicons name="star" size={12} color="#A36A24" /><Text style={styles.metaText}>{book.rating.toFixed(1)}</Text></View>
        <View style={styles.metaItem}><Ionicons name="eye-outline" size={13} color="#80747A" /><Text style={styles.metaText}>{book.views}</Text></View>
      </View>
      <Text numberOfLines={2} style={styles.description}>{book.description || 'Chưa có mô tả.'}</Text>
      <View style={styles.footerRow}>
        <Text style={styles.status}>{book.status}</Text>
        <Text style={styles.chapterCount}>{book.totalChapters} chương</Text>
      </View>
    </View>
    <Ionicons name="chevron-forward" size={17} color="#B4A7AC" />
  </Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  page: { padding: 16, paddingBottom: 44, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { marginTop: 7, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: xianxia.cinnabar, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: xianxia.ink, fontSize: 30, fontWeight: '900', marginTop: 3 },
  headerSub: { color: xianxia.muted, fontSize: 9, marginTop: 3 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E8DCD5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#47704D' },
  liveText: { color: '#756B6F', fontSize: 9, fontWeight: '800' },
  search: { minHeight: 54, backgroundColor: 'rgba(255,253,247,.90)', borderRadius: 17, borderWidth: 1, borderColor: xianxia.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, shadowColor: '#5F554A', shadowOpacity: .06, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  input: { flex: 1, marginLeft: 10, color: '#221A1D', fontSize: 14, paddingVertical: 12 },
  clearSearch: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  searchHint: { color: '#96898F', fontSize: 9, marginTop: 7, marginLeft: 3 },
  historyBlock: { marginTop: 18 },
  sectionHead: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  smallHeading: { color: '#2E2428', fontSize: 13, fontWeight: '900' },
  clearHistory: { color: '#8F1D3F', fontSize: 9, fontWeight: '800' },
  historyWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 },
  historyChip: { minHeight: 34, maxWidth: '100%', borderRadius: 11, borderWidth: 1, borderColor: '#E2D5CE', backgroundColor: '#FFFDFC', flexDirection: 'row', alignItems: 'center' },
  historyMain: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingVertical: 7, maxWidth: 260 },
  historyText: { color: '#53474C', fontSize: 10, fontWeight: '700', maxWidth: 200 },
  historyRemove: { width: 30, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  heading: { color: '#221A1D', fontSize: 19, fontWeight: '900', marginTop: 20, marginBottom: 9 },
  reset: { color: '#8F1D3F', fontSize: 9, fontWeight: '900', marginTop: 12 },
  resultCount: { color: '#82757B', fontSize: 10, marginTop: 12 },
  horizontalChips: { gap: 7, paddingRight: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#DFD1CA', alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: xianxia.jadeDeep, borderColor: '#496A61' },
  chipText: { color: '#65595E', fontSize: 10, fontWeight: '800' },
  chipTextActive: { color: '#FFF' },
  filterLabel: { color: '#5E5157', fontSize: 10, fontWeight: '900', marginTop: 14, marginBottom: 7 },
  sortRow: { gap: 7, paddingBottom: 12 },
  sortChip: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: '#DFC9D0', backgroundColor: '#FFFDFC' },
  sortChipActive: { backgroundColor: xianxia.jadeDeep, borderColor: '#496A61' },
  sortText: { color: '#8F1D3F', fontSize: 9, fontWeight: '900' },
  sortTextActive: { color: '#FFF' },
  stateBox: { minHeight: 220 },
  results: { gap: 9 },
  bookRow: { minHeight: 141, borderRadius: 18, backgroundColor: 'rgba(255,253,247,.90)', borderWidth: 1, borderColor: xianxia.line, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#5B5147', shadowOpacity: .04, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  pressed: { opacity: .78, transform: [{ scale: .995 }] },
  rank: { width: 26, height: 34, borderRadius: 9, backgroundColor: '#EEE8EA', alignItems: 'center', justifyContent: 'center' },
  rankTop: { backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold },
  rankText: { color: '#786D71', fontSize: 12, fontWeight: '900' },
  rankTextTop: { color: '#FFF' },
  cover: { width: 78, height: 116, borderRadius: 8, overflow: 'hidden', justifyContent: 'space-between', borderWidth: 2, borderColor: xianxia.gold, shadowColor: '#2B342E', shadowOpacity: .14, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,24,22,.12)' },
  coverSeal: { position: 'absolute', right: 6, top: 6, width: 20, height: 20, borderRadius: 6, backgroundColor: 'rgba(132,50,41,.82)', borderWidth: 1, borderColor: 'rgba(229,209,163,.7)', alignItems: 'center', justifyContent: 'center' },
  coverSealText: { color: '#F3D99D', fontSize: 9, fontWeight: '900' },
  coverBrand: { color: 'rgba(255,255,255,.78)', fontSize: 6, fontWeight: '900', letterSpacing: .8 },
  bookInfo: { flex: 1, minWidth: 0 },
  bookTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  bookTitle: { flex: 1, color: '#2A2024', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  author: { color: xianxia.jade, fontSize: 9, fontWeight: '800', marginTop: 3 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 },
  genre: { color: '#63565C', fontSize: 8, fontWeight: '800', backgroundColor: '#F5EFEB', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: '#80747A', fontSize: 8, fontWeight: '700' },
  description: { color: '#7B6F74', fontSize: 9, lineHeight: 13, marginTop: 6 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 6 },
  status: { color: '#47704D', fontSize: 8, fontWeight: '900' },
  chapterCount: { color: '#95898E', fontSize: 8 },
  infoCard: { marginTop: 20, borderRadius: 17, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoTitle: { color: '#382C31', fontSize: 11, fontWeight: '900' },
  infoBody: { color: '#756B6F', fontSize: 9, lineHeight: 14, marginTop: 3 },
});
