import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, LoadingState, RetryState } from '../../../components/States';
import { AssetBookCover, ButtonArt } from '../../../components/Artwork';
import { XianxiaBackdrop } from '../../../components/XianxiaBackdrop';
import { xianxia } from '../../../constants/xianxia';
import { useAuth } from '../../../contexts/AuthContext';
import {
  AdminChapterImport,
  deleteAdminDraftBook,
  getAdminCatalogBook,
  getAdminCatalogChapters,
  importAdminCatalogChapters,
  setAdminCatalogBookStatus,
} from '../../../services/adminCatalog';
import { messageForError } from '../../../services/errors';
import { replaceBookCover } from '../../../services/storage';
import { Book, BookStatus, Chapter } from '../../../types';

function parseBulkChapters(value: string): AdminChapterImport[] {
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  const chapters: AdminChapterImport[] = [];
  let current: AdminChapterImport | null = null;
  const push = () => {
    if (!current) return;
    current.content = current.content.trim();
    chapters.push(current);
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const match = line.match(/^\s*(?:#{1,4}\s*)?Chương\s+(\d+)\s*(?:(?::|[-–—])\s*(.+))?\s*$/i);
    if (match) {
      push();
      const number = Number(match[1]);
      current = { chapterNumber: number, title: match[2]?.trim() || `Chương ${number}`, content: '' };
      continue;
    }
    if (current) current.content += (current.content ? '\n' : '') + raw;
  }
  push();
  return chapters.filter((item) => item.content.trim().length > 0);
}

export default function AdminCatalogBookScreen() {
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [bulkText, setBulkText] = useState('');
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
      setBook(nextBook);
      setChapters(nextChapters);
    } catch (cause) {
      setError(messageForError(cause, 'Không thể tải truyện.'));
    } finally {
      setLoading(false);
    }
  }, [bookId, profile?.role, user]);

  useFocusEffect(useCallback(() => {
    if (!authLoading && (!user || profile?.role !== 'admin')) {
      router.replace('/(tabs)/profile');
      return;
    }
    void load();
  }, [authLoading, load, profile?.role, router, user]));

  const parsed = useMemo(() => parseBulkChapters(bulkText), [bulkText]);

  const changeCover = async () => {
    if (!user || !book || busy) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 3], quality: .88 });
      if (result.canceled) return;
      setBusy(true);
      setError('');
      await replaceBookCover(user.id, book.id, result.assets[0].uri, result.assets[0].mimeType, book.coverUrl);
      setMessage('Đã cập nhật ảnh bìa.');
      await load();
    } catch (cause) {
      setError(messageForError(cause, 'Không thể thay ảnh bìa.'));
    } finally {
      setBusy(false);
    }
  };

  const importChapters = async (publish: boolean) => {
    if (!parsed.length || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const imported = await importAdminCatalogChapters(bookId, parsed, publish);
      setBulkText('');
      setMessage(`Đã nhập ${imported.length} chương${publish ? ' và xuất bản' : ' dưới dạng bản nháp'}.`);
      await load();
    } catch (cause) {
      setError(messageForError(cause, 'Không thể nhập chương.'));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: BookStatus) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await setAdminCatalogBookStatus(bookId, status);
      setMessage(status === 'draft' ? 'Truyện đã chuyển về riêng tư.' : 'Đã cập nhật trạng thái công khai.');
      await load();
    } catch (cause) {
      setError(messageForError(cause));
    } finally {
      setBusy(false);
    }
  };

  const removeDraft = async () => {
    if (!book || book.backendStatus !== 'draft' || busy) return;
    setBusy(true);
    try {
      await deleteAdminDraftBook(book.id);
      router.replace('/admin/catalog');
    } catch (cause) {
      setError(messageForError(cause));
      setBusy(false);
    }
  };

  if (profile?.role !== 'admin' && !authLoading) return null;
  if (loading && !book) return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><LoadingState label="Đang mở hồ sơ truyện…" /></SafeAreaView>;
  if (error && !book) return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><RetryState detail={error} onRetry={load} /></SafeAreaView>;
  if (!book) return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><EmptyState title="Không tìm thấy truyện" /></SafeAreaView>;

  const published = chapters.filter((chapter) => chapter.status === 'published').length;
  const drafts = chapters.length - published;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={21} color={xianxia.ink} /></Pressable>
      <View style={styles.topCopy}><Text style={styles.kicker}>TÀNG KINH CÁC · QUẢN LÝ</Text><Text numberOfLines={1} style={styles.topTitle}>{book.title}</Text></View>
      <Pressable style={styles.previewButton} onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })}><Ionicons name="eye-outline" size={19} color={xianxia.jadeDeep} /></Pressable>
    </View>

    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      {error ? <View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={18} color={xianxia.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}
      {message ? <View style={styles.successBox}><Ionicons name="checkmark-circle-outline" size={18} color="#4C7356" /><Text style={styles.successText}>{message}</Text></View> : null}

      <View style={styles.bookHero}>
        <Pressable onPress={changeCover} style={styles.coverWrap}>
          <View style={styles.cover}>
            <AssetBookCover bookId={book.id} title={book.title} coverUrl={book.coverUrl} style={StyleSheet.absoluteFillObject} />
            <View pointerEvents="none" style={styles.coverShade} />
            <View style={styles.coverEdit}><Ionicons name="camera" size={14} color={xianxia.white} /></View>
          </View>
          <Text style={styles.changeCover}>{busy ? 'Đang lưu…' : 'Thay bìa'}</Text>
        </Pressable>
        <View style={styles.heroCopy}>
          <Text style={styles.bookTitle}>{book.title}</Text>
          <Text style={styles.bookAuthor}>{book.author}</Text>
          <Text style={styles.bookMeta}>{book.genre} · {book.language?.toUpperCase() || 'VI'}</Text>
          <View style={styles.statRow}>
            <View style={styles.stat}><Text style={styles.statValue}>{chapters.length}</Text><Text style={styles.statLabel}>Tổng chương</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{published}</Text><Text style={styles.statLabel}>Đã xuất bản</Text></View>
            <View style={styles.stat}><Text style={styles.statValue}>{drafts}</Text><Text style={styles.statLabel}>Bản nháp</Text></View>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Trạng thái truyện</Text>
      <View style={styles.statusCard}>
        {([
          ['draft', 'Riêng tư', 'lock-closed-outline'],
          ['ongoing', 'Đang ra', 'radio-outline'],
          ['completed', 'Hoàn thành', 'checkmark-done-outline'],
          ['paused', 'Tạm dừng', 'pause-circle-outline'],
        ] as const).map(([value, label, icon]) => {
          const active = book.backendStatus === value;
          return <Pressable disabled={busy} key={value} onPress={() => changeStatus(value)} style={[styles.statusOption, active && styles.statusOptionActive]}>
            <Ionicons name={icon} size={18} color={active ? xianxia.goldSoft : xianxia.jade} />
            <Text style={[styles.statusText, active && styles.statusTextActive]}>{label}</Text>
          </Pressable>;
        })}
      </View>
      {book.backendStatus !== 'draft' ? <Text style={styles.statusNote}>Truyện đang hiển thị công khai. Chỉ chương đã xuất bản mới được độc giả đọc.</Text> : <Text style={styles.statusNote}>Truyện đang ẩn khỏi kho công khai. Xuất bản ít nhất một chương trước khi chuyển sang “Đang ra”.</Text>}

      <View style={styles.importHeader}>
        <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Nhập chương hàng loạt</Text><Text style={styles.sectionNote}>Dán nhiều chương một lần theo đúng mẫu. Hệ thống tự tách số chương, tiêu đề và nội dung.</Text></View>
        <View style={styles.parsedPill}><Text style={styles.parsedValue}>{parsed.length}</Text><Text style={styles.parsedLabel}>chương nhận diện</Text></View>
      </View>

      <View style={styles.sample}>
        <Text style={styles.sampleTitle}>Mẫu nhập</Text>
        <Text style={styles.sampleText}>{'### Chương 1: Khai Môn\nNội dung chương 1...\n\n### Chương 2: Linh Căn\nNội dung chương 2...'}</Text>
      </View>
      <TextInput
        value={bulkText}
        onChangeText={setBulkText}
        placeholder={'### Chương 1: Tên chương\nDán nội dung ở đây...'}
        placeholderTextColor="#9A9186"
        multiline
        textAlignVertical="top"
        style={styles.bulkInput}
      />

      {parsed.length > 0 ? <View style={styles.previewList}>
        <Text style={styles.previewTitle}>Xem trước</Text>
        {parsed.slice(0, 6).map((item) => <View key={item.chapterNumber} style={styles.previewRow}>
          <View style={styles.number}><Text style={styles.numberText}>{item.chapterNumber}</Text></View>
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.previewChapterTitle}>{item.title}</Text><Text style={styles.previewMeta}>{item.content.length.toLocaleString('vi-VN')} ký tự</Text></View>
        </View>)}
        {parsed.length > 6 ? <Text style={styles.morePreview}>+ {parsed.length - 6} chương khác</Text> : null}
      </View> : null}

      <View style={styles.importActions}>
        <Pressable disabled={busy || !parsed.length} style={[styles.draftButton, (busy || !parsed.length) && styles.disabled]} onPress={() => importChapters(false)}>
          <Ionicons name="save-outline" size={17} color={xianxia.jadeDeep} /><Text style={styles.draftButtonText}>Nhập bản nháp</Text>
        </Pressable>
        <Pressable disabled={busy || !parsed.length} style={[styles.publishButton, (busy || !parsed.length) && styles.disabled]} onPress={() => importChapters(true)}>
          <ButtonArt />
          <Ionicons name="paper-plane-outline" size={17} color={xianxia.goldSoft} /><Text style={styles.publishButtonText}>Nhập & xuất bản</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Các chương hiện có</Text>
      {chapters.length === 0 ? <View style={styles.emptyChapters}><Ionicons name="document-text-outline" size={28} color="#9F968B" /><Text style={styles.emptyTitle}>Chưa có chương</Text><Text style={styles.emptyText}>Dùng ô nhập phía trên để thêm nhiều chương trong một lần.</Text></View> : chapters.map((chapter) => (
        <View key={chapter.id} style={styles.chapterRow}>
          <View style={[styles.chapterNumber, chapter.status === 'published' && styles.chapterNumberLive]}><Text style={styles.chapterNumberText}>{chapter.number}</Text></View>
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.chapterTitle}>{chapter.title}</Text><Text style={styles.chapterMeta}>{chapter.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'} · {(chapter.content?.length ?? 0).toLocaleString('vi-VN')} ký tự</Text></View>
          <Ionicons name={chapter.status === 'published' ? 'checkmark-circle' : 'document-outline'} size={18} color={chapter.status === 'published' ? '#5D8064' : '#A09488'} />
        </View>
      ))}

      {book.backendStatus === 'draft' ? <Pressable disabled={busy} onPress={removeDraft} style={styles.deleteButton}><Ionicons name="trash-outline" size={17} color={xianxia.danger} /><Text style={styles.deleteText}>Xóa truyện nháp</Text></Pressable> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { minHeight: 66, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(245,239,228,.90)' },
  iconButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,253,247,.9)', borderWidth: 1, borderColor: xianxia.line },
  previewButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B9CBBF' },
  topCopy: { flex: 1, marginLeft: 11, marginRight: 8 },
  kicker: { color: xianxia.cinnabar, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  topTitle: { color: xianxia.ink, fontSize: 16, fontWeight: '900', marginTop: 2 },
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 60 },
  errorBox: { marginBottom: 10, borderRadius: 14, padding: 11, backgroundColor: '#F5E5E1', borderWidth: 1, borderColor: '#E2C2BA', flexDirection: 'row', gap: 8 },
  errorText: { color: xianxia.danger, fontSize: 10, lineHeight: 15, flex: 1 },
  successBox: { marginBottom: 10, borderRadius: 14, padding: 11, backgroundColor: '#E7EFE9', borderWidth: 1, borderColor: '#C8DBC9', flexDirection: 'row', gap: 8 },
  successText: { color: '#4C7356', fontSize: 10, lineHeight: 15, flex: 1, fontWeight: '700' },
  bookHero: { borderRadius: 21, backgroundColor: 'rgba(255,253,247,.90)', borderWidth: 1, borderColor: xianxia.line, padding: 14, flexDirection: 'row', gap: 15 },
  coverWrap: { alignItems: 'center' },
  cover: { width: 92, height: 138, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: xianxia.gold, justifyContent: 'center' },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,20,18,.05)' },
  coverEdit: { position: 'absolute', right: 6, bottom: 6, width: 27, height: 27, borderRadius: 9, backgroundColor: 'rgba(25,39,35,.78)', alignItems: 'center', justifyContent: 'center' },
  changeCover: { color: xianxia.cinnabar, fontSize: 8.5, fontWeight: '900', marginTop: 6 },
  heroCopy: { flex: 1, paddingVertical: 5 },
  bookTitle: { color: xianxia.ink, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  bookAuthor: { color: xianxia.jade, fontSize: 11, fontWeight: '800', marginTop: 5 },
  bookMeta: { color: xianxia.muted, fontSize: 9, marginTop: 4 },
  statRow: { flexDirection: 'row', gap: 7, marginTop: 15 },
  stat: { flex: 1, minHeight: 48, borderRadius: 11, backgroundColor: '#F0EBE2', alignItems: 'center', justifyContent: 'center' },
  statValue: { color: xianxia.jadeDeep, fontSize: 15, fontWeight: '900' },
  statLabel: { color: xianxia.muted, fontSize: 6.5, marginTop: 2, fontWeight: '800' },
  sectionTitle: { color: xianxia.ink, fontSize: 15, fontWeight: '900', marginTop: 24, marginBottom: 8 },
  sectionNote: { color: xianxia.muted, fontSize: 9, lineHeight: 14, marginTop: -3 },
  statusCard: { borderRadius: 17, padding: 8, backgroundColor: 'rgba(255,253,247,.88)', borderWidth: 1, borderColor: xianxia.line, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  statusOption: { minHeight: 42, flexGrow: 1, minWidth: '46%', borderRadius: 12, borderWidth: 1, borderColor: xianxia.line, backgroundColor: '#F6F1E9', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  statusOptionActive: { backgroundColor: xianxia.jadeDeep, borderColor: '#496A61' },
  statusText: { color: xianxia.inkSoft, fontSize: 9.5, fontWeight: '900' },
  statusTextActive: { color: xianxia.white },
  statusNote: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13, marginTop: 7 },
  importHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  parsedPill: { minWidth: 78, borderRadius: 12, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', padding: 8, alignItems: 'center' },
  parsedValue: { color: xianxia.jadeDeep, fontSize: 16, fontWeight: '900' },
  parsedLabel: { color: xianxia.jade, fontSize: 6.5, fontWeight: '800', marginTop: 1 },
  sample: { borderRadius: 14, backgroundColor: '#EEE6DA', borderWidth: 1, borderColor: xianxia.line, padding: 11, marginTop: 5 },
  sampleTitle: { color: xianxia.cinnabar, fontSize: 9, fontWeight: '900', marginBottom: 5 },
  sampleText: { color: '#665F57', fontSize: 8.5, lineHeight: 13, fontFamily: 'monospace' },
  bulkInput: { minHeight: 260, marginTop: 9, borderRadius: 17, backgroundColor: 'rgba(255,253,247,.92)', borderWidth: 1, borderColor: xianxia.line, padding: 14, color: xianxia.ink, fontSize: 13, lineHeight: 21, fontFamily: 'Georgia' },
  previewList: { marginTop: 10, borderRadius: 16, backgroundColor: 'rgba(255,253,247,.88)', borderWidth: 1, borderColor: xianxia.line, padding: 11 },
  previewTitle: { color: xianxia.ink, fontSize: 10, fontWeight: '900', marginBottom: 4 },
  previewRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line },
  number: { width: 29, height: 29, borderRadius: 10, backgroundColor: xianxia.jadeMist, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: xianxia.jadeDeep, fontSize: 9, fontWeight: '900' },
  previewChapterTitle: { color: xianxia.ink, fontSize: 10, fontWeight: '900' },
  previewMeta: { color: xianxia.muted, fontSize: 7.5, marginTop: 2 },
  morePreview: { color: xianxia.cinnabar, fontSize: 8.5, fontWeight: '900', marginTop: 8 },
  importActions: { flexDirection: 'row', gap: 9, marginTop: 10 },
  draftButton: { flex: 1, minHeight: 49, borderRadius: 14, borderWidth: 1, borderColor: '#9CB4A5', backgroundColor: xianxia.jadeMist, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  draftButtonText: { color: xianxia.jadeDeep, fontSize: 10, fontWeight: '900' },
  publishButton: { position: 'relative', overflow: 'hidden', flex: 1, minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  publishButtonText: { color: xianxia.white, fontSize: 10, fontWeight: '900' },
  disabled: { opacity: .42 },
  emptyChapters: { borderRadius: 16, backgroundColor: 'rgba(255,253,247,.85)', borderWidth: 1, borderColor: xianxia.line, padding: 24, alignItems: 'center' },
  emptyTitle: { color: xianxia.ink, fontSize: 12, fontWeight: '900', marginTop: 7 },
  emptyText: { color: xianxia.muted, fontSize: 8.5, marginTop: 4, textAlign: 'center' },
  chapterRow: { minHeight: 66, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, flexDirection: 'row', alignItems: 'center', gap: 10 },
  chapterNumber: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#EEE6DA', alignItems: 'center', justifyContent: 'center' },
  chapterNumberLive: { backgroundColor: '#DCE9DF' },
  chapterNumberText: { color: xianxia.jadeDeep, fontSize: 9.5, fontWeight: '900' },
  chapterTitle: { color: xianxia.ink, fontSize: 11, fontWeight: '900' },
  chapterMeta: { color: xianxia.muted, fontSize: 7.5, marginTop: 3 },
  deleteButton: { marginTop: 26, alignSelf: 'center', minHeight: 42, paddingHorizontal: 15, borderRadius: 13, borderWidth: 1, borderColor: '#E1B8B2', backgroundColor: '#F8E8E5', flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: xianxia.danger, fontSize: 9.5, fontWeight: '900' },
});
