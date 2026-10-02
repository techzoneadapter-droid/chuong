import { ReaderSettings } from '../types';
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

async function uploadImage(bucket: 'book-covers' | 'author-avatars' | 'profile-avatars', ownerId: string, uri: string, mimeType = 'image/jpeg') {
  try {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Không thể đọc ảnh đã chọn.');
    const body = await response.arrayBuffer();
    const path = `${ownerId}/${Date.now()}.${extensionFromMime(mimeType)}`;
    const client = requireSupabase();
    const { error } = await client.storage.from(bucket).upload(path, body, { contentType: mimeType, upsert: false });
    if (error) throw error;
    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  } catch (error) {
    throw error instanceof Error ? error : new Error('Tải ảnh bìa thất bại.');
  }
}

export const uploadBookCover = (authorId: string, uri: string, mimeType = 'image/jpeg') => uploadImage('book-covers', authorId, uri, mimeType);
export const uploadAuthorAvatar = (authorId: string, uri: string, mimeType = 'image/jpeg') => uploadImage('author-avatars', authorId, uri, mimeType);
export const uploadProfileAvatar = (userId: string, uri: string, mimeType = 'image/jpeg') => uploadImage('profile-avatars', userId, uri, mimeType);
