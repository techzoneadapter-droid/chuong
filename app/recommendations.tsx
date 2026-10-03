import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState, RetryState } from '../components/States';
import { useAuth } from '../contexts/AuthContext';
import {
  getPersonalizedRecommendations,
  hideRecommendation,
  PersonalizedRecommendation,
  recommendationReasonText,
  resetHiddenRecommendations,
} from '../services/recommendations';

export default function RecommendationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<PersonalizedRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busyReset, setBusyReset] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setItems(await getPersonalizedRecommendations(30));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải đề xuất.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const hide = async (item: PersonalizedRecommendation) => {
    if (!user) return;
    try {
      await hideRecommendation(item.book.id);
      setItems((current) => current.filter((entry) => entry.book.id !== item.book.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể ẩn đề xuất.');
    }
  };

  const reset = async () => {
    setBusyReset(true);
    setError('');
    try {
      await resetHiddenRecommendations();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đặt lại đề xuất.');
    } finally {
      setBusyReset(false);
    }
  };

  if (loading && !items.length && !error) {
    return <SafeAreaView style={styles.safe}><LoadingState label="Đang chọn truyện hợp gu…" /></SafeAreaView>;
  }

  if (error && !items.length) {
    return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;
  }

  const personalized = items.some((item) => item.personalized);

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color="#2D2327" />
      </Pressable>
      <Text style={styles.topTitle}>Dành cho bạn</Text>
      <View style={styles.iconButton} />
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} />}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.page}
    >
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="sparkles" size={25} color="#8F1D3F" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>{personalized ? 'Đề xuất theo gu đọc của bạn' : 'Bắt đầu khám phá gu đọc'}</Text>
          <Text style={styles.heroBody}>
            {personalized
              ? 'CHƯƠNG dùng tủ sách, tiến độ đọc và tác giả/truyện bạn theo dõi. Không cần AI trả phí để xếp hạng cơ bản.'
              : 'Hiện đang hiển thị truyện nổi bật. Đọc, yêu thích hoặc theo dõi để đề xuất ngày càng sát gu hơn.'}
          </Text>
        </View>
      </View>

      {user ? <View style={styles.controlRow}>
        <Text style={styles.controlText}>Không thích một truyện? Bấm “Ẩn” để loại khỏi đề xuất.</Text>
        <Pressable disabled={busyReset} onPress={() => { void reset(); }}>
          <Text style={[styles.resetText, busyReset && styles.disabledText]}>{busyReset ? 'Đang đặt lại…' : 'Khôi phục truyện đã ẩn'}</Text>
        </Pressable>
      </View> : <Pressable style={styles.loginBanner} onPress={() => router.push('/auth/login')}>
        <Ionicons name="person-circle-outline" size={21} color="#8F1D3F" />
        <Text style={styles.loginText}>Đăng nhập để cá nhân hóa đề xuất trên mọi thiết bị.</Text>
        <Ionicons name="chevron-forward" size={17} color="#8F1D3F" />
      </Pressable>}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!items.length ? <EmptyState title="Chưa có đề xuất" detail="Hãy khám phá thêm truyện rồi quay lại." /> : <View style={styles.list}>
        {items.map((item, index) => <Pressable
          key={item.book.id}
          onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.book.id } })}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={[styles.cover, { backgroundColor: item.book.cover }]}>
            {item.book.coverUrl ? <Image source={{ uri: item.book.coverUrl }} style={styles.coverImage} /> : null}
            <Text style={styles.coverBrand}>CHƯƠNG</Text>
            {!item.book.coverUrl ? <Text numberOfLines={3} style={styles.coverTitle}>{item.book.title}</Text> : null}
          </View>

          <View style={styles.body}>
            <View style={styles.rankRow}>
              <Text style={styles.rank}>#{index + 1}</Text>
              <View style={styles.reasonPill}>
                <Ionicons name={item.personalized ? 'sparkles' : 'flame-outline'} size={11} color="#8F1D3F" />
                <Text numberOfLines={1} style={styles.reasonText}>{recommendationReasonText(item)}</Text>
              </View>
            </View>
            <Text numberOfLines={2} style={styles.title}>{item.book.title}</Text>
            <Text numberOfLines={1} style={styles.author}>{item.book.author} · {item.book.genre}</Text>
            <Text numberOfLines={2} style={styles.description}>{item.book.description || 'Chưa có mô tả.'}</Text>
            <View style={styles.meta}>
              <View style={styles.metaItem}><Ionicons name="star" size={12} color="#A36A24" /><Text style={styles.metaText}>{item.book.rating.toFixed(1)}</Text></View>
              <View style={styles.metaItem}><Ionicons name="eye-outline" size={13} color="#80747A" /><Text style={styles.metaText}>{item.book.views}</Text></View>
              <Text style={styles.chapterText}>{item.book.totalChapters} chương</Text>
            </View>
          </View>

          {user ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Ẩn đề xuất ' + item.book.title}
            hitSlop={8}
            onPress={(event) => {
              event.stopPropagation();
              void hide(item);
            }}
            style={styles.hideButton}
          >
            <Ionicons name="close" size={16} color="#8F1D3F" />
            <Text style={styles.hideText}>Ẩn</Text>
          </Pressable> : <Ionicons name="chevron-forward" size={18} color="#B2A6AB" />}
        </Pressable>)}
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F2E9' },
  topbar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, color: '#251D20', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  page: { padding: 16, paddingBottom: 44, width: '100%', maxWidth: 760, alignSelf: 'center' },
  hero: { borderRadius: 18, backgroundColor: '#F0E1E5', padding: 15, flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  heroIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF8FA', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#2B2125', fontSize: 14, fontWeight: '900' },
  heroBody: { color: '#74686D', fontSize: 10, lineHeight: 16, marginTop: 4 },
  controlRow: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E4D8D1', backgroundColor: '#FFFDFC', padding: 12 },
  controlText: { color: '#756B6F', fontSize: 9, lineHeight: 14 },
  resetText: { color: '#8F1D3F', fontSize: 9, fontWeight: '900', marginTop: 7 },
  disabledText: { opacity: .5 },
  loginBanner: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E4D8D1', backgroundColor: '#FFFDFC', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  loginText: { flex: 1, color: '#65595E', fontSize: 10, lineHeight: 15, fontWeight: '700' },
  error: { marginTop: 12, color: '#A12B48', backgroundColor: '#F8E7EC', padding: 10, borderRadius: 10, fontSize: 10 },
  list: { marginTop: 14, gap: 9 },
  card: { minHeight: 142, borderRadius: 17, borderWidth: 1, borderColor: '#E5D8D1', backgroundColor: '#FFFDFC', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pressed: { opacity: .8, transform: [{ scale: .995 }] },
  cover: { width: 78, height: 112, borderRadius: 12, padding: 8, overflow: 'hidden', justifyContent: 'space-between' },
  coverImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  coverBrand: { color: 'rgba(255,255,255,.76)', fontSize: 6, fontWeight: '900', letterSpacing: .8 },
  coverTitle: { color: '#FFF', fontSize: 11, lineHeight: 14, fontWeight: '900' },
  body: { flex: 1, minWidth: 0 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rank: { color: '#8F1D3F', fontSize: 9, fontWeight: '900' },
  reasonPill: { flex: 1, minHeight: 23, borderRadius: 999, backgroundColor: '#F4E8EC', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  reasonText: { flex: 1, color: '#8F1D3F', fontSize: 7, fontWeight: '800' },
  title: { color: '#2A2024', fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 6 },
  author: { color: '#8F1D3F', fontSize: 9, fontWeight: '800', marginTop: 3 },
  description: { color: '#7B6F74', fontSize: 9, lineHeight: 13, marginTop: 5 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: '#80747A', fontSize: 8, fontWeight: '700' },
  chapterText: { color: '#95898E', fontSize: 8 },
  hideButton: { minWidth: 38, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 8 },
  hideText: { color: '#8F1D3F', fontSize: 7, fontWeight: '900' },
});
