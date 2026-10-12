import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking, Text } from 'react-native';
import { FormField, FormMessage, FormScreen, PrimaryButton } from '../components/Form';
import { useAuth } from '../contexts/AuthContext';
import { getAccountDeletionStatus, requestAccountDeletion } from '../services/accountDeletion';
import { messageForError } from '../services/errors';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState('');
  const [status, setStatus] = useState('pending');
  useEffect(() => {
    let active = true;
    setRequestId(''); setStatus('pending'); setError('');
    if (user) void getAccountDeletionStatus().then(result => {
      if (active && result) { setRequestId(result.id); setStatus(result.status); }
    }).catch(cause => { if (active) setError(messageForError(cause)); });
    return () => { active = false; };
  }, [user?.id]);
  const submit = async () => {
    if (!user || confirmation.trim() !== 'XÓA' || loading) return;
    setLoading(true); setError('');
    try { const result = await requestAccountDeletion(); setRequestId(result.id); setStatus(result.status); }
    catch (cause) { setError(messageForError(cause)); }
    finally { setLoading(false); }
  };
  return <FormScreen title="Xóa tài khoản CHƯƠNG" backHref="/settings"
    subtitle="Yêu cầu xóa tài khoản và dữ liệu liên quan: hồ sơ, tủ sách, tiến độ, dấu trang, bình luận và nội dung bạn đã đăng.">
    <FormMessage>Yêu cầu cần được xử lý bởi đội vận hành. Dữ liệu chưa bị xóa ngay khi gửi yêu cầu. Hồ sơ giao dịch cần lưu theo nghĩa vụ pháp lý sẽ được xử lý theo chính sách lưu giữ được công bố.</FormMessage>
    <FormMessage>Xóa tài khoản không tự hủy thuê bao VIP. Bạn có thể quản lý thuê bao trong cửa hàng; việc hủy thuê bao không phải điều kiện để gửi yêu cầu xóa.</FormMessage>
    <Text accessibilityRole="link" onPress={() => { void Linking.openURL('https://play.google.com/store/account/subscriptions'); }}>Quản lý thuê bao Google Play</Text>
    <Text accessibilityRole="link" onPress={() => { void Linking.openURL('https://apps.apple.com/account/subscriptions'); }}>Quản lý thuê bao App Store</Text>
    {error ? <FormMessage error>{error}</FormMessage> : null}
    <Text accessibilityRole="link" onPress={() => router.push('/privacy')}>Chính sách quyền riêng tư · DRAFT</Text>
    {requestId ? <><FormMessage>Đã ghi nhận yêu cầu: {requestId}. Trạng thái: {status === 'processing' ? 'Đang xử lý' : status === 'blocked' ? 'Cần rà soát lưu giữ dữ liệu' : status === 'completed' ? 'Đã hoàn tất xử lý' : 'Đang chờ xử lý xóa'}.</FormMessage>
      <PrimaryButton label="Cập nhật trạng thái" onPress={() => { void getAccountDeletionStatus().then(result => { if (result) { setRequestId(result.id); setStatus(result.status); } }).catch(cause => setError(messageForError(cause))); }} />
    </> : user ? <>
      <FormField label="Nhập XÓA để xác nhận yêu cầu" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
      <PrimaryButton label="Yêu cầu xóa tài khoản và dữ liệu" onPress={submit} loading={loading} disabled={confirmation.trim() !== 'XÓA'} />
    </> : <>
      <FormMessage>Đăng nhập để xác minh tài khoản cần xóa. Sau khi đăng nhập, mở lại mục Xóa tài khoản trong Cài đặt hoặc trang này.</FormMessage>
      <PrimaryButton label="Đăng nhập để yêu cầu xóa" onPress={() => router.push('/auth/login')} />
    </>}
  </FormScreen>;
}
