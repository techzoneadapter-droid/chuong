import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AssetBookCover } from '../../components/Artwork';
import { LoadingState, RetryState } from '../../components/States';
import { StudioShell } from '../../components/StudioShell';
import { xianxia } from '../../constants/xianxia';
import { useAuth } from '../../contexts/AuthContext';
import { listAdminCatalogBooks } from '../../services/adminCatalog';
import { Book, BookStatus } from '../../types';

type Filter = 'all' | BookStatus;

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'draft', label: 'Bản nháp' },
  { value: 'ongoing', label: 'Đang ra' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'paused', label: 'Tạm dừng' },
];

export default function ContentStudioDashboard() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!user || profile?.role !== 'admin') return;
    setLoading(true);
    setError('');
    try {
      setBooks(await listAdminCatalogBooks());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải kho truyện.');
    } finally {
      setLoading(false);
    }
  }, [profile?.role, user]);

  useFocusEffect(useCallback(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/studio/login');
      return;
    }
    if (profile?.role !== 'admin') {
      router.replace('/(tabs)/profile');
      return;
    }
    void load();
  }, [authLoading, load, profile?.role, router, user]));

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi');
    return books.filter((book) => {
      if (filter !== 'all' && book.backendStatus !== filter) return false;
      if (!normalized) return true;
      return [book.title, book.author, book.genre, ...(book.tags ?? [])]
        .join(' ')
        .toLocaleLowerCase('vi')
        .includes(normalized);
    });
  }, [books, filter, query]);

  const metrics = useMemo(() => ({
    total: books.length,
    public: books.filter((book) => book.visibility === 'public' || (book.backendStatus && book.backendStatus !== 'draft')).length,
    drafts: books.filter((book) => book.backendStatus === 'draft').length,
    chapters: books.reduce((sum, book) => sum + Number(book.totalChapters || 0), 0),
  }), [books]);

  if (authLoading || (loading && !books.length)) return <LoadingState label="Đang mở CHƯƠNG Content Studio…" />;
  if (profile?.role !== 'admin') return null;
  if (error && !books.length) return <RetryState detail={error} onRetry={load} />;

  return <StudioShell
    active="overview"
    title="Kho truyện của app mobile"
    subtitle="Đẩy truyện, kiểm soát trạng thái xuất bản và quản lý nội dung hiển thị trực tiếp trong ứng dụng CHƯƠNG."
    actions={<>
      <Pressable style={styles.secondaryAction} onPress={() => void load()}><Ionicons name="refresh-outline" size={17} color={xianxia.jadeDeep} /><Text style={styles.secondaryActionText}>Làm mới</Text></Pressable>
      <Pressable style={styles.primaryAction} onPress={() => router.push('/studio/upload')}><Ionicons name="cloud-upload-outline" size={17} color="#FFF8EA" /><Text style={styles.primaryActionText}>Đẩy truyện</Text></Pressable>
    </>}
  >
    {error ? <View style={styles.error}><Ionicons name="alert-circle-outline" size={18} color={xianxia.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}

    <View style={styles.metricGrid}>
      <Metric icon="library-outline" value={metrics.total} label="Tổng truyện" />
      <Metric icon="eye-outline" value={metrics.public} label="Đang hiển thị" />
      <Metric icon="document-text-outline" value={metrics.drafts} label="Bản nháp" />
      <Metric icon="reader-outline" value={metrics.chapters} label="Tổng chương" />
    </View>

    <View style={styles.toolbar}>
      <View style={styles.search}>
        <Ionicons name="search-outline" size={18} color="#7A716C" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Tìm tên truyện, tác giả, thể loại…"
          placeholderTextColor="#9E9690"
          style={styles.searchInput}
        />
        {query ? <Pressable onPress={() => setQuery('')}><Ionicons name="close-circle" size={17} color="#A69C94" /></Pressable> : null}
      </View>
      <View style={styles.filters}>
        {filters.map((item) => {
          const active = filter === item.value;
          return <Pressable key={item.value} onPress={() => setFilter(item.value)} style={[styles.filter, active && styles.filterActive]}>
            <Text style={[styles.filterText, active && styles.filterTextActive]}>{item.label}</Text>
          </Pressable>;
        })}
      </View>
    </View>

    <View style={styles.sectionHead}>
      <View>
        <Text style={styles.sectionTitle}>Danh sách truyện</Text>
        <Text style={styles.sectionSub}>{visible.length} / {books.length} truyện đang hiển thị trong bộ lọc</Text>
      </View>
      <Pressable style={styles.textAction} onPress={() => router.push('/studio/upload')}><Ionicons name="add-circle-outline" size={17} color={xianxia.cinnabar} /><Text style={styles.textActionText}>Thêm nội dung mới</Text></Pressable>
    </View>

    {!visible.length ? <View style={styles.empty}>
      <Ionicons name="file-tray-outline" size={36} color={xianxia.jade} />
      <Text style={styles.emptyTitle}>Chưa có truyện phù hợp</Text>
      <Text style={styles.emptyBody}>Đổi bộ lọc hoặc đẩy truyện mới vào kho nội dung.</Text>
    </View> : <View style={styles.bookGrid}>
      {visible.map((book) => <BookTile key={book.id} book={book} onManage={() => router.push({ pathname: '/studio/book/[bookId]', params: { bookId: book.id } })} onPreview={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })} />)}
    </View>}
  </StudioShell>;
}

function Metric({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }) {
  return <View style={styles.metric}>
    <View style={styles.metricIcon}><Ionicons name={icon} size={20} color={xianxia.jadeDeep} /></View>
    <View><Text style={styles.metricValue}>{value.toLocaleString('vi-VN')}</Text><Text style={styles.metricLabel}>{label}</Text></View>
  </View>;
}

function statusLabel(status?: BookStatus) {
  if (status === 'ongoing') return 'Đang ra';
  if (status === 'completed') return 'Hoàn thành';
  if (status === 'paused') return 'Tạm dừng';
  return 'Bản nháp';
}

function BookTile({ book, onManage, onPreview }: { book: Book; onManage: () => void; onPreview: () => void }) {
  const live = book.backendStatus !== 'draft' && book.visibility !== 'private';
  return <View style={styles.bookCard}>
    <View style={styles.cover}>
      <AssetBookCover bookId={book.id} title={book.title} coverUrl={book.coverUrl} style={StyleSheet.absoluteFillObject} />
    </View>
    <View style={styles.bookBody}>
      <View style={styles.bookTop}>
        <View style={[styles.status, live ? styles.statusLive : styles.statusDraft]}><View style={[styles.dot, live ? styles.dotLive : styles.dotDraft]} /><Text style={[styles.statusText, live ? styles.statusTextLive : styles.statusTextDraft]}>{statusLabel(book.backendStatus)}</Text></View>
        <Text style={styles.chapterCount}>{book.totalChapters} chương</Text>
      </View>
      <Text numberOfLines={2} style={styles.bookTitle}>{book.title}</Text>
      <Text numberOfLines={1} style={styles.bookMeta}>{book.author} · {book.genre}</Text>
      <Text numberOfLines={2} style={styles.bookDesc}>{book.description || 'Chưa có mô tả.'}</Text>
      <View style={styles.bookActions}>
        <Pressable style={styles.manageButton} onPress={onManage}><Ionicons name="settings-outline" size={15} color="#FFF8EA" /><Text style={styles.manageText}>Quản lý</Text></Pressable>
        <Pressable style={styles.previewButton} onPress={onPreview}><Ionicons name="eye-outline" size={15} color={xianxia.jadeDeep} /><Text style={styles.previewText}>Xem trên app</Text></Pressable>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  primaryAction: { minHeight: 42, borderRadius: 12, paddingHorizontal: 14, backgroundColor: xianxia.jadeDeep, flexDirection: 'row', alignItems: 'center', gap: 7 },
  primaryActionText: { color: '#FFF8EA', fontSize: 9.5, fontWeight: '900' },
  secondaryAction: { minHeight: 42, borderRadius: 12, paddingHorizontal: 13, backgroundColor: '#EEF1EC', borderWidth: 1, borderColor: '#CCD7CF', flexDirection: 'row', alignItems: 'center', gap: 7 },
  secondaryActionText: { color: xianxia.jadeDeep, fontSize: 9, fontWeight: '900' },
  error: { borderRadius: 13, padding: 11, backgroundColor: '#F5E5E1', borderWidth: 1, borderColor: '#E4C5BD', flexDirection: 'row', gap: 8, marginBottom: 16 },
  errorText: { flex: 1, color: xianxia.danger, fontSize: 9, lineHeight: 14 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { minWidth: 190, flexGrow: 1, flexBasis: 210, minHeight: 92, borderRadius: 17, padding: 15, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E1D9CC', flexDirection: 'row', alignItems: 'center', gap: 12 },
  metricIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C1D1C6', alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: '#211D1F', fontSize: 22, fontWeight: '900' },
  metricLabel: { color: '#7A716C', fontSize: 8.5, fontWeight: '800', marginTop: 2 },
  toolbar: { marginTop: 18, borderRadius: 17, padding: 13, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E1D9CC', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  search: { flex: 1, minWidth: 280, minHeight: 42, borderRadius: 12, backgroundColor: '#F7F3EC', borderWidth: 1, borderColor: '#DED5C8', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, color: '#302A2C', fontSize: 10, paddingVertical: 0 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: { minHeight: 36, borderRadius: 10, paddingHorizontal: 11, borderWidth: 1, borderColor: '#DED5C8', backgroundColor: '#FAF7F1', alignItems: 'center', justifyContent: 'center' },
  filterActive: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.jadeDeep },
  filterText: { color: '#6F6763', fontSize: 8.5, fontWeight: '800' },
  filterTextActive: { color: '#FFF8EA' },
  sectionHead: { marginTop: 22, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: '#251F22', fontSize: 18, fontWeight: '900' },
  sectionSub: { color: '#7A716C', fontSize: 8.5, marginTop: 3 },
  textAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7 },
  textActionText: { color: xianxia.cinnabar, fontSize: 9, fontWeight: '900' },
  empty: { minHeight: 230, borderRadius: 18, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E1D9CC', alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { color: '#2B2528', fontSize: 14, fontWeight: '900', marginTop: 8 },
  emptyBody: { color: '#7A716C', fontSize: 9, marginTop: 4 },
  bookGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'stretch' },
  bookCard: { minWidth: 330, flexGrow: 1, flexBasis: 430, minHeight: 220, borderRadius: 18, padding: 14, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E1D9CC', flexDirection: 'row', gap: 14 },
  cover: { width: 112, height: 164, borderRadius: 12, overflow: 'hidden', backgroundColor: '#EDE5D7', borderWidth: 1, borderColor: '#D9CCBA' },
  bookBody: { flex: 1, minWidth: 0 },
  bookTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  status: { minHeight: 26, borderRadius: 999, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusLive: { backgroundColor: '#E6F0E8' },
  statusDraft: { backgroundColor: '#F0E8E4' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotLive: { backgroundColor: '#4F7758' },
  dotDraft: { backgroundColor: '#9A6A62' },
  statusText: { fontSize: 7.5, fontWeight: '900' },
  statusTextLive: { color: '#45694D' },
  statusTextDraft: { color: '#845950' },
  chapterCount: { color: '#827A74', fontSize: 8, fontWeight: '800' },
  bookTitle: { color: '#261F22', fontSize: 15, lineHeight: 20, fontWeight: '900', marginTop: 8 },
  bookMeta: { color: xianxia.jade, fontSize: 8.5, fontWeight: '800', marginTop: 4 },
  bookDesc: { color: '#7A716C', fontSize: 8.5, lineHeight: 13, marginTop: 7 },
  bookActions: { marginTop: 'auto' as never, paddingTop: 11, flexDirection: 'row', gap: 7 },
  manageButton: { minHeight: 38, borderRadius: 11, paddingHorizontal: 12, backgroundColor: xianxia.jadeDeep, flexDirection: 'row', alignItems: 'center', gap: 6 },
  manageText: { color: '#FFF8EA', fontSize: 8.5, fontWeight: '900' },
  previewButton: { minHeight: 38, borderRadius: 11, paddingHorizontal: 12, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C0D0C4', flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewText: { color: xianxia.jadeDeep, fontSize: 8.5, fontWeight: '900' },
});
