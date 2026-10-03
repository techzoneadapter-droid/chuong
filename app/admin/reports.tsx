import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { getAdminReports, ReportRow, ReportStatus, reportReasonLabel, reportStatusLabel } from '../../services/moderation';

const filters: Array<ReportStatus | 'all'> = ['all', 'open', 'reviewing', 'resolved', 'rejected'];

export default function AdminReportsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [filter, setFilter] = useState<ReportStatus | 'all'>('open');
  const [items, setItems] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setItems(await getAdminReports(filter === 'all' ? undefined : filter)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải báo cáo.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (profile?.role === 'admin') void load(); }, [filter, profile?.role]);
  if (profile?.role !== 'admin') return <SafeAreaView style={styles.safe}><RetryState detail="Bạn không có quyền quản trị." onRetry={() => router.back()} /></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.top}><Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={23} color="#2D2327" /></Pressable><Text style={styles.title}>Hàng đợi báo cáo</Text><View style={{ width: 23 }} /></View>
    <ScrollView contentContainerStyle={styles.page}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.map((item) => <Pressable key={item} style={[styles.filter, filter === item && styles.active]} onPress={() => setFilter(item)}>
          <Text style={[styles.filterText, filter === item && styles.activeText]}>{item === 'all' ? 'Tất cả' : reportStatusLabel(item)}</Text>
        </Pressable>)}
      </ScrollView>
      {loading ? <LoadingState label="Đang tải báo cáo…" /> : null}
      {error ? <RetryState detail={error} onRetry={load} /> : null}
      {!loading && !error && !items.length ? <Text style={styles.empty}>Không có báo cáo trong nhóm này.</Text> : null}
      {items.map((item) => <Pressable key={item.id} style={styles.card} onPress={() => router.push({ pathname: '/admin/reports/[id]', params: { id: item.id } })}>
        <View style={styles.cardTop}><Text style={styles.reason}>{reportReasonLabel(item.reason)}</Text><Text style={styles.status}>{reportStatusLabel(item.status)}</Text></View>
        <Text style={styles.target}>{targetLabel(item)}</Text>
        <Text numberOfLines={2} style={styles.details}>{item.details || 'Không có mô tả bổ sung.'}</Text>
        <Text style={styles.date}>{new Date(item.created_at).toLocaleString('vi-VN')}</Text>
      </Pressable>)}
    </ScrollView>
  </SafeAreaView>;
}

function targetLabel(item: ReportRow) {
  if (item.book_id) return 'Truyện · ' + item.book_id.slice(0, 8);
  if (item.chapter_id) return 'Chương · ' + item.chapter_id.slice(0, 8);
  if (item.comment_id) return 'Bình luận · ' + item.comment_id.slice(0, 8);
  if (item.author_id) return 'Tác giả · ' + item.author_id.slice(0, 8);
  if (item.review_id) return 'Đánh giá · ' + item.review_id.slice(0, 8);
  return 'Không xác định';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  top: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  title: { color: '#221A1D', fontSize: 18, fontWeight: '900' },
  page: { padding: 16, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' },
  filters: { gap: 8, paddingBottom: 14 },
  filter: { borderWidth: 1, borderColor: '#D9CCC5', backgroundColor: '#FFFDFC', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  active: { backgroundColor: '#8F1D3F', borderColor: '#8F1D3F' },
  filterText: { color: '#6E6166', fontSize: 11, fontWeight: '800' },
  activeText: { color: '#FFF' },
  empty: { color: '#84777C', fontSize: 13, textAlign: 'center', marginTop: 34 },
  card: { backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E4D8D1', borderRadius: 16, padding: 15, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  reason: { color: '#8F1D3F', fontSize: 13, fontWeight: '900', flex: 1 },
  status: { color: '#6A5F63', fontSize: 10, fontWeight: '800', backgroundColor: '#F1E9E5', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  target: { color: '#51454A', fontSize: 11, fontWeight: '800', marginTop: 10 },
  details: { color: '#766A6F', fontSize: 12, lineHeight: 18, marginTop: 5 },
  date: { color: '#9A8E92', fontSize: 9, marginTop: 10 },
});
