import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { FormMessage, FormScreen, PrimaryButton } from './Form';
import { requireSupabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function PolicyPage({ terms = false }: { terms?: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const [policy, setPolicy] = useState<{ version: string; terms: string; accepted: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true; setPolicy(null);
    if (terms) void (async () => {
      const { data, error } = await requireSupabase().rpc('get_active_ugc_policy');
      if (!error && active) setPolicy(data as typeof policy);
    })().catch(() => undefined);
    return () => { active = false; };
  }, [terms, user?.id]);
  if (terms && policy) return <FormScreen title="Điều khoản sử dụng" backHref="/settings" subtitle={'Phiên bản đã phê duyệt: ' + policy.version}>
    <Text selectable style={{ fontSize: 15, lineHeight: 24 }}>{policy.terms}</Text>
    {message ? <FormMessage error>{message}</FormMessage> : null}
    {policy.accepted ? <FormMessage>Bạn đã chấp nhận phiên bản này.</FormMessage> : <PrimaryButton label={user ? 'Tôi đã đọc và chấp nhận điều khoản' : 'Đăng nhập để chấp nhận điều khoản'} loading={busy} onPress={() => {
      if (!user) { router.push('/auth/login'); return; }
      setBusy(true); setMessage('');
      void (async () => {
        try {
          const { error } = await requireSupabase().rpc('accept_ugc_policy', { p_version: policy.version });
          if (error) setMessage('Không thể ghi nhận. Điều khoản có thể đã đổi; mở lại trang và thử lại.');
          else setPolicy({ ...policy, accepted: true });
        } catch { setMessage('Không thể kết nối để ghi nhận điều khoản.'); }
        finally { setBusy(false); }
      })();
    }} />}
    <Text accessibilityRole="link" onPress={() => router.push('/privacy')}>Chính sách quyền riêng tư</Text>
  </FormScreen>;
  return <FormScreen title={terms ? 'Điều khoản sử dụng · DRAFT' : 'Chính sách quyền riêng tư · DRAFT'} backHref="/settings"
    subtitle="Bản dự thảo kiểm thử, chưa được chủ sở hữu phê duyệt để phát hành. Phiên bản dự thảo 2026-10-12.">
    <FormMessage>Chủ sở hữu cần xác nhận pháp nhân, địa chỉ liên hệ, thời hạn lưu giữ và thời gian xử lý yêu cầu trước khi công bố chính sách chính thức.</FormMessage>
    {terms ? <>
      <FormMessage>Chỉ đăng truyện, bản dịch và ảnh bìa mà bạn có quyền sử dụng. Không mạo danh, spam, quấy rối, đăng nội dung trái pháp luật hoặc xâm phạm quyền của người khác. Nhãn nguồn truyện không thay thế chứng cứ cấp phép.</FormMessage>
      <FormMessage>Dùng Báo cáo tại truyện, bình luận, đánh giá và trang tác giả để yêu cầu kiểm duyệt. Quản trị viên có thể xem xét, ẩn và khôi phục nội dung, có nhật ký thao tác. Cơ chế khiếu nại và đầu mối bản quyền cần chủ sở hữu xác nhận.</FormMessage>
      <FormMessage>VIP và Linh Thạch mua trên Android/iOS dùng cửa hàng nền tảng. Máy chủ xác minh giao dịch trước cấp quyền. Khôi phục, hủy thuê bao và yêu cầu hoàn tiền tuân theo quy trình cửa hàng. Không cam kết chuyển đổi Linh Thạch sang tiền hoặc hoàn trả số dư trong dự thảo này.</FormMessage>
    </> : <>
      <FormMessage>Source có xử lý tài khoản/email, tên/avatar/tiểu sử, truyện và nội dung cộng đồng, tủ sách và tiến độ đọc, quan hệ theo dõi/chặn, token thông báo, dữ liệu mua hàng/thuê bao, ví/quà tặng và thông tin thanh toán tác giả.</FormMessage>
      <FormMessage>Supabase cung cấp xác thực, cơ sở dữ liệu và lưu trữ; SDK cửa hàng xác minh mua hàng; SDK quảng cáo và consent có thể xử lý định danh/diagnostics theo cấu hình. Chức năng AI có thể gửi văn bản/ảnh tới nhà cung cấp. TTS sử dụng engine hệ điều hành, có thể tải giọng hoặc dùng mạng. Danh sách nhà cung cấp, quốc gia, dữ liệu chia sẻ và thời hạn lưu giữ phải được xác nhận trên môi trường phát hành.</FormMessage>
      <FormMessage>Bạn có thể chỉnh hồ sơ, thiết lập quyền riêng tư, quản lý thông báo, mở tùy chọn quyền riêng tư quảng cáo và yêu cầu xóa tài khoản. Yêu cầu xóa cần đăng nhập để xác minh; không tự hủy thuê bao cửa hàng. Dữ liệu giao dịch và đối soát chưa được xóa khi chưa có chính sách lưu giữ phù hợp.</FormMessage>
      <FormMessage>Thời hạn xử lý xóa, cách thông báo hoàn tất, quyền liên hệ/khiếu nại, quy định độ tuổi và căn cứ xử lý dữ liệu đang chờ chủ sở hữu phê duyệt. Không dùng trang DRAFT này làm URL chính sách đã được ký duyệt trên store.</FormMessage>
    </>}
    <Text accessibilityRole="link" onPress={() => router.push('/delete-account')}>Yêu cầu xóa tài khoản và dữ liệu</Text>
    <Text accessibilityRole="link" onPress={() => router.push(terms ? '/privacy' : '/terms')}>{terms ? 'Chính sách quyền riêng tư' : 'Điều khoản sử dụng'} · DRAFT</Text>
  </FormScreen>;
}
