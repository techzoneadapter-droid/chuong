import { requireSupabase, supabase } from '../lib/supabase';
import { toServiceError } from './errors';

export type AuthorEventStatus = 'upcoming' | 'running' | 'ended';

export type AuthorEvent = {
  eventId: string;
  slug: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  targetWords: number;
  targetChapters: number;
  genreFilter: string | null;
  badgeLabel: string;
  prizeLabel: string;
  rules: string[];
  joined: boolean;
  joinedAt: string | null;
  wordsWritten: number;
  chaptersPublished: number;
  rank: number | null;
  participantCount: number;
  badgeAwarded: boolean;
  status: AuthorEventStatus;
};

export type AuthorEventLeaderboardRow = {
  rank: number;
  authorId: string;
  penName: string;
  avatarUrl: string | null;
  wordsWritten: number;
  chaptersPublished: number;
  goalReached: boolean;
};

export type AuthorBadge = {
  badgeKey: string;
  label: string;
  description: string;
  awardedAt: string;
  eventTitle: string;
};

function statusFor(startsAt: string, endsAt: string): AuthorEventStatus {
  const now = Date.now();
  if (now < new Date(startsAt).getTime()) return 'upcoming';
  if (now > new Date(endsAt).getTime()) return 'ended';
  return 'running';
}

function parseRules(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function eventError(error: unknown, fallback: string) {
  const raw = error && typeof error === 'object' && 'message' in error ? String((error as any).message) : '';
  if (/AUTHOR_REQUIRED/i.test(raw)) return new Error('Bạn cần hồ sơ tác giả để tham gia sự kiện.');
  if (/EVENT_ENDED/i.test(raw)) return new Error('Sự kiện này đã kết thúc.');
  if (/EVENT_NOT_FOUND/i.test(raw)) return new Error('Không tìm thấy sự kiện.');
  if (/FORBIDDEN/i.test(raw)) return new Error('Bạn không có quyền xem dữ liệu sự kiện này.');
  return toServiceError(error, fallback);
}

export async function getAuthorEventCenter(authorId: string): Promise<AuthorEvent[]> {
  try {
    const { data, error } = await requireSupabase().rpc('get_author_event_center', {
      p_author_id: authorId,
    });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      eventId: row.event_id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      targetWords: Number(row.target_words ?? 0),
      targetChapters: Number(row.target_chapters ?? 0),
      genreFilter: row.genre_filter,
      badgeLabel: row.badge_label,
      prizeLabel: row.prize_label,
      rules: parseRules(row.rules),
      joined: Boolean(row.joined),
      joinedAt: row.joined_at,
      wordsWritten: Number(row.words_written ?? 0),
      chaptersPublished: Number(row.chapters_published ?? 0),
      rank: row.rank_no == null ? null : Number(row.rank_no),
      participantCount: Number(row.participant_count ?? 0),
      badgeAwarded: Boolean(row.badge_awarded),
      status: statusFor(row.starts_at, row.ends_at),
    }));
  } catch (error) {
    throw eventError(error, 'Không thể tải sự kiện tác giả.');
  }
}

export async function joinAuthorEvent(eventId: string) {
  try {
    const { data, error } = await requireSupabase().rpc('join_author_event', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return Boolean(data);
  } catch (error) {
    throw eventError(error, 'Không thể tham gia sự kiện.');
  }
}

export async function syncAuthorEventBadge(eventId: string) {
  try {
    const { data, error } = await requireSupabase().rpc('sync_author_event_badge', {
      p_event_id: eventId,
    });
    if (error) throw error;
    return Boolean(data);
  } catch (error) {
    throw eventError(error, 'Chưa thể cập nhật huy hiệu sự kiện.');
  }
}

export async function getAuthorEventLeaderboard(eventId: string, limit = 30): Promise<AuthorEventLeaderboardRow[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc('get_author_event_leaderboard', {
      p_event_id: eventId,
      p_limit: Math.max(1, Math.min(limit, 100)),
    });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      rank: Number(row.rank_no),
      authorId: row.author_id,
      penName: row.pen_name,
      avatarUrl: row.avatar_url,
      wordsWritten: Number(row.words_written ?? 0),
      chaptersPublished: Number(row.chapters_published ?? 0),
      goalReached: Boolean(row.goal_reached),
    }));
  } catch (error) {
    throw toServiceError(error, 'Không thể tải bảng xếp hạng sự kiện.');
  }
}

export async function getPublicAuthorBadges(authorId: string): Promise<AuthorBadge[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc('get_public_author_badges', {
      p_author_id: authorId,
    });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      badgeKey: row.badge_key,
      label: row.label,
      description: row.description,
      awardedAt: row.awarded_at,
      eventTitle: row.event_title,
    }));
  } catch {
    return [];
  }
}
