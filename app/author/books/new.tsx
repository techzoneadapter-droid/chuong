import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { FormField, FormMessage, FormScreen, PrimaryButton } from '../../../components/Form';
import { useAuth } from '../../../contexts/AuthContext';
import { createBook, getAuthorForUser } from '../../../services/authors';
import { messageForError } from '../../../services/errors';
import { replaceBookCover } from '../../../services/storage';
import { Author, SourceType } from '../../../types';

const sources: { value: SourceType; label: string }[] = [{ value: 'original', label: 'Truyện sáng tác' }, { value: 'licensed_translation', label: 'Truyện dịch được cấp quyền' }, { value: 'authorized', label: 'Truyện được phép đăng' }];

export default function CreateBookScreen() {
  const router = useRouter(); const { user, configured, loading: authLoading } = useAuth(); const [author, setAuthor] = useState<Author | null>(null);
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [genre, setGenre] = useState(''); const [tags, setTags] = useState(''); const [language, setLanguage] = useState('vi'); const [sourceType, setSourceType] = useState<SourceType>('original'); const [cover, setCover] = useState<{ uri: string; mimeType?: string } | null>(null); const [isVip, setIsVip] = useState(false); const [priceCoins, setPriceCoins] = useState(0); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false); const createdBookId = useRef<string | null>(null);
  useEffect(() => { if (!configured || authLoading) return; if (!user) { router.replace('/auth/login'); return; } getAuthorForUser(user.id).then((value) => { if (!value) router.replace('/author/onboarding'); else setAuthor(value); }).catch((cause) => setError(messageForError(cause))); }, [router, user, configured, authLoading]);
  const pickCover = async () => { try { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 3], quality: .85 }); if (!result.canceled) { const asset = result.assets[0]; if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) return setError('Ảnh bìa cần nhỏ hơn 5 MB.'); setCover({ uri: asset.uri, mimeType: asset.mimeType }); setError(''); } } catch { setError('Trình chọn ảnh không khả dụng trên thiết bị này. Bạn vẫn có thể tạo truyện và thêm bìa sau.'); } };
  const submit = async () => {
    if (!author || !user) return; if (!agreed) return setError('Bạn cần xác nhận quyền sử dụng nội dung.'); if (title.trim().length < 2) return setError('Tên truyện cần có ít nhất 2 ký tự.'); if (description.trim().length < 20) return setError('Mô tả cần có ít nhất 20 ký tự.'); if (!genre.trim()) return setError('Vui lòng nhập thể loại.'); if (isVip && (!Number.isInteger(priceCoins) || priceCoins <= 0)) return setError('Truyện VIP cần giá Linh Thạch lớn hơn 0.');
    setLoading(true); setError('');
    try { if (!createdBookId.current) { const book = await createBook(author.id, { title, penName: author.penName, description, genre, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), language: language.trim() || 'vi', status: 'draft', coverUrl: null, sourceType, isVip, priceCoins: isVip ? priceCoins : 0 }); createdBookId.current = book.id; }
      if (cover) await replaceBookCover(user.id, createdBookId.current, cover.uri, cover.mimeType);
      router.replace({ pathname: '/author/books/[bookId]/chapters', params: { bookId: createdBookId.current } }); }
    catch (cause) { setError(messageForError(cause, 'Không thể tạo truyện.')); }
    finally { setLoading(false); }
  };
  return <FormScreen title="Tạo truyện" subtitle="Khai báo đúng nguồn nội dung giúp bảo vệ bạn, độc giả và cộng đồng tác giả.">
    {!configured ? <FormMessage>Demo · Bạn có thể xem biểu mẫu. Cấu hình Supabase và đăng nhập để tạo truyện.</FormMessage> : null}
    {error ? <FormMessage error>{error}</FormMessage> : null}
    <Pressable onPress={pickCover} style={styles.coverPicker}>{cover ? <Image source={{ uri: cover.uri }} style={styles.cover} /> : <View style={styles.coverEmpty}><Ionicons name="image-outline" size={28} color="#8F1D3F" /><Text style={styles.coverHint}>Chọn ảnh bìa</Text></View>}<Text style={styles.replace}>{cover ? 'Thay ảnh bìa' : 'JPG, PNG hoặc WebP · tối đa 5 MB'}</Text></Pressable>
    <View style={styles.coverGuide}><Text style={styles.coverGuideTitle}>Bìa đẹp nhất cho CHƯƠNG</Text><Text style={styles.coverGuideText}>Tỷ lệ 2:3 · nên dùng 1200 × 1800 px · tối thiểu 800 × 1200 px · dung lượng lý tưởng 300 KB – 1.5 MB · tối đa 5 MB. Ưu tiên WebP hoặc JPG chất lượng cao để ảnh nét và tải nhanh.</Text></View>
    <View style={styles.coverActions}>
      <Pressable style={styles.coverActionPrimary} onPress={pickCover}><Ionicons name="images-outline" size={16} color="#FFF" /><Text style={styles.coverActionPrimaryText}>{cover ? 'Chọn lại ảnh' : 'Chọn ảnh bìa'}</Text></Pressable>
      {cover ? <Pressable style={styles.coverActionDelete} onPress={() => setCover(null)}><Ionicons name="trash-outline" size={16} color="#9E3444" /><Text style={styles.coverActionDeleteText}>Xóa ảnh</Text></Pressable> : null}
    </View>
    <FormField label="Tên truyện" value={title} onChangeText={setTitle} placeholder="Tên truyện" maxLength={180} />
    <FormField label="Bút danh" value={author?.penName ?? ''} editable={false} placeholder="Hồ sơ tác giả" />
    <FormField label="Mô tả" value={description} onChangeText={setDescription} placeholder="Giới thiệu câu chuyện…" multiline />
    <FormField label="Thể loại" value={genre} onChangeText={setGenre} placeholder="Ví dụ: Tiên hiệp" />
    <FormField label="Tags" value={tags} onChangeText={setTags} placeholder="Phiêu lưu, trưởng thành, kỳ ảo" />
    <FormField label="Ngôn ngữ" value={language} onChangeText={setLanguage} placeholder="vi" autoCapitalize="none" />
    <View style={styles.vipCard}>
      <View style={styles.vipRow}><View style={{ flex: 1 }}><Text style={styles.vipTitle}>Truyện VIP</Text><Text style={styles.vipBody}>Bật nếu muốn độc giả dùng Linh Thạch để mở khóa toàn bộ truyện.</Text></View><Switch value={isVip} onValueChange={setIsVip} trackColor={{ false: '#D8CEC1', true: '#9D6A32' }} /></View>
      {isVip ? <View style={styles.vipPriceRow}><Text style={styles.vipPriceLabel}>Giá mở khóa toàn truyện</Text><TextInput value={String(priceCoins)} onChangeText={(value) => setPriceCoins(Number(value.replace(/\D/g, '')) || 0)} keyboardType="number-pad" style={styles.vipPriceInput} /><Text style={styles.vipUnit}>Linh Thạch</Text></View> : null}
      <Text style={styles.vipHint}>Bạn vẫn có thể đặt VIP riêng từng chương trong màn soạn chương.</Text>
    </View>
    <Text style={styles.label}>Trạng thái: Bản nháp</Text>
    <Text style={styles.label}>Nguồn nội dung</Text><View style={styles.sourceList}>{sources.map((item) => <Pressable key={item.value} onPress={() => setSourceType(item.value)} style={styles.source}><Ionicons name={sourceType === item.value ? 'radio-button-on' : 'radio-button-off'} size={20} color="#8F1D3F" /><Text style={styles.sourceText}>{item.label}</Text></Pressable>)}</View>
    <FormMessage>Chỉ đăng nội dung do bạn sáng tác hoặc đã được chủ sở hữu cho phép. CHƯƠNG không hỗ trợ sao chép nội dung trái phép.</FormMessage>
    <Pressable onPress={() => setAgreed((value) => !value)} style={styles.source}><Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={22} color="#8F1D3F" /><Text style={styles.sourceText}>Tôi cam kết chỉ đăng nội dung mà tôi có quyền sử dụng.</Text></Pressable>
    <FormMessage>Truyện luôn được tạo riêng tư dưới dạng bản nháp. Chọn công khai trong phần quản lý sau khi đã kiểm tra nội dung.</FormMessage>
    <PrimaryButton label="Lưu bản nháp" onPress={submit} loading={loading} disabled={!author} />
  </FormScreen>;
}
const styles = StyleSheet.create({ coverPicker: { alignItems: 'center', marginBottom: 20 }, cover: { width: 120, height: 180, borderRadius: 14 }, coverEmpty: { width: 120, height: 180, borderRadius: 14, backgroundColor: '#F0E1E5', borderWidth: 1, borderStyle: 'dashed', borderColor: '#CDAEBA', alignItems: 'center', justifyContent: 'center' }, coverHint: { color: '#8F1D3F', fontSize: 10, fontWeight: '900', marginTop: 6 }, replace: { color: '#81757A', fontSize: 9, marginTop: 7 }, coverGuide: { marginTop: -8, marginBottom: 18, padding: 11, borderRadius: 12, backgroundColor: '#EDF3EF', borderWidth: 1, borderColor: '#C6D7CC' }, coverGuideTitle: { color: '#24493E', fontSize: 10, fontWeight: '900', marginBottom: 4 }, coverGuideText: { color: '#6D665F', fontSize: 9, lineHeight: 14 }, coverActions: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: -8, marginBottom: 18, flexWrap: 'wrap' }, coverActionPrimary: { minHeight: 40, borderRadius: 11, paddingHorizontal: 13, backgroundColor: '#8F1D3F', flexDirection: 'row', alignItems: 'center', gap: 6 }, coverActionPrimaryText: { color: '#FFF', fontSize: 10, fontWeight: '900' }, coverActionDelete: { minHeight: 40, borderRadius: 11, paddingHorizontal: 13, backgroundColor: '#F7E7EA', borderWidth: 1, borderColor: '#E4C3CA', flexDirection: 'row', alignItems: 'center', gap: 6 }, coverActionDeleteText: { color: '#9E3444', fontSize: 10, fontWeight: '900' }, label: { color: '#45393E', fontSize: 12, fontWeight: '800', marginTop: 4, marginBottom: 8 }, options: { gap: 7, paddingBottom: 15 }, option: { color: '#756B6F', borderWidth: 1, borderColor: '#D8CBC5', borderRadius: 99, paddingHorizontal: 11, paddingVertical: 8, fontSize: 10, fontWeight: '800' }, optionActive: { color: '#FFFFFF', backgroundColor: '#8F1D3F', borderColor: '#8F1D3F' }, sourceList: { marginBottom: 13 }, source: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 }, sourceText: { color: '#4E4347', fontSize: 12, fontWeight: '700' } , vipCard: { marginBottom: 16, padding: 12, borderRadius: 13, backgroundColor: '#F7F0DF', borderWidth: 1, borderColor: '#D8C6A0' }, vipRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, vipTitle: { color: '#5D431D', fontSize: 11, fontWeight: '900' }, vipBody: { color: '#7E6C51', fontSize: 8.5, lineHeight: 13, marginTop: 3 }, vipPriceRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }, vipPriceLabel: { flex: 1, color: '#5D431D', fontSize: 9, fontWeight: '800' }, vipPriceInput: { width: 88, height: 38, borderRadius: 10, borderWidth: 1, borderColor: '#D8C6A0', backgroundColor: '#FFFDF7', textAlign: 'center', color: '#5D431D', fontWeight: '900' }, vipUnit: { color: '#7E6C51', fontSize: 8.5, fontWeight: '800' }, vipHint: { color: '#8A795F', fontSize: 8, lineHeight: 12, marginTop: 8 }});
