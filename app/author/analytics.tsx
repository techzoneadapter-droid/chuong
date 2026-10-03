import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { getAuthorForUser } from '../../services/authors';
import {
  AuthorReadingAnalytics,
  formatReadingDuration,
  getAuthorReadingAnalytics,
} from '../../services/analytics';

const ranges = [7, 30, 90] as const;

export default function AuthorAnalyticsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [days, setDays] = useState<(typeof ranges)[number]>(30);
  const [data, setData] = useState<AuthorReadingAnalytics | null>(null);
  const [penName, setPenName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth/login');
      return;
    }

    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const author = await getAuthorForUser(user.id);
      if (!author) {
        router.replace('/author/onboarding');
        return;
      }
      setPenName(author.penName);
      setData(await getAuthorReadingAnalytics(author.id, days));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải phân tích độc giả.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, days, router, user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const maxDaily = useMemo(
    () => Math.max(1, ...(data?.daily.map((item) => item.uniqueReaders) ?? [1])),
    [data?.daily],
  );

  if (loading && !data) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải phân tích độc giả…" /></SafeAreaView>;
  if (error && !data) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;
  if (!data) return null;

  const summary = data.summary;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.icon} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.topTitle}>Phân tích độc giả</Text>
        <Text style={styles.topSub}>{penName}</Text>
      </View>
      <Pressable style={styles.icon} onPress={() => { void load(true); }}><Ionicons name="refresh" size={20} color="#8F1D3F" /></Pressable>
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.rangeRow}>
        {ranges.map((range) => <Pressable key={range} onPress={() => setDays(range)} style={[styles.rangeChip, days === range && styles.rangeActive]}>
          <Text style={[styles.rangeText, days === range && styles.rangeTextActive]}>{range} ngày</Text>
        </Pressable>)}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.hero}>
        <Text style={styles.heroKicker}>SỨC KHỎE ĐỘC GIẢ</Text>
        <Text style={styles.heroValue}>{summary.readerCount.toLocaleString('vi-VN')} độc giả</Text>
        <Text style={styles.heroBody}>
          {summary.returningReaders.toLocaleString('vi-VN')} độc giả quay lại · {summary.sessions.toLocaleString('vi-VN')} phiên đọc trong {days} ngày gần nhất.
        </Text>
      </View>

      <View style={styles.grid}>
        <Metric icon="people-outline" label="Độc giả quay lại" value={summary.returningReaders.toLocaleString('vi-VN')} sub={summary.returnRate.toFixed(1) + '% tỷ lệ quay lại'} />
        <Metric icon="book-outline" label="Phiên đọc" value={summary.sessions.toLocaleString('vi-VN')} sub={summary.avgSessionMinutes.toFixed(1) + ' phút / phiên'} />
        <Metric icon="checkmark-circle-outline" label="Hoàn thành chương" value={summary.chapterCompletions.toLocaleString('vi-VN')} sub={summary.completionRate.toFixed(1) + '% trên lượt bắt đầu'} />
        <Metric icon="time-outline" label="Thời gian đọc" value={formatReadingDuration(summary.activeSeconds)} sub="Thời gian hoạt động đã xác minh" />
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Nhịp đọc theo ngày</Text>
        <Text style={styles.sectionMeta}>Có thể trễ tối đa ~5 phút</Text>
      </View>
      {!data.daily.length ? <Empty text="Chưa có dữ liệu đọc trong khoảng thời gian này." /> : <View style={styles.chartCard}>
        <View style={styles.chartBars}>
          {data.daily.slice(-30).map((item) => {
            const height = Math.max(5, Math.round(item.uniqueReaders / maxDaily * 86));
            return <View key={item.date} style={styles.barSlot}>
              <View style={[styles.bar, { height }]} />
            </View>;
          })}
        </View>
        <View style={styles.chartFooter}>
          <Text style={styles.chartLabel}>{data.daily[0]?.date ? new Date(data.daily[0].date + 'T00:00:00').toLocaleDateString('vi-VN') : ''}</Text>
          <Text style={styles.chartLabel}>{data.daily.length} ngày có dữ liệu</Text>
          <Text style={styles.chartLabel}>{data.daily.at(-1)?.date ? new Date(data.daily.at(-1)!.date + 'T00:00:00').toLocaleDateString('vi-VN') : ''}</Text>
        </View>
      </View>}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Theo từng truyện</Text>
        <Text style={styles.sectionMeta}>{data.books.length} truyện</Text>
      </View>
      {!data.books.length ? <Empty text="Chưa có truyện để thống kê." /> : data.books.map((book) => <Pressable
        key={book.bookId}
        onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.bookId } })}
        style={styles.bookCard}
      >
        <View style={styles.bookIcon}><Ionicons name="book-outline" size={19} color="#8F1D3F" /></View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.bookTitle}>{book.title}</Text>
          <Text style={styles.bookMeta}>{book.uniqueReaderDays.toLocaleString('vi-VN')} lượt độc giả/ngày · {book.sessions.toLocaleString('vi-VN')} phiên</Text>
          <Text style={styles.bookMeta}>{book.completionRate.toFixed(1)}% hoàn thành chương · {formatReadingDuration(book.activeSeconds)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#8F1D3F" />
      </Pressable>)}

      <View style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={19} color="#8F1D3F" />
        <Text style={styles.noteText}>
          Bảng này chỉ hiển thị số liệu tổng hợp. Tác giả không nhận ID thiết bị, danh tính độc giả hoặc lịch sử đọc cá nhân. Lượt đọc được chống đếm lặp theo độc giả/ngày và thời gian đọc được giới hạn theo thời gian thực của phiên.
        </Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function Metric({ icon, label, value, sub }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; sub: string }) {
  return <View style={styles.metric}>
    <View style={styles.metricIcon}><Ionicons name={icon} size={18} color="#8F1D3F" /></View>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricSub}>{sub}</Text>
  </View>;
}

function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: '#251D20', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  topSub: { color: '#81757A', fontSize: 9, textAlign: 'center', marginTop: 2 },
  page: { padding: 16, paddingBottom: 46, width: '100%', maxWidth: 760, alignSelf: 'center' },
  rangeRow: { flexDirection: 'row', gap: 7, marginBottom: 12 },
  rangeChip: { minWidth: 72, height: 34, borderRadius: 999, borderWidth: 1, borderColor: '#DCCEC7', backgroundColor: '#FFFDFC', alignItems: 'center', justifyContent: 'center' },
  rangeActive: { backgroundColor: '#8F1D3F', borderColor: '#8F1D3F' },
  rangeText: { color: '#756A6E', fontSize: 10, fontWeight: '900' },
  rangeTextActive: { color: '#FFF' },
  error: { color: '#A12B48', fontSize: 10, backgroundColor: '#F7E7EC', padding: 10, borderRadius: 10, marginBottom: 10 },
  hero: { backgroundColor: '#741632', borderRadius: 22, padding: 21 },
  heroKicker: { color: '#EFC5D1', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  heroValue: { color: '#FFF', fontSize: 31, fontWeight: '900', marginTop: 7 },
  heroBody: { color: '#E9C5D0', fontSize: 11, lineHeight: 17, marginTop: 8, maxWidth: 520 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  metric: { width: '48%', flexGrow: 1, minHeight: 132, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', borderRadius: 16, padding: 13 },
  metricIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: '#2B2226', fontSize: 18, fontWeight: '900', marginTop: 10 },
  metricLabel: { color: '#5E5257', fontSize: 10, fontWeight: '900', marginTop: 3 },
  metricSub: { color: '#8A7E82', fontSize: 8, lineHeight: 12, marginTop: 5 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 24, marginBottom: 8 },
  sectionTitle: { color: '#241C20', fontSize: 18, fontWeight: '900' },
  sectionMeta: { color: '#8F1D3F', fontSize: 9, fontWeight: '800' },
  chartCard: { borderRadius: 16, borderWidth: 1, borderColor: '#E5D8D1', backgroundColor: '#FFFDFC', padding: 13 },
  chartBars: { height: 96, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  barSlot: { flex: 1, minWidth: 2, alignItems: 'stretch', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, backgroundColor: '#9C2448', minHeight: 5 },
  chartFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 9 },
  chartLabel: { color: '#8A7E82', fontSize: 8 },
  bookCard: { minHeight: 76, borderRadius: 15, borderWidth: 1, borderColor: '#E5D8D1', backgroundColor: '#FFFDFC', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  bookIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  bookTitle: { color: '#33282D', fontSize: 12, fontWeight: '900' },
  bookMeta: { color: '#81757A', fontSize: 9, marginTop: 3 },
  empty: { minHeight: 86, borderRadius: 14, borderWidth: 1, borderColor: '#E5D8D1', backgroundColor: '#FFFDFC', alignItems: 'center', justifyContent: 'center', padding: 15 },
  emptyText: { color: '#81757A', fontSize: 10, textAlign: 'center' },
  note: { marginTop: 18, borderRadius: 15, backgroundColor: '#F0E1E5', padding: 14, flexDirection: 'row', gap: 9 },
  noteText: { flex: 1, color: '#65575D', fontSize: 10, lineHeight: 16 },
});
