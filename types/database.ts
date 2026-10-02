export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<{ id: string; username: string | null; display_name: string | null; avatar_url: string | null; bio: string | null; role: 'reader' | 'author' | 'admin'; created_at: string; updated_at: string }>;
      authors: Table<{ id: string; user_id: string; pen_name: string; bio: string | null; avatar_url: string | null; followers_count: number; verified: boolean; created_at: string }>;
      books: Table<{ id: string; author_id: string; title: string; slug: string; description: string; cover_url: string | null; language: string; source_type: 'original' | 'licensed_translation' | 'authorized'; status: 'draft' | 'ongoing' | 'completed' | 'paused'; visibility: 'public' | 'private' | 'unlisted'; is_vip: boolean; price_coins: number; rating: number; views_count: number; followers_count: number; total_chapters: number; tags: string[]; created_at: string; updated_at: string }>;
      book_genres: Table<{ book_id: string; genre: string }>;
      chapters: Table<{ id: string; book_id: string; chapter_number: number; title: string; content: string; status: 'draft' | 'published'; is_vip: boolean; price_coins: number; published_at: string | null; created_at: string; updated_at: string }>;
      library: Table<{ user_id: string; book_id: string; status: 'reading' | 'favorite' | 'completed'; added_at: string }>;
      reading_progress: Table<{ user_id: string; book_id: string; chapter_id: string | null; chapter_number: number; progress_percent: number; scroll_position: number; updated_at: string }>;
      bookmarks: Table<{ id: string; user_id: string; book_id: string; chapter_id: string | null; chapter_number: number; position: number; note: string | null; created_at: string }>;
      author_follows: Table<{ user_id: string; author_id: string; created_at: string }>;
      book_follows: Table<{ user_id: string; book_id: string; created_at: string }>;
      comments: Table<{ id: string; user_id: string; book_id: string; chapter_id: string | null; parent_id: string | null; content: string; created_at: string; updated_at: string }>;
      comment_likes: Table<{ user_id: string; comment_id: string }>;
      downloads: Table<{ user_id: string; book_id: string; chapter_id: string; downloaded_at: string }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { user_role: 'reader' | 'author' | 'admin'; book_status: 'draft' | 'ongoing' | 'completed' | 'paused'; chapter_status: 'draft' | 'published'; book_visibility: 'public' | 'private' | 'unlisted'; source_type: 'original' | 'licensed_translation' | 'authorized'; library_status: 'reading' | 'favorite' | 'completed' };
    CompositeTypes: Record<string, never>;
  };
}
