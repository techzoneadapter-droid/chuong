import { ServiceError } from '../types';

const messages: Record<string, string> = {
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  email_not_confirmed: 'Vui lòng xác nhận email trước khi đăng nhập.',
  user_already_exists: 'Email này đã được đăng ký.',
  weak_password: 'Mật khẩu chưa đủ mạnh. Vui lòng chọn mật khẩu khác.',
  over_email_send_rate_limit: 'Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau.',
  '23505': 'Thông tin đã tồn tại. Vui lòng kiểm tra tên hoặc số chương.',
  '23514': 'Thông tin chưa hợp lệ. Vui lòng kiểm tra các trường nhập.',
  '42501': 'Bạn không có quyền thực hiện thao tác này.',
  PGRST301: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
};

export function toServiceError(error: unknown, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'): ServiceError {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
  const raw = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  let message = code ? messages[code] : undefined;
  if (/invalid login credentials/i.test(raw)) message = messages.invalid_credentials;
  else if (/email not confirmed/i.test(raw)) message = messages.email_not_confirmed;
  else if (/already registered/i.test(raw)) message = messages.user_already_exists;
  else if (/fetch|network|timeout/i.test(raw)) message = 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.';
  else if (/JWT expired|refresh token/i.test(raw)) message = messages.PGRST301;
  else if (/row-level security|permission denied/i.test(raw)) message = messages['42501'];
  // Preserve our Vietnamese validation messages, never display raw provider/SQL details.
  const result: ServiceError = new Error(message ?? (/[\u00c0-\u1ef9]/.test(raw) ? raw : fallback));
  result.code = code;
  return result;
}
export function messageForError(error: unknown, fallback?: string) { return toServiceError(error, fallback).message; }
