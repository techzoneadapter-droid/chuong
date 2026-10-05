import { requireSupabase } from '../lib/supabase';
import { Tables } from '../types/database';
import { toServiceError } from './errors';

export type AppNotification = Tables<'notifications'>;
export type NotificationPreferenceRow = Tables<'notification_preferences'>;

export type NotificationPreferences = {
  inAppEnabled: boolean;
  purchases: boolean;
  authorEarnings: boolean;
  payouts: boolean;
  comments: boolean;
  moderation: boolean;
  system: boolean;
  pushEnabled: boolean;
};

export const defaultNotificationPreferences: NotificationPreferences = {
  inAppEnabled: true,
  purchases: true,
  authorEarnings: true,
  payouts: true,
  comments: true,
  moderation: true,
  system: true,
  pushEnabled: false,
};

export async function getNotifications(options?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<AppNotification[]> {
  try {
    let query = requireSupabase()
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(options?.limit ?? 100, 200)));

    if (options?.unreadOnly) query = query.is('read_at', null);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    throw toServiceError(error, 'Không thể tải thông báo.');
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const { data, error } = await requireSupabase().rpc('get_unread_notification_count');
    if (error) throw error;
    return Number(data ?? 0);
  } catch {
    return 0;
  }
}

export async function markNotificationRead(notificationId: string) {
  const { data, error } = await requireSupabase().rpc('mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw toServiceError(error, 'Không thể đánh dấu thông báo đã đọc.');
  return data;
}

export async function markAllNotificationsRead() {
  const { data, error } = await requireSupabase().rpc('mark_all_notifications_read');
  if (error) throw toServiceError(error, 'Không thể đánh dấu tất cả đã đọc.');
  return Number(data ?? 0);
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const { data, error } = await requireSupabase()
      .from('notification_preferences')
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) return defaultNotificationPreferences;

    return {
      inAppEnabled: data.in_app_enabled,
      purchases: data.purchases,
      authorEarnings: data.author_earnings,
      payouts: data.payouts,
      comments: data.comments,
      moderation: data.moderation,
      system: data.system,
      pushEnabled: data.push_enabled,
    };
  } catch (error) {
    throw toServiceError(error, 'Không thể tải cài đặt thông báo.');
  }
}

export async function saveNotificationPreferences(input: NotificationPreferences) {
  try {
    const { data, error } = await requireSupabase().rpc('update_notification_preferences', {
      p_in_app_enabled: input.inAppEnabled,
      p_purchases: input.purchases,
      p_author_earnings: input.authorEarnings,
      p_payouts: input.payouts,
      p_comments: input.comments,
      p_moderation: input.moderation,
      p_system: input.system,
      p_push_enabled: input.pushEnabled,
    });
    if (error) throw error;
    return data;
  } catch (error) {
    throw toServiceError(error, 'Không thể lưu cài đặt thông báo.');
  }
}

export function notificationCategoryLabel(category: string) {
  if (category === 'purchase') return 'Hạ Phẩm · Thượng Phẩm';
  if (category === 'author_earnings') return 'Doanh thu';
  if (category === 'payout') return 'Thanh toán tác giả';
  if (category === 'comment') return 'Bình luận';
  if (category === 'moderation') return 'Kiểm duyệt';
  return 'CHƯƠNG';
}
