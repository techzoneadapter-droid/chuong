import { ReaderSettings } from '../types';
import { toServiceError } from './errors';
import { requireSupabase } from '../lib/supabase';

export const defaultReaderSettings: ReaderSettings = {
  fontSize: 18,
  font: 'serif',
  spacing: 'normal',
  theme: 'paper',
  padding: 22,
  mode: 'scroll'
};

const memory = new Map<string, string>();

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : memory.get(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal<T>(key: string, value: T) {
  try {
    const serialized = JSON.stringify(value);
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, serialized);
    else memory.set(key, serialized);
  } catch {
    // Persistence is best-effort in preview mode.
  }
}

function extensionFromMime(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function uploadImage(bucket: 'book-covers' | 'author-avatars' | 'profile-avatars', ownerId: string, uri: string, mimeType = 'image/jpeg', bookId?: string) {
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.');
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Không thể đọc ảnh đã chọn.');
    const body = await response.arrayBuffer();
    if (body.byteLength > 5 * 1024 * 1024) throw new Error('Ảnh cần nhỏ hơn 5 MB.');
    const path = `${ownerId}/${bookId ? `${bookId}/` : ''}${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extensionFromMime(mimeType)}`;
    const client = requireSupabase();
    const { error } = await client.storage.from(bucket).upload(path, body, { contentType: mimeType, upsert: false });
    if (error) throw error;
    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  } catch (error) {
    throw toServiceError(error, 'Không thể tải ảnh. Vui lòng thử lại.');
  }
}

export const uploadBookCover = (userId: string, bookId: string, uri: string, mimeType = 'image/jpeg') => uploadImage('book-covers', userId, uri, mimeType, bookId);
export const uploadAuthorAvatar = (authorId: string, uri: string, mimeType = 'image/jpeg') => uploadImage('author-avatars', authorId, uri, mimeType);
export const uploadProfileAvatar = (userId: string, uri: string, mimeType = 'image/jpeg') => uploadImage('profile-avatars', userId, uri, mimeType);

// Delete only a URL from this project's bucket and the caller's exact book folder.
export async function deleteOwnBookCover(userId: string, bookId: string, url: string) {
  const client = requireSupabase();
  const base = client.storage.from('book-covers').getPublicUrl('').data.publicUrl;
  if (!url.startsWith(base)) return;
  const path = decodeURIComponent(url.slice(base.length));
  if (!path.startsWith(`${userId}/${bookId}/`) || path.includes('..')) return;
  const { error } = await client.storage.from('book-covers').remove([path]);
  if (error) throw toServiceError(error, 'Bìa đã lưu nhưng chưa xóa được ảnh cũ.');
}

export async function replaceBookCover(userId: string, bookId: string, uri: string, mimeType?: string, oldUrl?: string | null) {
  const client = requireSupabase();
  const url = await uploadBookCover(userId, bookId, uri, mimeType);
  const { error } = await client.from('books').update({ cover_url: url }).eq('id', bookId).select('id').single();
  if (error) { await deleteOwnBookCover(userId, bookId, url).catch(() => undefined); throw toServiceError(error, 'Không thể lưu ảnh bìa.'); }
  if (oldUrl) await deleteOwnBookCover(userId, bookId, oldUrl);
  return url;
}
