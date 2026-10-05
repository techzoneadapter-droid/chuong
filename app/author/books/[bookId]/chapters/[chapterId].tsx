import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAuthorChapter, getAuthorChapters, getAuthorForUser, getMyBooks, saveChapter } from '../../../../../services/authors';
import { messageForError } from '../../../../../services/errors';
import { deleteDraftChapter } from '../../../../../services/chapters';
import { isSupabaseConfigured } from '../../../../../lib/supabase';
import { useAuth } from '../../../../../contexts/AuthContext';
import { ChapterInput, ChapterStatus, SaveState } from '../../../../../types';

const labels: Record<SaveState, string> = { idle: '', saving: 'Đang lưu…', saved: 'Đã lưu', error: 'Lỗi lưu' };

export default function ChapterEditorScreen() {
  const router = useRouter(); const { bookId, chapterId } = useLocalSearchParams<{ bookId: string; chapterId: string }>();
  const [id, setId] = useState(chapterId === 'new' ? undefined : chapterId); const [number, setNumber] = useState(1); const [title, setTitle] = useState(''); const [content, setContent] = useState(''); const [status, setStatus] = useState<ChapterStatus>('draft'); const [isVip, setIsVip] = useState(false); const [priceCoins, setPriceCoins] = useState(0); const [earlyAccessUntil, setEarlyAccessUntil] = useState<string | null>(null); const [saveState, setSaveState] = useState<SaveState>('idle'); const [error, setError] = useState(''); const ready = useRef(false);
  const { user, loading: authLoading } = useAuth();
  const savedId = useRef(id);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef(Promise.resolve());
  const lastSaved = useRef('');
  const deleted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [reload, setReload] = useState(0);
  const snapshot = useRef<ChapterInput>({ bookId, chapterNumber: number, title, content, status, isVip, priceCoins, earlyAccessUntil });
  snapshot.current = { bookId, chapterNumber: number, title: title.trim() || `Chương ${number}`, content, status, isVip, priceCoins, earlyAccessUntil: isVip ? earlyAccessUntil : null };
  useEffect(() => {
    if (!isSupabaseConfigured || authLoading) return;
    if (!user) { router.replace('/auth/login'); return; }
    let active = true; ready.current = false; setLoading(true); setError('');
    getAuthorForUser(user.id).then(async (author) => {
      if (!author || !(await getMyBooks(author.id)).some((book) => book.id === bookId)) throw new Error('Bạn không có quyền chỉnh sửa truyện này.');
      return Promise.all([getAuthorChapter(bookId, chapterId), getAuthorChapters(bookId)]);
    }).then(([chapter, chapters]) => {
      if (!active) return;
      if (chapterId !== 'new' && !chapter) throw new Error('Không tìm thấy chương hoặc bạn không có quyền chỉnh sửa.');
      if (chapter) {
        savedId.current = chapter.id; setId(chapter.id); setNumber(chapter.number); setTitle(chapter.title); setContent(chapter.content ?? ''); setStatus(chapter.status ?? 'draft'); setIsVip(chapter.configuredVip ?? chapter.access === 'vip'); setPriceCoins(chapter.priceCoins ?? 0); setEarlyAccessUntil(chapter.earlyAccessUntil ?? null);
        lastSaved.current = JSON.stringify({ bookId, chapterNumber: chapter.number, title: chapter.title, content: chapter.content ?? '', status: chapter.status ?? 'draft', isVip: chapter.configuredVip ?? chapter.access === 'vip', priceCoins: chapter.priceCoins ?? 0, earlyAccessUntil: chapter.earlyAccessUntil ?? null });
      } else setNumber(Math.max(0, ...chapters.map((item) => item.number)) + 1);
      ready.current = true;
    }).catch((cause) => { if (active) setError(messageForError(cause, 'Không thể tải bản thảo.')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookId, chapterId, reload, user?.id, authLoading]);
  const persist = useCallback((nextStatus?: ChapterStatus) => {
    if (timer.current) clearTimeout(timer.current);
    if (!ready.current || deleted.current) return Promise.resolve(false);
    const input = { ...snapshot.current, status: nextStatus ?? snapshot.current.status };
    const key = JSON.stringify(input);
    if (key === lastSaved.current) return Promise.resolve(true);
    if (!input.content.trim() && !title.trim()) return Promise.resolve(false);
    setSaveState('saving'); setError('');
    let success = false;
    queue.current = queue.current.then(async () => {
      const result = await saveChapter({ ...input, id: savedId.current });
      savedId.current = result; setId(result); lastSaved.current = key;
      if (nextStatus) { snapshot.current.status = nextStatus; setStatus(nextStatus); }
      setSaveState('saved'); success = true;
    }).catch((cause) => { setSaveState('error'); setError(messageForError(cause, 'Không thể lưu chương.')); });
    return queue.current.then(() => success);
  }, [title]);
  const persistRef = useRef(persist); persistRef.current = persist;
  useEffect(() => {
    if (!ready.current || busy || loading || (!title.trim() && !content.trim()) || JSON.stringify(snapshot.current) === lastSaved.current) return;
    timer.current = setTimeout(() => { void persistRef.current(); }, 1600);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [title, content, number, isVip, priceCoins, earlyAccessUntil, busy, loading]);
  useFocusEffect(useCallback(() => () => { if (!deleted.current) void persistRef.current(); }, []));
  const save = async () => { setBusy(true); await persist(); setBusy(false); };
  const changeStatus = async (next: ChapterStatus) => {
    if (next === 'published' && (title.trim().length < 2 || content.trim().length < 50)) { setError('Chương cần có tiêu đề và ít nhất 50 ký tự trước khi xuất bản.'); return; }
    setBusy(true); await persist(next); setBusy(false);
  };
  const setEarlyDays = (days: number) => {
    setEarlyAccessUntil(new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString());
  };
  const earlyConfigured = Boolean(earlyAccessUntil);
  const earlyExpired = Boolean(earlyAccessUntil && new Date(earlyAccessUntil).getTime() <= Date.now());
  const earlyLabel = earlyAccessUntil
    ? new Date(earlyAccessUntil).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
    : '';

  const remove = async () => {
    if (!id || status !== 'draft') return;
    setBusy(true); deleted.current = true; if (timer.current) clearTimeout(timer.current);
    await queue.current;
    try { await deleteDraftChapter(id); router.back(); }
    catch (cause) { deleted.current = false; setError(messageForError(cause)); setBusy(false); }
  };
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Pressable style={styles.icon} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#2D2327" /></Pressable><View style={styles.headCopy}><Text style={styles.title}>Trình soạn thảo chương</Text><Text style={[styles.save, saveState === 'error' && styles.errorText]}>{labels[saveState] || (status === 'published' ? 'Đã xuất bản' : 'Bản nháp')}</Text></View><Pressable style={styles.saveButton} disabled={busy || loading || !ready.current} onPress={save}><Text style={styles.saveButtonText}>Lưu</Text></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      {!isSupabaseConfigured ? <Text style={styles.error}>Demo · Bạn có thể xem trình soạn thảo. Đăng nhập với Supabase để lưu chương.</Text> : null}
      {loading ? <Text style={styles.count}>Đang tải bản thảo…</Text> : null}
      {error ? <Pressable onPress={() => setReload((value) => value + 1)}><Text style={styles.error}>{error} · Chạm để tải lại</Text></Pressable> : null}
      <View style={styles.numberRow}><Text style={styles.label}>Số chương</Text><TextInput value={String(number)} onChangeText={(value) => setNumber(Math.max(1, Number(value.replace(/\D/g, '')) || 1))} keyboardType="number-pad" style={styles.numberInput} /></View>
      <Text style={styles.label}>Tiêu đề chương</Text><TextInput value={title} onChangeText={setTitle} placeholder="Tên chương" placeholderTextColor="#9A8E93" style={styles.titleInput} maxLength={180} />
      <Text style={styles.label}>Nội dung</Text><TextInput value={content} onChangeText={setContent} placeholder="Bắt đầu câu chuyện…" placeholderTextColor="#9A8E93" style={styles.editor} multiline textAlignVertical="top" />
      <Text style={styles.count}>{content.length.toLocaleString('vi-VN')} ký tự</Text>
      <View style={styles.optionRow}><View style={{ flex: 1 }}><Text style={styles.optionTitle}>Chương VIP</Text><Text style={styles.optionDetail}>Bật để chương yêu cầu Linh Thạch. Có thể để VIP vĩnh viễn hoặc dùng Tiên Cơ để tự mở miễn phí sau một thời gian.</Text></View><Switch value={isVip} onValueChange={(value) => { setIsVip(value); if (!value) setEarlyAccessUntil(null); }} trackColor={{ true: '#B85A78' }} /></View>
      {isVip ? <>
        <View style={styles.numberRow}><Text style={styles.label}>Giá Linh Thạch</Text><TextInput value={String(priceCoins)} onChangeText={(value) => setPriceCoins(Number(value.replace(/\D/g, '')) || 0)} keyboardType="number-pad" style={styles.numberInput} /></View>
        <View style={styles.earlyCard}>
          <View style={styles.earlyHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.earlyTitle}>Tiên Cơ · đọc sớm</Text>
              <Text style={styles.earlyBody}>Trong thời gian Tiên Cơ, độc giả có thể dùng Linh Thạch để đọc trước. Hết hạn, chương tự mở miễn phí mà không cần bạn thao tác lại.</Text>
            </View>
            <Switch value={earlyConfigured} onValueChange={(value) => value ? setEarlyDays(3) : setEarlyAccessUntil(null)} trackColor={{ true: '#567B70' }} />
          </View>
          {earlyConfigured ? <>
            <Text style={[styles.earlyDeadline, earlyExpired && styles.earlyExpired]}>{earlyExpired ? 'Đã hết Tiên Cơ · chương hiện đang miễn phí' : `Tự mở miễn phí: ${earlyLabel}`}</Text>
            <View style={styles.durationRow}>
              {[1, 3, 7, 14].map((days) => <Pressable key={days} style={styles.duration} onPress={() => setEarlyDays(days)}><Text style={styles.durationText}>{days} ngày</Text></Pressable>)}
            </View>
            <Text style={styles.earlyHint}>Chọn lại mốc sẽ tính từ thời điểm hiện tại. Quyền đọc của người đã mở sớm vẫn được giữ.</Text>
          </> : <Text style={styles.earlyHint}>Đang là VIP vĩnh viễn. Bật Tiên Cơ nếu muốn tự chuyển miễn phí.</Text>}
        </View>
      </> : null}
      {id && status === 'draft' ? <Pressable disabled={busy} onPress={remove}><Text style={styles.error}>Xóa bản nháp</Text></Pressable> : null}
      <View style={styles.actions}>{status === 'published' ? <Pressable style={styles.secondary} disabled={busy || loading || !ready.current} onPress={() => changeStatus('draft')}><Text style={styles.secondaryText}>Gỡ xuất bản</Text></Pressable> : <Pressable style={styles.publish} disabled={busy || loading || !ready.current} onPress={() => changeStatus('published')}><Ionicons name="paper-plane-outline" size={17} color="#FFFFFF" /><Text style={styles.publishText}>Xuất bản</Text></Pressable>}</View>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#F8F2E9' }, header: { height: 61, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DED1CA' }, icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, headCopy: { flex: 1, marginLeft: 5 }, title: { color: '#291F23', fontSize: 16, fontWeight: '900' }, save: { color: '#66806A', fontSize: 9, marginTop: 2 }, errorText: { color: '#A12B48' }, saveButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F0E1E5' }, saveButtonText: { color: '#8F1D3F', fontSize: 11, fontWeight: '900' }, page: { padding: 16, paddingBottom: 50, maxWidth: 760, width: '100%', alignSelf: 'center' }, error: { color: '#A12B48', backgroundColor: '#F5E3E7', padding: 10, borderRadius: 10, fontSize: 11, marginBottom: 12 }, label: { color: '#45393E', fontSize: 11, fontWeight: '900', marginBottom: 7 }, numberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, numberInput: { width: 90, height: 42, borderWidth: 1, borderColor: '#DDD0C9', backgroundColor: '#FFFDFC', borderRadius: 11, textAlign: 'center', color: '#2D2327', fontWeight: '800' }, titleInput: { height: 50, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#DDD0C9', borderRadius: 13, paddingHorizontal: 14, color: '#2D2327', fontSize: 15, fontWeight: '800', marginBottom: 16 }, editor: { minHeight: 420, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#DDD0C9', borderRadius: 13, padding: 16, color: '#302821', fontFamily: 'Georgia', fontSize: 17, lineHeight: 28 }, count: { color: '#91858A', fontSize: 9, textAlign: 'right', marginTop: 6 }, optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 19, paddingVertical: 13, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E2D6D0' }, optionTitle: { color: '#3A3034', fontSize: 12, fontWeight: '900' }, optionDetail: { color: '#81757A', fontSize: 9, marginTop: 3, lineHeight: 14 }, earlyCard: { borderRadius: 14, backgroundColor: '#EDF3EF', borderWidth: 1, borderColor: '#C6D7CC', padding: 12, marginBottom: 15 }, earlyHead: { flexDirection: 'row', alignItems: 'center', gap: 10 }, earlyTitle: { color: '#31564C', fontSize: 12, fontWeight: '900' }, earlyBody: { color: '#66776F', fontSize: 9, lineHeight: 14, marginTop: 3 }, earlyDeadline: { color: '#47704D', fontSize: 9.5, fontWeight: '900', marginTop: 10 }, earlyExpired: { color: '#A12B48' }, durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }, duration: { minWidth: 62, minHeight: 34, borderRadius: 10, borderWidth: 1, borderColor: '#AFC4B7', backgroundColor: '#FFFDFC', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }, durationText: { color: '#31564C', fontSize: 9, fontWeight: '900' }, earlyHint: { color: '#7E8B85', fontSize: 8, lineHeight: 12, marginTop: 8 }, actions: { marginTop: 20 }, publish: { height: 50, borderRadius: 14, backgroundColor: '#8F1D3F', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, publishText: { color: '#FFF', fontSize: 13, fontWeight: '900' }, secondary: { height: 50, borderRadius: 14, borderWidth: 1, borderColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: '#8F1D3F', fontSize: 13, fontWeight: '900' } });
