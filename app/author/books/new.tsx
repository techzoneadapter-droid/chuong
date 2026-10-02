import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FormField, FormMessage, FormScreen, PrimaryButton } from '../../../components/Form';
import { useAuth } from '../../../contexts/AuthContext';
import { createBook, getAuthorForUser } from '../../../services/authors';
import { messageForError } from '../../../services/errors';
import { replaceBookCover } from '../../../services/storage';
import { Author, SourceType } from '../../../types';

const sources: { value: SourceType; label: string }[] = [{ value: 'original', label: 'Truyện sáng tác' }, { value: 'licensed_translation', label: 'Truyện dịch được cấp quyền' }, { value: 'authorized', label: 'Truyện được phép đăng' }];

export default function CreateBookScreen() {
  const router = useRouter(); const { user, configured, loading: authLoading } = useAuth(); const [author, setAuthor] = useState<Author | null>(null);
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [genre, setGenre] = useState(''); const [tags, setTags] = useState(''); const [language, setLanguage] = useState('vi'); const [sourceType, setSourceType] = useState<SourceType>('original'); const [cover, setCover] = useState<{ uri: string; mimeType?: string } | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false); const createdBookId = useRef<string | null>(null);
  useEffect(() => { if (!configured || authLoading) return; if (!user) { router.replace('/auth/login'); return; } getAuthorForUser(user.id).then((value) => { if (!value) router.replace('/author/onboarding'); else setAuthor(value); }).catch((cause) => setError(messageForError(cause))); }, [router, user, configured, authLoading]);
  const pickCover = async () => { try { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 3], quality: .85 }); if (!result.canceled) setCover({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType }); } catch { setError('Trình chọn ảnh không khả dụng trên thiết bị này. Bạn vẫn có thể tạo truyện và thêm bìa sau.'); } };
  const submit = async () => {
    if (!author || !user) return; if (!agreed) return setError('Bạn cần xác nhận quyền sử dụng nội dung.'); if (title.trim().length < 2) return setError('Tên truyện cần có ít nhất 2 ký tự.'); if (description.trim().length < 20) return setError('Mô tả cần có ít nhất 20 ký tự.'); if (!genre.trim()) return setError('Vui lòng nhập thể loại.');
    setLoading(true); setError('');
    try { if (!createdBookId.current) { const book = await createBook(author.id, { title, penName: author.penName, description, genre, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), language: language.trim() || 'vi', status: 'draft', coverUrl: null, sourceType }); createdBookId.current = book.id; }
      if (cover) await replaceBookCover(user.id, createdBookId.current, cover.uri, cover.mimeType);
      router.replace({ pathname: '/author/books/[bookId]/chapters', params: { bookId: createdBookId.current } }); }
    catch (cause) { setError(messageForError(cause, 'Không thể tạo truyện.')); }
    finally { setLoading(false); }
  };
  return <FormScreen title="Tạo truyện" subtitle="Khai báo đúng nguồn nội dung giúp bảo vệ bạn, độc giả và cộng đồng tác giả.">
    {!configured ? <FormMessage>Demo · Bạn có thể xem biểu mẫu. Cấu hình Supabase và đăng nhập để tạo truyện.</FormMessage> : null}
    {error ? <FormMessage error>{error}</FormMessage> : null}
    <Pressable onPress={pickCover} style={styles.coverPicker}>{cover ? <Image source={{ uri: cover.uri }} style={styles.cover} /> : <View style={styles.coverEmpty}><Ionicons name="image-outline" size={28} color="#8F1D3F" /><Text style={styles.coverHint}>Chọn ảnh bìa</Text></View>}<Text style={styles.replace}>{cover ? 'Thay ảnh bìa' : 'JPG, PNG hoặc WebP · tối đa 5 MB'}</Text></Pressable>
    <FormField label="Tên truyện" value={title} onChangeText={setTitle} placeholder="Tên truyện" maxLength={180} />
    <FormField label="Bút danh" value={author?.penName ?? ''} editable={false} placeholder="Hồ sơ tác giả" />
    <FormField label="Mô tả" value={description} onChangeText={setDescription} placeholder="Giới thiệu câu chuyện…" multiline />
    <FormField label="Thể loại" value={genre} onChangeText={setGenre} placeholder="Ví dụ: Tiên hiệp" />
    <FormField label="Tags" value={tags} onChangeText={setTags} placeholder="Phiêu lưu, trưởng thành, kỳ ảo" />
    <FormField label="Ngôn ngữ" value={language} onChangeText={setLanguage} placeholder="vi" autoCapitalize="none" />
    <Text style={styles.label}>Trạng thái: Bản nháp</Text>
    <Text style={styles.label}>Nguồn nội dung</Text><View style={styles.sourceList}>{sources.map((item) => <Pressable key={item.value} onPress={() => setSourceType(item.value)} style={styles.source}><Ionicons name={sourceType === item.value ? 'radio-button-on' : 'radio-button-off'} size={20} color="#8F1D3F" /><Text style={styles.sourceText}>{item.label}</Text></Pressable>)}</View>
    <FormMessage>Chỉ đăng nội dung do bạn sáng tác hoặc đã được chủ sở hữu cho phép. CHƯƠNG không hỗ trợ sao chép nội dung trái phép.</FormMessage>
    <Pressable onPress={() => setAgreed((value) => !value)} style={styles.source}><Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={22} color="#8F1D3F" /><Text style={styles.sourceText}>Tôi cam kết chỉ đăng nội dung mà tôi có quyền sử dụng.</Text></Pressable>
    <FormMessage>Truyện luôn được tạo riêng tư dưới dạng bản nháp. Chọn công khai trong phần quản lý sau khi đã kiểm tra nội dung.</FormMessage>
    <PrimaryButton label="Lưu bản nháp" onPress={submit} loading={loading} disabled={!author} />
  </FormScreen>;
}
const styles = StyleSheet.create({ coverPicker: { alignItems: 'center', marginBottom: 20 }, cover: { width: 120, height: 180, borderRadius: 14 }, coverEmpty: { width: 120, height: 180, borderRadius: 14, backgroundColor: '#F0E1E5', borderWidth: 1, borderStyle: 'dashed', borderColor: '#CDAEBA', alignItems: 'center', justifyContent: 'center' }, coverHint: { color: '#8F1D3F', fontSize: 10, fontWeight: '900', marginTop: 6 }, replace: { color: '#81757A', fontSize: 9, marginTop: 7 }, label: { color: '#45393E', fontSize: 12, fontWeight: '800', marginTop: 4, marginBottom: 8 }, options: { gap: 7, paddingBottom: 15 }, option: { color: '#756B6F', borderWidth: 1, borderColor: '#D8CBC5', borderRadius: 99, paddingHorizontal: 11, paddingVertical: 8, fontSize: 10, fontWeight: '800' }, optionActive: { color: '#FFFFFF', backgroundColor: '#8F1D3F', borderColor: '#8F1D3F' }, sourceList: { marginBottom: 13 }, source: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 }, sourceText: { color: '#4E4347', fontSize: 12, fontWeight: '700' } });
