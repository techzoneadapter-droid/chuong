import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState, RetryState } from '../../../components/States';
import { XianxiaBackdrop } from '../../../components/XianxiaBackdrop';
import { xianxia } from '../../../constants/xianxia';
import { useAuth } from '../../../contexts/AuthContext';
import { listAdminCatalogBooks } from '../../../services/adminCatalog';
import { Book } from '../../../types';

export default function AdminCatalogScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user || profile?.role !== 'admin') return;
    setLoading(true);
    setError('');
    try { setBooks(await listAdminCatalogBooks()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải kho truyện.'); }
    finally { setLoading(false); }
  }, [profile?.role, user]);

  useFocusEffect(useCallback(() => {
    if (!authLoading && (!user || profile?.role !== 'admin')) {
      router.replace('/(tabs)/profile');
      return;
    }
    void load();
  }, [authLoading, load, profile?.role, router, user]));

  if (authLoading) return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><LoadingState /></SafeAreaView>;
  if (profile?.role !== 'admin') return null;

  const publicCount = books.filter((book) => book.visibility === 'public' && book.backendStatus !== 'draft').length;
  const draftCount = books.filter((book) => book.backendStatus === 'draft').length;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={21} color={xianxia.ink} /></Pressable>
      <View style={styles.topCopy}><Text style={styles.kicker}>TÀNG KINH CÁC · ADMIN</Text><Text style={styles.topTitle}>Kho truyện</Text></View>
      <Pressable style={styles.addButton} onPress={() => router.push('/admin/catalog/new')}><Ionicons name="add" size={22} color={xianxia.white} /></Pressable>
    </View>

    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.summary}>
        <View style={styles.summarySeal}><Text style={styles.summarySealText}>藏</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryTitle}>Quản trị nội dung nền tảng</Text>
          <Text style={styles.summaryBody}>Admin có thể thêm truyện vào kho, gắn tác giả hiển thị, tải bìa và nhập nhiều chương. Truyện mới luôn bắt đầu ở trạng thái riêng tư.</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricValue}>{books.length}</Text><Text style={styles.metricLabel}>Tổng truyện</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{publicCount}</Text><Text style={styles.metricLabel}>Đang công khai</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{draftCount}</Text><Text style={styles.metricLabel}>Bản nháp</Text></View>
      </View>

      <Pressable style={styles.createCard} onPress={() => router.push('/admin/catalog/new')}>
        <View style={styles.createIcon}><Ionicons name="library-outline" size={22} color={xianxia.goldSoft} /></View>
        <View style={{ flex: 1 }}><Text style={styles.createTitle}>Thêm truyện vào kho</Text><Text style={styles.createBody}>Chọn tác giả sở hữu nội bộ, khai báo nguồn, ảnh bìa và tác giả hiển thị.</Text></View>
        <Ionicons name="chevron-forward" size={18} color={xianxia.goldSoft} />
      </Pressable>

      <Text style={styles.sectionTitle}>Danh mục hiện tại</Text>
      {loading ? <LoadingState label="Đang mở kho truyện…" /> : error ? <RetryState detail={error} onRetry={load} /> : books.length === 0 ? <EmptyState title="Kho truyện trống" detail="Hãy thêm truyện đầu tiên từ tài khoản quản trị." /> : books.map((book) => (
        <Pressable key={book.id} style={styles.bookRow} onPress={() => router.push({ pathname: '/admin/catalog/[bookId]', params: { bookId: book.id } })}>
          <View style={[styles.cover, { backgroundColor: book.cover || xianxia.jadeDeep }]}>
            {book.coverUrl ? <Image source={{ uri: book.coverUrl }} style={styles.coverImage} /> : <Text numberOfLines={3} style={styles.coverText}>{book.title}</Text>}
          </View>
          <View style={styles.bookCopy}>
            <Text numberOfLines={2} style={styles.bookTitle}>{book.title}</Text>
            <Text numberOfLines={1} style={styles.bookAuthor}>{book.author} · {book.genre}</Text>
            <View style={styles.badges}>
              <Text style={[styles.badge, book.visibility === 'public' && book.backendStatus !== 'draft' ? styles.badgeLive : styles.badgeDraft]}>{book.visibility === 'public' && book.backendStatus !== 'draft' ? 'CÔNG KHAI' : 'RIÊNG TƯ'}</Text>
              <Text style={styles.chapterBadge}>{book.totalChapters} chương</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9A8E80" />
        </Pressable>
      ))}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { minHeight: 66, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(245,239,228,.88)' },
  iconButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,253,247,.88)', borderWidth: 1, borderColor: xianxia.line },
  topCopy: { flex: 1, marginLeft: 11 },
  kicker: { color: xianxia.cinnabar, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  topTitle: { color: xianxia.ink, fontSize: 18, fontWeight: '900', marginTop: 2 },
  addButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: '#46665E' },
  page: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 16, paddingBottom: 48 },
  summary: { minHeight: 112, borderRadius: 20, padding: 16, backgroundColor: '#263E38', borderWidth: 1, borderColor: '#496A61', flexDirection: 'row', alignItems: 'center', gap: 14, overflow: 'hidden' },
  summarySeal: { width: 52, height: 52, borderRadius: 15, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, alignItems: 'center', justifyContent: 'center' },
  summarySealText: { color: '#F4DDA8', fontSize: 24, fontWeight: '900' },
  summaryTitle: { color: xianxia.white, fontSize: 15, fontWeight: '900' },
  summaryBody: { color: 'rgba(255,253,248,.68)', fontSize: 9, lineHeight: 14, marginTop: 5 },
  metrics: { flexDirection: 'row', gap: 9, marginTop: 12 },
  metric: { flex: 1, minHeight: 76, borderRadius: 16, backgroundColor: 'rgba(255,253,247,.88)', borderWidth: 1, borderColor: xianxia.line, alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: xianxia.jadeDeep, fontSize: 23, fontWeight: '900' },
  metricLabel: { color: xianxia.muted, fontSize: 8, marginTop: 3, fontWeight: '800' },
  createCard: { marginTop: 14, minHeight: 78, borderRadius: 18, padding: 14, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: '#496A61', flexDirection: 'row', alignItems: 'center', gap: 12 },
  createIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(229,209,163,.10)', borderWidth: 1, borderColor: 'rgba(229,209,163,.35)', alignItems: 'center', justifyContent: 'center' },
  createTitle: { color: xianxia.white, fontSize: 13, fontWeight: '900' },
  createBody: { color: 'rgba(255,253,248,.64)', fontSize: 8.5, lineHeight: 13, marginTop: 4 },
  sectionTitle: { color: xianxia.ink, fontSize: 17, fontWeight: '900', marginTop: 27, marginBottom: 8 },
  bookRow: { minHeight: 112, borderRadius: 18, padding: 10, marginTop: 9, backgroundColor: 'rgba(255,253,247,.90)', borderWidth: 1, borderColor: xianxia.line, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 62, height: 92, borderRadius: 11, overflow: 'hidden', borderWidth: 1, borderColor: xianxia.goldSoft, justifyContent: 'center', padding: 7 },
  coverImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  coverText: { color: xianxia.white, fontSize: 9, lineHeight: 12, fontWeight: '900', textAlign: 'center' },
  bookCopy: { flex: 1 },
  bookTitle: { color: xianxia.ink, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  bookAuthor: { color: xianxia.jade, fontSize: 9, fontWeight: '700', marginTop: 4 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 9 },
  badge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 99, fontSize: 7, fontWeight: '900' },
  badgeLive: { backgroundColor: '#DCE9DF', color: '#446A4E' },
  badgeDraft: { backgroundColor: '#EEE5DA', color: '#7E6F5D' },
  chapterBadge: { color: xianxia.muted, backgroundColor: '#F0EBE2', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 99, fontSize: 7, fontWeight: '800' },
});
