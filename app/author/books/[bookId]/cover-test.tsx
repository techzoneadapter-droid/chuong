import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingState, RetryState } from '../../../../components/States';
import { xianxia } from '../../../../constants/xianxia';
import { useAuth } from '../../../../contexts/AuthContext';
import { getAuthorForUser } from '../../../../services/authors';
import { getMyBooks } from '../../../../services/books';
import {
  AuthorCoverExperiment,
  cancelCoverExperiment,
  finishCoverExperiment,
  getAuthorCoverExperiments,
  startCoverExperiment,
  suggestedCoverWinner,
} from '../../../../services/coverExperiments';
import { messageForError } from '../../../../services/errors';
import { deleteOwnBookCover, uploadBookCover } from '../../../../services/storage';
import { Book } from '../../../../types';

export default function CoverExperimentScreen() {
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { user, loading: authLoading } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [experiments, setExperiments] = useState<AuthorCoverExperiment[]>([]);
  const [candidateB, setCandidateB] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const active = useMemo(
    () => experiments.find((item) => item.bookId === bookId && item.status === 'running') ?? null,
    [bookId, experiments],
  );
  const history = useMemo(
    () => experiments.filter((item) => item.bookId === bookId && item.status !== 'running'),
    [bookId, experiments],
  );
  const recommendation = active ? suggestedCoverWinner(active) : null;

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
      const owned = (await getMyBooks(author.id)).find((item) => item.id === bookId) ?? null;
      if (!owned) throw new Error('Không tìm thấy truyện hoặc bạn không có quyền quản lý.');
      const rows = await getAuthorCoverExperiments(author.id);
      setBook(owned);
      setExperiments(rows);
    } catch (cause) {
      setError(messageForError(cause, 'Không thể tải A/B test bìa.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authLoading, bookId, router, user]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const chooseCandidate = async () => {
    if (!user || !book || busy) return;
    setError('');
    setNotice('');
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [2, 3],
        quality: .88,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        setError('Bìa B cần nhỏ hơn 5 MB.');
        return;
      }
      setBusy(true);
      const url = await uploadBookCover(user.id, book.id, asset.uri, asset.mimeType);
      if (candidateB) await deleteOwnBookCover(user.id, book.id, candidateB).catch(() => undefined);
      setCandidateB(url);
      setNotice('Đã tải bìa B. Kiểm tra hai ảnh trước khi bắt đầu thử nghiệm.');
    } catch (cause) {
      setError(messageForError(cause, 'Không thể tải bìa B.'));
    } finally {
      setBusy(false);
    }
  };

  const begin = async () => {
    if (!book || !candidateB || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await startCoverExperiment(book.id, candidateB);
      setCandidateB(null);
      setNotice('A/B test đã bắt đầu. Mỗi thiết bị được giữ ổn định ở một phương án A hoặc B.');
      await load(true);
    } catch (cause) {
      setError(messageForError(cause, 'Không thể bắt đầu thử nghiệm.'));
    } finally {
      setBusy(false);
    }
  };

  const chooseWinner = (variant: 'A' | 'B') => {
    if (!active || busy) return;
    Alert.alert(
      'Chốt bìa ' + variant + '?',
      'Bìa ' + variant + ' sẽ trở thành bìa chính của truyện và A/B test sẽ kết thúc.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Chốt bìa ' + variant,
          onPress: async () => {
            setBusy(true);
            setError('');
            try {
              await finishCoverExperiment(active.experimentId, variant);
              setNotice('Đã chốt bìa ' + variant + ' làm bìa chính.');
              await load(true);
            } catch (cause) {
              setError(messageForError(cause, 'Không thể chốt bìa.'));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const cancel = () => {
    if (!active || busy) return;
    Alert.alert(
      'Dừng A/B test?',
      'Thử nghiệm sẽ dừng và bìa hiện tại của truyện được giữ nguyên.',
      [
        { text: 'Không', style: 'cancel' },
        {
          text: 'Dừng thử nghiệm',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError('');
            try {
              await cancelCoverExperiment(active.experimentId);
              setNotice('Đã dừng thử nghiệm bìa.');
              await load(true);
            } catch (cause) {
              setError(messageForError(cause, 'Không thể dừng thử nghiệm.'));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  if (loading && !book) return <SafeAreaView style={styles.safe}><LoadingState label="Đang mở phòng thử bìa…" /></SafeAreaView>;
  if (error && !book) return <SafeAreaView style={styles.safe}><RetryState detail={error} onRetry={() => void load()} /></SafeAreaView>;
  if (!book) return null;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.topbar}>
      <Pressable style={styles.icon} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color={xianxia.ink} /></Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>A/B Test bìa truyện</Text>
        <Text numberOfLines={1} style={styles.subtitle}>{book.title}</Text>
      </View>
      <Pressable style={styles.icon} onPress={() => void load(true)}><Ionicons name="refresh" size={19} color={xianxia.cinnabar} /></Pressable>
    </View>

    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <View style={styles.intro}>
        <View style={styles.introIcon}><Ionicons name="git-compare-outline" size={22} color={xianxia.goldSoft} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.introTitle}>Để dữ liệu chọn bìa thay vì cảm tính</Text>
          <Text style={styles.introBody}>CHƯƠNG chia người xem ổn định 50/50 giữa bìa A và B, rồi đo lượt hiển thị và lượt mở truyện. CTR = lượt mở / lượt hiển thị.</Text>
        </View>
      </View>

      {active ? <>
        <Text style={styles.sectionTitle}>Thử nghiệm đang chạy</Text>
        <Text style={styles.sectionSub}>Bắt đầu {new Date(active.startedAt).toLocaleString('vi-VN')} · mỗi thiết bị chỉ được tính một lượt hiển thị và một lượt mở cho thử nghiệm này.</Text>

        <View style={styles.compareRow}>
          <VariantCard
            label="A"
            url={active.variantAUrl}
            impressions={active.impressionsA}
            clicks={active.clicksA}
            ctr={active.ctrA}
            recommended={recommendation === 'A'}
            onChoose={() => chooseWinner('A')}
            busy={busy}
          />
          <VariantCard
            label="B"
            url={active.variantBUrl}
            impressions={active.impressionsB}
            clicks={active.clicksB}
            ctr={active.ctrB}
            recommended={recommendation === 'B'}
            onChoose={() => chooseWinner('B')}
            busy={busy}
          />
        </View>

        <View style={styles.recommendBox}>
          <Ionicons name={recommendation ? 'sparkles' : 'hourglass-outline'} size={18} color={xianxia.jadeDeep} />
          <Text style={styles.recommendText}>
            {recommendation
              ? `Gợi ý sơ bộ: bìa ${recommendation} đang có CTR tốt hơn sau khi cả hai phương án đạt ít nhất 50 lượt hiển thị.`
              : 'Chưa đủ tín hiệu để gợi ý. Nên chờ cả A và B đạt ít nhất 50 lượt hiển thị và có chênh lệch CTR rõ ràng.'}
          </Text>
        </View>

        <Pressable disabled={busy} onPress={cancel} style={styles.cancel}><Text style={styles.cancelText}>Dừng thử nghiệm, chưa chọn người thắng</Text></Pressable>
      </> : <>
        <Text style={styles.sectionTitle}>Tạo thử nghiệm mới</Text>
        {!book.coverUrl ? <View style={styles.warn}><Ionicons name="alert-circle-outline" size={18} color={xianxia.danger} /><Text style={styles.warnText}>Truyện chưa có bìa A. Hãy quay lại quản lý truyện và đặt bìa chính trước.</Text></View> : <View style={styles.compareRow}>
          <View style={styles.setupCard}>
            <Text style={styles.variantLabel}>BÌA A · HIỆN TẠI</Text>
            <Image source={{ uri: book.coverUrl }} style={styles.cover} />
            <Text style={styles.setupMeta}>Bìa đang dùng trên CHƯƠNG</Text>
          </View>
          <View style={styles.setupCard}>
            <Text style={styles.variantLabel}>BÌA B · ỨNG VIÊN</Text>
            {candidateB ? <Image source={{ uri: candidateB }} style={styles.cover} /> : <View style={[styles.cover, styles.coverEmpty]}><Ionicons name="image-outline" size={31} color={xianxia.muted} /><Text style={styles.emptyText}>Chưa chọn bìa B</Text></View>}
            <Pressable disabled={busy} onPress={() => void chooseCandidate()} style={styles.pickButton}><Ionicons name="images-outline" size={15} color={xianxia.cinnabar} /><Text style={styles.pickText}>{candidateB ? 'Chọn lại bìa B' : 'Chọn bìa B'}</Text></Pressable>
          </View>
        </View>}

        {book.coverUrl ? <Pressable disabled={busy || !candidateB} onPress={() => void begin()} style={[styles.start, (!candidateB || busy) && styles.disabled]}>
          <Ionicons name="play" size={17} color="#FFF8EA" /><Text style={styles.startText}>{busy ? 'Đang xử lý…' : 'Bắt đầu chia 50/50'}</Text>
        </Pressable> : null}
      </>}

      {history.length ? <>
        <Text style={styles.sectionTitle}>Lịch sử thử nghiệm</Text>
        {history.slice(0, 8).map((item) => <View key={item.experimentId} style={styles.history}>
          <View style={{ flex: 1 }}>
            <Text style={styles.historyTitle}>{item.status === 'completed' ? `Đã chốt bìa ${item.winnerVariant ?? '—'}` : 'Đã hủy thử nghiệm'}</Text>
            <Text style={styles.historyMeta}>{new Date(item.startedAt).toLocaleDateString('vi-VN')} · A {item.ctrA.toFixed(2)}% / B {item.ctrB.toFixed(2)}%</Text>
          </View>
          <Ionicons name={item.status === 'completed' ? 'checkmark-circle' : 'close-circle-outline'} size={20} color={item.status === 'completed' ? '#527058' : xianxia.muted} />
        </View>)}
      </> : null}

      <View style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={18} color={xianxia.jadeDeep} />
        <Text style={styles.noteText}>A/B test chỉ dùng mã cài đặt ẩn danh để giữ một thiết bị ở cùng phương án. Tác giả chỉ thấy số liệu tổng hợp, không thấy danh tính độc giả.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function VariantCard({
  label,
  url,
  impressions,
  clicks,
  ctr,
  recommended,
  onChoose,
  busy,
}: {
  label: 'A' | 'B';
  url: string;
  impressions: number;
  clicks: number;
  ctr: number;
  recommended: boolean;
  onChoose: () => void;
  busy: boolean;
}) {
  return <View style={[styles.variant, recommended && styles.variantRecommended]}>
    <View style={styles.variantTop}><Text style={styles.variantLabel}>BÌA {label}</Text>{recommended ? <Text style={styles.recommendedBadge}>ĐANG NHỈNH HƠN</Text> : null}</View>
    <Image source={{ uri: url }} style={styles.cover} />
    <Text style={styles.ctr}>{ctr.toFixed(2)}% CTR</Text>
    <Text style={styles.metric}>{impressions.toLocaleString('vi-VN')} hiển thị · {clicks.toLocaleString('vi-VN')} lượt mở</Text>
    <Pressable disabled={busy} onPress={onChoose} style={styles.choose}><Text style={styles.chooseText}>Chọn bìa {label}</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { minHeight: 62, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  title: { color: xianxia.ink, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: xianxia.muted, fontSize: 8.5, textAlign: 'center', marginTop: 2 },
  page: { padding: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  error: { color: xianxia.danger, backgroundColor: '#F6E6E3', borderRadius: 11, padding: 10, fontSize: 9.5, marginBottom: 10 },
  notice: { color: '#47704D', backgroundColor: '#E8F2EA', borderRadius: 11, padding: 10, fontSize: 9.5, marginBottom: 10 },
  intro: { borderRadius: 18, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: xianxia.gold, padding: 15, flexDirection: 'row', gap: 11, alignItems: 'center' },
  introIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(229,209,163,.12)', borderWidth: 1, borderColor: 'rgba(229,209,163,.40)', alignItems: 'center', justifyContent: 'center' },
  introTitle: { color: '#FFF8EA', fontSize: 13, fontWeight: '900' },
  introBody: { color: 'rgba(255,248,234,.72)', fontSize: 8.5, lineHeight: 13, marginTop: 4 },
  sectionTitle: { color: xianxia.ink, fontSize: 17, fontWeight: '900', marginTop: 22 },
  sectionSub: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13, marginTop: 4 },
  compareRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  setupCard: { width: '48.5%', flexGrow: 1, minWidth: 145, borderRadius: 16, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: xianxia.line, padding: 10 },
  variant: { width: '48.5%', flexGrow: 1, minWidth: 145, borderRadius: 16, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: xianxia.line, padding: 10 },
  variantRecommended: { borderColor: '#6B917D', backgroundColor: '#F3F8F4' },
  variantTop: { minHeight: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 5 },
  variantLabel: { color: xianxia.cinnabar, fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  recommendedBadge: { color: '#47704D', fontSize: 6.5, fontWeight: '900', backgroundColor: '#DDEBE1', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3 },
  cover: { width: '100%', aspectRatio: 2 / 3, borderRadius: 11, marginTop: 8, backgroundColor: '#EDE7DD' },
  coverEmpty: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyText: { color: xianxia.muted, fontSize: 8.5, fontWeight: '700' },
  setupMeta: { color: xianxia.muted, fontSize: 8, marginTop: 8, textAlign: 'center' },
  pickButton: { minHeight: 38, borderRadius: 10, backgroundColor: '#F2E4E8', borderWidth: 1, borderColor: '#DABFC7', marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  pickText: { color: xianxia.cinnabar, fontSize: 8.5, fontWeight: '900' },
  ctr: { color: xianxia.jadeDeep, fontSize: 20, fontWeight: '900', marginTop: 10 },
  metric: { color: xianxia.muted, fontSize: 8, lineHeight: 12, marginTop: 2 },
  choose: { minHeight: 38, borderRadius: 10, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: xianxia.gold, marginTop: 10, alignItems: 'center', justifyContent: 'center' },
  chooseText: { color: '#FFF8EA', fontSize: 8.5, fontWeight: '900' },
  recommendBox: { borderRadius: 13, padding: 11, backgroundColor: '#EDF3EF', borderWidth: 1, borderColor: '#C6D7CC', flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 11 },
  recommendText: { flex: 1, color: '#5D7067', fontSize: 8.5, lineHeight: 13 },
  start: { minHeight: 48, borderRadius: 13, backgroundColor: xianxia.cinnabar, borderWidth: 1, borderColor: xianxia.gold, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  startText: { color: '#FFF8EA', fontSize: 10, fontWeight: '900' },
  disabled: { opacity: .45 },
  cancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  cancelText: { color: xianxia.danger, fontSize: 8.5, fontWeight: '800' },
  warn: { borderRadius: 13, backgroundColor: '#F6E6E3', borderWidth: 1, borderColor: '#E7C7C0', padding: 11, marginTop: 10, flexDirection: 'row', gap: 8 },
  warnText: { flex: 1, color: xianxia.danger, fontSize: 8.5, lineHeight: 13 },
  history: { minHeight: 62, borderRadius: 13, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: xianxia.line, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 7 },
  historyTitle: { color: xianxia.ink, fontSize: 9.5, fontWeight: '900' },
  historyMeta: { color: xianxia.muted, fontSize: 8, marginTop: 3 },
  note: { borderRadius: 14, backgroundColor: '#EDF3EF', padding: 12, marginTop: 20, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  noteText: { flex: 1, color: '#62736B', fontSize: 8.5, lineHeight: 13 },
});
