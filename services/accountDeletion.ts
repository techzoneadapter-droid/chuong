import { requireSupabase } from '../lib/supabase';
import { toServiceError } from './errors';

export async function getAccountDeletionStatus(): Promise<{ id: string; status: string } | null> {
  const { data, error } = await requireSupabase().rpc('get_account_deletion_status');
  if (error) throw toServiceError(error, 'Không thể kiểm tra trạng thái xóa.');
  return data as { id: string; status: string } | null;
}

export async function requestAccountDeletion(): Promise<{ id: string; status: string }> {
  try {
    const { data, error } = await requireSupabase().rpc('request_account_deletion');
    if (error) throw error;
    const result = data as { id?: string; status?: string } | null;
    if (!result?.id || !result.status) throw new Error('Yêu cầu chưa được xác nhận.');
    return { id: result.id, status: result.status };
  } catch (cause) { throw toServiceError(cause, 'Không thể gửi yêu cầu xóa tài khoản. Vui lòng thử lại.'); }
}
