import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, DimensionValue, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  BookReviewItem,
  BookReviewSummary,
  deleteBookReview,
  getBookReviews,
  getBookReviewSummary,
  ReviewSort,
  saveBookReview,
  setReviewHelpful,
} from '../services/reviews';
import { LoadingState, RetryState } from './States';

const sorts: Array<{ id: ReviewSort; label: string }> = [
  { id: 'helpful', label: 'Hữu ích' },
  { id: 'recent', label: 'Mới nhất' },
  { id: 'high', label: 'Điểm cao' },
  { id: 'low', label: 'Điểm thấp' },
];

export function BookReviews({ bookId, authorUserId }: { bookId: string; authorUserId?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [summary, setSummary] = useState<BookReviewSummary | null>(null);
  const [items, setItems] = useState<BookReviewItem[]>([]);
  const [sort, setSort] = useState<ReviewSort>('helpful');
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [pendingHelpful, setPendingHelpful] = useState<Set<string>>(new Set());

  const ownBook = Boolean(user?.id && authorUserId && user.id === authorUserId);

  const load = useCallback(async (full = true) => {
    if (!isSupabaseConfigured) {
      setSummary({
        averageRating: 0,
        ratingCount: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        myReview: null,
      });
      setItems([]);
      setLoading(false);
      return;
    }

    full ? setLoading(true) : setListLoading(true);
    setError('');
    try {
      const [nextSummary, nextItems] = await Promise.all([
        getBookReviewSummary(bookId),
        getBookReviews(bookId, sort, user?.id),
      ]);
      setSummary(nextSummary);
      setItems(nextItems);
      if (nextSummary.myReview) {
        setRating(nextSummary.myReview.rating);
        setReviewText(nextSummary.myReview.reviewText);
        setSpoiler(nextSummary.myReview.spoiler);
      } else {
        setRating(0);
        setReviewText('');
        setSpoiler(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải đánh giá.');
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [bookId, sort, user?.id]);

  useEffect(() => { void load(); }, [load]);

  const distributionMax = useMemo(() => {
    if (!summary) return 1;
    return Math.max(1, ...Object.values(summary.distribution));
  }, [summary]);

  const save = async () => {
    if (!user) return router.push('/auth/login');
    if (ownBook) return Alert.alert('Không thể tự đánh giá', 'Tác giả không thể chấm điểm truyện của chính mình.');
    if (!rating) return Alert.alert('Chưa chọn số sao', 'Hãy chọn từ 1 đến 5 sao trước khi gửi.');
    if (saving) return;

    setSaving(true);
    setError('');
    try {
      await saveBookReview({ userId: user.id, bookId, rating, reviewText, spoiler });
      await load(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu đánh giá.');
    } finally {
      setSaving(false);
    }
  };

  const removeOwn = () => {
    if (!user || !summary?.myReview) return;
    Alert.alert('Xóa đánh giá?', 'Điểm sao và nội dung đánh giá của bạn sẽ bị xóa.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          void deleteBookReview(summary.myReview!.id, user.id)
            .then(() => load(false))
            .catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể xóa đánh giá.'));
        },
      },
    ]);
  };

  const toggleHelpful = async (item: BookReviewItem) => {
    if (!user) return router.push('/auth/login');
    if (item.userId === user.id || pendingHelpful.has(item.id)) return;
    const nextHelpful = !item.helpful;

    setPendingHelpful((value) => new Set(value).add(item.id));
    setItems((rows) => rows.map((row) => row.id === item.id
      ? { ...row, helpful: nextHelpful, helpfulCount: Math.max(0, row.helpfulCount + (nextHelpful ? 1 : -1)) }
      : row));

    try {
      await setReviewHelpful(item.id, user.id, nextHelpful);
    } catch (cause) {
      setItems((rows) => rows.map((row) => row.id === item.id ? item : row));
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật đánh giá hữu ích.');
    } finally {
      setPendingHelpful((value) => {
        const next = new Set(value);
        next.delete(item.id);
        return next;
      });
    }
  };

  if (loading) return <View style={styles.wrap}><LoadingState label="Đang tải đánh giá…" /></View>;
  if (error && !summary) return <View style={styles.wrap}><RetryState detail={error} onRetry={() => load()} /></View>;
  if (!summary) return null;

  return <View style={styles.wrap}>
    <View style={styles.head}>
      <Text style={styles.heading}>Đánh giá độc giả</Text>
      <Text style={styles.count}>{summary.ratingCount} lượt</Text>
    </View>

    <View style={styles.summaryCard}>
      <View style={styles.scoreBox}>
        <Text style={styles.score}>{summary.ratingCount ? summary.averageRating.toFixed(1) : '—'}</Text>
        <Stars value={Math.round(summary.averageRating)} size={15} />
        <Text style={styles.scoreMeta}>{summary.ratingCount ? String(summary.ratingCount) + ' đánh giá' : 'Chưa có đánh giá'}</Text>
      </View>
      <View style={styles.distribution}>
        {([5, 4, 3, 2, 1] as const).map((star) => <View style={styles.distRow} key={star}>
          <Text style={styles.distLabel}>{star}</Text>
          <Ionicons name="star" size={10} color="#B9842E" />
          <View style={styles.distTrack}><View style={[styles.distFill, { width: (String(summary.distribution[star] / distributionMax * 100) + '%') as DimensionValue }]} /></View>
          <Text style={styles.distCount}>{summary.distribution[star]}</Text>
        </View>)}
      </View>
    </View>

    {isSupabaseConfigured ? <View style={styles.editor}>
      <View style={styles.editorTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.editorTitle}>{summary.myReview ? 'Đánh giá của bạn' : 'Bạn thấy truyện này thế nào?'}</Text>
          <Text style={styles.editorHint}>{ownBook ? 'Tác giả không thể tự chấm điểm truyện.' : 'Mỗi tài khoản chỉ có một đánh giá cho mỗi truyện.'}</Text>
        </View>
        {summary.myReview ? <Pressable onPress={removeOwn}><Text style={styles.deleteText}>Xóa</Text></Pressable> : null}
      </View>

      <View style={styles.starPicker}>
        {[1, 2, 3, 4, 5].map((value) => <Pressable key={value} disabled={ownBook} hitSlop={6} onPress={() => setRating(value)}>
          <Ionicons name={value <= rating ? 'star' : 'star-outline'} size={29} color={value <= rating ? '#B9842E' : '#B8AAA1'} />
        </Pressable>)}
      </View>

      <TextInput
        value={reviewText}
        onChangeText={setReviewText}
        editable={!ownBook}
        multiline
        maxLength={4000}
        placeholder={user ? 'Viết cảm nhận về cốt truyện, nhân vật, nhịp truyện…' : 'Đăng nhập để viết đánh giá…'}
        placeholderTextColor="#9C9094"
        style={styles.input}
      />
      <View style={styles.editorBottom}>
        <Pressable disabled={ownBook} onPress={() => setSpoiler((value) => !value)} style={[styles.spoilerToggle, spoiler && styles.spoilerActive]}>
          <Ionicons name={spoiler ? 'eye-off' : 'eye-off-outline'} size={15} color={spoiler ? '#FFFFFF' : '#8F1D3F'} />
          <Text style={[styles.spoilerText, spoiler && styles.spoilerTextActive]}>Có spoiler</Text>
        </Pressable>
        <Text style={styles.charCount}>{reviewText.length}/4000</Text>
        <Pressable disabled={saving || ownBook} onPress={save} style={[styles.saveButton, (saving || ownBook) && styles.disabled]}>
          <Text style={styles.saveText}>{!user ? 'Đăng nhập' : saving ? 'Đang lưu…' : summary.myReview ? 'Cập nhật' : 'Gửi đánh giá'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View> : <Text style={styles.demo}>Demo · Đánh giá thật hoạt động khi kết nối Supabase.</Text>}

    <View style={styles.listHead}>
      <Text style={styles.listTitle}>Cảm nhận gần đây</Text>
      <View style={styles.sorts}>{sorts.map((item) => <Pressable key={item.id} onPress={() => setSort(item.id)} style={[styles.sortChip, sort === item.id && styles.sortActive]}>
        <Text style={[styles.sortText, sort === item.id && styles.sortTextActive]}>{item.label}</Text>
      </Pressable>)}</View>
    </View>

    {listLoading ? <LoadingState label="Đang sắp xếp…" /> : null}
    {!listLoading && !items.length ? <Text style={styles.empty}>Chưa có cảm nhận nào. Hãy là người đầu tiên đánh giá.</Text> : null}
    {!listLoading && items.map((item) => {
      const hiddenSpoiler = item.spoiler && !revealed.has(item.id) && item.userId !== user?.id;
      return <View key={item.id} style={styles.review}>
        <View style={styles.reviewTop}>
          {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.avatar} /> : <View style={styles.avatar}><Text style={styles.avatarText}>{item.userName[0]?.toUpperCase() || 'C'}</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewName}>{item.userName}</Text>
            <View style={styles.reviewStars}><Stars value={item.rating} size={12} /><Text style={styles.reviewDate}>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</Text></View>
          </View>
          {item.moderationState !== 'approved' ? <Text style={styles.moderationBadge}>{item.moderationState === 'hidden' ? 'Đã ẩn' : 'Bị từ chối'}</Text> : null}
        </View>

        {item.reviewText ? hiddenSpoiler ? <Pressable style={styles.spoilerCover} onPress={() => setRevealed((value) => new Set(value).add(item.id))}>
          <Ionicons name="eye-off-outline" size={18} color="#8F1D3F" />
          <View style={{ flex: 1 }}><Text style={styles.spoilerCoverTitle}>Nội dung có spoiler</Text><Text style={styles.spoilerCoverBody}>Chạm để hiện đánh giá này.</Text></View>
        </Pressable> : <Text style={styles.reviewText}>{item.reviewText}</Text> : <Text style={styles.ratingOnly}>Chỉ chấm {item.rating} sao.</Text>}

        <View style={styles.actions}>
          <Pressable disabled={item.userId === user?.id} onPress={() => { void toggleHelpful(item); }} style={styles.action}>
            <Ionicons name={item.helpful ? 'thumbs-up' : 'thumbs-up-outline'} size={14} color={item.helpful ? '#8F1D3F' : '#756A6E'} />
            <Text style={[styles.actionText, item.helpful && styles.actionActiveText]}>Hữu ích · {item.helpfulCount}</Text>
          </Pressable>
          {item.userId !== user?.id ? <Pressable onPress={() => {
            if (!user) return router.push('/auth/login');
            router.push({ pathname: '/report', params: { reviewId: item.id, label: 'Đánh giá của ' + item.userName } });
          }}><Text style={styles.reportText}>Báo cáo</Text></Pressable> : null}
        </View>
      </View>;
    })}
  </View>;
}

function Stars({ value, size }: { value: number; size: number }) {
  return <View style={styles.stars}>{[1, 2, 3, 4, 5].map((star) => <Ionicons key={star} name={star <= value ? 'star' : 'star-outline'} size={size} color="#B9842E" />)}</View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 24 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  heading: { color: '#221A1D', fontSize: 19, fontWeight: '900' },
  count: { color: '#8F1D3F', fontSize: 10, fontWeight: '900' },
  summaryCard: { borderRadius: 17, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', padding: 14, flexDirection: 'row', gap: 18 },
  scoreBox: { width: 110, alignItems: 'center', justifyContent: 'center' },
  score: { color: '#2B2125', fontSize: 34, fontWeight: '900' },
  scoreMeta: { color: '#8A7E82', fontSize: 9, marginTop: 5 },
  stars: { flexDirection: 'row', gap: 2 },
  distribution: { flex: 1, justifyContent: 'center', gap: 5 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  distLabel: { color: '#756A6E', fontSize: 9, width: 8, textAlign: 'right' },
  distTrack: { flex: 1, height: 6, borderRadius: 99, backgroundColor: '#EDE3DE', overflow: 'hidden' },
  distFill: { height: 6, borderRadius: 99, backgroundColor: '#B9842E' },
  distCount: { color: '#8A7E82', fontSize: 8, width: 20, textAlign: 'right' },
  editor: { marginTop: 12, borderRadius: 17, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E5D8D1', padding: 14 },
  editorTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  editorTitle: { color: '#2B2125', fontSize: 13, fontWeight: '900' },
  editorHint: { color: '#84777C', fontSize: 9, marginTop: 3 },
  deleteText: { color: '#A12B48', fontSize: 9, fontWeight: '900' },
  starPicker: { flexDirection: 'row', gap: 5, marginTop: 12 },
  input: { minHeight: 86, textAlignVertical: 'top', borderWidth: 1, borderColor: '#DED1CA', backgroundColor: '#FAF6F2', borderRadius: 13, padding: 11, color: '#33282D', fontSize: 12, lineHeight: 18, marginTop: 10 },
  editorBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  spoilerToggle: { height: 34, borderRadius: 999, borderWidth: 1, borderColor: '#DABBC5', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  spoilerActive: { backgroundColor: '#8F1D3F', borderColor: '#8F1D3F' },
  spoilerText: { color: '#8F1D3F', fontSize: 9, fontWeight: '900' },
  spoilerTextActive: { color: '#FFF' },
  charCount: { flex: 1, color: '#9B8F93', fontSize: 8, textAlign: 'right' },
  saveButton: { minHeight: 36, borderRadius: 10, backgroundColor: '#8F1D3F', paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  disabled: { opacity: .45 },
  error: { color: '#A12B48', backgroundColor: '#F8E7EC', borderRadius: 9, padding: 8, fontSize: 9, marginTop: 9 },
  demo: { color: '#8A7E82', fontSize: 10, textAlign: 'center', paddingVertical: 12 },
  listHead: { marginTop: 20 },
  listTitle: { color: '#2B2125', fontSize: 15, fontWeight: '900' },
  sorts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  sortChip: { borderRadius: 999, borderWidth: 1, borderColor: '#DED1CA', paddingHorizontal: 9, paddingVertical: 6, backgroundColor: '#FFFDFC' },
  sortActive: { backgroundColor: '#8F1D3F', borderColor: '#8F1D3F' },
  sortText: { color: '#756A6E', fontSize: 8, fontWeight: '800' },
  sortTextActive: { color: '#FFF' },
  empty: { color: '#8A7E82', fontSize: 10, textAlign: 'center', paddingVertical: 24 },
  review: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA', paddingVertical: 14 },
  reviewTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#8F1D3F', fontSize: 12, fontWeight: '900' },
  reviewName: { color: '#33282D', fontSize: 11, fontWeight: '900' },
  reviewStars: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  reviewDate: { color: '#94888C', fontSize: 8 },
  moderationBadge: { color: '#A12B48', fontSize: 8, fontWeight: '900', backgroundColor: '#F8E7EC', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  reviewText: { color: '#554A4E', fontSize: 12, lineHeight: 19, marginTop: 9 },
  ratingOnly: { color: '#8A7E82', fontSize: 10, fontStyle: 'italic', marginTop: 8 },
  spoilerCover: { marginTop: 9, borderRadius: 12, backgroundColor: '#F0E1E5', padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  spoilerCoverTitle: { color: '#8F1D3F', fontSize: 10, fontWeight: '900' },
  spoilerCoverBody: { color: '#806E74', fontSize: 8, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: '#756A6E', fontSize: 9, fontWeight: '800' },
  actionActiveText: { color: '#8F1D3F' },
  reportText: { color: '#8F1D3F', fontSize: 9, fontWeight: '800' },
});
