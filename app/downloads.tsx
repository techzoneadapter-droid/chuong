import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState, RetryState } from '../components/States';
import { getConnectivityState } from '../services/connectivity';
import {
  clearOfflineDownloads,
  formatOfflineBytes,
  getOfflineBookRecords,
  getOfflineStorageStats,
  listOfflineBooks,
  OfflineBookSummary,
  OfflineStorageStats,
  pruneExpiredVipDownloads,
  removeOfflineBook,
  setOfflineQuotaBytes,
} from '../services/offlineDownloads';

const quotaOptions = [
  { label: '100 MB', bytes: 100 * 1024 * 1024 },
  { label: '250 MB', bytes: 250 * 1024 * 1024 },
  { label: '500 MB', bytes: 500 * 1024 * 1024 },
  { label: '1 GB', bytes: 1024 * 1024 * 1024 },
];

export default function DownloadsScreen() {
  const router = useRouter();
  const [books, setBooks] = useState<OfflineBookSummary[]>([]);
  const [stats, setStats] = useState<OfflineStorageStats | null>(null);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [items, storage, connectivity] = await Promise.all([
        listOfflineBooks(),
        getOfflineStorageStats(),
        getConnectivityState(),
      ]);
      setBooks(items);
      setStats(storage);
      setOnline(connectivity.reachable);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách offline.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const openBook = async (book: OfflineBookSummary) => {
    const records = await getOfflineBookRecords(book.bookId);
    const first = records.find((item) => item.expiredVipCount === undefined) ?? records[0];
    if (!first) return;
    router.push({ pathname: '/reader/[bookId]', params: { bookId: book.bookId, chapter: first.chapterNumber } });
  };

  const remove = (book: OfflineBookSummary) => {
    Alert.alert(
      'Xóa bản tải?',
      `Xóa ${book.chapterCount} chương của “${book.title}” khỏi thiết bị?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () => {
            void removeOfflineBook(book.bookId).then(() => load());
          },
        },
      ],
    );
  };

  const clearAll = () => {
    Alert.alert(
      'Xóa toàn bộ bản tải?',
      'Tủ sách và quyền đã mua không bị ảnh hưởng. Chỉ nội dung lưu trên thiết bị sẽ bị xóa.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa tất cả',
          style: 'destructive',
          onPress: () => {
            void clearOfflineDownloads().then(() => load());
          },
        },
      ],
    );
  };

  if (loading && !stats) return <SafeAreaView style={styles.safe}><LoadingState label="Đang kiểm tra bản tải…" /></SafeAreaView>;
  if (error && !stats) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;

  const usedPercent = stats ? Math.min(100, stats.totalBytes / Math.max(1, stats.quotaBytes) * 100) : 0;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable>
      <Text style={styles.topTitle}>Tải xuống</Text>
      <Pressable style={styles.iconButton} onPress={() => { void load(true); }}><Ionicons name="refresh" size={20} color="#8F1D3F" /></Pressable>
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>CHƯƠNG OFFLINE</Text>
          <Text style={styles.title}>Đọc khi không có mạng</Text>
        </View>
        <View style={[styles.networkBadge, online ? styles.networkOnline : styles.networkOffline]}>
          <View style={[styles.networkDot, { backgroundColor: online ? '#527058' : '#A12B48' }]} />
          <Text style={styles.networkText}>{online ? 'Đang online' : 'Đang offline'}</Text>
        </View>
      </View>

      <View style={styles.storageCard}>
        <View style={styles.storageTop}>
          <View>
            <Text style={styles.storageLabel}>Dung lượng offline</Text>
            <Text style={styles.storageValue}>{formatOfflineBytes(stats?.totalBytes ?? 0)} / {formatOfflineBytes(stats?.quotaBytes ?? 0)}</Text>
          </View>
          <Text style={styles.storageMeta}>{stats?.bookCount ?? 0} truyện · {stats?.chapterCount ?? 0} chương</Text>
        </View>
        <View style={styles.track}><View style={[styles.fill, { width: `${usedPercent}%` }]} /></View>
        <Text style={styles.storageHint}>Khi vượt giới hạn, CHƯƠNG tự dọn các chương ít dùng nhất trước. Bản vừa tải được giữ lại.</Text>

        <Text style={styles.quotaTitle}>Giới hạn lưu trữ</Text>
        <View style={styles.quotaRow}>
          {quotaOptions.map((option) => {
            const active = stats?.quotaBytes === option.bytes;
            return <Pressable
              key={option.label}
              style={[styles.quotaChip, active && styles.quotaChipActive]}
              onPress={() => {
                void setOfflineQuotaBytes(option.bytes).then(() => load());
              }}
            >
              <Text style={[styles.quotaText, active && styles.quotaTextActive]}>{option.label}</Text>
            </Pressable>;
          })}
        </View>
      </View>

      {(stats?.expiredVipCount ?? 0) > 0 ? <View style={styles.warning}>
        <Ionicons name="shield-outline" size={21} color="#A12B48" />
        <View style={{ flex: 1 }}>
          <Text style={styles.warningTitle}>{stats?.expiredVipCount} chương VIP cần xác minh lại</Text>
          <Text style={styles.warningBody}>Bản VIP offline có thời hạn xác minh. Kết nối mạng rồi mở lại truyện hoặc dọn các bản hết hạn.</Text>
        </View>
        <Pressable onPress={() => { void pruneExpiredVipDownloads().then(() => load()); }}>
          <Text style={styles.warningAction}>Dọn</Text>
        </Pressable>
      </View> : null}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Truyện đã tải</Text>
        {books.length ? <Pressable onPress={clearAll}><Text style={styles.clearText}>Xóa tất cả</Text></Pressable> : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!books.length ? <EmptyState title="Chưa có truyện offline" detail="Mở một truyện → Tải truyện để lưu chương trên thiết bị." /> : <View style={styles.list}>
        {books.map((book) => <Pressable key={book.bookId} onPress={() => { void openBook(book); }} style={({ pressed }) => [styles.bookCard, pressed && styles.pressed]}>
          <View style={[styles.cover, { backgroundColor: book.cover }]}>
            <Text style={styles.coverBrand}>CHƯƠNG</Text>
            <Text numberOfLines={3} style={styles.coverTitle}>{book.title}</Text>
          </View>
          <View style={styles.bookBody}>
            <Text numberOfLines={2} style={styles.bookTitle}>{book.title}</Text>
            <Text numberOfLines={1} style={styles.bookAuthor}>{book.author}{book.genre ? ` · ${book.genre}` : ''}</Text>
            <View style={styles.bookMetaRow}>
              <View style={styles.metaItem}><Ionicons name="download-outline" size={13} color="#8F1D3F" /><Text style={styles.metaText}>{book.chapterCount} chương</Text></View>
              <View style={styles.metaItem}><Ionicons name="save-outline" size={13} color="#8F1D3F" /><Text style={styles.metaText}>{formatOfflineBytes(book.bytes)}</Text></View>
            </View>
            {book.expiredVipCount ? <Text style={styles.expiredText}>{book.expiredVipCount} chương VIP cần mạng để xác minh</Text> : <Text style={styles.readyText}>Sẵn sàng đọc offline</Text>}
          </View>
          <Pressable hitSlop={8} onPress={(event) => { event.stopPropagation(); remove(book); }} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={18} color="#A12B48" />
          </Pressable>
        </Pressable>)}
      </View>}

      <View style={styles.licenseNote}>
        <Ionicons name="information-circle-outline" size={20} color="#8F1D3F" />
        <Text style={styles.licenseText}>Nội dung miễn phí có thể đọc offline lâu dài. Nội dung VIP cần xác minh quyền đọc định kỳ; nếu hoàn tiền hoặc quyền bị thu hồi, bản tải sẽ bị vô hiệu khi ứng dụng kết nối lại.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', color: '#251D20', fontSize: 16, fontWeight: '900' },
  page: { padding: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { marginTop: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  kicker: { color: '#8F1D3F', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#221A1D', fontSize: 25, fontWeight: '900', marginTop: 4 },
  networkBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1 },
  networkOnline: { backgroundColor: '#EDF4EC', borderColor: '#D6E2D4' },
  networkOffline: { backgroundColor: '#F8E7EC', borderColor: '#E7CAD2' },
  networkDot: { width: 7, height: 7, borderRadius: 4 },
  networkText: { color: '#61565A', fontSize: 8, fontWeight: '900' },
  storageCard: { marginTop: 16, borderRadius: 18, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', padding: 15 },
  storageTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  storageLabel: { color: '#6E6167', fontSize: 9, fontWeight: '800' },
  storageValue: { color: '#2B2125', fontSize: 17, fontWeight: '900', marginTop: 3 },
  storageMeta: { color: '#8C7F84', fontSize: 8, textAlign: 'right' },
  track: { height: 6, borderRadius: 99, backgroundColor: '#E9DFDA', overflow: 'hidden', marginTop: 12 },
  fill: { height: 6, borderRadius: 99, backgroundColor: '#8F1D3F' },
  storageHint: { color: '#85787D', fontSize: 9, lineHeight: 14, marginTop: 8 },
  quotaTitle: { color: '#4A3D42', fontSize: 9, fontWeight: '900', marginTop: 13, marginBottom: 7 },
  quotaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quotaChip: { borderRadius: 999, borderWidth: 1, borderColor: '#DED1CA', backgroundColor: '#FAF6F2', paddingHorizontal: 10, paddingVertical: 6 },
  quotaChipActive: { backgroundColor: '#8F1D3F', borderColor: '#8F1D3F' },
  quotaText: { color: '#756B6F', fontSize: 8, fontWeight: '800' },
  quotaTextActive: { color: '#FFF' },
  warning: { marginTop: 12, borderRadius: 15, backgroundColor: '#F8E7EC', borderWidth: 1, borderColor: '#E8CBD3', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  warningTitle: { color: '#7D233F', fontSize: 10, fontWeight: '900' },
  warningBody: { color: '#806E74', fontSize: 8, lineHeight: 13, marginTop: 2 },
  warningAction: { color: '#8F1D3F', fontSize: 9, fontWeight: '900' },
  sectionHead: { marginTop: 22, marginBottom: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#2B2125', fontSize: 18, fontWeight: '900' },
  clearText: { color: '#A12B48', fontSize: 9, fontWeight: '900' },
  error: { color: '#A12B48', backgroundColor: '#F8E7EC', borderRadius: 10, padding: 10, fontSize: 9, marginBottom: 8 },
  list: { gap: 9 },
  bookCard: { minHeight: 128, borderRadius: 17, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pressed: { opacity: .82, transform: [{ scale: .995 }] },
  cover: { width: 72, height: 104, borderRadius: 12, padding: 8, justifyContent: 'space-between' },
  coverBrand: { color: 'rgba(255,255,255,.76)', fontSize: 6, fontWeight: '900', letterSpacing: .8 },
  coverTitle: { color: '#FFF', fontSize: 11, lineHeight: 14, fontWeight: '900' },
  bookBody: { flex: 1, minWidth: 0 },
  bookTitle: { color: '#2A2024', fontSize: 14, lineHeight: 18, fontWeight: '900' },
  bookAuthor: { color: '#8F1D3F', fontSize: 9, fontWeight: '800', marginTop: 3 },
  bookMetaRow: { flexDirection: 'row', gap: 10, marginTop: 9 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#776A70', fontSize: 8, fontWeight: '700' },
  readyText: { color: '#527058', fontSize: 8, fontWeight: '900', marginTop: 7 },
  expiredText: { color: '#A12B48', fontSize: 8, fontWeight: '900', marginTop: 7 },
  deleteButton: { width: 36, height: 42, borderRadius: 12, backgroundColor: '#F8E7EC', alignItems: 'center', justifyContent: 'center' },
  licenseNote: { marginTop: 18, borderRadius: 15, backgroundColor: '#F0E1E5', padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  licenseText: { flex: 1, color: '#6B5E63', fontSize: 9, lineHeight: 15 },
});
