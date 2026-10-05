import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ButtonArt } from '../../../../components/Artwork';
import { XianxiaBackdrop } from '../../../../components/XianxiaBackdrop';
import { xianxia } from '../../../../constants/xianxia';
import { useAuth } from '../../../../contexts/AuthContext';
import { auditParsedImportChapters, normalizeImportChapterTitles, parseAdminImportFile, parseAdminImportPaste, ParsedImportBook, removeShortImportChapters, renumberImportChapters } from '../../../../services/adminImport';
import { importAuthorParsedBook } from '../../../../services/authorImport';
import { getAuthorForUser, getMyBooks } from '../../../../services/authors';
import { messageForError } from '../../../../services/errors';
import { getPremiumAiStatus, PremiumStatus, runWholeBookTranslation } from '../../../../services/premiumAi';
import { removeBookCover, replaceBookCover } from '../../../../services/storage';
import { setAuthorBookStatus, updateBook } from '../../../../services/books';
import { Book, BookStatus } from '../../../../types';

export default function AuthorImportBookScreen() {
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { user, loading: authLoading } = useAuth();

  const [book, setBook] = useState<Book | null>(null);
  const [premium, setPremium] = useState<PremiumStatus | null>(null);
  const [candidates, setCandidates] = useState<ParsedImportBook[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [paste, setPaste] = useState('');
  const [publish, setPublish] = useState(false);
  const [publishStatus, setPublishStatus] = useState<Exclude<BookStatus, 'draft'>>('ongoing');
  const [isVip, setIsVip] = useState(false);
  const [priceCoins, setPriceCoins] = useState(0);
  const [useAi, setUseAi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth/login');
      return;
    }

    let active = true;
    setLoading(true);
    Promise.all([
      getAuthorForUser(user.id),
      getPremiumAiStatus().catch(() => ({ premium: false, providerReady: false } as PremiumStatus)),
    ]).then(async ([author, premiumStatus]) => {
      if (!author) throw new Error('Bạn cần hồ sơ tác giả để tải truyện lên.');
      const owned = (await getMyBooks(author.id)).find((item) => item.id === bookId);
      if (!owned) throw new Error('Không tìm thấy truyện hoặc bạn không có quyền chỉnh sửa.');
      if (!active) return;
      setBook(owned);
      setIsVip(Boolean(owned.isVip));
      setPriceCoins(Number(owned.price || 0));
      setPremium(premiumStatus);
    }).catch((cause) => {
      if (active) setError(messageForError(cause, 'Không thể mở trình nhập truyện.'));
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [authLoading, bookId, router, user]);

  const selected = useMemo(
    () => candidates.find((item) => item.id === selectedId) ?? candidates[0] ?? null,
    [candidates, selectedId],
  );

  const selectedAudit = useMemo(
    () => selected ? auditParsedImportChapters(selected.chapters) : null,
    [selected],
  );

  const updateSelectedChapters = (updater: (chapters: ParsedImportBook['chapters']) => ParsedImportBook['chapters']) => {
    if (!selected) return;
    setCandidates((items) => items.map((item) => item.id === selected.id ? { ...item, chapters: updater(item.chapters) } : item));
    setError('');
    setSuccess('');
  };

  const setParsed = (items: ParsedImportBook[]) => {
    setCandidates(items);
    setSelectedId(items[0]?.id ?? '');
    setError('');
    setSuccess('');
    setProgress('');
  };

  const changeCover = async () => {
    if (!user || !book || busy) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 3], quality: .88 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) return setError('Ảnh bìa cần nhỏ hơn 5 MB.');
      setBusy(true);
      setError('');
      const url = await replaceBookCover(user.id, book.id, asset.uri, asset.mimeType, book.coverUrl);
      setBook((current) => current ? { ...current, coverUrl: url } : current);
      setSuccess('Đã cập nhật ảnh bìa.');
    } catch (cause) {
      setError(messageForError(cause, 'Không thể thay ảnh bìa.'));
    } finally {
      setBusy(false);
    }
  };

  const clearCover = async () => {
    if (!user || !book || busy || !book.coverUrl) return;
    setBusy(true);
    setError('');
    try {
      await removeBookCover(user.id, book.id, book.coverUrl);
      setBook((current) => current ? { ...current, coverUrl: null } : current);
      setSuccess('Đã xóa ảnh bìa.');
    } catch (cause) {
      setError(messageForError(cause, 'Không thể xóa ảnh bìa.'));
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async () => {
    setError('');
    setSuccess('');
    if (Platform.OS !== 'web') {
      setError('Chọn TXT/DOCX/ZIP trực tiếp hiện dành cho Web Author Studio. Trên điện thoại hãy dán nội dung ở ô bên dưới.');
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
      setParsed(await parseAdminImportFile(file));
    } catch (cause) {
      setError(messageForError(cause, 'Không thể đọc file.'));
    } finally {
      setParsing(false);
    }
  };

  const parsePaste = () => {
    if (paste.trim().length < 20) {
      setError('Hãy dán nội dung truyện trước.');
      return;
    }
    setParsed(parseAdminImportPaste(paste, book?.title || 'Truyện nhập'));
  };

  const startImport = async () => {
    if (!selected || !book || busy) return;
    const audit = auditParsedImportChapters(selected.chapters);
    if (audit.duplicateNumbers.length) {
      setError(`File có số chương trùng: ${audit.duplicateNumbers.slice(0, 12).join(', ')}.`);
      return;
    }
    if (audit.emptyIndexes.length) {
      setError(`Có ${audit.emptyIndexes.length} chương rỗng. Hãy loại bỏ hoặc sửa trước khi nhập.`);
      return;
    }
    if (publish && audit.shortIndexes.length) {
      setError(`Có ${audit.shortIndexes.length} chương quá ngắn. Hãy tắt “Xuất bản ngay” hoặc xử lý trước khi nhập.`);
      return;
    }
    if (isVip && (!Number.isInteger(priceCoins) || priceCoins <= 0)) {
      setError('Truyện VIP cần giá Linh Thạch lớn hơn 0.');
      return;
    }
    if (useAi && !premium?.premium) {
      setError('AI dịch toàn truyện chỉ dành cho tài khoản CHƯƠNG Premium đang hoạt động.');
      return;
    }
    if (useAi && !premium?.providerReady) {
      setError('Tài khoản đã có Premium nhưng máy chủ AI chưa được cấu hình. Bạn vẫn có thể nhập truyện thường.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      setProgress(`Đang nhập ${selected.chapters.length} chương vào “${book.title}”…`);
      await updateBook(book.id, { is_vip: isVip, price_coins: isVip ? priceCoins : 0 });
      setBook((current) => current ? { ...current, isVip, price: isVip ? priceCoins : 0 } : current);
      const imported = await importAuthorParsedBook(book.id, selected, { publish: useAi ? false : publish });

      if (!useAi && publish) {
        await setAuthorBookStatus(book.id, publishStatus);
        setBook((current) => current ? { ...current, backendStatus: publishStatus, visibility: 'public', status: publishStatus === 'ongoing' ? 'Đang ra' : publishStatus === 'completed' ? 'Đã hoàn thành' : 'Tạm dừng / Drop' } : current);
      }

      if (useAi) {
        setProgress(`Đã nhập ${imported.imported} chương. Đang AI biên dịch theo văn phong ${book.genre || 'tiểu thuyết'}…`);
        const job = await runWholeBookTranslation(book.id, book.genre || 'Tiểu thuyết', (current) => {
          setProgress(`AI đang xử lý ${current.completedChapters}/${current.totalChapters} chương · ${book.genre || 'Tiểu thuyết'}`);
        });
        setSuccess(`Hoàn tất AI dịch toàn truyện: ${job.completedChapters}/${job.totalChapters} chương. Các chương vẫn giữ trạng thái nháp để bạn kiểm tra trước khi xuất bản.`);
      } else {
        const statusLabel = publishStatus === 'completed' ? 'Hoàn thành' : publishStatus === 'paused' ? 'Tạm dừng / Drop' : 'Đang ra';
        setSuccess(`Đã nhập thành công ${imported.imported} chương ${publish ? `và công khai truyện ở trạng thái “${statusLabel}”.` : 'dưới dạng bản nháp.'}`);
      }
      setProgress('');
      setCandidates([]);
      setPaste('');
    } catch (cause) {
      setError(messageForError(cause, 'Không thể hoàn tất nhập truyện.'));
      setProgress('');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><XianxiaBackdrop /><View style={styles.center}><Text style={styles.loading}>Đang mở cổng nhập truyện…</Text></View></SafeAreaView>;
  }

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}><Ionicons name="arrow-back" size={21} color={xianxia.ink} /></Pressable>
      <View style={styles.topCopy}><Text style={styles.kicker}>VĂN CÁC · IMPORT</Text><Text style={styles.topTitle}>Tải truyện lên</Text></View>
      <View style={styles.iconButton} />
    </View>

    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Ionicons name="cloud-upload-outline" size={27} color={xianxia.goldSoft} />
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>{book?.title || 'Truyện của bạn'}</Text>
          <Text style={styles.heroBody}>Nhập TXT / DOCX / ZIP hoặc dán toàn bộ bản convert. AI chỉ xuất hiện ở bước tải truyện này, không còn nằm trong màn đọc.</Text>
        </View>
      </View>
      <View style={styles.coverPanel}>
        {book?.coverUrl ? <Image source={{ uri: book.coverUrl }} style={styles.coverThumb} /> : <View style={styles.coverThumbEmpty}><Ionicons name="image-outline" size={22} color={xianxia.jade} /><Text style={styles.coverThumbEmptyText}>Chưa có bìa</Text></View>}
        <View style={styles.coverPanelBody}>
          <Text style={styles.coverGuideTitle}>Ảnh bìa truyện</Text>
          <Text style={styles.coverGuideText}>2:3 · đẹp nhất 1200 × 1800 px · tối thiểu 800 × 1200 px · 300 KB – 1.5 MB là lý tưởng · tối đa 5 MB · ưu tiên WebP/JPG.</Text>
          <View style={styles.coverActions}>
            <Pressable disabled={busy} style={styles.coverSelect} onPress={changeCover}><Ionicons name="images-outline" size={14} color={xianxia.jadeDeep} /><Text style={styles.coverSelectText}>{book?.coverUrl ? 'Chọn lại ảnh' : 'Chọn ảnh bìa'}</Text></Pressable>
            {book?.coverUrl ? <Pressable disabled={busy} style={styles.coverDelete} onPress={clearCover}><Ionicons name="trash-outline" size={14} color={xianxia.danger} /><Text style={styles.coverDeleteText}>Xóa ảnh</Text></Pressable> : null}
          </View>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>{success}</Text> : null}
      {progress ? <View style={styles.progress}><Ionicons name="sparkles" size={17} color={xianxia.jadeDeep} /><Text style={styles.progressText}>{progress}</Text></View> : null}

      <Text style={styles.section}>1. Nguồn truyện</Text>
      <Pressable style={styles.primary} onPress={pickFile} disabled={parsing || busy}>
        <ButtonArt />
        <Ionicons name="folder-open-outline" size={18} color={xianxia.goldSoft} />
        <Text style={styles.primaryText}>{parsing ? 'Đang đọc file…' : 'Chọn TXT / DOCX / ZIP'}</Text>
      </Pressable>
      <Text style={styles.hint}>ZIP có thể chứa nhiều thư mục truyện. Bạn chọn đúng truyện muốn đưa vào linh quyển hiện tại sau khi phân tích.</Text>

      <View style={styles.pasteCard}>
        <Text style={styles.label}>Hoặc dán toàn bộ bản convert</Text>
        <TextInput
          multiline
          value={paste}
          onChangeText={setPaste}
          placeholder={'Chương 1: Khởi đầu\n\nNội dung...\n\nChương 2: Nhập đạo\n\nNội dung...'}
          placeholderTextColor="#9B9185"
          style={styles.pasteInput}
          textAlignVertical="top"
        />
        <Pressable style={styles.parseButton} onPress={parsePaste} disabled={busy}><Ionicons name="cut-outline" size={17} color={xianxia.jadeDeep} /><Text style={styles.parseText}>Phân tích chương</Text></Pressable>
      </View>

      {candidates.length ? <>
        <Text style={styles.section}>2. Chọn truyện đã nhận diện</Text>
        <View style={styles.candidateList}>
          {candidates.map((item) => {
            const active = selected?.id === item.id;
            const audit = auditParsedImportChapters(item.chapters);
            return <Pressable key={item.id} onPress={() => setSelectedId(item.id)} style={[styles.candidate, active && styles.candidateActive]}>
              <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? xianxia.gold : xianxia.jade} />
              <View style={{ flex: 1 }}><Text style={[styles.candidateTitle, active && styles.candidateTitleActive]}>{item.title}</Text><Text style={[styles.candidateMeta, active && styles.candidateMetaActive]}>{item.chapters.length} chương · {audit.totalWords.toLocaleString('vi-VN')} từ · {item.sourceName}</Text></View>
            </Pressable>;
          })}
        </View>

        {selected && selectedAudit ? <View style={styles.auditCard}>
          <View style={styles.auditGrid}>
            <View style={styles.auditMetric}><Text style={styles.auditValue}>{selectedAudit.chapterCount}</Text><Text style={styles.auditLabel}>chương</Text></View>
            <View style={styles.auditMetric}><Text style={styles.auditValue}>{selectedAudit.totalWords.toLocaleString('vi-VN')}</Text><Text style={styles.auditLabel}>từ</Text></View>
            <View style={styles.auditMetric}><Text style={[styles.auditValue, (selectedAudit.shortIndexes.length || selectedAudit.emptyIndexes.length) && styles.auditDanger]}>{selectedAudit.shortIndexes.length + selectedAudit.emptyIndexes.length}</Text><Text style={styles.auditLabel}>cần xem lại</Text></View>
          </View>
          <View style={styles.auditActions}>
            <Pressable style={styles.auditAction} onPress={() => updateSelectedChapters((chapters) => renumberImportChapters(chapters, 1))}><Text style={styles.auditActionText}>Đánh lại số 1→N</Text></Pressable>
            <Pressable style={styles.auditAction} onPress={() => updateSelectedChapters(normalizeImportChapterTitles)}><Text style={styles.auditActionText}>Chuẩn hóa tiêu đề</Text></Pressable>
            <Pressable style={[styles.auditAction, styles.auditDangerButton]} onPress={() => updateSelectedChapters(removeShortImportChapters)}><Text style={styles.auditDangerText}>Bỏ chương quá ngắn</Text></Pressable>
          </View>
          {selectedAudit.duplicateNumbers.length ? <Text style={styles.auditWarning}>Trùng số chương: {selectedAudit.duplicateNumbers.slice(0, 12).join(', ')}</Text> : null}
          {selectedAudit.missingNumbers.length ? <Text style={styles.auditHint}>Thiếu số: {selectedAudit.missingNumbers.slice(0, 12).join(', ')}{selectedAudit.missingNumbers.length > 12 ? '…' : ''}</Text> : null}
          {selectedAudit.shortIndexes.length ? <Text style={styles.auditHint}>{selectedAudit.shortIndexes.length} chương dưới 50 ký tự hoặc dưới 15 từ.</Text> : null}
        </View> : null}
      </> : null}

      <Text style={styles.section}>3. Xử lý sau khi tải lên</Text>
      <View style={styles.optionCard}>
        <View style={styles.optionRow}>
          <View style={{ flex: 1 }}><Text style={styles.optionTitle}>AI dịch / làm mượt toàn truyện</Text><Text style={styles.optionBody}>AI đọc từng chương và chuyển toàn bộ bản convert thành tiếng Việt tự nhiên theo đúng văn phong “{book?.genre || 'thể loại truyện'}”. Không tóm tắt, không bỏ đoạn.</Text></View>
          <Switch
            value={useAi}
            onValueChange={(value) => {
              if (value && !premium?.premium) {
                setError('Tính năng này chỉ mở cho tài khoản CHƯƠNG Premium.');
                setUseAi(false);
                return;
              }
              setError('');
              setUseAi(value);
              if (value) setPublish(false);
            }}
            trackColor={{ false: '#D7CFC1', true: '#77988A' }}
            thumbColor={useAi ? xianxia.jadeDeep : '#FFF8EA'}
          />
        </View>

        <View style={[styles.premiumBadge, premium?.premium ? styles.premiumOn : styles.premiumOff]}>
          <Ionicons name={premium?.premium ? 'diamond' : 'lock-closed'} size={16} color={premium?.premium ? xianxia.gold : xianxia.cinnabar} />
          <Text style={styles.premiumText}>{premium?.premium ? 'Tài khoản Premium · AI được phép sử dụng' : 'Tài khoản Free · AI đang khóa'}</Text>
        </View>

        {premium?.premium && !premium.providerReady ? <Text style={styles.warning}>Premium đã hợp lệ nhưng server chưa có API AI dịch truyện. Cần cấu hình AI_TRANSLATE_API_KEY và AI_TRANSLATE_MODEL trước khi dùng production.</Text> : null}

        <View style={styles.vipCard}>
          <View style={styles.vipRow}><View style={{ flex: 1 }}><Text style={styles.vipTitle}>Truyện VIP</Text><Text style={styles.vipBody}>Bật để độc giả dùng Linh Thạch mở khóa toàn bộ truyện. Thiết lập này áp dụng cho cả truyện hiện tại.</Text></View><Switch value={isVip} onValueChange={setIsVip} /></View>
          {isVip ? <View style={styles.vipPriceRow}><Text style={styles.vipPriceLabel}>Giá mở khóa toàn truyện</Text><TextInput value={String(priceCoins)} onChangeText={(value) => setPriceCoins(Number(value.replace(/\D/g, '')) || 0)} keyboardType="number-pad" style={styles.vipPriceInput} /><Text style={styles.vipUnit}>Linh Thạch</Text></View> : null}
          <Text style={styles.vipHint}>Bạn vẫn có thể đặt VIP riêng cho từng chương sau khi nhập.</Text>
        </View>
        {!useAi ? <>
          <View style={styles.publishRow}>
            <View style={{ flex: 1 }}><Text style={styles.optionTitle}>Xuất bản ngay sau khi nhập</Text><Text style={styles.optionBody}>Tắt: giữ chương ở bản nháp. Bật: xuất bản chương và công khai truyện theo trạng thái bạn chọn.</Text></View>
            <Switch value={publish} onValueChange={setPublish} trackColor={{ false: '#D7CFC1', true: '#77988A' }} thumbColor={publish ? xianxia.jadeDeep : '#FFF8EA'} />
          </View>
          {publish ? <View style={styles.publishStatusBox}>
            <Text style={styles.publishStatusTitle}>Trạng thái truyện sau khi đăng</Text>
            <View style={styles.publishStatusRow}>
              {([
                ['ongoing', 'Đang ra', 'radio-outline'],
                ['completed', 'Hoàn thành', 'checkmark-done-outline'],
                ['paused', 'Tạm dừng / Drop', 'pause-circle-outline'],
              ] as const).map(([value, label, icon]) => {
                const active = publishStatus === value;
                return <Pressable key={value} onPress={() => setPublishStatus(value)} style={[styles.publishStatusChip, active && styles.publishStatusChipActive]}>
                  <Ionicons name={icon} size={15} color={active ? xianxia.goldSoft : xianxia.jadeDeep} />
                  <Text style={[styles.publishStatusText, active && styles.publishStatusTextActive]}>{label}</Text>
                </Pressable>;
              })}
            </View>
            <Text style={styles.publishStatusHint}>Bạn có thể đổi lại trạng thái này bất cứ lúc nào trong màn Quản lý chương.</Text>
          </View> : null}
        </> : <Text style={styles.aiDraftNote}>Khi dùng AI, tất cả chương được giữ ở bản nháp sau khi dịch để tác giả kiểm tra rồi mới xuất bản.</Text>}
      </View>

      <Pressable disabled={!selected || busy} style={[styles.primary, (!selected || busy) && styles.disabled]} onPress={startImport}>
        <ButtonArt />
        <Ionicons name={useAi ? 'sparkles' : 'cloud-upload-outline'} size={18} color={xianxia.goldSoft} />
        <Text style={styles.primaryText}>{busy ? 'Đang xử lý…' : useAi ? 'Tải lên + AI dịch toàn truyện' : 'Nhập truyện'}</Text>
      </Pressable>

      <View style={styles.safety}>
        <Ionicons name="shield-checkmark-outline" size={18} color={xianxia.jadeDeep} />
        <Text style={styles.safetyText}>Chỉ tải lên nội dung bạn có quyền sử dụng. AI Premium được kiểm tra lại ở server; tài khoản Free không thể vượt khóa bằng cách gọi API trực tiếp.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { color: xianxia.muted, fontSize: 11, fontWeight: '800' },
  topbar: { minHeight: 64, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(244,235,216,.91)' },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topCopy: { flex: 1, alignItems: 'center' },
  kicker: { color: xianxia.cinnabar, fontSize: 7.5, fontWeight: '900', letterSpacing: 1.2 },
  topTitle: { color: xianxia.ink, fontSize: 18, fontWeight: '900', marginTop: 2 },
  page: { width: '100%', maxWidth: 780, alignSelf: 'center', padding: 16, paddingBottom: 54 },
  coverPanel: { marginTop: 10, borderRadius: 13, padding: 11, backgroundColor: '#EAF2EC', borderWidth: 1, borderColor: '#C4D7C8', flexDirection: 'row', gap: 11, alignItems: 'center' },
  coverThumb: { width: 58, height: 87, borderRadius: 8, backgroundColor: '#E8E2D8' },
  coverThumbEmpty: { width: 58, height: 87, borderRadius: 8, backgroundColor: '#F3EEE6', borderWidth: 1, borderStyle: 'dashed', borderColor: xianxia.line, alignItems: 'center', justifyContent: 'center', padding: 4 },
  coverThumbEmptyText: { color: xianxia.muted, fontSize: 6.5, textAlign: 'center', marginTop: 4 },
  coverPanelBody: { flex: 1 },
  coverActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  coverSelect: { minHeight: 34, borderRadius: 9, paddingHorizontal: 9, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C1D1C6', flexDirection: 'row', alignItems: 'center', gap: 5 },
  coverSelectText: { color: xianxia.jadeDeep, fontSize: 7.8, fontWeight: '900' },
  coverDelete: { minHeight: 34, borderRadius: 9, paddingHorizontal: 9, backgroundColor: '#F6E7E4', borderWidth: 1, borderColor: '#E4C4BD', flexDirection: 'row', alignItems: 'center', gap: 5 },
  coverDeleteText: { color: xianxia.danger, fontSize: 7.8, fontWeight: '900' },
  coverGuideTitle: { color: xianxia.jadeDeep, fontSize: 9.5, fontWeight: '900', marginBottom: 4 },
  coverGuideText: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13 },
  hero: { minHeight: 104, borderRadius: 20, padding: 16, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: xianxia.gold, flexDirection: 'row', alignItems: 'center', gap: 13 },
  heroTitle: { color: '#FFF8EA', fontSize: 14, fontWeight: '900' },
  heroBody: { color: 'rgba(255,248,234,.72)', fontSize: 9, lineHeight: 14, marginTop: 5 },
  error: { color: xianxia.danger, backgroundColor: '#F5E5E1', borderRadius: 13, padding: 11, marginTop: 12, fontSize: 9.5, lineHeight: 15 },
  success: { color: '#47704D', backgroundColor: '#E8F3EC', borderRadius: 13, padding: 11, marginTop: 12, fontSize: 9.5, lineHeight: 15 },
  progress: { borderRadius: 13, padding: 11, marginTop: 12, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', flexDirection: 'row', gap: 8, alignItems: 'center' },
  progressText: { flex: 1, color: xianxia.jadeDeep, fontSize: 9.5, fontWeight: '800' },
  section: { color: xianxia.ink, fontSize: 15, fontWeight: '900', marginTop: 22, marginBottom: 9 },
  primary: { position: 'relative', overflow: 'hidden', minHeight: 52, paddingHorizontal: 18, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFF8EA', fontSize: 11, fontWeight: '900' },
  disabled: { opacity: .45 },
  hint: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13, textAlign: 'center', marginTop: 7 },
  pasteCard: { marginTop: 12, borderRadius: 17, padding: 13, backgroundColor: 'rgba(255,248,234,.94)', borderWidth: 1, borderColor: xianxia.line },
  label: { color: xianxia.ink, fontSize: 10, fontWeight: '900', marginBottom: 7 },
  pasteInput: { minHeight: 170, borderRadius: 12, borderWidth: 1, borderColor: xianxia.line, backgroundColor: '#FFFDF7', padding: 12, color: xianxia.ink, fontSize: 11, lineHeight: 17 },
  parseButton: { alignSelf: 'flex-end', minHeight: 39, marginTop: 9, borderRadius: 11, paddingHorizontal: 12, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', flexDirection: 'row', alignItems: 'center', gap: 6 },
  parseText: { color: xianxia.jadeDeep, fontSize: 9, fontWeight: '900' },
  candidateList: { gap: 7 },
  candidate: { minHeight: 62, borderRadius: 14, padding: 11, backgroundColor: 'rgba(255,248,234,.94)', borderWidth: 1, borderColor: xianxia.line, flexDirection: 'row', gap: 9, alignItems: 'center' },
  candidateActive: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.gold },
  candidateTitle: { color: xianxia.ink, fontSize: 11, fontWeight: '900' },
  candidateTitleActive: { color: '#FFF8EA' },
  candidateMeta: { color: xianxia.muted, fontSize: 8, marginTop: 3 },
  candidateMetaActive: { color: 'rgba(255,248,234,.65)' },
  auditCard: { marginTop: 10, borderRadius: 15, padding: 12, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: xianxia.line },
  auditGrid: { flexDirection: 'row', gap: 7 },
  auditMetric: { flex: 1, minHeight: 58, borderRadius: 11, backgroundColor: '#F1ECE4', alignItems: 'center', justifyContent: 'center', padding: 7 },
  auditValue: { color: xianxia.jadeDeep, fontSize: 16, fontWeight: '900' },
  auditDanger: { color: xianxia.danger },
  auditLabel: { color: xianxia.muted, fontSize: 7.5, marginTop: 2, fontWeight: '800' },
  auditActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  auditAction: { minHeight: 34, borderRadius: 9, paddingHorizontal: 9, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#BED0C3', alignItems: 'center', justifyContent: 'center' },
  auditActionText: { color: xianxia.jadeDeep, fontSize: 7.8, fontWeight: '900' },
  auditDangerButton: { backgroundColor: '#F6E7E4', borderColor: '#E3C4BD' },
  auditDangerText: { color: xianxia.danger, fontSize: 7.8, fontWeight: '900' },
  auditWarning: { color: xianxia.danger, fontSize: 8.5, lineHeight: 13, marginTop: 8, fontWeight: '800' },
  auditHint: { color: xianxia.muted, fontSize: 8, lineHeight: 12, marginTop: 5 },
  optionCard: { borderRadius: 18, padding: 14, backgroundColor: 'rgba(255,248,234,.95)', borderWidth: 1, borderColor: xianxia.line },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionTitle: { color: xianxia.ink, fontSize: 11, fontWeight: '900' },
  optionBody: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13, marginTop: 4 },
  premiumBadge: { minHeight: 40, borderRadius: 12, paddingHorizontal: 11, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1 },
  premiumOn: { backgroundColor: '#263E38', borderColor: xianxia.gold },
  premiumOff: { backgroundColor: '#F5E5E1', borderColor: '#E1C3BA' },
  premiumText: { flex: 1, color: xianxia.inkSoft, fontSize: 8.5, fontWeight: '900' },
  warning: { color: xianxia.cinnabar, fontSize: 8.5, lineHeight: 13, marginTop: 9 },
  publishRow: { marginTop: 14, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: xianxia.line, flexDirection: 'row', alignItems: 'center', gap: 10 },
  vipCard: { marginTop: 12, padding: 11, borderRadius: 13, backgroundColor: '#F7F0DF', borderWidth: 1, borderColor: '#D8C6A0' },
  vipRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  vipTitle: { color: '#5D431D', fontSize: 9.5, fontWeight: '900' },
  vipBody: { color: '#7E6C51', fontSize: 8, lineHeight: 12, marginTop: 3 },
  vipPriceRow: { marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
  vipPriceLabel: { flex: 1, color: '#5D431D', fontSize: 8.5, fontWeight: '800' },
  vipPriceInput: { width: 84, height: 36, borderRadius: 9, borderWidth: 1, borderColor: '#D8C6A0', backgroundColor: '#FFFDF7', textAlign: 'center', color: '#5D431D', fontWeight: '900' },
  vipUnit: { color: '#7E6C51', fontSize: 8, fontWeight: '800' },
  vipHint: { color: '#8A795F', fontSize: 7.8, lineHeight: 12, marginTop: 7 },
  publishStatusBox: { marginTop: 10, borderRadius: 13, padding: 11, backgroundColor: '#EDF3EF', borderWidth: 1, borderColor: '#C6D7CC' },
  publishStatusTitle: { color: xianxia.ink, fontSize: 9.5, fontWeight: '900', marginBottom: 8 },
  publishStatusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  publishStatusChip: { minHeight: 36, borderRadius: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: '#C5D2C9', backgroundColor: '#FFFDF7', flexDirection: 'row', alignItems: 'center', gap: 5 },
  publishStatusChipActive: { backgroundColor: xianxia.jadeDeep, borderColor: xianxia.gold },
  publishStatusText: { color: xianxia.jadeDeep, fontSize: 8.5, fontWeight: '900' },
  publishStatusTextActive: { color: '#FFF8EA' },
  publishStatusHint: { color: xianxia.muted, fontSize: 8, lineHeight: 12, marginTop: 8 },
  aiDraftNote: { color: xianxia.jade, fontSize: 8.5, lineHeight: 13, marginTop: 12, fontWeight: '800' },
  safety: { marginTop: 13, borderRadius: 13, padding: 11, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#B8CBBF', flexDirection: 'row', gap: 8 },
  safetyText: { flex: 1, color: xianxia.inkSoft, fontSize: 8.5, lineHeight: 13 },
});
