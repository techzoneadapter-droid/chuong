import { SpiritPricePreview } from '../../../../../components/SpiritPricePreview';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { StudioShell } from '../../../../../components/StudioShell';
import { LoadingState, RetryState } from '../../../../../components/States';
import { xianxia } from '../../../../../constants/xianxia';
import { useAuth } from '../../../../../contexts/AuthContext';
import {
  deleteAdminDraftChapter,
  getAdminCatalogBook,
  getAdminCatalogChapter,
  getAdminCatalogChapters,
  saveAdminCatalogChapter,
} from '../../../../../services/adminCatalog';
import { messageForError } from '../../../../../services/errors';
import { Book, Chapter } from '../../../../../types';

export default function StudioChapterEditor() {
  const router = useRouter();
  const { bookId, chapterId } = useLocalSearchParams<{ bookId: string; chapterId: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const creating = chapterId === 'new';

  const [book, setBook] = useState<Book | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [chapterNumber, setChapterNumber] = useState('1');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [priceCoins, setPriceCoins] = useState('0');
  const [earlyAccessUntil, setEarlyAccessUntil] = useState<string | null>(null);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!user || profile?.role !== 'admin') return;
    setLoading(true);
    setError('');
    try {
      const [nextBook, nextChapters] = await Promise.all([
        getAdminCatalogBook(bookId),
        getAdminCatalogChapters(bookId),
      ]);
      if (!nextBook) throw new Error('Không tìm thấy truyện.');
      setBook(nextBook);

      if (creating) {
        const nextNumber = nextChapters.reduce((max, item) => Math.max(max, item.number), 0) + 1;
        setChapter(null);
        setChapterNumber(String(nextNumber));
        setTitle('');
        setContent('');
        setIsVip(false);
        setPriceCoins('0');
        setEarlyAccessUntil(null);
        setStatus('draft');
      } else {
        const current = await getAdminCatalogChapter(bookId, chapterId);
        if (!current) throw new Error('Không tìm thấy chương.');
        setChapter(current);
        setChapterNumber(String(current.number));
        setTitle(current.title);
        setContent(current.content || '');
        setIsVip(current.configuredVip ?? current.access === 'vip');
        setPriceCoins(String(current.priceCoins || 0));
        setEarlyAccessUntil(current.earlyAccessUntil ?? null);
        setStatus(current.status === 'published' ? 'published' : 'draft');
      }
    } catch (cause) {
      setError(messageForError(cause, 'Không thể tải trình biên tập chương.'));
    } finally {
      setLoading(false);
    }
  }, [bookId, chapterId, creating, profile?.role, user]);

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

  const stats = useMemo(() => {
    const trimmed = content.trim();
    return {
      chars: trimmed.length,
      words: trimmed ? trimmed.split(/\s+/).length : 0,
      paragraphs: trimmed ? trimmed.split(/\n\s*\n/).filter(Boolean).length : 0,
    };
  }, [content]);

  const setEarlyDays = (days: number) => {
    setEarlyAccessUntil(new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString());
  };
  const earlyConfigured = Boolean(earlyAccessUntil);
  const earlyExpired = Boolean(earlyAccessUntil && new Date(earlyAccessUntil).getTime() <= Date.now());
  const earlyLabel = earlyAccessUntil
    ? new Date(earlyAccessUntil).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
    : '';

  const save = async (nextStatus: 'draft' | 'published') => {
    if (!book || busy) return;
    const number = Number(chapterNumber);
    const price = Number(priceCoins || 0);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const savedId = await saveAdminCatalogChapter({
        id: chapter?.id,
        bookId: book.id,
        chapterNumber: number,
        title,
        content,
        status: nextStatus,
        isVip,
        priceCoins: isVip ? price : 0,
        earlyAccessUntil: isVip ? earlyAccessUntil : null,
      });
      setStatus(nextStatus);
      setMessage(nextStatus === 'published' ? 'Đã lưu và xuất bản chương.' : 'Đã lưu bản nháp.');
      if (creating) {
        router.replace({
          pathname: '/studio/book/[bookId]/chapter/[chapterId]',
          params: { bookId: book.id, chapterId: savedId },
        });
      } else {
        await load();
      }
    } catch (cause) {
      setError(messageForError(cause, 'Không thể lưu chương.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!book || !chapter?.id || status !== 'draft' || busy) return;
    setBusy(true);
    setError('');
    try {
      await deleteAdminDraftChapter(book.id, chapter.id);
      router.replace({ pathname: '/studio/book/[bookId]', params: { bookId: book.id } });
    } catch (cause) {
      setError(messageForError(cause, 'Không thể xóa chương nháp.'));
      setBusy(false);
    }
  };

  if (authLoading || loading) return <LoadingState label="Đang mở trình biên tập chương…" />;
  if (profile?.role !== 'admin') return null;
  if (error && !book) return <RetryState detail={error} onRetry={load} />;
  if (!book) return null;

  return <StudioShell
    active="books"
    title={creating ? 'Tạo chương mới' : `Biên tập Chương ${chapter?.number ?? ''}`}
    subtitle={`${book.title} · Nội dung lưu ở cùng database mà app mobile đang đọc.`}
    actions={<>
      <Pressable style={styles.lightAction} onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })}>
        <Ionicons name="eye-outline" size={16} color={xianxia.jadeDeep} /><Text style={styles.lightActionText}>Xem truyện</Text>
      </Pressable>
      <Pressable style={styles.lightAction} onPress={() => router.replace({ pathname: '/studio/book/[bookId]', params: { bookId: book.id } })}>
        <Ionicons name="arrow-back" size={16} color={xianxia.jadeDeep} /><Text style={styles.lightActionText}>Về quản lý truyện</Text>
      </Pressable>
    </>}
  >
    {error ? <View style={styles.error}><Ionicons name="alert-circle-outline" size={18} color={xianxia.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}
    {message ? <View style={styles.success}><Ionicons name="checkmark-circle-outline" size={18} color="#47704D" /><Text style={styles.successText}>{message}</Text></View> : null}

    <View style={styles.grid}>
      <View style={styles.editorPanel}>
        <View style={styles.row}>
          <View style={styles.numberField}>
            <Text style={styles.label}>Số chương</Text>
            <TextInput value={chapterNumber} onChangeText={setChapterNumber} keyboardType="number-pad" style={styles.input} />
          </View>
          <View style={styles.titleField}>
            <Text style={styles.label}>Tiêu đề chương</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="Tên chương" placeholderTextColor="#9C938C" style={styles.input} />
          </View>
        </View>

        <View style={styles.statBar}>
          <Stat value={stats.words.toLocaleString('vi-VN')} label="từ" />
          <Stat value={stats.chars.toLocaleString('vi-VN')} label="ký tự" />
          <Stat value={stats.paragraphs.toLocaleString('vi-VN')} label="đoạn" />
          <View style={[styles.stateBadge, status === 'published' && styles.stateBadgeLive]}>
            <Text style={[styles.stateText, status === 'published' && styles.stateTextLive]}>{status === 'published' ? 'ĐANG HIỂN THỊ' : 'BẢN NHÁP'}</Text>
          </View>
        </View>

        <Text style={styles.label}>Nội dung chương</Text>
        <TextInput
          multiline
          value={content}
          onChangeText={setContent}
          placeholder="Nhập hoặc dán toàn bộ nội dung chương tại đây…"
          placeholderTextColor="#9C938C"
          textAlignVertical="top"
          style={styles.editor}
        />

        <View style={styles.saveRow}>
          <Pressable disabled={busy} style={[styles.draftButton, busy && styles.disabled]} onPress={() => void save('draft')}>
            <Ionicons name="save-outline" size={17} color={xianxia.jadeDeep} />
            <Text style={styles.draftButtonText}>{busy ? 'Đang lưu…' : 'Lưu bản nháp'}</Text>
          </Pressable>
          <Pressable disabled={busy} style={[styles.publishButton, busy && styles.disabled]} onPress={() => void save('published')}>
            <Ionicons name="cloud-upload-outline" size={17} color="#FFF8EA" />
            <Text style={styles.publishButtonText}>{busy ? 'Đang lưu…' : 'Lưu & xuất bản'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.side}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Quyền truy cập</Text>
          <Text style={styles.panelSub}>Cấu hình này được app mobile dùng ngay khi độc giả mở chương.</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Chương VIP</Text>
              <Text style={styles.switchBody}>{isVip ? 'Độc giả cần mở khóa bằng Hạ Phẩm Linh Thạch.' : 'Độc giả có thể đọc miễn phí.'}</Text>
            </View>
            <Switch value={isVip} onValueChange={(value) => { setIsVip(value); if (!value) setEarlyAccessUntil(null); }} />
          </View>
          {isVip ? <>
            <Text style={styles.label}>Giá Hạ Phẩm Linh Thạch</Text>
            <TextInput value={priceCoins} onChangeText={setPriceCoins} keyboardType="number-pad" style={styles.input} />
            <SpiritPricePreview lowPrice={Number(priceCoins) || 0} />
            <View style={styles.earlyBox}>
              <View style={styles.switchRowPlain}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Tiên Cơ · đọc sớm</Text>
                  <Text style={styles.switchBody}>Tạm khóa bằng Hạ Phẩm Linh Thạch rồi tự mở miễn phí khi hết hạn.</Text>
                </View>
                <Switch value={earlyConfigured} onValueChange={(value) => value ? setEarlyDays(3) : setEarlyAccessUntil(null)} />
              </View>
              {earlyConfigured ? <>
                <Text style={[styles.earlyDeadline, earlyExpired && styles.earlyExpired]}>{earlyExpired ? 'Đã hết Tiên Cơ · hiện đang miễn phí' : `Tự mở miễn phí: ${earlyLabel}`}</Text>
                <View style={styles.durationRow}>{[1, 3, 7, 14].map((days) => <Pressable key={days} style={styles.duration} onPress={() => setEarlyDays(days)}><Text style={styles.durationText}>{days} ngày</Text></Pressable>)}</View>
              </> : <Text style={styles.earlyHint}>Không bật Tiên Cơ = VIP vĩnh viễn.</Text>}
            </View>
          </> : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Kiểm tra trước khi xuất bản</Text>
          <Check ok={Number(chapterNumber) > 0} label="Số chương hợp lệ" />
          <Check ok={title.trim().length >= 2} label="Có tiêu đề chương" />
          <Check ok={content.trim().length >= 50} label="Nội dung từ 50 ký tự" />
          <Check ok={!isVip || Number(priceCoins) > 0} label={isVip ? 'Có giá Hạ Phẩm Linh Thạch' : 'Chương miễn phí'} />
          {earlyConfigured ? <Check ok={!earlyExpired} label={earlyExpired ? 'Tiên Cơ đã hết hạn' : 'Tiên Cơ còn hiệu lực'} /> : null}
        </View>

        {!creating && status === 'draft' ? <Pressable disabled={busy} style={styles.delete} onPress={() => void remove()}>
          <Ionicons name="trash-outline" size={16} color={xianxia.danger} />
          <Text style={styles.deleteText}>Xóa chương nháp</Text>
        </Pressable> : null}
      </View>
    </View>
  </StudioShell>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return <View style={styles.check}><Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={17} color={ok ? '#527058' : '#9D958F'} /><Text style={styles.checkText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  lightAction: { minHeight: 40, borderRadius: 11, paddingHorizontal: 11, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C1D1C6', flexDirection: 'row', alignItems: 'center', gap: 6 },
  lightActionText: { color: xianxia.jadeDeep, fontSize: 8.5, fontWeight: '900' },
  error: { borderRadius: 13, padding: 11, backgroundColor: '#F5E5E1', borderWidth: 1, borderColor: '#E4C5BD', flexDirection: 'row', gap: 8, marginBottom: 14 },
  errorText: { flex: 1, color: xianxia.danger, fontSize: 9, lineHeight: 14 },
  success: { borderRadius: 13, padding: 11, backgroundColor: '#E8F3EC', borderWidth: 1, borderColor: '#C9DDCD', flexDirection: 'row', gap: 8, marginBottom: 14 },
  successText: { flex: 1, color: '#47704D', fontSize: 9, lineHeight: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
  editorPanel: { flex: 1.35, minWidth: 610, borderRadius: 18, padding: 17, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E1D9CC' },
  side: { flex: .65, minWidth: 330, gap: 14 },
  row: { flexDirection: 'row', gap: 10 },
  numberField: { width: 120 },
  titleField: { flex: 1 },
  label: { color: '#4C4440', fontSize: 8.5, fontWeight: '900', marginBottom: 5, marginTop: 9 },
  input: { minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: '#DDD4C8', backgroundColor: '#FAF7F1', paddingHorizontal: 10, color: '#2B2528', fontSize: 10 },
  statBar: { minHeight: 52, marginTop: 13, borderRadius: 12, paddingHorizontal: 11, backgroundColor: '#F4F1E9', borderWidth: 1, borderColor: '#E0D7CA', flexDirection: 'row', alignItems: 'center', gap: 14 },
  stat: { minWidth: 72 },
  statValue: { color: xianxia.jadeDeep, fontSize: 12, fontWeight: '900' },
  statLabel: { color: '#7C736D', fontSize: 7.5, marginTop: 1 },
  stateBadge: { marginLeft: 'auto' as never, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: '#F0E8E4' },
  stateBadgeLive: { backgroundColor: '#E6F0E8' },
  stateText: { color: '#845950', fontSize: 7, fontWeight: '900' },
  stateTextLive: { color: '#45694D' },
  editor: { minHeight: 520, borderRadius: 12, borderWidth: 1, borderColor: '#DDD4C8', backgroundColor: '#FAF7F1', padding: 14, color: '#2B2528', fontSize: 12, lineHeight: 20 },
  saveRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  draftButton: { minHeight: 42, borderRadius: 11, paddingHorizontal: 13, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C1D1C6', flexDirection: 'row', alignItems: 'center', gap: 6 },
  draftButtonText: { color: xianxia.jadeDeep, fontSize: 9, fontWeight: '900' },
  publishButton: { minHeight: 42, borderRadius: 11, paddingHorizontal: 14, backgroundColor: xianxia.jadeDeep, flexDirection: 'row', alignItems: 'center', gap: 6 },
  publishButtonText: { color: '#FFF8EA', fontSize: 9, fontWeight: '900' },
  panel: { borderRadius: 17, padding: 15, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E1D9CC' },
  panelTitle: { color: '#251F22', fontSize: 14, fontWeight: '900' },
  panelSub: { color: '#7C736D', fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  switchRow: { minHeight: 64, marginTop: 12, borderRadius: 13, padding: 10, backgroundColor: '#F4F1E9', borderWidth: 1, borderColor: '#DED5C8', flexDirection: 'row', alignItems: 'center', gap: 9 },
  switchTitle: { color: '#2B2528', fontSize: 9.5, fontWeight: '900' },
  switchBody: { color: '#7B726D', fontSize: 8, lineHeight: 12, marginTop: 2 },
  earlyBox: { marginTop: 10, borderRadius: 13, padding: 10, backgroundColor: '#EDF3EF', borderWidth: 1, borderColor: '#C6D7CC' },
  switchRowPlain: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  earlyDeadline: { color: '#47704D', fontSize: 8.5, fontWeight: '900', marginTop: 9 },
  earlyExpired: { color: xianxia.danger },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  duration: { minHeight: 32, borderRadius: 9, paddingHorizontal: 8, borderWidth: 1, borderColor: '#AFC4B7', backgroundColor: '#FFFDFC', alignItems: 'center', justifyContent: 'center' },
  durationText: { color: xianxia.jadeDeep, fontSize: 7.5, fontWeight: '900' },
  earlyHint: { color: '#7C8A83', fontSize: 7.5, lineHeight: 11, marginTop: 7 },
  check: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 7 },
  checkText: { color: '#5D5551', fontSize: 8.5, fontWeight: '700' },
  delete: { minHeight: 42, borderRadius: 11, paddingHorizontal: 12, backgroundColor: '#F6E7E4', borderWidth: 1, borderColor: '#E4C4BD', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  deleteText: { color: xianxia.danger, fontSize: 8.5, fontWeight: '900' },
  disabled: { opacity: .45 },
});
