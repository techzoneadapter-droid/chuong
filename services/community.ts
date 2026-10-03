import { requireSupabase, supabase } from '../lib/supabase';
import { toServiceError } from './errors';

export type ReaderPrivacy = {
  userId: string;
  profilePublic: boolean;
  showShelves: boolean;
  showReviews: boolean;
  showComments: boolean;
  allowFollows: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PublicReaderProfile = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  role: 'reader' | 'author' | 'admin';
  createdAt: string;
  followerCount: number;
  followingCount: number;
  viewerFollows: boolean;
  viewerMuted: boolean;
  viewerBlocked: boolean;
  profilePublic: boolean;
  showShelves: boolean;
  showReviews: boolean;
  showComments: boolean;
  allowFollows: boolean;
};

export type PublicShelfItem = {
  bookId: string;
  title: string;
  coverUrl: string | null;
  authorName: string;
  genre: string;
  bookStatus: 'draft' | 'ongoing' | 'completed' | 'paused';
  shelfStatus: 'reading' | 'favorite' | 'completed';
  addedAt: string;
};

export type CommunityActivity = {
  activityType: 'review' | 'comment';
  activityId: string;
  actorUserId: string;
  actorName?: string;
  actorAvatarUrl?: string | null;
  bookId: string;
  bookTitle: string;
  chapterId: string | null;
  rating: number | null;
  body: string;
  createdAt: string;
};

export type ReaderSearchItem = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  role: 'reader' | 'author' | 'admin';
  followerCount: number;
  viewerFollows: boolean;
};

function mapPrivacy(row: {
  user_id: string;
  profile_public: boolean;
  show_shelves: boolean;
  show_reviews: boolean;
  show_comments: boolean;
  allow_follows: boolean;
  created_at: string;
  updated_at: string;
}): ReaderPrivacy {
  return {
    userId: row.user_id,
    profilePublic: row.profile_public,
    showShelves: row.show_shelves,
    showReviews: row.show_reviews,
    showComments: row.show_comments,
    allowFollows: row.allow_follows,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProfile(row: {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: 'reader' | 'author' | 'admin';
  created_at: string;
  follower_count: number;
  following_count: number;
  viewer_follows: boolean;
  viewer_muted: boolean;
  viewer_blocked: boolean;
  profile_public: boolean;
  show_shelves: boolean;
  show_reviews: boolean;
  show_comments: boolean;
  allow_follows: boolean;
}): PublicReaderProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    role: row.role,
    createdAt: row.created_at,
    followerCount: Number(row.follower_count),
    followingCount: Number(row.following_count),
    viewerFollows: Boolean(row.viewer_follows),
    viewerMuted: Boolean(row.viewer_muted),
    viewerBlocked: Boolean(row.viewer_blocked),
    profilePublic: Boolean(row.profile_public),
    showShelves: Boolean(row.show_shelves),
    showReviews: Boolean(row.show_reviews),
    showComments: Boolean(row.show_comments),
    allowFollows: Boolean(row.allow_follows),
  };
}

function mapActivity(row: {
  activity_type: string;
  activity_id: string;
  actor_user_id: string;
  actor_name?: string | null;
  actor_avatar_url?: string | null;
  book_id: string;
  book_title: string;
  chapter_id: string | null;
  rating: number | null;
  body: string;
  created_at: string;
}): CommunityActivity {
  return {
    activityType: row.activity_type === 'review' ? 'review' : 'comment',
    activityId: row.activity_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name ?? undefined,
    actorAvatarUrl: row.actor_avatar_url,
    bookId: row.book_id,
    bookTitle: row.book_title,
    chapterId: row.chapter_id,
    rating: row.rating === null ? null : Number(row.rating),
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function getMyReaderPrivacy(): Promise<ReaderPrivacy> {
  const { data, error } = await requireSupabase().rpc('get_my_reader_privacy');
  if (error || !data?.[0]) throw toServiceError(error ?? new Error('Không tìm thấy cài đặt.'), 'Không thể tải quyền riêng tư.');
  return mapPrivacy(data[0]);
}

export async function updateReaderPrivacy(input: Omit<ReaderPrivacy, 'userId' | 'createdAt' | 'updatedAt'>): Promise<ReaderPrivacy> {
  const { data, error } = await requireSupabase().rpc('update_reader_privacy', {
    p_profile_public: input.profilePublic,
    p_show_shelves: input.showShelves,
    p_show_reviews: input.showReviews,
    p_show_comments: input.showComments,
    p_allow_follows: input.allowFollows,
  });
  if (error || !data?.[0]) throw toServiceError(error ?? new Error('Không thể lưu cài đặt.'), 'Không thể cập nhật quyền riêng tư.');
  return mapPrivacy(data[0]);
}

export async function getPublicReaderProfile(userId: string): Promise<PublicReaderProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_public_reader_profile', { p_user_id: userId });
  if (error) throw toServiceError(error, 'Không thể tải hồ sơ độc giả.');
  return data?.[0] ? mapProfile(data[0]) : null;
}

export async function getPublicReaderShelf(userId: string, limit = 50): Promise<PublicShelfItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_public_reader_shelf', { p_user_id: userId, p_limit: limit });
  if (error) throw toServiceError(error, 'Không thể tải kệ sách công khai.');
  return (data ?? []).map((row) => ({
    bookId: row.book_id,
    title: row.title,
    coverUrl: row.cover_url,
    authorName: row.author_name,
    genre: row.genre,
    bookStatus: row.book_status,
    shelfStatus: row.shelf_status,
    addedAt: row.added_at,
  }));
}

export async function getReaderPublicActivity(userId: string, limit = 30): Promise<CommunityActivity[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_reader_public_activity', { p_user_id: userId, p_limit: limit });
  if (error) throw toServiceError(error, 'Không thể tải hoạt động công khai.');
  return (data ?? []).map(mapActivity);
}

export async function getCommunityFeed(limit = 40): Promise<CommunityActivity[]> {
  const { data, error } = await requireSupabase().rpc('get_community_feed', { p_limit: limit });
  if (error) throw toServiceError(error, 'Không thể tải bảng tin cộng đồng.');
  return (data ?? []).map(mapActivity);
}

export async function searchPublicReaders(query = '', limit = 20): Promise<ReaderSearchItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('search_public_readers', { p_query: query, p_limit: limit });
  if (error) throw toServiceError(error, 'Không thể tìm độc giả.');
  return (data ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    role: row.role,
    followerCount: Number(row.follower_count),
    viewerFollows: Boolean(row.viewer_follows),
  }));
}

export async function setReaderFollow(targetUserId: string, following: boolean) {
  const { data, error } = await requireSupabase().rpc('set_reader_follow', {
    p_target_id: targetUserId,
    p_following: following,
  });
  if (error) {
    if (error.message?.includes('FOLLOW_NOT_ALLOWED')) throw new Error('Người này hiện không nhận lượt theo dõi mới.');
    if (error.message?.includes('INVALID_FOLLOW_TARGET')) throw new Error('Không thể theo dõi chính mình.');
    throw toServiceError(error, 'Không thể cập nhật theo dõi.');
  }
  return Boolean(data);
}

export async function setReaderMute(targetUserId: string, muted: boolean) {
  const { data, error } = await requireSupabase().rpc('set_reader_mute', {
    p_target_id: targetUserId,
    p_muted: muted,
  });
  if (error) throw toServiceError(error, 'Không thể cập nhật chế độ ẩn hoạt động.');
  return Boolean(data);
}

export async function setReaderBlock(targetUserId: string, blocked: boolean) {
  const { data, error } = await requireSupabase().rpc('set_reader_block', {
    p_target_id: targetUserId,
    p_blocked: blocked,
  });
  if (error) throw toServiceError(error, 'Không thể cập nhật chặn độc giả.');
  return Boolean(data);
}
