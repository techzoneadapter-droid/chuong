import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { getAuthorForUser } from '../../services/authors';
import { AuthorReviewDashboard, getAuthorReviewDashboard } from '../../services/reviews';

export default function AuthorReviewsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<AuthorReviewDashboard | null>(null);
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
      setData(await getAuthorReviewDashboard(author.id, user.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải đánh giá độc giả.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, router, user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading && !data) return <SafeAreaView style={styles.safe}><LoadingState label="Đang tải đánh giá độc giả…" /></SafeAreaView>;
  if (error && !data) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;
  if (!data) return null;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.icon} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable>
      <View style={{ flex: 1 }}><Text style={styles.topTitle}>Đánh giá độc giả</Text><Text style={styles.topSub}>{penName}</Text></View>
      <Pressable style={styles.icon} onPress={() => { void load(true); }}><Ionicons name="refresh" size={20} color="#8F1D3F" /></Pressable>
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.hero}>
        <Text style={styles.heroKicker}>TỔNG QUAN PHẢN HỒI</Text>
        <Text style={styles.heroScore}>{data.totalRatings ? data.weightedAverage.toFixed(2) : '—'} / 5</Text>
        <Text style={styles.heroBody}>{data.totalRatings} lượt chấm điểm trên {data.books.length} truyện. Điểm trung bình được tính theo số lượng đánh giá thực tế của từng truyện.</Text>
      </View>

      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Theo từng truyện</Text><Text style={styles.sectionMeta}>{data.books.length} truyện</Text></View>
      {!data.books.length ? <View style={styles.empty}><Text style={styles.emptyText}>Chưa có truyện để thống kê.</Text></View> : data.books.map((book) => <Pressable
        key={book.id}
        style={styles.bookRow}
        onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })}
      >
        <View style={styles.bookIcon}><Ionicons name="book-outline" size={19} color="#8F1D3F" /></View>
        <View style={{ flex: 1 }}><Text style={styles.bookTitle}>{book.title}</Text><Text style={styles.bookMeta}>{book.ratingCount} lượt đánh giá</Text></View>
        <View style={styles.bookScore}><Ionicons name="star" size={14} color="#B9842E" /><Text style={styles.bookScoreText}>{book.ratingCount ? book.rating.toFixed(2) : '—'}</Text></View>
      </Pressable>)}

      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Đánh giá gần đây</Text><Text style={styles.sectionMeta}>{data.reviews.length} mục</Text></View>
      {!data.reviews.length ? <View style={styles.empty}><Text style={styles.emptyText}>Chưa có độc giả nào để lại đánh giá.</Text></View> : data.reviews.map((review) => <View key={review.id} style={styles.review}>
        <View style={styles.reviewTop}>
          {review.avatarUrl ? <Image source={{ uri: review.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatar}><Text style={styles.avatarText}>{review.userName[0]?.toUpperCase() || 'C'}</Text></View>}
          <View style={{ flex: 1 }}><Text style={styles.reviewName}>{review.userName}</Text><Text style={styles.reviewBook}>{review.bookTitle}</Text></View>
          <View style={styles.reviewScore}><Ionicons name="star" size={13} color="#B9842E" /><Text style={styles.reviewScoreText}>{review.rating}</Text></View>
        </View>
        {review.spoiler ? <Text style={styles.spoiler}>Có spoiler</Text> : null}
        <Text style={styles.reviewText}>{review.reviewText || 'Chỉ chấm điểm, không viết nhận xét.'}</Text>
        <View style={styles.reviewBottom}>
          <Text style={styles.reviewMeta}>{new Date(review.createdAt).toLocaleString('vi-VN')}</Text>
          <Text style={styles.reviewMeta}>Hữu ích · {review.helpfulCount}</Text>
          {review.moderationState !== 'approved' ? <Text style={styles.moderated}>{review.moderationState === 'hidden' ? 'Đã ẩn' : 'Bị từ chối'}</Text> : null}
        </View>
      </View>)}

      <View style={styles.note}><Ionicons name="information-circle-outline" size={19} color="#8F1D3F" /><Text style={styles.noteText}>Tác giả chỉ xem phản hồi và số liệu. Tác giả không thể sửa, xóa hoặc tác động vào điểm đánh giá của độc giả. Nội dung vi phạm được xử lý qua hệ thống báo cáo và quản trị.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: '#251D20', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  topSub: { color: '#81757A', fontSize: 9, textAlign: 'center', marginTop: 2 },
  page: { padding: 16, paddingBottom: 44, width: '100%', maxWidth: 760, alignSelf: 'center' },
  error: { color: '#A12B48', fontSize: 10, backgroundColor: '#F7E7EC', padding: 10, borderRadius: 10, marginBottom: 10 },
  hero: { backgroundColor: '#741632', borderRadius: 22, padding: 21 },
  heroKicker: { color: '#EFC5D1', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  heroScore: { color: '#FFF', fontSize: 34, fontWeight: '900', marginTop: 7 },
  heroBody: { color: '#E9C5D0', fontSize: 11, lineHeight: 17, marginTop: 8, maxWidth: 520 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 8 },
  sectionTitle: { color: '#241C20', fontSize: 18, fontWeight: '900' },
  sectionMeta: { color: '#8F1D3F', fontSize: 10, fontWeight: '800' },
  bookRow: { minHeight: 66, borderRadius: 14, borderWidth: 1, borderColor: '#E5D8D1', backgroundColor: '#FFFDFC', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  bookIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  bookTitle: { color: '#33282D', fontSize: 12, fontWeight: '900' },
  bookMeta: { color: '#81757A', fontSize: 9, marginTop: 3 },
  bookScore: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bookScoreText: { color: '#33282D', fontSize: 13, fontWeight: '900' },
  review: { borderRadius: 15, borderWidth: 1, borderColor: '#E5D8D1', backgroundColor: '#FFFDFC', padding: 12, marginBottom: 8 },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#8F1D3F', fontSize: 12, fontWeight: '900' },
  reviewName: { color: '#33282D', fontSize: 11, fontWeight: '900' },
  reviewBook: { color: '#8F1D3F', fontSize: 9, fontWeight: '800', marginTop: 2 },
  reviewScore: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FAF0DA', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  reviewScoreText: { color: '#805C20', fontSize: 10, fontWeight: '900' },
  spoiler: { alignSelf: 'flex-start', color: '#8F1D3F', backgroundColor: '#F0E1E5', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4, fontSize: 8, fontWeight: '900', marginTop: 9 },
  reviewText: { color: '#5D5156', fontSize: 11, lineHeight: 18, marginTop: 8 },
  reviewBottom: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 9 },
  reviewMeta: { color: '#94888C', fontSize: 8 },
  moderated: { color: '#A12B48', fontSize: 8, fontWeight: '900' },
  empty: { minHeight: 82, borderRadius: 14, borderWidth: 1, borderColor: '#E5D8D1', backgroundColor: '#FFFDFC', alignItems: 'center', justifyContent: 'center', padding: 15 },
  emptyText: { color: '#81757A', fontSize: 10, textAlign: 'center' },
  note: { marginTop: 18, borderRadius: 15, backgroundColor: '#F0E1E5', padding: 14, flexDirection: 'row', gap: 9 },
  noteText: { flex: 1, color: '#65575D', fontSize: 10, lineHeight: 16 },
});
