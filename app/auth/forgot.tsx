import { useState } from 'react';
import { FormField, FormMessage, FormScreen, PrimaryButton } from '../../components/Form';
import { useAuth } from '../../contexts/AuthContext';
import { sendPasswordReset } from '../../services/auth';
import { messageForError } from '../../services/errors';

export default function ForgotPasswordScreen() {
  const { configured } = useAuth(); const [email, setEmail] = useState(''); const [loading, setLoading] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Vui lòng nhập email hợp lệ.');
    setLoading(true); setError('');
    try { await sendPasswordReset(email); setMessage('Đã gửi hướng dẫn đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.'); }
    catch (cause) { setError(messageForError(cause)); }
    finally { setLoading(false); }
  };
  return <FormScreen title="Quên mật khẩu" subtitle="Nhập email tài khoản để nhận liên kết đặt lại mật khẩu.">
    {!configured ? <FormMessage>Chế độ demo đang hoạt động. Cấu hình Supabase để gửi email.</FormMessage> : null}
    {error ? <FormMessage error>{error}</FormMessage> : null}{message ? <FormMessage>{message}</FormMessage> : null}
    <FormField label="Email" value={email} onChangeText={setEmail} placeholder="ban@example.com" autoCapitalize="none" keyboardType="email-address" />
    <PrimaryButton label="Gửi hướng dẫn" onPress={submit} loading={loading} disabled={!configured || Boolean(message)} />
  </FormScreen>;
}
