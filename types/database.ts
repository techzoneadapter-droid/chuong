export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      author_follows: {
        Row: {
          author_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "author_follows_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "author_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      author_revenue_accounts: {
        Row: {
          author_id: string
          gross_sales_coins: number
          refunded_coins: number
          updated_at: string
        }
        Insert: {
          author_id: string
          gross_sales_coins?: number
          refunded_coins?: number
          updated_at?: string
        }
        Update: {
          author_id?: string
          gross_sales_coins?: number
          refunded_coins?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "author_revenue_accounts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: true
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
        ]
      }
      author_revenue_ledger: {
        Row: {
          author_id: string
          book_entitlement_id: string | null
          book_id: string
          chapter_entitlement_id: string | null
          chapter_id: string | null
          created_at: string
          description: string | null
          gross_coins: number
          id: string
          type: Database["public"]["Enums"]["author_revenue_type"]
          wallet_transaction_id: string | null
        }
        Insert: {
          author_id: string
          book_entitlement_id?: string | null
          book_id: string
          chapter_entitlement_id?: string | null
          chapter_id?: string | null
          created_at?: string
          description?: string | null
          gross_coins: number
          id?: string
          type: Database["public"]["Enums"]["author_revenue_type"]
          wallet_transaction_id?: string | null
        }
        Update: {
          author_id?: string
          book_entitlement_id?: string | null
          book_id?: string
          chapter_entitlement_id?: string | null
          chapter_id?: string | null
          created_at?: string
          description?: string | null
          gross_coins?: number
          id?: string
          type?: Database["public"]["Enums"]["author_revenue_type"]
          wallet_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "author_revenue_ledger_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "author_revenue_ledger_book_entitlement_id_fkey"
            columns: ["book_entitlement_id"]
            isOneToOne: false
            referencedRelation: "book_entitlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "author_revenue_ledger_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "author_revenue_ledger_chapter_entitlement_id_fkey"
            columns: ["chapter_entitlement_id"]
            isOneToOne: false
            referencedRelation: "chapter_entitlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "author_revenue_ledger_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "author_revenue_ledger_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      authors: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          followers_count: number
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_note: string | null
          moderation_state: Database["public"]["Enums"]["moderation_state"]
          pen_name: string
          user_id: string
          verified: boolean
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          followers_count?: number
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          pen_name: string
          user_id: string
          verified?: boolean
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          followers_count?: number
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          pen_name?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "authors_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      book_entitlements: {
        Row: {
          book_id: string
          granted_at: string
          id: string
          price_paid_coins: number
          revoked_at: string | null
          source: Database["public"]["Enums"]["entitlement_source"]
          user_id: string
          wallet_transaction_id: string | null
        }
        Insert: {
          book_id: string
          granted_at?: string
          id?: string
          price_paid_coins?: number
          revoked_at?: string | null
          source?: Database["public"]["Enums"]["entitlement_source"]
          user_id: string
          wallet_transaction_id?: string | null
        }
        Update: {
          book_id?: string
          granted_at?: string
          id?: string
          price_paid_coins?: number
          revoked_at?: string | null
          source?: Database["public"]["Enums"]["entitlement_source"]
          user_id?: string
          wallet_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_entitlements_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_entitlements_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      book_follows: {
        Row: {
          book_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_follows_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_follows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      book_genres: {
        Row: {
          book_id: string
          genre: string
        }
        Insert: {
          book_id: string
          genre: string
        }
        Update: {
          book_id?: string
          genre?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_genres_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          book_id: string
          chapter_id: string | null
          chapter_number: number
          created_at: string
          id: string
          note: string | null
          position: number
          user_id: string
        }
        Insert: {
          book_id: string
          chapter_id?: string | null
          chapter_number: number
          created_at?: string
          id?: string
          note?: string | null
          position?: number
          user_id: string
        }
        Update: {
          book_id?: string
          chapter_id?: string | null
          chapter_number?: number
          created_at?: string
          id?: string
          note?: string | null
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author_id: string
          cover_url: string | null
          created_at: string
          description: string
          followers_count: number
          id: string
          is_vip: boolean
          language: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_note: string | null
          moderation_state: Database["public"]["Enums"]["moderation_state"]
          price_coins: number
          rating: number
          slug: string
          source_type: Database["public"]["Enums"]["source_type"]
          status: Database["public"]["Enums"]["book_status"]
          tags: string[]
          title: string
          total_chapters: number
          updated_at: string
          views_count: number
          visibility: Database["public"]["Enums"]["book_visibility"]
        }
        Insert: {
          author_id: string
          cover_url?: string | null
          created_at?: string
          description?: string
          followers_count?: number
          id?: string
          is_vip?: boolean
          language?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          price_coins?: number
          rating?: number
          slug: string
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["book_status"]
          tags?: string[]
          title: string
          total_chapters?: number
          updated_at?: string
          views_count?: number
          visibility?: Database["public"]["Enums"]["book_visibility"]
        }
        Update: {
          author_id?: string
          cover_url?: string | null
          created_at?: string
          description?: string
          followers_count?: number
          id?: string
          is_vip?: boolean
          language?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          price_coins?: number
          rating?: number
          slug?: string
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["book_status"]
          tags?: string[]
          title?: string
          total_chapters?: number
          updated_at?: string
          views_count?: number
          visibility?: Database["public"]["Enums"]["book_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "books_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "books_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_entitlements: {
        Row: {
          book_id: string
          chapter_id: string
          granted_at: string
          id: string
          price_paid_coins: number
          revoked_at: string | null
          source: Database["public"]["Enums"]["entitlement_source"]
          user_id: string
          wallet_transaction_id: string | null
        }
        Insert: {
          book_id: string
          chapter_id: string
          granted_at?: string
          id?: string
          price_paid_coins?: number
          revoked_at?: string | null
          source?: Database["public"]["Enums"]["entitlement_source"]
          user_id: string
          wallet_transaction_id?: string | null
        }
        Update: {
          book_id?: string
          chapter_id?: string
          granted_at?: string
          id?: string
          price_paid_coins?: number
          revoked_at?: string | null
          source?: Database["public"]["Enums"]["entitlement_source"]
          user_id?: string
          wallet_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapter_entitlements_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_entitlements_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_entitlements_wallet_transaction_id_fkey"
            columns: ["wallet_transaction_id"]
            isOneToOne: false
            referencedRelation: "wallet_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          book_id: string
          chapter_number: number
          content: string
          created_at: string
          id: string
          is_vip: boolean
          moderated_at: string | null
          moderated_by: string | null
          moderation_note: string | null
          moderation_state: Database["public"]["Enums"]["moderation_state"]
          price_coins: number
          published_at: string | null
          status: Database["public"]["Enums"]["chapter_status"]
          title: string
          updated_at: string
        }
        Insert: {
          book_id: string
          chapter_number: number
          content?: string
          created_at?: string
          id?: string
          is_vip?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          price_coins?: number
          published_at?: string | null
          status?: Database["public"]["Enums"]["chapter_status"]
          title: string
          updated_at?: string
        }
        Update: {
          book_id?: string
          chapter_number?: number
          content?: string
          created_at?: string
          id?: string
          is_vip?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          price_coins?: number
          published_at?: string | null
          status?: Database["public"]["Enums"]["chapter_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_likes: {
        Row: {
          comment_id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          user_id: string
        }
        Update: {
          comment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          book_id: string
          chapter_id: string | null
          content: string
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_note: string | null
          moderation_state: Database["public"]["Enums"]["moderation_state"]
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          chapter_id?: string | null
          content: string
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          chapter_id?: string | null
          content?: string
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      downloads: {
        Row: {
          book_id: string
          chapter_id: string
          downloaded_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          chapter_id: string
          downloaded_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          chapter_id?: string
          downloaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "downloads_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "downloads_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "downloads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library: {
        Row: {
          added_at: string
          book_id: string
          status: Database["public"]["Enums"]["library_status"]
          user_id: string
        }
        Insert: {
          added_at?: string
          book_id: string
          status?: Database["public"]["Enums"]["library_status"]
          user_id: string
        }
        Update: {
          added_at?: string
          book_id?: string
          status?: Database["public"]["Enums"]["library_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          report_id: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          report_id?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          report_id?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      reading_progress: {
        Row: {
          book_id: string
          chapter_id: string | null
          chapter_number: number
          progress_percent: number
          scroll_position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          chapter_id?: string | null
          chapter_number: number
          progress_percent?: number
          scroll_position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          chapter_id?: string | null
          chapter_number?: number
          progress_percent?: number
          scroll_position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_progress_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_progress_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          assigned_admin_id: string | null
          author_id: string | null
          book_id: string | null
          chapter_id: string | null
          comment_id: string | null
          created_at: string
          details: string
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string | null
          resolution_note: string | null
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        Insert: {
          assigned_admin_id?: string | null
          author_id?: string | null
          book_id?: string | null
          chapter_id?: string | null
          comment_id?: string | null
          created_at?: string
          details?: string
          id?: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string | null
          resolution_note?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Update: {
          assigned_admin_id?: string | null
          author_id?: string | null
          book_id?: string | null
          chapter_id?: string | null
          comment_id?: string | null
          created_at?: string
          details?: string
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string | null
          resolution_note?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_accounts: {
        Row: {
          balance_coins: number
          lifetime_credited: number
          lifetime_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_coins?: number
          lifetime_credited?: number
          lifetime_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_coins?: number
          lifetime_credited?: number
          lifetime_spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount_coins: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          reference_id: string | null
          reference_type: string | null
          type: Database["public"]["Enums"]["wallet_transaction_type"]
          user_id: string
        }
        Insert: {
          amount_coins: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          reference_id?: string | null
          reference_type?: string | null
          type: Database["public"]["Enums"]["wallet_transaction_type"]
          user_id: string
        }
        Update: {
          amount_coins?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          reference_id?: string | null
          reference_type?: string | null
          type?: Database["public"]["Enums"]["wallet_transaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_wallet: {
        Args: {
          p_amount: number
          p_idempotency_key?: string
          p_reason: string
          p_user_id: string
        }
        Returns: {
          balance_coins: number
          transaction_id: string
        }[]
      }
      admin_set_moderation: {
        Args: {
          p_reason?: string
          p_report_id?: string
          p_state: Database["public"]["Enums"]["moderation_state"]
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      admin_update_report: {
        Args: {
          p_report_id: string
          p_resolution_note?: string
          p_status: Database["public"]["Enums"]["report_status"]
        }
        Returns: undefined
      }
      get_author_chapter_for_editing: {
        Args: { p_book_id: string; p_chapter_id: string }
        Returns: {
          book_id: string
          chapter_number: number
          content: string
          created_at: string
          id: string
          is_vip: boolean
          price_coins: number
          published_at: string
          status: Database["public"]["Enums"]["chapter_status"]
          title: string
          updated_at: string
        }[]
      }
      get_chapter_for_reading: {
        Args: { p_book_id: string; p_chapter_number: number }
        Returns: {
          book_id: string
          chapter_number: number
          content: string
          created_at: string
          id: string
          is_vip: boolean
          lock_kind: string
          lock_price_coins: number
          price_coins: number
          published_at: string
          status: Database["public"]["Enums"]["chapter_status"]
          title: string
          updated_at: string
        }[]
      }
      unlock_book: {
        Args: { p_book_id: string; p_idempotency_key: string }
        Returns: {
          already_unlocked: boolean
          balance_coins: number
          entitlement_id: string
          price_paid_coins: number
          unlocked: boolean
        }[]
      }
      unlock_chapter: {
        Args: { p_chapter_id: string; p_idempotency_key: string }
        Returns: {
          already_unlocked: boolean
          balance_coins: number
          entitlement_id: string
          price_paid_coins: number
          unlocked: boolean
        }[]
      }
    }
    Enums: {
      author_revenue_type: "sale" | "refund" | "adjustment"
      book_status: "draft" | "ongoing" | "completed" | "paused"
      book_visibility: "public" | "private" | "unlisted"
      chapter_status: "draft" | "published"
      entitlement_source:
        | "coin_unlock"
        | "admin_grant"
        | "promo"
        | "refund_restore"
      library_status: "reading" | "favorite" | "completed"
      moderation_state: "approved" | "hidden" | "rejected"
      report_reason:
        | "copyright"
        | "plagiarism"
        | "spam"
        | "harassment"
        | "inappropriate"
        | "impersonation"
        | "other"
      report_status: "open" | "reviewing" | "resolved" | "rejected"
      source_type: "original" | "licensed_translation" | "authorized"
      user_role: "reader" | "author" | "admin"
      wallet_transaction_type:
        | "purchase_credit"
        | "unlock_debit"
        | "refund_credit"
        | "promo_credit"
        | "admin_credit"
        | "admin_debit"
        | "author_payout_debit"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      author_revenue_type: ["sale", "refund", "adjustment"],
      book_status: ["draft", "ongoing", "completed", "paused"],
      book_visibility: ["public", "private", "unlisted"],
      chapter_status: ["draft", "published"],
      entitlement_source: [
        "coin_unlock",
        "admin_grant",
        "promo",
        "refund_restore",
      ],
      library_status: ["reading", "favorite", "completed"],
      moderation_state: ["approved", "hidden", "rejected"],
      report_reason: [
        "copyright",
        "plagiarism",
        "spam",
        "harassment",
        "inappropriate",
        "impersonation",
        "other",
      ],
      report_status: ["open", "reviewing", "resolved", "rejected"],
      source_type: ["original", "licensed_translation", "authorized"],
      user_role: ["reader", "author", "admin"],
      wallet_transaction_type: [
        "purchase_credit",
        "unlock_debit",
        "refund_credit",
        "promo_credit",
        "admin_credit",
        "admin_debit",
        "author_payout_debit",
      ],
    },
  },
} as const
