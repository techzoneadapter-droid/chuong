import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BrandLockup } from '../../components/Artwork';
import { xianxia } from '../../constants/xianxia';
import { useAuth } from '../../contexts/AuthContext';
import { signIn } from '../../services/auth';
import { messageForError } from '../../services/errors';

export default function StudioLoginScreen() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (user && profile?.role === 'admin') router.replace('/studio');
  }, [authLoading, profile?.role, router, user]);

  const submit = async () => {
    if (!email.trim() || password.length < 6 || busy) return;
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
      router.replace('/studio');
    } catch (cause) {
      setError(messageForError(cause, 'Không thể đăng nhập Content Studio.'));
    } finally {
      setBusy(false);
    }
  };

  return <View style={styles.page}>
    <View style={styles.aside}>
      <BrandLockup inverse />
      <Text style={styles.kicker}>CONTENT STUDIO</Text>
      <Text style={styles.asideTitle}>Đẩy truyện và quản lý kho nội dung của app mobile.</Text>
      <Text style={styles.asideBody}>Một nơi riêng cho quản trị viên: tải TXT/DOCX/ZIP, thay bìa, biên tập chương, xuất bản và kiểm soát nội dung đang xuất hiện trên CHƯƠNG.</Text>
      <View style={styles.points}>
        {['Đồng bộ trực tiếp với Supabase production', 'Quản lý bìa, metadata và trạng thái', 'Biên tập từng chương trên màn hình lớn', 'Chỉ tài khoản Admin mới truy cập được'].map((item) => <View key={item} style={styles.point}><Ionicons name="checkmark-circle" size={17} color={xianxia.goldSoft} /><Text style={styles.pointText}>{item}</Text></View>)}
      </View>
    </View>

    <View style={styles.main}>
      <View style={styles.card}>
        <View style={styles.icon}><Ionicons name="desktop-outline" size={24} color={xianxia.jadeDeep} /></View>
        <Text style={styles.title}>Đăng nhập quản trị</Text>
        <Text style={styles.subtitle}>{Platform.OS === 'web' ? 'Truy cập CHƯƠNG Content Studio trên trình duyệt.' : 'Content Studio được tối ưu cho trình duyệt máy tính.'}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>Email Admin</Text>
        <TextInput autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="admin@example.com" placeholderTextColor="#9B928C" style={styles.input} />
        <Text style={styles.label}>Mật khẩu</Text>
        <TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#9B928C" style={styles.input} />

        <Pressable disabled={busy || !email.trim() || password.length < 6} style={[styles.submit, (busy || !email.trim() || password.length < 6) && styles.disabled]} onPress={() => void submit()}>
          <Ionicons name="log-in-outline" size={18} color="#FFF8EA" />
          <Text style={styles.submitText}>{busy ? 'Đang đăng nhập…' : 'Mở Content Studio'}</Text>
        </Pressable>
        <Text style={styles.note}>Tài khoản không có vai trò Admin sẽ bị từ chối ở cả giao diện và chính sách dữ liệu.</Text>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: '100%' as never, backgroundColor: '#F4F0E7', flexDirection: 'row' },
  aside: { width: '44%', minWidth: 420, padding: 48, backgroundColor: '#13211E', justifyContent: 'center' },
  kicker: { color: xianxia.goldSoft, fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginTop: 30 },
  asideTitle: { color: '#FFF8EA', fontSize: 34, lineHeight: 42, fontWeight: '900', marginTop: 8, maxWidth: 520 },
  asideBody: { color: '#B6C4BE', fontSize: 12, lineHeight: 20, marginTop: 12, maxWidth: 520 },
  points: { marginTop: 24, gap: 10 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pointText: { color: '#D5DFDA', fontSize: 10, fontWeight: '700' },
  main: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 460, borderRadius: 22, padding: 28, backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E1D9CC' },
  icon: { width: 52, height: 52, borderRadius: 16, backgroundColor: xianxia.jadeMist, borderWidth: 1, borderColor: '#C1D1C6', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#251F22', fontSize: 25, fontWeight: '900', marginTop: 15 },
  subtitle: { color: '#7A716C', fontSize: 10, lineHeight: 15, marginTop: 5 },
  error: { color: xianxia.danger, backgroundColor: '#F5E5E1', borderRadius: 11, padding: 10, marginTop: 12, fontSize: 9, lineHeight: 14 },
  label: { color: '#4C4440', fontSize: 9, fontWeight: '900', marginTop: 15, marginBottom: 5 },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: '#DDD4C8', backgroundColor: '#FAF7F1', paddingHorizontal: 12, color: '#2B2528', fontSize: 10.5 },
  submit: { minHeight: 48, borderRadius: 12, backgroundColor: xianxia.jadeDeep, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFF8EA', fontSize: 10.5, fontWeight: '900' },
  note: { color: '#8B817A', fontSize: 8, lineHeight: 12, textAlign: 'center', marginTop: 10 },
  disabled: { opacity: .45 },
});
