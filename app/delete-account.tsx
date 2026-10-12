import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Linking, Text } from 'react-native';
import { FormField, FormMessage, FormScreen, PrimaryButton } from '../components/Form';
import { useAuth } from '../contexts/AuthContext';
import { requestAccountDeletion } from '../services/accountDeletion';
import { messageForError } from '../services/errors';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState('');
  const submit = async () => {
    if (!user || confirmation.trim() !== 'XÓA' || loading) return;
    setLoading(true); setError('');
    try { setRequestId((await requestAccountDeletion()).id); }
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
    {requestId ? <FormMessage>Đã ghi nhận yêu cầu: {requestId}. Tài khoản đang chờ xử lý xóa.</FormMessage> : user ? <>
      <FormField label="Nhập XÓA để xác nhận yêu cầu" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
      <PrimaryButton label="Yêu cầu xóa tài khoản và dữ liệu" onPress={submit} loading={loading} disabled={confirmation.trim() !== 'XÓA'} />
    </> : <>
      <FormMessage>Đăng nhập để xác minh tài khoản cần xóa. Sau khi đăng nhập, mở lại mục Xóa tài khoản trong Cài đặt hoặc trang này.</FormMessage>
      <PrimaryButton label="Đăng nhập để yêu cầu xóa" onPress={() => router.push('/auth/login')} />
    </>}
  </FormScreen>;
}
