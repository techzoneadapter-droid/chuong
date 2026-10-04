import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ButtonArt } from '../../../components/Artwork';
import { FormField } from '../../../components/Form';
import { XianxiaBackdrop } from '../../../components/XianxiaBackdrop';
import { xianxia } from '../../../constants/xianxia';
import { useAuth } from '../../../contexts/AuthContext';
import {
  AdminAuthorOption,
  createAdminCatalogBook,
  deleteAdminDraftBook,
  importAdminCatalogChapters,
  listAdminAuthors,
  setAdminCatalogBookStatus,
} from '../../../services/adminCatalog';
import { parseAdminImportFile, parseAdminImportPaste, ParsedImportBook } from '../../../services/adminImport';
import { messageForError } from '../../../services/errors';
import { replaceBookCover } from '../../../services/storage';
import { SourceType } from '../../../types';

type MutableCandidate = ParsedImportBook & { enabled: boolean };

const sources: { value: SourceType; label: string }[] = [
  { value: 'original', label: 'Nội dung gốc' },
  { value: 'licensed_translation', label: 'Bản dịch có bản quyền' },
  { value: 'authorized', label: 'Được cấp phép đăng' },
];

export default function AdminBulkImportScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [authors, setAuthors] = useState<AdminAuthorOption[]>([]);
  const [ownerAuthorId, setOwnerAuthorId] = useState('');
  const [genre, setGenre] = useState('Tiên hiệp');
  const [language, setLanguage] = useState('vi');
  const [sourceType, setSourceType] = useState<SourceType>('authorized');
  const [creditedAuthorName, setCreditedAuthorName] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [publish, setPublish] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [candidates, setCandidates] = useState<MutableCandidate[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user || profile?.role !== 'admin') {
      router.replace('/(tabs)/profile');
      return;
    }
    let active = true;
    listAdminAuthors().then((items) => {
      if (!active) return;
      setAuthors(items);
      const preferred = items.find((item) => item.penName.toLocaleLowerCase('vi').includes('chương studio')) ?? items[0];
      setOwnerAuthorId(preferred?.id ?? '');
    }).catch((cause) => {
      if (active) setError(messageForError(cause, 'Không tải được danh sách tác giả.'));
    });
    return () => { active = false; };
  }, [authLoading, profile?.role, router, user]);

  const owner = useMemo(() => authors.find((item) => item.id === ownerAuthorId), [authors, ownerAuthorId]);
  const selected = candidates.filter((item) => item.enabled);
  const totalChapters = selected.reduce((sum, item) => sum + item.chapters.length, 0);

  const mergeCandidates = (items: ParsedImportBook[]) => {
    setCandidates(items.map((item) => ({ ...item, enabled: true })));
    setResult('');
    setError('');
  };

  const parsePaste = () => {
    setError('');
    setResult('');
    if (pasteText.trim().length < 20) {
      setError('Hãy dán nội dung truyện trước khi phân tích.');
      return;
    }
    const parsed = parseAdminImportPaste(pasteText, pasteTitle.trim() || 'Truyện nhập nhanh');
    if (!parsed.length) {
      setError('Không tách được chương từ nội dung đã dán.');
      return;
    }
    mergeCandidates(parsed);
  };

  const pickFile = async () => {
    setError('');
    setResult('');
    if (Platform.OS !== 'web') {
      setError('Nhập file TXT/DOCX/ZIP hiện được tối ưu cho trang quản trị Web. Trên Android/iOS bạn vẫn có thể dán nội dung vào ô phía dưới.');
      return;
    }

    setParsing(true);
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
      const parsed = await parseAdminImportFile(file);
      mergeCandidates(parsed);
      if (!pasteTitle.trim() && parsed.length === 1) setPasteTitle(parsed[0].title);
    } catch (cause) {
      setError(messageForError(cause, 'Không thể đọc file nhập.'));
    } finally {
      setParsing(false);
    }
  };

  const updateCandidate = (id: string, patch: Partial<MutableCandidate>) => {
    setCandidates((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const pickCandidateCover = async (id: string) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 3], quality: .88 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) return setError('Ảnh bìa cần nhỏ hơn 5 MB.');
      updateCandidate(id, { coverDataUri: asset.uri, coverMimeType: asset.mimeType || 'image/jpeg' });
      setError('');
    } catch (cause) {
      setError(messageForError(cause, 'Không thể chọn ảnh bìa.'));
    }
  };

  const runImport = async () => {
    if (!user || profile?.role !== 'admin') return;
    if (!ownerAuthorId) return setError('Cần chọn tác giả sở hữu nội bộ.');
    if (!rightsConfirmed) return setError('Cần xác nhận quyền sử dụng và phân phối nội dung.');
    if (!selected.length) return setError('Chưa chọn truyện nào để nhập.');

    const invalid = selected.find((item) => item.title.trim().length < 2 || !item.chapters.length);
    if (invalid) return setError(`“${invalid.title || invalid.sourceName}” chưa đủ tên truyện hoặc chương.`);

    setImporting(true);
    setError('');
    setResult('');
    const imported: string[] = [];
    const failed: string[] = [];

    for (const item of selected) {
      let bookId = '';
      try {
        bookId = await createAdminCatalogBook({
          ownerAuthorId,
          title: item.title,
          creditedAuthorName: creditedAuthorName.trim() || null,
          description: `Truyện được nhập vào Tàng Kinh Các từ nguồn “${item.sourceName}”. Nội dung sẽ được biên tập và kiểm duyệt trên CHƯƠNG.`,
          genre,
          tags: [],
          language,
          sourceType,
        });
        await importAdminCatalogChapters(bookId, item.chapters, publish);
        if (item.coverDataUri && item.coverMimeType) {
          await replaceBookCover(user.id, bookId, item.coverDataUri, item.coverMimeType);
        }
        if (publish) await setAdminCatalogBookStatus(bookId, 'ongoing');
        imported.push(`${item.title} (${item.chapters.length} chương)`);
      } catch (cause) {
        if (bookId) await deleteAdminDraftBook(bookId).catch(() => undefined);
        failed.push(`${item.title}: ${messageForError(cause, 'Nhập thất bại')}`);
      }
    }

    if (failed.length) setError(failed.join('\n'));
    if (imported.length) setResult(`Đã nhập ${imported.length} truyện / ${imported.reduce((sum, line) => sum + Number(line.match(/\((\d+) chương\)/)?.[1] || 0), 0)} chương.\n${imported.join('\n')}`);
    setImporting(false);
    if (imported.length && !failed.length) setCandidates([]);
  };

  if (profile?.role !== 'admin' && !authLoading) return null;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={21} color={xianxia.ink} /></Pressable>
      <View style={styles.topCopy}><Text style={styles.kicker}>TÀNG KINH CÁC · BULK</Text><Text style={styles.topTitle}>Nhập kho hàng loạt</Text></View>
      <View style={styles.iconButton} />
    </View>

    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="documents-outline" size={25} color={xianxia.goldSoft} /></View>
        <View style={{ flex: 1 }}><Text style={styles.heroTitle}>TXT · DOCX · ZIP → truyện & chương</Text><Text style={styles.heroBody}>Tự tách tiêu đề “Chương 1, Chương 2…”. ZIP có thể chứa nhiều truyện theo thư mục; nếu có cover/bia JPG, PNG hoặc WebP cùng nhóm, hệ thống sẽ thử gắn bìa tự động.</Text></View>
      </View>
      <View style={styles.coverGuide}><Text style={styles.coverGuideTitle}>Chuẩn ảnh bìa khi nhập kho</Text><Text style={styles.coverGuideText}>Nếu ZIP/EPUB có bìa, nên dùng tỷ lệ 2:3 · 1200 × 1800 px · tối thiểu 800 × 1200 px · 300 KB – 1.5 MB là lý tưởng · tối đa 5 MB · ưu tiên WebP/JPG.</Text></View>

      {error ? <View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={18} color={xianxia.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}
      {result ? <View style={styles.successBox}><Ionicons name="checkmark-circle-outline" size={18} color="#47704D" /><Text style={styles.successText}>{result}</Text></View> : null}

      <Text style={styles.sectionTitle}>1. Chọn nguồn nhập</Text>
      <Pressable style={styles.fileButton} onPress={pickFile} disabled={parsing}>
        <ButtonArt />
        <Ionicons name="folder-open-outline" size={19} color={xianxia.goldSoft} />
        <Text style={styles.fileButtonText}>{parsing ? 'Đang đọc file…' : 'Chọn TXT / DOCX / ZIP'}</Text>
      </Pressable>
      <Text style={styles.platformHint}>{Platform.OS === 'web' ? 'Web Admin: hỗ trợ chọn file trực tiếp.' : 'Mobile: dùng khung dán nội dung bên dưới; file picker hàng loạt dành cho Web Admin.'}</Text>

      <View style={styles.pasteCard}>
        <FormField label="Tên truyện khi dán" value={pasteTitle} onChangeText={setPasteTitle} placeholder="Ví dụ: Vạn Cổ Tiên Tông" />
        <Text style={styles.fieldLabel}>Nội dung chương</Text>
        <TextInput
          multiline
          value={pasteText}
          onChangeText={setPasteText}
          placeholder={'Chương 1: Khởi đầu\n\nNội dung...\n\nChương 2: Nhập đạo\n\nNội dung...'}
          placeholderTextColor="#9B9185"
          style={styles.pasteInput}
          textAlignVertical="top"
        />
        <Pressable style={styles.parseButton} onPress={parsePaste}><Ionicons name="cut-outline" size={17} color={xianxia.jadeDeep} /><Text style={styles.parseText}>Phân tích nội dung dán</Text></Pressable>
      </View>

      <Text style={styles.sectionTitle}>2. Thiết lập chung</Text>
      <View style={styles.settingsCard}>
        <Text style={styles.fieldLabel}>Tác giả sở hữu nội bộ</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.authorList}>
          {authors.map((item) => {
            const active = item.id === ownerAuthorId;
            return <Pressable key={item.id} onPress={() => setOwnerAuthorId(item.id)} style={[styles.authorChip, active && styles.authorChipActive]}>
              <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={16} color={active ? xianxia.goldSoft : xianxia.jade} />
              <Text style={[styles.authorText, active && styles.authorTextActive]}>{item.penName}{item.verified ? ' ✓' : ''}</Text>
            </Pressable>;
          })}
        </ScrollView>
        <FormField label="Tên tác giả hiển thị (tùy chọn)" value={creditedAuthorName} onChangeText={setCreditedAuthorName} placeholder={owner?.penName ? `Để trống sẽ dùng: ${owner.penName}` : 'Tên tác giả'} />
        <FormField label="Thể loại mặc định" value={genre} onChangeText={setGenre} placeholder="Tiên hiệp" />
        <FormField label="Ngôn ngữ" value={language} onChangeText={setLanguage} placeholder="vi" autoCapitalize="none" />

        <Text style={styles.fieldLabel}>Nguồn nội dung</Text>
        <View style={styles.sourceRow}>{sources.map((item) => <Pressable key={item.value} onPress={() => setSourceType(item.value)} style={[styles.sourceChip, sourceType === item.value && styles.sourceChipActive]}><Text style={[styles.sourceText, sourceType === item.value && styles.sourceTextActive]}>{item.label}</Text></Pressable>)}</View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}><Text style={styles.switchTitle}>Xuất bản ngay</Text><Text style={styles.switchBody}>Tắt: nhập thành bản nháp để kiểm tra. Bật: chương được xuất bản và truyện chuyển sang “Đang ra”.</Text></View>
          <Switch value={publish} onValueChange={setPublish} trackColor={{ false: '#D8CEC1', true: '#79988B' }} thumbColor={publish ? xianxia.jadeDeep : '#FFF8EA'} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>3. Kiểm tra trước khi nhập</Text>
      {!candidates.length ? <View style={styles.empty}><Ionicons name="file-tray-outline" size={28} color={xianxia.jade} /><Text style={styles.emptyTitle}>Chưa có dữ liệu phân tích</Text><Text style={styles.emptyBody}>Chọn file hoặc dán nội dung để xem truyện, số chương và cảnh báo trước khi ghi vào kho.</Text></View> : <>
        <View style={styles.summary}><Text style={styles.summaryText}>{selected.length} truyện được chọn · {totalChapters} chương</Text></View>
        {candidates.map((item) => <View key={item.id} style={[styles.candidate, !item.enabled && styles.candidateDisabled]}>
          <Pressable onPress={() => updateCandidate(item.id, { enabled: !item.enabled })}><Ionicons name={item.enabled ? 'checkbox' : 'square-outline'} size={23} color={item.enabled ? xianxia.jadeDeep : xianxia.muted} /></Pressable>
          <View style={styles.candidateCoverWrap}>
            {item.coverDataUri ? <Image source={{ uri: item.coverDataUri }} style={styles.candidateCover} /> : <View style={styles.candidateCoverEmpty}><Ionicons name="image-outline" size={20} color={xianxia.jade} /><Text style={styles.candidateCoverEmptyText}>Chưa có bìa</Text></View>}
          </View>
          <View style={{ flex: 1 }}>
            <TextInput value={item.title} onChangeText={(title) => updateCandidate(item.id, { title })} style={styles.candidateTitle} />
            <Text style={styles.candidateMeta}>{item.sourceName} · {item.chapters.length} chương{item.coverDataUri ? ' · có bìa' : ''}</Text>
            <Text numberOfLines={2} style={styles.chapterPreview}>{item.chapters.slice(0, 3).map((chapter) => `${chapter.chapterNumber}. ${chapter.title}`).join('  •  ')}</Text>
            {item.warnings.map((warning) => <Text key={warning} style={styles.warning}>⚠ {warning}</Text>)}
            <View style={styles.candidateCoverActions}>
              <Pressable style={styles.candidateCoverButton} onPress={() => void pickCandidateCover(item.id)}><Ionicons name="images-outline" size={14} color={xianxia.jadeDeep} /><Text style={styles.candidateCoverButtonText}>{item.coverDataUri ? 'Chọn lại ảnh' : 'Chọn ảnh bìa'}</Text></Pressable>
              {item.coverDataUri ? <Pressable style={styles.candidateCoverDelete} onPress={() => updateCandidate(item.id, { coverDataUri: undefined, coverMimeType: undefined })}><Ionicons name="trash-outline" size={14} color={xianxia.danger} /><Text style={styles.candidateCoverDeleteText}>Xóa ảnh</Text></Pressable> : null}
            </View>
          </View>
        </View>)}
      </>}

      <Pressable style={[styles.rights, rightsConfirmed && styles.rightsActive]} onPress={() => setRightsConfirmed((value) => !value)}>
        <Ionicons name={rightsConfirmed ? 'checkbox' : 'square-outline'} size={22} color={rightsConfirmed ? xianxia.jadeDeep : xianxia.muted} />
        <Text style={styles.rightsText}>Tôi xác nhận CHƯƠNG có quyền hợp pháp để lưu trữ và phân phối toàn bộ nội dung đã chọn.</Text>
      </Pressable>

      <Pressable disabled={importing || !selected.length} style={[styles.importButton, (importing || !selected.length) && styles.disabled]} onPress={runImport}>
        <ButtonArt />
        <Ionicons name="cloud-upload-outline" size={19} color={xianxia.goldSoft} />
        <Text style={styles.importText}>{importing ? 'Đang nhập kho…' : `Nhập ${selected.length} truyện · ${totalChapters} chương`}</Text>
        <Ionicons name="arrow-forward" size={17} color="#FFF8EA" />
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { minHeight: 66, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(244,235,216,.91)' },
  iconButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  topCopy: { flex: 1, alignItems: 'center' },
  kicker: { color: xianxia.cinnabar, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.2 },
  topTitle: { color: xianxia.ink, fontSize: 18, fontWeight: '900', marginTop: 2 },
  page: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 16, paddingBottom: 54 },
  coverGuide: { marginTop: 10, borderRadius: 13, padding: 11, backgroundColor: '#EAF2EC', borderWidth: 1, borderColor: '#C4D7C8' },
  coverGuideTitle: { color: xianxia.jadeDeep, fontSize: 9.5, fontWeight: '900', marginBottom: 4 },
  coverGuideText: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13 },
  hero: { minHeight: 112, borderRadius: 20, padding: 16, backgroundColor: '#263E38', borderWidth: 1, borderColor: '#496A61', flexDirection: 'row', gap: 13, alignItems: 'center' },
  heroIcon: { width: 52, height: 52, borderRadius: 15, backgroundColor: 'rgba(229,209,163,.10)', borderWidth: 1, borderColor: 'rgba(229,209,163,.35)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: xianxia.white, fontSize: 14, fontWeight: '900' },
  heroBody: { color: 'rgba(255,253,248,.68)', fontSize: 9, lineHeight: 14, marginTop: 5 },
  errorBox: { marginTop: 12, padding: 11, borderRadius: 14, backgroundColor: '#F5E5E1', borderWidth: 1, borderColor: '#E2C2BA', flexDirection: 'row', gap: 8 },
  errorText: { flex: 1, color: xianxia.danger, fontSize: 9.5, lineHeight: 15, whiteSpace: 'pre-wrap' } as never,
  successBox: { marginTop: 12, padding: 11, borderRadius: 14, backgroundColor: '#E8F3EC', borderWidth: 1, borderColor: '#C9DDCD', flexDirection: 'row', gap: 8 },
  successText: { flex: 1, color: '#47704D', fontSize: 9.5, lineHeight: 15, whiteSpace: 'pre-wrap' } as never,
  sectionTitle: { color: xianxia.ink, fontSize: 15, fontWeight: '900', marginTop: 23, marginBottom: 9 },
  fileButton: { position: 'relative', overflow: 'hidden', minHeight: 52, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  fileButtonText: { color: '#FFF8EA', fontSize: 11, fontWeight: '900' },
  platformHint: { color: xianxia.muted, fontSize: 8.5, textAlign: 'center', marginTop: 6 },
  pasteCard: { marginTop: 12, borderRadius: 18, padding: 14, backgroundColor: 'rgba(255,248,234,.94)', borderWidth: 1, borderColor: xianxia.line },
  fieldLabel: { color: xianxia.ink, fontSize: 10, fontWeight: '900', marginTop: 9, marginBottom: 6 },
  pasteInput: { minHeight: 180, borderRadius: 13, borderWidth: 1, borderColor: xianxia.line, backgroundColor: '#FFFDF7', padding: 12, color: xianxia.ink, fontSize: 11, lineHeight: 17 },
  parseButton: { alignSelf: 'flex-end', minHeight: 40, marginTop: 10, borderRadius: 12, paddingHorizontal: 13, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', flexDirection: 'row', alignItems: 'center', gap: 6 },
  parseText: { color: xianxia.jadeDeep, fontSize: 9, fontWeight: '900' },
  settingsCard: { borderRadius: 18, padding: 14, backgroundColor: 'rgba(255,248,234,.94)', borderWidth: 1, borderColor: xianxia.line },
  authorList: { gap: 7, paddingRight: 10 },
  authorChip: { minHeight: 38, borderRadius: 12, paddingHorizontal: 11, borderWidth: 1, borderColor: xianxia.line, backgroundColor: '#FFFDF7', flexDirection: 'row', alignItems: 'center', gap: 6 },
  authorChipActive: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.gold },
  authorText: { color: xianxia.inkSoft, fontSize: 9, fontWeight: '800' },
  authorTextActive: { color: xianxia.goldSoft },
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  sourceChip: { minHeight: 36, borderRadius: 11, paddingHorizontal: 11, borderWidth: 1, borderColor: xianxia.line, backgroundColor: '#FFFDF7', alignItems: 'center', justifyContent: 'center' },
  sourceChipActive: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.gold },
  sourceText: { color: xianxia.inkSoft, fontSize: 8.5, fontWeight: '800' },
  sourceTextActive: { color: xianxia.goldSoft },
  switchRow: { marginTop: 16, minHeight: 66, borderRadius: 13, padding: 11, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchTitle: { color: xianxia.ink, fontSize: 10.5, fontWeight: '900' },
  switchBody: { color: xianxia.muted, fontSize: 8, lineHeight: 12, marginTop: 3 },
  empty: { minHeight: 170, borderRadius: 17, backgroundColor: 'rgba(255,248,234,.82)', borderWidth: 1, borderColor: xianxia.line, alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyTitle: { color: xianxia.ink, fontSize: 12, fontWeight: '900', marginTop: 9 },
  emptyBody: { color: xianxia.muted, fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 5 },
  summary: { borderRadius: 12, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', padding: 10, marginBottom: 8 },
  summaryText: { color: xianxia.jadeDeep, fontSize: 9.5, fontWeight: '900' },
  candidate: { minHeight: 104, borderRadius: 16, padding: 12, marginBottom: 8, backgroundColor: 'rgba(255,248,234,.94)', borderWidth: 1, borderColor: xianxia.line, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  candidateDisabled: { opacity: .48 },
  candidateCoverWrap: { width: 66, alignItems: 'center' },
  candidateCover: { width: 58, height: 87, borderRadius: 8, backgroundColor: '#EEE7DD' },
  candidateCoverEmpty: { width: 58, height: 87, borderRadius: 8, backgroundColor: '#F3EEE6', borderWidth: 1, borderStyle: 'dashed', borderColor: xianxia.line, alignItems: 'center', justifyContent: 'center', padding: 4 },
  candidateCoverEmptyText: { color: xianxia.muted, fontSize: 6.5, textAlign: 'center', marginTop: 4 },
  candidateCoverActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  candidateCoverButton: { minHeight: 34, borderRadius: 9, paddingHorizontal: 9, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C1D1C6', flexDirection: 'row', alignItems: 'center', gap: 5 },
  candidateCoverButtonText: { color: xianxia.jadeDeep, fontSize: 7.8, fontWeight: '900' },
  candidateCoverDelete: { minHeight: 34, borderRadius: 9, paddingHorizontal: 9, backgroundColor: '#F6E7E4', borderWidth: 1, borderColor: '#E4C4BD', flexDirection: 'row', alignItems: 'center', gap: 5 },
  candidateCoverDeleteText: { color: xianxia.danger, fontSize: 7.8, fontWeight: '900' },
  candidateTitle: { color: xianxia.ink, fontSize: 13, fontWeight: '900', padding: 0 },
  candidateMeta: { color: xianxia.jade, fontSize: 8.5, fontWeight: '800', marginTop: 4 },
  chapterPreview: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13, marginTop: 5 },
  warning: { color: xianxia.cinnabar, fontSize: 8, lineHeight: 12, marginTop: 5 },
  rights: { minHeight: 62, marginTop: 14, borderRadius: 15, padding: 12, backgroundColor: 'rgba(255,248,234,.90)', borderWidth: 1, borderColor: xianxia.line, flexDirection: 'row', alignItems: 'center', gap: 9 },
  rightsActive: { backgroundColor: '#E7EFE9', borderColor: '#95B1A2' },
  rightsText: { flex: 1, color: xianxia.inkSoft, fontSize: 9.5, lineHeight: 14, fontWeight: '700' },
  importButton: { position: 'relative', overflow: 'hidden', minHeight: 54, marginTop: 16, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 9 },
  importText: { flex: 1, color: '#FFF8EA', fontSize: 11, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: .45 },
});
