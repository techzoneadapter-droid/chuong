import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { FormField, FormMessage, FormScreen, PrimaryButton } from '../../components/Form';
import { useAuth } from '../../contexts/AuthContext';
import { signUp } from '../../services/auth';
import { messageForError } from '../../services/errors';

export default function RegisterScreen() {
  const router = useRouter(); const { configured } = useAuth();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const submit = async () => {
    if (name.trim().length < 2) return setError('Tên hiển thị cần có ít nhất 2 ký tự.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Vui lòng nhập email hợp lệ.');
    if (password.length < 6) return setError('Mật khẩu cần có ít nhất 6 ký tự.');
    if (password !== confirm) return setError('Mật khẩu xác nhận chưa khớp.');
    setLoading(true); setError('');
    try { const result = await signUp(email, password, name); if (result.session) router.replace('/profile'); else setSuccess('Đã tạo tài khoản. Vui lòng kiểm tra email để xác nhận đăng ký.'); }
    catch (cause) { setError(messageForError(cause, 'Không thể tạo tài khoản.')); }
    finally { setLoading(false); }
  };
  return <FormScreen title="Đăng ký" subtitle="Tạo tài khoản miễn phí. Bạn vẫn có thể đọc truyện công khai khi chưa đăng nhập.">
    {!configured ? <FormMessage>Chế độ demo đang hoạt động. Cấu hình Supabase để đăng ký.</FormMessage> : null}
    {error ? <FormMessage error>{error}</FormMessage> : null}{success ? <FormMessage>{success}</FormMessage> : null}
    <FormField label="Tên hiển thị" value={name} onChangeText={setName} placeholder="Tên của bạn" />
    <FormField label="Email" value={email} onChangeText={setEmail} placeholder="ban@example.com" autoCapitalize="none" keyboardType="email-address" />
    <FormField label="Mật khẩu" value={password} onChangeText={setPassword} placeholder="Ít nhất 6 ký tự" secureTextEntry />
    <FormField label="Xác nhận mật khẩu" value={confirm} onChangeText={setConfirm} placeholder="Nhập lại mật khẩu" secureTextEntry />
    <PrimaryButton label="Tạo tài khoản" onPress={submit} loading={loading} disabled={!configured || Boolean(success)} />
    <Text style={styles.footer}>Đã có tài khoản? <Text style={styles.link} onPress={() => router.replace('/auth/login')}>Đăng nhập</Text></Text>
  </FormScreen>;
}
const styles = StyleSheet.create({ footer: { color: '#756B6F', textAlign: 'center', fontSize: 12, marginTop: 20 }, link: { color: '#8F1D3F', fontWeight: '900' } });
