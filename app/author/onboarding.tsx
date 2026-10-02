import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { FormField, FormMessage, FormScreen, PrimaryButton } from '../../components/Form';
import { useAuth } from '../../contexts/AuthContext';
import { becomeAuthor, updateAuthorAvatar } from '../../services/authors';
import { messageForError } from '../../services/errors';
import { uploadAuthorAvatar } from '../../services/storage';

export default function AuthorOnboardingScreen() {
  const router = useRouter(); const { user, refreshProfile } = useAuth();
  const [penName, setPenName] = useState(''); const [bio, setBio] = useState(''); const [avatar, setAvatar] = useState<{ uri: string; mimeType?: string } | null>(null); const [agreed, setAgreed] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const pickAvatar = async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: .85 }); if (!result.canceled) setAvatar({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType }); };
  const submit = async () => {
    if (!user) return router.replace('/auth/login');
    if (penName.trim().length < 2) return setError('Bút danh cần có ít nhất 2 ký tự.');
    if (!agreed) return setError('Bạn cần xác nhận cam kết bản quyền.');
    setLoading(true); setError('');
    try {
      let author = await becomeAuthor(user.id, { penName, bio, avatarUrl: null, agreed });
      if (avatar) { const url = await uploadAuthorAvatar(author.id, avatar.uri, avatar.mimeType); author = await updateAuthorAvatar(author.id, url); }
      await refreshProfile(); router.replace('/write');
    } catch (cause) { setError(messageForError(cause, 'Không thể hoàn tất đăng ký tác giả.')); }
    finally { setLoading(false); }
  };
  return <FormScreen title="Trở thành tác giả" subtitle="Xây dựng trang tác giả và bắt đầu đăng nội dung bạn có quyền sử dụng.">
    {error ? <FormMessage error>{error}</FormMessage> : null}
    <Pressable style={styles.avatarPicker} onPress={pickAvatar}>{avatar ? <Image source={{ uri: avatar.uri }} style={styles.avatar} /> : <View style={styles.avatarEmpty}><Ionicons name="camera-outline" size={24} color="#8F1D3F" /></View>}<Text style={styles.avatarText}>{avatar ? 'Đổi avatar' : 'Chọn avatar'}</Text></Pressable>
    <FormField label="Bút danh" value={penName} onChangeText={setPenName} placeholder="Tên hiển thị với độc giả" maxLength={80} />
    <FormField label="Giới thiệu" value={bio} onChangeText={setBio} placeholder="Phong cách, thể loại bạn theo đuổi…" multiline maxLength={1000} />
    <Pressable onPress={() => setAgreed((value) => !value)} style={styles.agreement}><Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={23} color="#8F1D3F" /><Text style={styles.agreementText}>Tôi cam kết chỉ đăng nội dung mà tôi có quyền sử dụng.</Text></Pressable>
    <PrimaryButton label="Tạo hồ sơ tác giả" onPress={submit} loading={loading} disabled={!user} />
  </FormScreen>;
}
const styles = StyleSheet.create({ avatarPicker: { alignItems: 'center', marginBottom: 18 }, avatar: { width: 82, height: 82, borderRadius: 41 }, avatarEmpty: { width: 82, height: 82, borderRadius: 41, backgroundColor: '#F0E1E5', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#8F1D3F', fontSize: 11, fontWeight: '900', marginTop: 7 }, agreement: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginVertical: 6 }, agreementText: { flex: 1, color: '#554A4E', fontSize: 12, lineHeight: 18, fontWeight: '700' } });
