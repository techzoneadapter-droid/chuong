import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { FormField, FormMessage, FormScreen, PrimaryButton } from '../../components/Form';
import { useAuth } from '../../contexts/AuthContext';
import { updateProfile } from '../../services/auth';
import { messageForError } from '../../services/errors';
import { uploadProfileAvatar } from '../../services/storage';

export default function EditProfileScreen() {
  const router = useRouter(); const { user, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(''); const [username, setUsername] = useState(''); const [avatarUrl, setAvatarUrl] = useState(''); const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState<{ uri: string; mimeType?: string } | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  useEffect(() => { setDisplayName(profile?.displayName ?? ''); setUsername(profile?.username ?? ''); setAvatarUrl(profile?.avatarUrl ?? ''); setBio(profile?.bio ?? ''); }, [profile]);
  const submit = async () => {
    if (!user) return router.replace('/auth/login');
    if (displayName.trim().length < 2) return setError('Tên hiển thị cần có ít nhất 2 ký tự.');
    if (username && !/^[a-zA-Z0-9_]{3,30}$/.test(username)) return setError('Username chỉ gồm chữ, số, dấu gạch dưới và dài 3–30 ký tự.');
    setLoading(true); setError('');
    try { const nextAvatarUrl = avatar ? await uploadProfileAvatar(user.id, avatar.uri, avatar.mimeType) : avatarUrl || null; await updateProfile(user.id, { displayName, username: username || null, avatarUrl: nextAvatarUrl, bio: bio || null }); await refreshProfile(); router.back(); }
    catch (cause) { setError(messageForError(cause, 'Không thể cập nhật hồ sơ.')); }
    finally { setLoading(false); }
  };
  return <FormScreen title="Chỉnh sửa hồ sơ" subtitle="Thông tin này được hiển thị trên CHƯƠNG.">
    {error ? <FormMessage error>{error}</FormMessage> : null}
    <Pressable style={styles.avatarPicker} onPress={async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: .85 }); if (!result.canceled) setAvatar({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType }); }}><View>{avatar?.uri || avatarUrl ? <Image source={{ uri: avatar?.uri || avatarUrl }} style={styles.avatar} /> : <View style={styles.avatarEmpty}><Text style={styles.avatarLetter}>{(displayName || 'C')[0].toUpperCase()}</Text></View>}</View><Text style={styles.avatarLink}>Chọn ảnh đại diện</Text></Pressable>
    <FormField label="Tên hiển thị" value={displayName} onChangeText={setDisplayName} placeholder="Tên của bạn" />
    <FormField label="Username" value={username} onChangeText={setUsername} placeholder="chuong_reader" autoCapitalize="none" />
    <FormField label="Giới thiệu" value={bio} onChangeText={setBio} placeholder="Vài dòng về bạn…" multiline maxLength={500} />
    <PrimaryButton label="Lưu hồ sơ" onPress={submit} loading={loading} />
  </FormScreen>;
}
const styles = StyleSheet.create({ avatarPicker: { alignItems: 'center', marginBottom: 18 }, avatar: { width: 82, height: 82, borderRadius: 41 }, avatarEmpty: { width: 82, height: 82, borderRadius: 41, backgroundColor: '#8F1D3F', alignItems: 'center', justifyContent: 'center' }, avatarLetter: { color: '#FFFFFF', fontSize: 27, fontWeight: '900' }, avatarLink: { color: '#8F1D3F', fontSize: 11, fontWeight: '900', marginTop: 7 } });
