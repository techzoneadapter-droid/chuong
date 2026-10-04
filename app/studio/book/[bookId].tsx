import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AssetBookCover } from '../../../components/Artwork';
import { LoadingState, RetryState } from '../../../components/States';
import { StudioShell } from '../../../components/StudioShell';
import { xianxia } from '../../../constants/xianxia';
import { useAuth } from '../../../contexts/AuthContext';
import {
  deleteAdminDraftBook,
  getAdminCatalogBook,
  getAdminCatalogChapters,
  importAdminCatalogChapters,
  setAdminCatalogBookStatus,
  setAdminCatalogChapterStatus,
  updateAdminCatalogBookMetadata,
} from '../../../services/adminCatalog';
import { splitChaptersFromText } from '../../../services/adminImport';
import { messageForError } from '../../../services/errors';
import { replaceBookCover } from '../../../services/storage';
import { Book, BookStatus, Chapter, SourceType } from '../../../types';

const statuses: { value: BookStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'draft', label: 'Bản nháp', icon: 'lock-closed-outline' },
  { value: 'ongoing', label: 'Đang ra', icon: 'radio-outline' },
  { value: 'completed', label: 'Hoàn thành', icon: 'checkmark-done-outline' },
  { value: 'paused', label: 'Tạm dừng', icon: 'pause-circle-outline' },
];

const sources: { value: SourceType; label: string }[] = [
  { value: 'original', label: 'Nội dung gốc' },
  { value: 'licensed_translation', label: 'Bản dịch có bản quyền' },
  { value: 'authorized', label: 'Được cấp phép đăng' },
];

export default function StudioBookManager() {
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [creditedAuthorName, setCreditedAuthorName] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');
  const [tags, setTags] = useState('');
  const [language, setLanguage] = useState('vi');
  const [sourceType, setSourceType] = useState<SourceType>('authorized');
  const [bulkText, setBulkText] = useState('');

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
      if (nextBook) {
        setTitle(nextBook.title);
        setCreditedAuthorName(nextBook.creditedAuthorName || '');
        setDescription(nextBook.description || '');
        setGenre(nextBook.genre || '');
        setTags((nextBook.tags || []).join(', '));
        setLanguage(nextBook.language || 'vi');
        setSourceType(nextBook.sourceType || 'authorized');
      }
    } catch (cause) {
      setError(messageForError(cause, 'Không thể tải truyện.'));
    } finally {
      setLoading(false);
    }
  }, [bookId, profile?.role, user]);

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

  const parsed = useMemo(() => splitChaptersFromText(bulkText), [bulkText]);
  const published = chapters.filter((chapter) => chapter.status === 'published').length;
  const drafts = chapters.length - published;

  const saveMetadata = async () => {
    if (!book || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await updateAdminCatalogBookMetadata(book.id, {
        title,
        creditedAuthorName: creditedAuthorName.trim() || null,
        description,
        genre,
        tags: tags.split(',').map((item) => item.trim()).filter(Boolean),
        language,
        sourceType,
      });
      setMessage('Đã lưu thông tin truyện.');
      await load();
    } catch (cause) {
      setError(messageForError(cause, 'Không thể lưu thông tin truyện.'));
    } finally {
      setBusy(false);
    }
  };

  const changeCover = async () => {
    if (!user || !book || busy) return;
    if (Platform.OS !== 'web') return setError('Đổi bìa trong Content Studio được tối ưu cho trình duyệt Web.');
    try {
      const doc = globalThis.document;
      if (!doc) throw new Error('Trình duyệt không hỗ trợ chọn ảnh.');
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      const file = await new Promise<File | null>((resolve) => {
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.oncancel = () => resolve(null);
        input.click();
      });
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) throw new Error('Ảnh bìa cần nhỏ hơn 5 MB.');
      const url = URL.createObjectURL(file);
      setBusy(true);
      setError('');
      try {
        await replaceBookCover(user.id, book.id, url, file.type, book.coverUrl);
      } finally {
        URL.revokeObjectURL(url);
      }
      setMessage('Đã thay ảnh bìa.');
      await load();
    } catch (cause) {
      setError(messageForError(cause, 'Không thể thay ảnh bìa.'));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: BookStatus) => {
    if (!book || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await setAdminCatalogBookStatus(book.id, status);
      setMessage(status === 'draft' ? 'Truyện đã chuyển về riêng tư.' : 'Đã cập nhật trạng thái hiển thị.');
      await load();
    } catch (cause) {
      setError(messageForError(cause));
    } finally {
      setBusy(false);
    }
  };

  const importChapters = async (publishNow: boolean) => {
    if (!book || !parsed.length || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const imported = await importAdminCatalogChapters(book.id, parsed, publishNow);
      setBulkText('');
      setMessage('Đã nhập ' + imported.length + ' chương' + (publishNow ? ' và xuất bản.' : ' dưới dạng bản nháp.'));
      await load();
    } catch (cause) {
      setError(messageForError(cause, 'Không thể nhập chương.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleChapter = async (chapter: Chapter) => {
    if (!book || !chapter.id || busy) return;
    setBusy(true);
    setError('');
    try {
      await setAdminCatalogChapterStatus(book.id, chapter.id, chapter.status === 'published' ? 'draft' : 'published');
      await load();
    } catch (cause) {
      setError(messageForError(cause, 'Không thể đổi trạng thái chương.'));
    } finally {
      setBusy(false);
    }
  };

  const removeDraft = async () => {
    if (!book || book.backendStatus !== 'draft' || busy) return;
    setBusy(true);
    setError('');
    try {
      await deleteAdminDraftBook(book.id);
      router.replace('/studio');
    } catch (cause) {
      setError(messageForError(cause));
      setBusy(false);
    }
  };

  if (authLoading || (loading && !book)) return <LoadingState label="Đang mở trình quản lý truyện…" />;
  if (profile?.role !== 'admin') return null;
  if (error && !book) return <RetryState detail={error} onRetry={load} />;
  if (!book) return <RetryState detail="Không tìm thấy truyện." onRetry={() => router.replace('/studio')} />;

  return <StudioShell
    active="books"
    title={book.title}
    subtitle="Quản lý metadata, bìa, trạng thái truyện và chương hiển thị trong ứng dụng mobile."
    actions={<>
      <Pressable style={styles.primaryAction} onPress={() => router.push({ pathname: '/studio/book/[bookId]/chapter/[chapterId]', params: { bookId: book.id, chapterId: 'new' } })}><Ionicons name="add-circle-outline" size={16} color="#FFF8EA" /><Text style={styles.primaryActionText}>Thêm chương</Text></Pressable>
      <Pressable style={styles.lightAction} onPress={() => router.push({ pathname: '/book/[id]', params: { id: book.id } })}><Ionicons name="eye-outline" size={16} color={xianxia.jadeDeep} /><Text style={styles.lightActionText}>Xem trên app</Text></Pressable>
      <Pressable style={styles.lightAction} onPress={() => router.push('/studio')}><Ionicons name="arrow-back" size={16} color={xianxia.jadeDeep} /><Text style={styles.lightActionText}>Về kho</Text></Pressable>
    </>}
  >
    {error ? <View style={styles.error}><Ionicons name="alert-circle-outline" size={18} color={xianxia.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}
    {message ? <View style={styles.success}><Ionicons name="checkmark-circle-outline" size={18} color="#47704D" /><Text style={styles.successText}>{message}</Text></View> : null}

    <View style={styles.hero}>
      <Pressable style={styles.cover} onPress={changeCover}>
        <AssetBookCover bookId={book.id} title={book.title} coverUrl={book.coverUrl} style={StyleSheet.absoluteFillObject} />
        <View style={styles.coverEdit}><Ionicons name="camera-outline" size={16} color="#FFF" /><Text style={styles.coverEditText}>Thay bìa</Text></View>
      </Pressable>
      <View style={styles.heroBody}>
        <Text style={styles.heroKicker}>TRUYỆN TRONG APP MOBILE</Text>
        <Text style={styles.heroTitle}>{book.title}</Text>
        <Text style={styles.heroMeta}>{book.author} · {book.genre} · {book.language?.toUpperCase() || 'VI'}</Text>
        <View style={styles.metrics}>
          <Metric value={chapters.length} label="Tổng chương" />
          <Metric value={published} label="Đã xuất bản" />
          <Metric value={drafts} label="Bản nháp" />
        </View>
      </View>
    </View>

    <View style={styles.columns}>
      <View style={styles.left}>
        <Panel title="Thông tin truyện" subtitle="Lưu tại đây sẽ cập nhật dữ liệu dùng chung cho web và app mobile.">
          <View style={styles.formGrid}>
            <Field label="Tên truyện" value={title} onChangeText={setTitle} />
            <Field label="Tác giả hiển thị" value={creditedAuthorName} onChangeText={setCreditedAuthorName} />
            <Field label="Thể loại" value={genre} onChangeText={setGenre} />
            <Field label="Ngôn ngữ" value={language} onChangeText={setLanguage} />
          </View>
          <Text style={styles.label}>Mô tả</Text>
          <TextInput multiline value={description} onChangeText={setDescription} textAlignVertical="top" style={styles.textareaSmall} />
          <Text style={styles.label}>Tags</Text>
          <TextInput value={tags} onChangeText={setTags} placeholder="tu tiên, huyền huyễn, hệ thống" placeholderTextColor="#9D958F" style={styles.input} />
          <Text style={styles.label}>Nguồn nội dung</Text>
          <View style={styles.chips}>{sources.map((item) => {
            const active = sourceType === item.value;
            return <Pressable key={item.value} onPress={() => setSourceType(item.value)} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text></Pressable>;
          })}</View>
          <Pressable disabled={busy} style={[styles.save, busy && styles.disabled]} onPress={saveMetadata}><Ionicons name="save-outline" size={16} color="#FFF8EA" /><Text style={styles.saveText}>{busy ? 'Đang lưu…' : 'Lưu thông tin truyện'}</Text></Pressable>
        </Panel>

        <Panel title="Nhập thêm chương" subtitle="Dán nhiều chương một lần; Studio tự tách tiêu đề và nội dung.">
          <TextInput
            multiline
            value={bulkText}
            onChangeText={setBulkText}
            placeholder={'Chương 1: Tên chương\n\nNội dung…\n\nChương 2: Tên chương\n\nNội dung…'}
            placeholderTextColor="#9D958F"
            textAlignVertical="top"
            style={styles.textarea}
          />
          <View style={styles.importFoot}>
            <Text style={styles.detected}>{parsed.length} chương nhận diện</Text>
            <View style={styles.importActions}>
              <Pressable disabled={!parsed.length || busy} style={[styles.draftButton, (!parsed.length || busy) && styles.disabled]} onPress={() => importChapters(false)}><Text style={styles.draftText}>Nhập bản nháp</Text></Pressable>
              <Pressable disabled={!parsed.length || busy} style={[styles.publishButton, (!parsed.length || busy) && styles.disabled]} onPress={() => importChapters(true)}><Text style={styles.publishText}>Nhập & xuất bản</Text></Pressable>
            </View>
          </View>
        </Panel>
      </View>

      <View style={styles.right}>
        <Panel title="Trạng thái truyện" subtitle="Chỉ truyện công khai và chương đã xuất bản mới xuất hiện cho độc giả.">
          <View style={styles.statusGrid}>{statuses.map((item) => {
            const active = book.backendStatus === item.value;
            return <Pressable key={item.value} disabled={busy} onPress={() => changeStatus(item.value)} style={[styles.status, active && styles.statusActive]}>
              <Ionicons name={item.icon} size={17} color={active ? xianxia.goldSoft : xianxia.jadeDeep} />
              <Text style={[styles.statusText, active && styles.statusTextActive]}>{item.label}</Text>
            </Pressable>;
          })}</View>
        </Panel>

        <Panel title="Danh sách chương" subtitle={published + ' đã xuất bản · ' + drafts + ' bản nháp'}>
          {!chapters.length ? <View style={styles.chapterEmpty}><Ionicons name="reader-outline" size={28} color={xianxia.jade} /><Text style={styles.chapterEmptyText}>Chưa có chương nào.</Text></View> : <View>
            {chapters.slice(0, 120).map((chapter) => <View key={chapter.id || chapter.number} style={styles.chapter}>
              <View style={[styles.chapterNo, chapter.status === 'published' && styles.chapterNoLive]}><Text style={styles.chapterNoText}>{chapter.number}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.chapterTitle}>{chapter.title}</Text><Text style={styles.chapterMeta}>{chapter.status === 'published' ? 'Đang hiển thị' : 'Bản nháp'}</Text></View>
              <Pressable disabled={!chapter.id || busy} onPress={() => toggleChapter(chapter)} style={[styles.chapterToggle, chapter.status === 'published' && styles.chapterToggleLive]}>
                <Text style={[styles.chapterToggleText, chapter.status === 'published' && styles.chapterToggleTextLive]}>{chapter.status === 'published' ? 'Ẩn' : 'Xuất bản'}</Text>
              </Pressable>
              {chapter.id ? <Pressable
                style={styles.chapterEdit}
                onPress={() => router.push({ pathname: '/studio/book/[bookId]/chapter/[chapterId]', params: { bookId: book.id, chapterId: chapter.id! } })}
              >
                <Ionicons name="create-outline" size={14} color={xianxia.jadeDeep} />
                <Text style={styles.chapterEditText}>Sửa</Text>
              </Pressable> : null}
            </View>)}
            {chapters.length > 120 ? <Text style={styles.more}>Đang hiển thị 120 chương đầu tiên trong Studio.</Text> : null}
          </View>}
        </Panel>

        {book.backendStatus === 'draft' ? <Pressable disabled={busy} style={styles.delete} onPress={removeDraft}><Ionicons name="trash-outline" size={16} color={xianxia.danger} /><Text style={styles.deleteText}>Xóa truyện nháp</Text></Pressable> : null}
      </View>
    </View>
  </StudioShell>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <View style={styles.panel}><Text style={styles.panelTitle}>{title}</Text>{subtitle ? <Text style={styles.panelSub}>{subtitle}</Text> : null}<View style={styles.panelBody}>{children}</View></View>;
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  primaryAction: { minHeight: 40, borderRadius: 11, paddingHorizontal: 12, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: xianxia.gold, flexDirection: 'row', alignItems: 'center', gap: 6 },
  primaryActionText: { color: '#FFF8EA', fontSize: 8.5, fontWeight: '900' },
  lightAction: { minHeight: 40, borderRadius: 11, paddingHorizontal: 11, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C1D1C6', flexDirection: 'row', alignItems: 'center', gap: 6 },
  lightActionText: { color: xianxia.jadeDeep, fontSize: 8.5, fontWeight: '900' },
  error: { borderRadius: 13, padding: 11, backgroundColor: '#F5E5E1', borderWidth: 1, borderColor: '#E4C5BD', flexDirection: 'row', gap: 8, marginBottom: 14 },
  errorText: { flex: 1, color: xianxia.danger, fontSize: 9, lineHeight: 14 },
  success: { borderRadius: 13, padding: 11, backgroundColor: '#E8F3EC', borderWidth: 1, borderColor: '#C9DDCD', flexDirection: 'row', gap: 8, marginBottom: 14 },
  successText: { flex: 1, color: '#47704D', fontSize: 9, lineHeight: 14 },
  hero: { minHeight: 220, borderRadius: 20, padding: 16, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E1D9CC', flexDirection: 'row', gap: 18 },
  cover: { width: 132, height: 194, borderRadius: 13, overflow: 'hidden', backgroundColor: '#EDE5D7', borderWidth: 1, borderColor: '#D9CCBA' },
  coverEdit: { position: 'absolute', left: 8, right: 8, bottom: 8, minHeight: 34, borderRadius: 10, backgroundColor: 'rgba(19,33,30,.86)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  coverEditText: { color: '#FFF8EA', fontSize: 8, fontWeight: '900' },
  heroBody: { flex: 1, justifyContent: 'center' },
  heroKicker: { color: xianxia.cinnabar, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: '#231E20', fontSize: 26, lineHeight: 32, fontWeight: '900', marginTop: 5 },
  heroMeta: { color: xianxia.jade, fontSize: 9, fontWeight: '800', marginTop: 6 },
  metrics: { marginTop: 17, flexDirection: 'row', gap: 9 },
  metric: { minWidth: 100, borderRadius: 12, padding: 10, backgroundColor: '#F4F1EA', borderWidth: 1, borderColor: '#E0D7CA' },
  metricValue: { color: xianxia.jadeDeep, fontSize: 17, fontWeight: '900' },
  metricLabel: { color: '#7C736D', fontSize: 7.5, marginTop: 2, fontWeight: '800' },
  columns: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 },
  left: { flex: 1.2, minWidth: 520, gap: 16 },
  right: { flex: .8, minWidth: 390, gap: 16 },
  panel: { borderRadius: 18, padding: 16, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E1D9CC' },
  panelTitle: { color: '#251F22', fontSize: 16, fontWeight: '900' },
  panelSub: { color: '#7C736D', fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  panelBody: { marginTop: 13 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { minWidth: 190, flexGrow: 1, flexBasis: 230 },
  label: { color: '#4C4440', fontSize: 8.5, fontWeight: '900', marginBottom: 5, marginTop: 10 },
  input: { minHeight: 41, borderRadius: 11, borderWidth: 1, borderColor: '#DDD4C8', backgroundColor: '#FAF7F1', paddingHorizontal: 10, color: '#2B2528', fontSize: 9.5 },
  textareaSmall: { minHeight: 120, borderRadius: 11, borderWidth: 1, borderColor: '#DDD4C8', backgroundColor: '#FAF7F1', padding: 10, color: '#2B2528', fontSize: 9.5, lineHeight: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 36, borderRadius: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: '#DDD4C8', backgroundColor: '#FAF7F1', justifyContent: 'center' },
  chipActive: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.jadeDeep },
  chipText: { color: '#6D6560', fontSize: 8, fontWeight: '800' },
  chipTextActive: { color: '#FFF8EA' },
  save: { alignSelf: 'flex-end', minHeight: 42, marginTop: 13, borderRadius: 11, paddingHorizontal: 13, backgroundColor: xianxia.jadeDeep, flexDirection: 'row', alignItems: 'center', gap: 6 },
  saveText: { color: '#FFF8EA', fontSize: 8.5, fontWeight: '900' },
  textarea: { minHeight: 240, borderRadius: 12, borderWidth: 1, borderColor: '#DDD4C8', backgroundColor: '#FAF7F1', padding: 11, color: '#2B2528', fontSize: 10, lineHeight: 16 },
  importFoot: { marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  detected: { color: xianxia.jade, fontSize: 8.5, fontWeight: '900' },
  importActions: { flexDirection: 'row', gap: 7 },
  draftButton: { minHeight: 38, borderRadius: 10, paddingHorizontal: 11, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C1D1C6', justifyContent: 'center' },
  draftText: { color: xianxia.jadeDeep, fontSize: 8.5, fontWeight: '900' },
  publishButton: { minHeight: 38, borderRadius: 10, paddingHorizontal: 11, backgroundColor: xianxia.jadeDeep, justifyContent: 'center' },
  publishText: { color: '#FFF8EA', fontSize: 8.5, fontWeight: '900' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  status: { minWidth: '46%', flexGrow: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: '#DDD4C8', backgroundColor: '#FAF7F1', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  statusActive: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.jadeDeep },
  statusText: { color: '#675F5B', fontSize: 8.5, fontWeight: '900' },
  statusTextActive: { color: '#FFF8EA' },
  chapterEmpty: { minHeight: 130, alignItems: 'center', justifyContent: 'center' },
  chapterEmptyText: { color: '#7C736D', fontSize: 9, marginTop: 6 },
  chapter: { minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4DCD0', flexDirection: 'row', alignItems: 'center', gap: 9 },
  chapterNo: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EEE7DD', alignItems: 'center', justifyContent: 'center' },
  chapterNoLive: { backgroundColor: '#DDEADF' },
  chapterNoText: { color: xianxia.jadeDeep, fontSize: 8.5, fontWeight: '900' },
  chapterTitle: { color: '#2B2528', fontSize: 9.5, fontWeight: '900' },
  chapterMeta: { color: '#847A74', fontSize: 7, marginTop: 2 },
  chapterToggle: { minHeight: 30, borderRadius: 9, paddingHorizontal: 8, backgroundColor: '#F1E7E4', justifyContent: 'center' },
  chapterToggleLive: { backgroundColor: '#E4EFE7' },
  chapterToggleText: { color: xianxia.cinnabar, fontSize: 7.5, fontWeight: '900' },
  chapterToggleTextLive: { color: '#47704D' },
  more: { color: xianxia.cinnabar, fontSize: 8, fontWeight: '800', marginTop: 9 },
  delete: { alignSelf: 'center', minHeight: 40, borderRadius: 11, paddingHorizontal: 12, backgroundColor: '#F6E7E4', borderWidth: 1, borderColor: '#E4C4BD', flexDirection: 'row', alignItems: 'center', gap: 6 },
  chapterEdit: { minHeight: 34, borderRadius: 9, paddingHorizontal: 9, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C1D1C6', flexDirection: 'row', alignItems: 'center', gap: 4 },
  chapterEditText: { color: xianxia.jadeDeep, fontSize: 7.5, fontWeight: '900' },
  deleteText: { color: xianxia.danger, fontSize: 8.5, fontWeight: '900' },
  disabled: { opacity: .45 },
});
