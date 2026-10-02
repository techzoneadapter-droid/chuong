import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { FormField, FormMessage, FormScreen, PrimaryButton } from '../../components/Form';
import { useAuth } from '../../contexts/AuthContext';
import { signIn } from '../../services/auth';
import { messageForError } from '../../services/errors';

export default function LoginScreen() {
  const router = useRouter();
  const { configured } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Vui lòng nhập email hợp lệ.');
    if (password.length < 6) return setError('Mật khẩu cần có ít nhất 6 ký tự.');
    setLoading(true); setError('');
    try { await signIn(email, password); router.replace('/profile'); }
    catch (cause) { setError(messageForError(cause, 'Không thể đăng nhập.')); }
    finally { setLoading(false); }
  };
  return <FormScreen title="Đăng nhập" subtitle="Đồng bộ tủ sách, tiến độ và dấu trang trên các thiết bị.">
    {!configured ? <FormMessage>Chế độ demo đang hoạt động. Cấu hình Supabase để đăng nhập.</FormMessage> : null}
    {error ? <FormMessage error>{error}</FormMessage> : null}
    <FormField label="Email" value={email} onChangeText={setEmail} placeholder="ban@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
    <FormField label="Mật khẩu" value={password} onChangeText={setPassword} placeholder="Ít nhất 6 ký tự" secureTextEntry autoComplete="current-password" />
    <PrimaryButton label="Đăng nhập" onPress={submit} loading={loading} disabled={!configured} />
    <Pressable onPress={() => router.push('/auth/forgot')}><Text style={styles.link}>Quên mật khẩu?</Text></Pressable>
    <Text style={styles.footer}>Chưa có tài khoản? <Text style={styles.strong} onPress={() => router.push('/auth/register')}>Đăng ký</Text></Text>
  </FormScreen>;
}
const styles = StyleSheet.create({ link: { color: '#8F1D3F', textAlign: 'center', fontWeight: '800', fontSize: 12, padding: 14 }, footer: { color: '#756B6F', textAlign: 'center', fontSize: 12, marginTop: 8 }, strong: { color: '#8F1D3F', fontWeight: '900' } });
