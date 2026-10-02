import { Session, User } from '@supabase/supabase-js';
import { requireSupabase, supabase } from '../lib/supabase';
import { Profile } from '../types';
import { toServiceError } from './errors';

export interface AuthPayload { session: Session | null; user: User | null; }
export type FutureOAuthProvider = 'google' | 'apple';

const mapProfile = (row: NonNullable<Awaited<ReturnType<typeof getProfileRow>>>) : Profile => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  bio: row.bio,
  role: row.role,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

async function getProfileRow(userId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  try {
    const row = await getProfileRow(userId);
    return row ? mapProfile(row) : null;
  } catch (error) {
    throw toServiceError(error, 'Không thể tải hồ sơ.');
  }
}

export async function signIn(email: string, password: string): Promise<AuthPayload> {
  try {
    const { data, error } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    return { session: data.session, user: data.user };
  } catch (error) { throw toServiceError(error, 'Không thể đăng nhập.'); }
}

export async function signUp(email: string, password: string, displayName: string): Promise<AuthPayload> {
  try {
    const { data, error } = await requireSupabase().auth.signUp({
      email: email.trim(), password,
      options: { data: { display_name: displayName.trim() } }
    });
    if (error) throw error;
    return { session: data.session, user: data.user };
  } catch (error) { throw toServiceError(error, 'Không thể tạo tài khoản.'); }
}

export async function sendPasswordReset(email: string) {
  try {
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/reset` : undefined;
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw error;
  } catch (error) { throw toServiceError(error, 'Không thể gửi email đặt lại mật khẩu.'); }
}

export async function signOut() {
  try {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
  } catch (error) { throw toServiceError(error, 'Không thể đăng xuất.'); }
}

// Reserved provider contract; OAuth is intentionally disabled until a later phase.
export async function signInWithOAuth(_provider: FutureOAuthProvider, _redirectTo?: string): Promise<never> {
  throw new Error('Đăng nhập Google/Apple sẽ được hỗ trợ trong giai đoạn sau.');
}

export async function ensureProfile(user: User): Promise<Profile> {
  const existing = await getProfile(user.id);
  if (existing) return existing;
  const name = typeof user.user_metadata.display_name === 'string' ? user.user_metadata.display_name.slice(0, 80) : null;
  const { error } = await requireSupabase().from('profiles').upsert({ id: user.id, display_name: name, role: 'reader' }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw toServiceError(error, 'Không thể tạo hồ sơ.');
  const profile = await getProfile(user.id);
  if (!profile) throw new Error('Không thể tải hồ sơ. Vui lòng thử lại.');
  return profile;
}

export async function resetPassword(password: string) {
  const { error } = await requireSupabase().auth.updateUser({ password });
  if (error) throw toServiceError(error, 'Không thể đặt lại mật khẩu.');
}

export async function updateProfile(userId: string, updates: Pick<Profile, 'username' | 'displayName' | 'avatarUrl' | 'bio'>) {
  try {
    const client = requireSupabase();
    const { data, error } = await client.from('profiles').update({
      username: updates.username?.trim() || null,
      display_name: updates.displayName?.trim() || null,
      avatar_url: updates.avatarUrl,
      bio: updates.bio?.trim() || null,
      updated_at: new Date().toISOString()
    }).eq('id', userId).select('*').single();
    if (error) throw error;
    return mapProfile(data);
  } catch (error) { throw toServiceError(error, 'Không thể cập nhật hồ sơ.'); }
}
