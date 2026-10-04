import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { StudioShell } from '../../components/StudioShell';
import { xianxia } from '../../constants/xianxia';
import { useAuth } from '../../contexts/AuthContext';
import {
  AdminAuthorOption,
  createAdminCatalogBook,
  deleteAdminDraftBook,
  importAdminCatalogChapters,
  getAdminCatalogChapters,
  listAdminAuthors,
  setAdminCatalogBookStatus,
} from '../../services/adminCatalog';
import { parseAdminImportFile, parseAdminImportPaste, ParsedImportBook } from '../../services/adminImport';
import { messageForError } from '../../services/errors';
import { replaceBookCover } from '../../services/storage';
import { SourceType } from '../../types';

type Candidate = ParsedImportBook & { enabled: boolean };

const sourceOptions: { value: SourceType; label: string }[] = [
  { value: 'original', label: 'Nội dung gốc' },
  { value: 'licensed_translation', label: 'Bản dịch có bản quyền' },
  { value: 'authorized', label: 'Được cấp phép đăng' },
];

const genreOptions = ['Tiên hiệp', 'Huyền huyễn', 'Đô thị', 'Kiếm hiệp', 'Ngôn tình', 'Kinh dị', 'Fantasy', 'Khoa huyễn', 'Hệ thống'];

export default function StudioUploadScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [authors, setAuthors] = useState<AdminAuthorOption[]>([]);
  const [ownerAuthorId, setOwnerAuthorId] = useState('');
  const [genre, setGenre] = useState('Tiên hiệp');
  const [language, setLanguage] = useState('vi');
  const [sourceType, setSourceType] = useState<SourceType>('authorized');
  const [creditedAuthorName, setCreditedAuthorName] = useState('');
  const [publish, setPublish] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/studio/login');
      return;
    }
    if (profile?.role !== 'admin') {
      router.replace('/(tabs)/profile');
      return;
    }
    let active = true;
    listAdminAuthors()
      .then((items) => {
        if (!active) return;
        setAuthors(items);
        const preferred = items.find((item) => item.penName.toLocaleLowerCase('vi').includes('chương studio')) ?? items[0];
        setOwnerAuthorId(preferred?.id ?? '');
      })
      .catch((cause) => { if (active) setError(messageForError(cause, 'Không tải được danh sách tác giả.')); });
    return () => { active = false; };
  }, [authLoading, profile?.role, router, user]);

  const owner = useMemo(() => authors.find((item) => item.id === ownerAuthorId), [authors, ownerAuthorId]);
  const selected = useMemo(() => candidates.filter((item) => item.enabled), [candidates]);
  const totalChapters = selected.reduce((sum, item) => sum + item.chapters.length, 0);

  const acceptParsed = (items: ParsedImportBook[]) => {
    setCandidates(items.map((item) => ({ ...item, enabled: true })));
    setError('');
    setResult('');
    if (items.length === 1 && !pasteTitle.trim()) setPasteTitle(items[0].title);
  };

  const pickFile = async () => {
    if (Platform.OS !== 'web') return setError('Cổng chọn file của Content Studio chỉ dành cho trình duyệt Web.');
    setParsing(true);
    setError('');
    setResult('');
    try {
      const doc = globalThis.document;
      if (!doc) throw new Error('Trình duyệt không hỗ trợ chọn file.');
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.docx,.zip,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip';
      const file = await new Promise<File | null>((resolve) => {
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.oncancel = () => resolve(null);
        input.click();
      });
      if (!file) return;
      acceptParsed(await parseAdminImportFile(file));
    } catch (cause) {
      setError(messageForError(cause, 'Không thể đọc file.'));
    } finally {
      setParsing(false);
    }
  };

  const parsePaste = () => {
    if (pasteText.trim().length < 20) return setError('Hãy dán nội dung truyện trước.');
    const parsed = parseAdminImportPaste(pasteText, pasteTitle.trim() || 'Truyện nhập từ Studio');
    if (!parsed.length) return setError('Không nhận diện được chương hợp lệ.');
    acceptParsed(parsed);
  };

  const updateCandidate = (id: string, patch: Partial<Candidate>) => {
    setCandidates((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const pickCover = async (candidateId: string) => {
    if (Platform.OS !== 'web') return setError('Chọn ảnh bìa trong Content Studio chỉ hỗ trợ trình duyệt Web.');
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

      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Không thể đọc ảnh bìa.'));
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Không thể đọc ảnh bìa.'));
        reader.readAsDataURL(file);
      });

      updateCandidate(candidateId, { coverDataUri: dataUri, coverMimeType: file.type || 'image/jpeg' });
      setError('');
    } catch (cause) {
      setError(messageForError(cause, 'Không thể chọn ảnh bìa.'));
    }
  };

  const importAll = async () => {
    if (!user || profile?.role !== 'admin' || busy) return;
    if (!ownerAuthorId) return setError('Cần chọn tác giả sở hữu nội bộ.');
    if (!rightsConfirmed) return setError('Cần xác nhận quyền sử dụng nội dung.');
    if (!selected.length) return setError('Chưa chọn truyện để nhập.');

    setBusy(true);
    setError('');
    setResult('');
    const done: string[] = [];
    const failed: string[] = [];

    for (const item of selected) {
      let bookId = '';
      try {
        bookId = await createAdminCatalogBook({
          ownerAuthorId,
          title: item.title,
          creditedAuthorName: creditedAuthorName.trim() || null,
          description: `Truyện được nhập bằng CHƯƠNG Content Studio từ nguồn “${item.sourceName}”.`,
          genre,
          tags: [],
          language,
          sourceType,
        });
        await importAdminCatalogChapters(bookId, item.chapters, publish);

        // Read back from production immediately. A story is only reported as
        // successful when every expected chapter number exists in the database.
        const storedChapters = await getAdminCatalogChapters(bookId);
        const expectedNumbers = item.chapters.map((chapter) => chapter.chapterNumber).sort((a, b) => a - b);
        const storedNumbers = storedChapters.map((chapter) => chapter.number).sort((a, b) => a - b);
        const complete = expectedNumbers.length === storedNumbers.length
          && expectedNumbers.every((number, index) => storedNumbers[index] === number);
        if (!complete) {
          throw new Error(`Kiểm tra sau khi tải thất bại: dự kiến ${expectedNumbers.length} chương nhưng database có ${storedNumbers.length}. Truyện được giữ ở trạng thái nháp để kiểm tra.`);
        }

        if (item.coverDataUri && item.coverMimeType) {
          await replaceBookCover(user.id, bookId, item.coverDataUri, item.coverMimeType);
        }
        if (publish) await setAdminCatalogBookStatus(bookId, 'ongoing');
        done.push(`${item.title} · ✓ ${item.chapters.length}/${item.chapters.length} chương đã lưu đủ`);
      } catch (cause) {
        if (bookId) await deleteAdminDraftBook(bookId).catch(() => undefined);
        failed.push(`${item.title}: ${messageForError(cause, 'Nhập thất bại')}`);
      }
    }

    if (done.length) setResult(`Đã nhập ${done.length} truyện / ${totalChapters} chương.\n${done.join('\n')}`);
    if (failed.length) setError(failed.join('\n'));
    if (!failed.length) {
      setCandidates([]);
      setPasteText('');
    }
    setBusy(false);
  };

  if (profile?.role !== 'admin' && !authLoading) return null;

  return <StudioShell
    active="upload"
    title="Đẩy truyện vào app mobile"
    subtitle="CHỈ DÀNH CHO ADMIN để tăng kho truyện của app. Tác giả vẫn đăng truyện bình thường từ tài khoản cá nhân/Author Studio."
    actions={<Pressable style={styles.back} onPress={() => router.push('/studio')}><Ionicons name="arrow-back" size={16} color={xianxia.jadeDeep} /><Text style={styles.backText}>Về kho truyện</Text></Pressable>}
  >
    <View style={styles.adminOnly}>
      <Ionicons name="shield-checkmark-outline" size={18} color={xianxia.goldSoft} />
      <View style={{ flex: 1 }}>
        <Text style={styles.adminOnlyTitle}>Cổng nhập kho truyện · chỉ Admin</Text>
        <Text style={styles.adminOnlyBody}>Trang này không thay thế luồng đăng truyện của tác giả. Mọi truyện nhập ở đây được ghi trực tiếp vào kho nội dung của app mobile.</Text>
      </View>
    </View>

    {error ? <View style={styles.error}><Ionicons name="alert-circle-outline" size={18} color={xianxia.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}
    {result ? <View style={styles.success}><Ionicons name="checkmark-circle-outline" size={18} color="#47704D" /><Text style={styles.successText}>{result}</Text></View> : null}

    <View style={styles.columns}>
      <View style={styles.left}>
        <Section title="1. Dán truyện hoặc tải file" subtitle="TXT, DOCX, ZIP hoặc dán thẳng nội dung. Studio sẽ tự nhận diện và tách Chương 1, Chương 2…">
          <Pressable disabled={parsing || busy} style={styles.fileButton} onPress={pickFile}>
            <Ionicons name="folder-open-outline" size={22} color={xianxia.goldSoft} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fileTitle}>{parsing ? 'Đang phân tích…' : 'Chọn TXT / DOCX / ZIP'}</Text>
              <Text style={styles.fileBody}>Chọn file từ máy tính. TXT/DOCX sẽ tự tách chương; ZIP có thể chứa nhiều truyện, nhiều chương và ảnh bìa.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={xianxia.goldSoft} />
          </Pressable>

          <Text style={styles.label}>Tên truyện khi dán</Text>
          <TextInput value={pasteTitle} onChangeText={setPasteTitle} placeholder="Ví dụ: Vạn Cổ Tiên Tông" placeholderTextColor="#9C938C" style={styles.input} />
          <Text style={styles.label}>Hoặc dán toàn bộ nội dung truyện</Text>
          <TextInput
            multiline
            value={pasteText}
            onChangeText={setPasteText}
            placeholder={'Chương 1: Khởi đầu\n\nNội dung...\n\nChương 2: Nhập đạo\n\nNội dung...'}
            placeholderTextColor="#9C938C"
            textAlignVertical="top"
            style={styles.textarea}
          />
          <Pressable style={styles.parse} onPress={parsePaste}><Ionicons name="cut-outline" size={16} color={xianxia.jadeDeep} /><Text style={styles.parseText}>Tự tách chương</Text></Pressable>
        </Section>

        <Section title="2. Thông tin truyện" subtitle="Chỉ cần điền các thông tin cơ bản trước khi đẩy vào app.">
          <View style={styles.formGrid}>
            <Field label="Tên tác giả hiển thị" value={creditedAuthorName} onChangeText={setCreditedAuthorName} placeholder={owner?.penName || 'Ví dụ: Nguyễn Văn A'} />
            <Field label="Thể loại" value={genre} onChangeText={setGenre} placeholder="Tiên hiệp" />
          </View>

          <Text style={styles.label}>Phân loại nhanh</Text>
          <View style={styles.chips}>
            {genreOptions.map((item) => {
              const active = genre === item;
              return <Pressable key={item} style={[styles.chip, active && styles.chipActive]} onPress={() => setGenre(item)}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
              </Pressable>;
            })}
          </View>

          <View style={styles.formGrid}>
            <Field label="Ngôn ngữ" value={language} onChangeText={setLanguage} placeholder="vi" />
            <View style={styles.field}>
              <Text style={styles.label}>Tài khoản lưu nội bộ</Text>
              <View style={styles.ownerBox}><Ionicons name="person-circle-outline" size={18} color={xianxia.jadeDeep} /><Text style={styles.ownerText}>{owner?.penName || 'Đang tải tác giả nội bộ…'}</Text></View>
            </View>
          </View>

          <Text style={styles.label}>Nguồn nội dung</Text>
          <View style={styles.chips}>
            {sourceOptions.map((item) => {
              const active = sourceType === item.value;
              return <Pressable key={item.value} style={[styles.chip, active && styles.chipActive]} onPress={() => setSourceType(item.value)}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
              </Pressable>;
            })}
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}><Text style={styles.switchTitle}>Xuất bản ngay</Text><Text style={styles.switchBody}>Khuyên để tắt lần đầu, kiểm tra bìa/chương rồi mới công khai.</Text></View>
            <Switch value={publish} onValueChange={setPublish} />
          </View>

          <Pressable style={[styles.rights, rightsConfirmed && styles.rightsActive]} onPress={() => setRightsConfirmed((value) => !value)}>
            <Ionicons name={rightsConfirmed ? 'checkbox' : 'square-outline'} size={20} color={rightsConfirmed ? xianxia.jadeDeep : xianxia.muted} />
            <Text style={styles.rightsText}>Tôi xác nhận nội dung này có quyền hợp pháp để đăng lên CHƯƠNG.</Text>
          </Pressable>
        </Section>
      </View>

      <View style={styles.right}>
        <Section title="3. Kiểm tra trước khi đẩy" subtitle={candidates.length ? `${selected.length} truyện · ${totalChapters} chương được chọn` : 'Chưa có dữ liệu phân tích.'}>
          {!candidates.length ? <View style={styles.empty}>
            <Ionicons name="documents-outline" size={36} color={xianxia.jade} />
            <Text style={styles.emptyTitle}>Chọn file hoặc dán nội dung</Text>
            <Text style={styles.emptyBody}>Studio tự tách chương. Sau đó bạn chỉnh tên truyện, chọn ảnh bìa và kiểm tra trước khi đẩy.</Text>
          </View> : candidates.map((item) => <View key={item.id} style={[styles.candidate, !item.enabled && styles.candidateOff]}>
            <Pressable onPress={() => updateCandidate(item.id, { enabled: !item.enabled })}><Ionicons name={item.enabled ? 'checkbox' : 'square-outline'} size={22} color={item.enabled ? xianxia.jadeDeep : xianxia.muted} /></Pressable>
            <Pressable style={styles.coverPicker} onPress={() => void pickCover(item.id)}>
              {item.coverDataUri ? <Image source={{ uri: item.coverDataUri }} style={styles.coverPreview} resizeMode="cover" /> : <View style={styles.coverEmpty}><Ionicons name="image-outline" size={24} color={xianxia.jadeDeep} /><Text style={styles.coverEmptyText}>Chọn bìa</Text></View>}
              <View style={styles.coverEditBadge}><Ionicons name="camera-outline" size={12} color="#FFF" /></View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.candidateLabel}>Tên truyện</Text>
              <TextInput value={item.title} onChangeText={(title) => updateCandidate(item.id, { title })} style={styles.candidateTitle} />
              <Text style={styles.candidateMeta}>{item.chapters.length} chương · {item.coverDataUri ? 'đã có ảnh bìa' : 'chưa có ảnh bìa'} · {item.sourceName}</Text>
              <Text numberOfLines={3} style={styles.preview}>{item.chapters.slice(0, 5).map((chapter) => `${chapter.chapterNumber}. ${chapter.title}`).join('  •  ')}</Text>
              {item.warnings.map((warning) => <Text key={warning} style={styles.warning}>⚠ {warning}</Text>)}
              <Pressable style={styles.coverButton} onPress={() => void pickCover(item.id)}><Ionicons name="image-outline" size={14} color={xianxia.jadeDeep} /><Text style={styles.coverButtonText}>{item.coverDataUri ? 'Đổi ảnh bìa' : 'Chọn ảnh bìa'}</Text></Pressable>
              <View style={styles.coverGuide}><Text style={styles.coverGuideTitle}>Bìa đẹp nhất</Text><Text style={styles.coverGuideText}>2:3 · nên dùng 1200 × 1800 px · tối thiểu 800 × 1200 px · 300 KB – 1.5 MB là lý tưởng · tối đa 5 MB · ưu tiên WebP/JPG.</Text></View>
            </View>
          </View>)}

          <Pressable disabled={busy || !selected.length} style={[styles.submit, (busy || !selected.length) && styles.disabled]} onPress={importAll}>
            <Ionicons name="cloud-upload-outline" size={18} color="#FFF8EA" />
            <Text style={styles.submitText}>{busy ? 'Đang đẩy vào kho…' : `Đẩy ${selected.length} truyện · ${totalChapters} chương`}</Text>
          </Pressable>
        </Section>
      </View>
    </View>
  </StudioShell>;
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}<View style={styles.sectionBody}>{children}</View></View>;
}

function Field({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#9C938C" style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  adminOnly: { minHeight: 64, borderRadius: 14, padding: 12, backgroundColor: '#27423B', borderWidth: 1, borderColor: '#C7A95D', flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  adminOnlyTitle: { color: '#FFF8EA', fontSize: 10.5, fontWeight: '900' },
  adminOnlyBody: { color: 'rgba(255,248,234,.68)', fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  back: { minHeight: 40, borderRadius: 11, paddingHorizontal: 12, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C1D1C6', flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { color: xianxia.jadeDeep, fontSize: 8.5, fontWeight: '900' },
  error: { borderRadius: 13, padding: 11, backgroundColor: '#F5E5E1', borderWidth: 1, borderColor: '#E4C5BD', flexDirection: 'row', gap: 8, marginBottom: 14 },
  errorText: { flex: 1, color: xianxia.danger, fontSize: 9, lineHeight: 14 },
  success: { borderRadius: 13, padding: 11, backgroundColor: '#E8F3EC', borderWidth: 1, borderColor: '#C9DDCD', flexDirection: 'row', gap: 8, marginBottom: 14 },
  successText: { flex: 1, color: '#47704D', fontSize: 9, lineHeight: 14, whiteSpace: 'pre-wrap' } as never,
  columns: { flexDirection: 'row', flexWrap: 'nowrap', gap: 18, alignItems: 'flex-start' },
  left: { flex: 1.15, minWidth: 620, gap: 16 },
  right: { flex: .85, minWidth: 430, gap: 16 },
  section: { borderRadius: 18, padding: 16, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E1D9CC' },
  sectionTitle: { color: '#251F22', fontSize: 16, fontWeight: '900' },
  sectionSub: { color: '#7B726D', fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  sectionBody: { marginTop: 13 },
  fileButton: { minHeight: 76, borderRadius: 15, padding: 13, backgroundColor: '#27423B', borderWidth: 1, borderColor: '#C7A95D', flexDirection: 'row', alignItems: 'center', gap: 11 },
  fileTitle: { color: '#FFF8EA', fontSize: 11.5, fontWeight: '900' },
  fileBody: { color: 'rgba(255,248,234,.66)', fontSize: 8, lineHeight: 12, marginTop: 3 },
  label: { color: '#4C4440', fontSize: 8.5, fontWeight: '900', marginTop: 12, marginBottom: 5 },
  input: { minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: '#DDD4C8', backgroundColor: '#FAF7F1', paddingHorizontal: 10, color: '#2B2528', fontSize: 9.5 },
  textarea: { minHeight: 280, borderRadius: 12, borderWidth: 1, borderColor: '#DDD4C8', backgroundColor: '#FAF7F1', padding: 11, color: '#2B2528', fontSize: 10, lineHeight: 16 },
  parse: { alignSelf: 'flex-end', minHeight: 38, marginTop: 8, borderRadius: 10, paddingHorizontal: 11, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C1D1C6', flexDirection: 'row', alignItems: 'center', gap: 6 },
  parseText: { color: xianxia.jadeDeep, fontSize: 8.5, fontWeight: '900' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 36, borderRadius: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: '#DDD4C8', backgroundColor: '#FAF7F1', flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipActive: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.jadeDeep },
  chipText: { color: '#6D6560', fontSize: 8, fontWeight: '800' },
  chipTextActive: { color: '#FFF8EA' },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { minWidth: 220, flexGrow: 1, flexBasis: 240 },
  ownerBox: { minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: '#DDD4C8', backgroundColor: '#F4F1E9', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  ownerText: { color: '#4E4743', fontSize: 9, fontWeight: '800' },
  switchRow: { minHeight: 64, marginTop: 13, borderRadius: 13, padding: 11, backgroundColor: '#F4F1E9', borderWidth: 1, borderColor: '#DED5C8', flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchTitle: { color: '#2B2528', fontSize: 9.5, fontWeight: '900' },
  switchBody: { color: '#7B726D', fontSize: 8, lineHeight: 12, marginTop: 3 },
  rights: { minHeight: 56, marginTop: 10, borderRadius: 13, padding: 11, borderWidth: 1, borderColor: '#DED5C8', backgroundColor: '#FAF7F1', flexDirection: 'row', alignItems: 'center', gap: 8 },
  rightsActive: { backgroundColor: '#E7EFE9', borderColor: '#9CB5A3' },
  rightsText: { flex: 1, color: '#514945', fontSize: 8.5, lineHeight: 13, fontWeight: '700' },
  empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { color: '#2B2528', fontSize: 12, fontWeight: '900', marginTop: 8 },
  emptyBody: { color: '#7B726D', fontSize: 8.5, lineHeight: 13, textAlign: 'center', marginTop: 4 },
  candidate: { minHeight: 142, borderRadius: 14, padding: 11, marginBottom: 8, backgroundColor: '#FAF7F1', borderWidth: 1, borderColor: '#DED5C8', flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  candidateOff: { opacity: .45 },
  coverPicker: { width: 78, height: 112, borderRadius: 10, overflow: 'hidden', backgroundColor: '#EEE7DB', borderWidth: 1, borderColor: '#D9CFC0' },
  coverPreview: { width: '100%', height: '100%' },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 },
  coverEmptyText: { color: xianxia.jadeDeep, fontSize: 7.5, fontWeight: '900' },
  coverEditBadge: { position: 'absolute', right: 5, bottom: 5, width: 24, height: 24, borderRadius: 8, backgroundColor: 'rgba(19,49,43,.86)', alignItems: 'center', justifyContent: 'center' },
  candidateLabel: { color: '#776E68', fontSize: 7.5, fontWeight: '900', marginBottom: 3 },
  candidateTitle: { minHeight: 36, borderRadius: 9, borderWidth: 1, borderColor: '#DDD4C8', backgroundColor: '#FFFDFC', paddingHorizontal: 9, color: '#2B2528', fontSize: 11, fontWeight: '900' },
  candidateMeta: { color: xianxia.jade, fontSize: 7.5, fontWeight: '800', marginTop: 3 },
  preview: { color: '#7B726D', fontSize: 8, lineHeight: 12, marginTop: 5 },
  warning: { color: xianxia.cinnabar, fontSize: 7.5, lineHeight: 11, marginTop: 4 },
  coverGuide: { marginTop: 8, padding: 9, borderRadius: 10, backgroundColor: '#EDF3EF', borderWidth: 1, borderColor: '#C6D7CC' },
  coverGuideTitle: { color: xianxia.jadeDeep, fontSize: 8.5, fontWeight: '900', marginBottom: 3 },
  coverGuideText: { color: xianxia.muted, fontSize: 7.8, lineHeight: 12 },
  coverButton: { alignSelf: 'flex-start', minHeight: 32, marginTop: 7, borderRadius: 9, paddingHorizontal: 9, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C1D1C6', flexDirection: 'row', alignItems: 'center', gap: 5 },
  coverButtonText: { color: xianxia.jadeDeep, fontSize: 7.5, fontWeight: '900' },
  submit: { minHeight: 50, borderRadius: 13, marginTop: 10, paddingHorizontal: 14, backgroundColor: xianxia.jadeDeep, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  submitText: { color: '#FFF8EA', fontSize: 9.5, fontWeight: '900' },
  disabled: { opacity: .45 },
});
