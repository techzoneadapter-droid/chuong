import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState, RetryState } from '../components/States';
import { AssetBookCover, ArtIcon } from '../components/Artwork';
import { XianxiaBackdrop } from '../components/XianxiaBackdrop';
import { artwork } from '../constants/artwork';
import { xianxia } from '../constants/xianxia';
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
    return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><LoadingState label="Đang chọn truyện hợp gu…" /></SafeAreaView>;
  }

  if (error && !items.length) {
    return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><RetryState detail={error} onRetry={() => load()} /></SafeAreaView>;
  }

  const personalized = items.some((item) => item.personalized);

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={21} color={xianxia.ink} />
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
        <ArtIcon source={artwork.lotus} size={58} />
        <View style={styles.heroIcon}><Ionicons name="sparkles" size={22} color={xianxia.goldSoft} /></View>
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
        <Ionicons name="person-circle-outline" size={21} color={xianxia.cinnabar} />
        <Text style={styles.loginText}>Đăng nhập để cá nhân hóa đề xuất trên mọi thiết bị.</Text>
        <Ionicons name="chevron-forward" size={17} color={xianxia.cinnabar} />
      </Pressable>}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!items.length ? <EmptyState title="Chưa có đề xuất" detail="Hãy khám phá thêm truyện rồi quay lại." /> : <View style={styles.list}>
        {items.map((item, index) => <Pressable
          key={item.book.id}
          onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.book.id } })}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.cover}>
            <AssetBookCover bookId={item.book.id} title={item.book.title} coverUrl={item.book.coverUrl} style={StyleSheet.absoluteFillObject} />
            <View pointerEvents="none" style={styles.coverShade} />
            <Text style={styles.coverBrand}>CHƯƠNG</Text>
          </View>

          <View style={styles.body}>
            <View style={styles.rankRow}>
              <Text style={styles.rank}>#{index + 1}</Text>
              <View style={styles.reasonPill}>
                <Ionicons name={item.personalized ? 'sparkles' : 'flame-outline'} size={11} color={xianxia.cinnabar} />
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
            <Ionicons name="close" size={16} color={xianxia.cinnabar} />
            <Text style={styles.hideText}>Ẩn</Text>
          </Pressable> : <Ionicons name="chevron-forward" size={18} color={xianxia.muted} />}
        </Pressable>)}
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(244,235,216,.90)' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, color: xianxia.ink, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  page: { padding: 16, paddingBottom: 44, width: '100%', maxWidth: 760, alignSelf: 'center' },
  hero: { minHeight: 105, borderRadius: 19, backgroundColor: '#23443A', borderWidth: 1, borderColor: xianxia.gold, padding: 15, flexDirection: 'row', gap: 10, alignItems: 'center', overflow: 'hidden' },
  heroIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(185,137,69,.16)', borderWidth: 1, borderColor: 'rgba(229,209,163,.42)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: xianxia.white, fontSize: 14, fontWeight: '900' },
  heroBody: { color: 'rgba(255,253,248,.68)', fontSize: 9.5, lineHeight: 15, marginTop: 4 },
  controlRow: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: xianxia.line, backgroundColor: 'rgba(255,248,234,.92)', padding: 12 },
  controlText: { color: xianxia.muted, fontSize: 9, lineHeight: 14 },
  resetText: { color: xianxia.cinnabar, fontSize: 9, fontWeight: '900', marginTop: 7 },
  disabledText: { opacity: .5 },
  loginBanner: { marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: '#B8CBBF', backgroundColor: xianxia.jadeMist, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  loginText: { flex: 1, color: xianxia.inkSoft, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  error: { marginTop: 12, color: xianxia.danger, backgroundColor: '#F5E5E1', borderWidth: 1, borderColor: '#E2C2BA', padding: 10, borderRadius: 10, fontSize: 10 },
  list: { marginTop: 14, gap: 9 },
  card: { minHeight: 142, borderRadius: 17, borderWidth: 1, borderColor: xianxia.line, backgroundColor: 'rgba(255,248,234,.94)', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pressed: { opacity: .8, transform: [{ scale: .995 }] },
  cover: { width: 78, height: 116, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: xianxia.gold },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,20,18,.07)' },
  coverBrand: { position: 'absolute', left: 6, top: 6, color: '#FFF8EA', fontSize: 6, fontWeight: '900', letterSpacing: .8, textShadowColor: 'rgba(0,0,0,.5)', textShadowRadius: 4 },
  body: { flex: 1, minWidth: 0 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rank: { color: xianxia.cinnabar, fontSize: 9, fontWeight: '900' },
  reasonPill: { flex: 1, minHeight: 23, borderRadius: 999, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C0D0C5', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  reasonText: { flex: 1, color: xianxia.jadeDeep, fontSize: 7, fontWeight: '800' },
  title: { color: xianxia.ink, fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 6 },
  author: { color: xianxia.jade, fontSize: 9, fontWeight: '800', marginTop: 3 },
  description: { color: xianxia.muted, fontSize: 9, lineHeight: 13, marginTop: 5 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: xianxia.muted, fontSize: 8, fontWeight: '700' },
  chapterText: { color: '#958B7D', fontSize: 8 },
  hideButton: { minWidth: 38, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 8 },
  hideText: { color: xianxia.cinnabar, fontSize: 7, fontWeight: '900' },
});
