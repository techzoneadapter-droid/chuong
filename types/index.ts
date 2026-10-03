export type ChapterAccess = 'free' | 'vip';
export type UserRole = 'reader' | 'author' | 'admin';
export type BookStatus = 'draft' | 'ongoing' | 'completed' | 'paused';
export type ChapterStatus = 'draft' | 'published';
export type BookVisibility = 'public' | 'private' | 'unlisted';
export type LibraryStatus = 'reading' | 'favorite' | 'completed';
export type SourceType = 'original' | 'licensed_translation' | 'authorized';

export interface Chapter {
  id?: string;
  bookId?: string;
  number: number;
  title: string;
  content?: string;
  date: string;
  relativeDate: string;
  access: ChapterAccess;
  priceCoins?: number;
  status?: ChapterStatus;
  publishedAt?: string | null;
  updatedAt?: string | null;
  offline?: boolean;
  isRead: boolean;
  isDownloaded: boolean;
}

export interface Book {
  id: string;
  authorId?: string;
  title: string;
  slug?: string;
  author: string;
  authorFollowers: string;
  authorAvatarUrl?: string | null;
  cover: string;
  coverUrl?: string | null;
  genre: string;
  rating: number;
  views: string;
  viewsCount?: number;
  followers: string;
  followersCount?: number;
  status: string;
  backendStatus?: BookStatus;
  visibility?: BookVisibility;
  language?: string;
  sourceType?: SourceType;
  description: string;
  tags: string[];
  totalChapters: number;
  latestChapter: number;
  publishedChapters?: number;
  draftChapters?: number;
  isVip: boolean;
  price: number;
  progress: number;
  chapters: Chapter[];
}

export interface Profile {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface Author {
  id: string;
  userId: string;
  penName: string;
  bio: string | null;
  avatarUrl: string | null;
  followersCount: number;
  verified: boolean;
  createdAt: string;
}

export interface LibraryEntry {
  userId?: string;
  bookId: string;
  status: LibraryStatus;
  addedAt: string;
  book?: Book;
}

export interface ReadingProgress {
  userId?: string;
  bookId: string;
  chapterId?: string | null;
  chapterNumber: number;
  progressPercent: number;
  scrollPosition: number;
  updatedAt: string;
}

export interface Bookmark {
  id: string;
  userId?: string;
  bookId: string;
  chapterId?: string | null;
  chapterNumber: number;
  position: number;
  note?: string | null;
  createdAt: string;
}

export interface AuthorBookInput {
  title: string;
  penName: string;
  description: string;
  genre: string;
  tags: string[];
  language: string;
  status: BookStatus;
  coverUrl: string | null;
  sourceType: SourceType;
}

export interface ChapterInput {
  id?: string;
  bookId: string;
  chapterNumber: number;
  title: string;
  content: string;
  status: ChapterStatus;
  isVip: boolean;
  priceCoins: number;
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type DataMode = 'supabase' | 'demo' | 'offline';

export type ReaderFont = 'default' | 'serif' | 'sans';
export type ReaderSpacing = 'compact' | 'normal' | 'relaxed';
export type ReaderTheme = 'white' | 'paper' | 'night' | 'amoled';
export type ReaderMode = 'scroll' | 'page';

export interface ReaderSettings {
  fontSize: number;
  font: ReaderFont;
  spacing: ReaderSpacing;
  theme: ReaderTheme;
  padding: number;
  mode: ReaderMode;
}

export interface CommentItem {
  id: string;
  name: string;
  avatar: string;
  body: string;
  time: string;
  likes: number;
}

export interface ServiceResult<T> {
  data: T;
  mode: DataMode;
}

export interface ServiceError extends Error {
  code?: string;
}

export interface DiscussionComment {
  id: string;
  userId: string;
  parentId: string | null;
  name: string;
  avatarUrl: string | null;
  content: string;
  createdAt: string;
  likes: number;
  liked: boolean;
}
