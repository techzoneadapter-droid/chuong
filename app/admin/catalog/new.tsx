import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FormField } from '../../../components/Form';
import { XianxiaBackdrop } from '../../../components/XianxiaBackdrop';
import { xianxia } from '../../../constants/xianxia';
import { useAuth } from '../../../contexts/AuthContext';
import { createAdminCatalogBook, listAdminAuthors, AdminAuthorOption } from '../../../services/adminCatalog';
import { messageForError } from '../../../services/errors';
import { replaceBookCover } from '../../../services/storage';
import { SourceType } from '../../../types';

const sources: { value: SourceType; label: string; detail: string }[] = [
  { value: 'original', label: 'Nội dung gốc', detail: 'CHƯƠNG / tác giả sở hữu quyền khai thác.' },
  { value: 'licensed_translation', label: 'Bản dịch có bản quyền', detail: 'Có quyền dịch và quyền phân phối.' },
  { value: 'authorized', label: 'Được cấp phép đăng', detail: 'Chủ sở hữu đã cho phép CHƯƠNG phân phối.' },
];

export default function AdminCreateCatalogBookScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [authors, setAuthors] = useState<AdminAuthorOption[]>([]);
  const [ownerAuthorId, setOwnerAuthorId] = useState('');
  const [title, setTitle] = useState('');
  const [creditedAuthorName, setCreditedAuthorName] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('Tiên hiệp');
  const [tags, setTags] = useState('tu tiên, huyền huyễn');
  const [language, setLanguage] = useState('vi');
  const [sourceType, setSourceType] = useState<SourceType>('authorized');
  const [cover, setCover] = useState<{ uri: string; mimeType?: string } | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authorsLoading, setAuthorsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user || profile?.role !== 'admin') { router.replace('/(tabs)/profile'); return; }
    let active = true;
    setAuthorsLoading(true);
    listAdminAuthors().then((items) => {
      if (!active) return;
      setAuthors(items);
      const preferred = items.find((item) => item.penName.toLocaleLowerCase('vi').includes('chương studio')) ?? items[0];
      setOwnerAuthorId(preferred?.id ?? '');
    }).catch((cause) => { if (active) setError(messageForError(cause, 'Không thể tải tác giả.')); })
      .finally(() => { if (active) setAuthorsLoading(false); });
    return () => { active = false; };
  }, [authLoading, profile?.role, router, user]);

  const owner = useMemo(() => authors.find((item) => item.id === ownerAuthorId), [authors, ownerAuthorId]);

  const pickCover = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 3], quality: .88 });
      if (!result.canceled) {
        const asset = result.assets[0];
        if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) return setError('Ảnh bìa cần nhỏ hơn 5 MB.');
        setCover({ uri: asset.uri, mimeType: asset.mimeType });
        setError('');
      }
    } catch {
      setError('Không mở được thư viện ảnh trên thiết bị này.');
    }
  };

  const submit = async () => {
    if (!user || profile?.role !== 'admin') return;
    if (!ownerAuthorId) return setError('Cần chọn tác giả sở hữu nội bộ cho truyện.');
    if (!rightsConfirmed) return setError('Cần xác nhận quyền sử dụng và phân phối nội dung.');
    setLoading(true);
    setError('');
    try {
      const bookId = await createAdminCatalogBook({
        ownerAuthorId,
        title,
        creditedAuthorName: creditedAuthorName.trim() || null,
        description,
        genre,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        language,
        sourceType,
      });
      if (cover) await replaceBookCover(user.id, bookId, cover.uri, cover.mimeType);
      router.replace({ pathname: '/admin/catalog/[bookId]', params: { bookId } });
    } catch (cause) {
      setError(messageForError(cause, 'Không thể tạo truyện.'));
    } finally {
      setLoading(false);
    }
  };

  if (profile?.role !== 'admin' && !authLoading) return null;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <XianxiaBackdrop />
    <View style={styles.topbar}>
      <Pressable style={styles.backButton} onPress={() => router.replace('/admin/catalog')}><Ionicons name="arrow-back" size={18} color={xianxia.ink} /><Text style={styles.backButtonText}>Quay lại</Text></Pressable>
      <View style={styles.topCopy}><Text style={styles.kicker}>TÀNG KINH CÁC · BIÊN TẬP</Text><Text style={styles.topTitle}>Thêm truyện</Text></View>
      <View style={styles.iconSpacer} />
    </View>

    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      <View style={styles.hero}>
        <View style={styles.heroSeal}><Ionicons name="cloud-upload-outline" size={23} color={xianxia.goldSoft} /></View>
        <View style={{ flex: 1 }}><Text style={styles.heroTitle}>Nhập truyện vào kho CHƯƠNG</Text><Text style={styles.heroBody}>Tạo metadata và bìa trước, sau đó nhập chương hàng loạt. Truyện mới luôn riêng tư cho đến khi admin chủ động công khai.</Text></View>
      </View>

      {error ? <View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={18} color={xianxia.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}

      <Text style={styles.groupTitle}>Ảnh bìa</Text>
      <Pressable style={styles.coverPicker} onPress={pickCover}>
        <View style={styles.cover}>
          {cover ? <Image source={{ uri: cover.uri }} style={styles.coverImage} /> : <View style={styles.coverEmpty}><Ionicons name="image-outline" size={27} color={xianxia.goldSoft} /><Text style={styles.coverEmptyTitle}>Bìa 2:3</Text><Text style={styles.coverEmptyMeta}>JPG · PNG · WebP</Text></View>}
        </View>
        <View style={styles.coverCopy}><Text style={styles.coverAction}>{cover ? 'Thay ảnh bìa' : 'Chọn ảnh bìa'}</Text><Text style={styles.coverNote}>Ảnh thật sẽ được dùng làm thumbnail ở Trang chủ, Khám phá và trang truyện.</Text></View>
      </Pressable>
      <View style={styles.coverGuide}><Text style={styles.coverGuideTitle}>Khuyến nghị bìa đẹp nhất</Text><Text style={styles.coverGuideText}>Tỷ lệ 2:3 · nên dùng 1200 × 1800 px · tối thiểu 800 × 1200 px · dung lượng lý tưởng 300 KB – 1.5 MB · tối đa 5 MB. Ưu tiên WebP hoặc JPG chất lượng cao.</Text></View>
      <View style={styles.coverActions}>
        <Pressable style={styles.coverActionPrimary} onPress={pickCover}><Ionicons name="images-outline" size={16} color="#FFF8EA" /><Text style={styles.coverActionPrimaryText}>{cover ? 'Chọn lại ảnh' : 'Chọn ảnh bìa'}</Text></Pressable>
        {cover ? <Pressable style={styles.coverActionDelete} onPress={() => setCover(null)}><Ionicons name="trash-outline" size={16} color={xianxia.danger} /><Text style={styles.coverActionDeleteText}>Xóa ảnh</Text></Pressable> : null}
      </View>

      <Text style={styles.groupTitle}>Thông tin truyện</Text>
      <View style={styles.formCard}>
        <FormField label="Tên truyện" value={title} onChangeText={setTitle} placeholder="Ví dụ: Vạn Cổ Tiên Tông" maxLength={180} />
        <FormField label="Tên tác giả hiển thị" value={creditedAuthorName} onChangeText={setCreditedAuthorName} placeholder={owner?.penName ? `Để trống sẽ dùng: ${owner.penName}` : 'Tên tác giả'} maxLength={120} />
        <FormField label="Mô tả" value={description} onChangeText={setDescription} placeholder="Giới thiệu thế giới, nhân vật và hành trình…" multiline />
        <FormField label="Thể loại" value={genre} onChangeText={setGenre} placeholder="Tiên hiệp" />
        <FormField label="Tags" value={tags} onChangeText={setTags} placeholder="tu tiên, huyền huyễn, hệ thống" />
        <FormField label="Ngôn ngữ" value={language} onChangeText={setLanguage} placeholder="vi" autoCapitalize="none" />
      </View>

      <Text style={styles.groupTitle}>Tác giả sở hữu nội bộ</Text>
      <Text style={styles.groupNote}>Dùng để quản lý quyền sở hữu, doanh thu và bảo mật. Tên hiển thị bên ngoài có thể khác ở ô phía trên.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.authorList}>
        {authorsLoading ? <Text style={styles.muted}>Đang tải tác giả…</Text> : authors.map((item) => {
          const active = item.id === ownerAuthorId;
          return <Pressable key={item.id} onPress={() => setOwnerAuthorId(item.id)} style={[styles.authorChip, active && styles.authorChipActive]}>
            <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={17} color={active ? xianxia.goldSoft : xianxia.jade} />
            <Text numberOfLines={1} style={[styles.authorChipText, active && styles.authorChipTextActive]}>{item.penName}{item.verified ? ' ✓' : ''}</Text>
          </Pressable>;
        })}
      </ScrollView>

      <Text style={styles.groupTitle}>Nguồn & quyền nội dung</Text>
      <View style={styles.sourceCard}>
        {sources.map((item) => {
          const active = sourceType === item.value;
          return <Pressable key={item.value} style={[styles.sourceRow, active && styles.sourceRowActive]} onPress={() => setSourceType(item.value)}>
            <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? xianxia.cinnabar : xianxia.muted} />
            <View style={{ flex: 1 }}><Text style={styles.sourceTitle}>{item.label}</Text><Text style={styles.sourceDetail}>{item.detail}</Text></View>
          </Pressable>;
        })}
      </View>

      <Pressable style={[styles.rightsBox, rightsConfirmed && styles.rightsBoxActive]} onPress={() => setRightsConfirmed((value) => !value)}>
        <Ionicons name={rightsConfirmed ? 'checkbox' : 'square-outline'} size={22} color={rightsConfirmed ? xianxia.jadeDeep : xianxia.muted} />
        <Text style={styles.rightsText}>Tôi xác nhận CHƯƠNG có quyền hợp pháp để lưu trữ và phân phối nội dung này.</Text>
      </Pressable>

      <Pressable accessibilityRole="button" disabled={loading || authorsLoading || !ownerAuthorId} style={[styles.submit, (loading || authorsLoading || !ownerAuthorId) && styles.disabled]} onPress={submit}>
        <View style={styles.submitGlyph}><Ionicons name="library-outline" size={18} color={xianxia.goldSoft} /></View>
        <Text style={styles.submitText}>{loading ? 'Đang tạo truyện…' : 'Tạo truyện & nhập chương'}</Text>
        {!loading ? <Ionicons name="arrow-forward" size={17} color={xianxia.white} /> : null}
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: xianxia.paper },
  topbar: { minHeight: 66, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line, backgroundColor: 'rgba(245,239,228,.96)', zIndex: 30, elevation: 8 },
  backButton: { minWidth: 88, height: 40, borderRadius: 13, paddingHorizontal: 10, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,253,247,.96)', borderWidth: 1, borderColor: xianxia.line },
  backButtonText: { color: xianxia.ink, fontSize: 8.5, fontWeight: '900' },
  iconButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconSpacer: { width: 40 },
  topCopy: { flex: 1, marginLeft: 11 },
  kicker: { color: xianxia.cinnabar, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  topTitle: { color: xianxia.ink, fontSize: 18, fontWeight: '900', marginTop: 2 },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 16, paddingBottom: 52 },
  hero: { borderRadius: 20, backgroundColor: '#263E38', borderWidth: 1, borderColor: '#496A61', padding: 16, flexDirection: 'row', gap: 13, alignItems: 'center' },
  heroSeal: { width: 50, height: 50, borderRadius: 15, borderWidth: 1, borderColor: xianxia.gold, backgroundColor: xianxia.cinnabar, alignItems: 'center', justifyContent: 'center' },
  heroSealText: { color: '#F5DDA7', fontSize: 23, fontWeight: '900' },
  heroTitle: { color: xianxia.white, fontSize: 14, fontWeight: '900' },
  heroBody: { color: 'rgba(255,253,248,.68)', fontSize: 9, lineHeight: 14, marginTop: 4 },
  errorBox: { marginTop: 12, borderRadius: 14, padding: 11, backgroundColor: '#F5E5E1', borderWidth: 1, borderColor: '#E2C2BA', flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  errorText: { color: xianxia.danger, fontSize: 10, lineHeight: 15, flex: 1 },
  coverGuide: { marginTop: 9, borderRadius: 13, padding: 11, backgroundColor: '#EAF2EC', borderWidth: 1, borderColor: '#C4D7C8' },
  coverGuideTitle: { color: xianxia.jadeDeep, fontSize: 9.5, fontWeight: '900', marginBottom: 4 },
  coverGuideText: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13 },
  coverActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  coverActionPrimary: { minHeight: 40, borderRadius: 11, paddingHorizontal: 12, backgroundColor: xianxia.jadeDeep, flexDirection: 'row', alignItems: 'center', gap: 6 },
  coverActionPrimaryText: { color: '#FFF8EA', fontSize: 9, fontWeight: '900' },
  coverActionDelete: { minHeight: 40, borderRadius: 11, paddingHorizontal: 12, backgroundColor: '#F6E7E4', borderWidth: 1, borderColor: '#E4C4BD', flexDirection: 'row', alignItems: 'center', gap: 6 },
  coverActionDeleteText: { color: xianxia.danger, fontSize: 9, fontWeight: '900' },
  groupTitle: { color: xianxia.ink, fontSize: 14, fontWeight: '900', marginTop: 23, marginBottom: 8 },
  groupNote: { color: xianxia.muted, fontSize: 9, lineHeight: 14, marginTop: -3, marginBottom: 7 },
  coverPicker: { borderRadius: 18, backgroundColor: 'rgba(255,253,247,.88)', borderWidth: 1, borderColor: xianxia.line, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 14 },
  cover: { width: 86, height: 128, borderRadius: 13, backgroundColor: xianxia.jadeDeep, overflow: 'hidden', borderWidth: 1, borderColor: xianxia.goldSoft },
  coverImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  coverEmptyTitle: { color: xianxia.white, fontSize: 10, fontWeight: '900', marginTop: 5 },
  coverEmptyMeta: { color: 'rgba(255,253,248,.62)', fontSize: 7, marginTop: 2 },
  coverCopy: { flex: 1 },
  coverAction: { color: xianxia.cinnabar, fontSize: 13, fontWeight: '900' },
  coverNote: { color: xianxia.muted, fontSize: 9, lineHeight: 14, marginTop: 5 },
  formCard: { borderRadius: 18, backgroundColor: 'rgba(255,253,247,.90)', borderWidth: 1, borderColor: xianxia.line, padding: 14 },
  authorList: { gap: 8, paddingVertical: 2, paddingRight: 12 },
  authorChip: { minHeight: 42, maxWidth: 230, borderRadius: 13, paddingHorizontal: 12, borderWidth: 1, borderColor: xianxia.line, backgroundColor: 'rgba(255,253,247,.88)', flexDirection: 'row', alignItems: 'center', gap: 7 },
  authorChipActive: { backgroundColor: xianxia.jadeDeep, borderColor: '#496A61' },
  authorChipText: { maxWidth: 180, color: xianxia.ink, fontSize: 10, fontWeight: '800' },
  authorChipTextActive: { color: xianxia.white },
  sourceCard: { borderRadius: 17, backgroundColor: 'rgba(255,253,247,.90)', borderWidth: 1, borderColor: xianxia.line, overflow: 'hidden' },
  sourceRow: { minHeight: 65, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', gap: 10, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: xianxia.line },
  sourceRowActive: { backgroundColor: '#F2E8DD' },
  sourceTitle: { color: xianxia.ink, fontSize: 11, fontWeight: '900' },
  sourceDetail: { color: xianxia.muted, fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  rightsBox: { marginTop: 14, minHeight: 60, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: xianxia.line, backgroundColor: 'rgba(255,253,247,.82)', flexDirection: 'row', alignItems: 'center', gap: 10 },
  rightsBoxActive: { borderColor: '#95B1A2', backgroundColor: '#E7EFE9' },
  rightsText: { color: xianxia.inkSoft, fontSize: 9.5, lineHeight: 14, flex: 1, fontWeight: '700' },
  submit: { marginTop: 20, minHeight: 54, borderRadius: 16, paddingHorizontal: 15, backgroundColor: xianxia.jadeDeep, borderWidth: 1, borderColor: '#496A61', flexDirection: 'row', alignItems: 'center', gap: 10 },
  submitGlyph: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(229,209,163,.10)', alignItems: 'center', justifyContent: 'center' },
  submitText: { flex: 1, color: xianxia.white, fontSize: 12, fontWeight: '900' },
  disabled: { opacity: .48 },
  muted: { color: xianxia.muted, fontSize: 10 },
});
