import { AuthError, PostgrestError } from '@supabase/supabase-js';
import { ServiceError } from '../types';

const vietnameseMessages: Record<string, string> = {
  'Invalid login credentials': 'Email hoặc mật khẩu không đúng.',
  'Email not confirmed': 'Vui lòng xác nhận email trước khi đăng nhập.',
  'User already registered': 'Email này đã được đăng ký.',
  'Password should be at least 6 characters': 'Mật khẩu cần có ít nhất 6 ký tự.',
  'Failed to fetch': 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.',
  'Network request failed': 'Bạn đang ngoại tuyến hoặc kết nối không ổn định.',
  'JWT expired': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
};

export function toServiceError(error: unknown, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'): ServiceError {
  if (error instanceof Error) {
    const result = new Error(vietnameseMessages[error.message] ?? error.message ?? fallback) as ServiceError;
    if (error instanceof AuthError || 'code' in error) result.code = String((error as AuthError | PostgrestError).code ?? 'UNKNOWN');
    return result;
  }
  return new Error(fallback) as ServiceError;
}

export function messageForError(error: unknown, fallback?: string) {
  const message = toServiceError(error, fallback).message;
  if (/row-level security|permission denied|42501/i.test(message)) return 'Bạn không có quyền thực hiện thao tác này.';
  return message;
}
