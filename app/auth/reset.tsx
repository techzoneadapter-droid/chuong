import { useState } from 'react';
import { useRouter } from 'expo-router';
import { FormField, FormMessage, FormScreen, PrimaryButton } from '../../components/Form';
import { useAuth } from '../../contexts/AuthContext';
import { resetPassword } from '../../services/auth';
import { messageForError } from '../../services/errors';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { user, loading: restoring } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (password.length < 6) return setError('Mật khẩu cần có ít nhất 6 ký tự.');
    if (password !== confirm) return setError('Mật khẩu xác nhận chưa khớp.');
    setLoading(true); setError('');
    try { await resetPassword(password); router.replace('/profile'); }
    catch (cause) { setError(messageForError(cause)); }
    finally { setLoading(false); }
  };
  return <FormScreen title="Đặt lại mật khẩu">
    {!user && !restoring ? <FormMessage error>Mở liên kết khôi phục từ email trên trình duyệt này. Nếu liên kết hết hạn, hãy gửi lại yêu cầu.</FormMessage> : null}
    {error ? <FormMessage error>{error}</FormMessage> : null}
    <FormField label="Mật khẩu mới" value={password} onChangeText={setPassword} secureTextEntry />
    <FormField label="Xác nhận mật khẩu" value={confirm} onChangeText={setConfirm} secureTextEntry />
    <PrimaryButton label="Lưu mật khẩu" onPress={submit} loading={loading || restoring} disabled={!user} />
  </FormScreen>;
}
