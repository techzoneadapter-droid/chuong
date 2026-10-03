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
      author_payout_profiles: {
        Row: {
          author_id: string
          compliance_note: string | null
          created_at: string
          destination_label: string | null
          kyc_status: string
          payout_method: string
          reviewed_at: string | null
          reviewed_by: string | null
          tax_status: string
          updated_at: string
        }
        Insert: {
          author_id: string
          compliance_note?: string | null
          created_at?: string
          destination_label?: string | null
          kyc_status?: string
          payout_method?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          tax_status?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          compliance_note?: string | null
          created_at?: string
          destination_label?: string | null
          kyc_status?: string
          payout_method?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          tax_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "author_payout_profiles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: true
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "author_payout_profiles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      author_payouts: {
        Row: {
          amount_coins: number
          author_id: string
          created_at: string
          external_reference: string | null
          id: string
          idempotency_key: string | null
          note: string | null
          processed_at: string | null
          processed_by: string | null
          request_snapshot: Json
          requested_at: string
          requested_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["author_payout_status"]
        }
        Insert: {
          amount_coins: number
          author_id: string
          created_at?: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string | null
          note?: string | null
          processed_at?: string | null
          processed_by?: string | null
          request_snapshot?: Json
          requested_at?: string
          requested_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["author_payout_status"]
        }
        Update: {
          amount_coins?: number
          author_id?: string
          created_at?: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string | null
          note?: string | null
          processed_at?: string | null
          processed_by?: string | null
          request_snapshot?: Json
          requested_at?: string
          requested_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["author_payout_status"]
        }
        Relationships: [
          {
            foreignKeyName: "author_payouts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "author_payouts_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "author_payouts_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "author_payouts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      author_revenue_accounts: {
        Row: {
          author_earnings_coins: number
          author_id: string
          gross_sales_coins: number
          paid_out_coins: number
          refunded_coins: number
          refunded_earnings_coins: number
          updated_at: string
        }
        Insert: {
          author_earnings_coins?: number
          author_id: string
          gross_sales_coins?: number
          paid_out_coins?: number
          refunded_coins?: number
          refunded_earnings_coins?: number
          updated_at?: string
        }
        Update: {
          author_earnings_coins?: number
          author_id?: string
          gross_sales_coins?: number
          paid_out_coins?: number
          refunded_coins?: number
          refunded_earnings_coins?: number
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
          author_earnings_coins: number
          author_id: string
          author_share_bps: number | null
          book_entitlement_id: string | null
          book_id: string
          chapter_entitlement_id: string | null
          chapter_id: string | null
          created_at: string
          description: string | null
          gross_coins: number
          id: string
          platform_share_coins: number
          share_policy_id: string | null
          type: Database["public"]["Enums"]["author_revenue_type"]
          wallet_transaction_id: string | null
        }
        Insert: {
          author_earnings_coins?: number
          author_id: string
          author_share_bps?: number | null
          book_entitlement_id?: string | null
          book_id: string
          chapter_entitlement_id?: string | null
          chapter_id?: string | null
          created_at?: string
          description?: string | null
          gross_coins: number
          id?: string
          platform_share_coins?: number
          share_policy_id?: string | null
          type: Database["public"]["Enums"]["author_revenue_type"]
          wallet_transaction_id?: string | null
        }
        Update: {
          author_earnings_coins?: number
          author_id?: string
          author_share_bps?: number | null
          book_entitlement_id?: string | null
          book_id?: string
          chapter_entitlement_id?: string | null
          chapter_id?: string | null
          created_at?: string
          description?: string | null
          gross_coins?: number
          id?: string
          platform_share_coins?: number
          share_policy_id?: string | null
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
            foreignKeyName: "author_revenue_ledger_share_policy_id_fkey"
            columns: ["share_policy_id"]
            isOneToOne: false
            referencedRelation: "revenue_share_policies"
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
      book_engagement_daily: {
        Row: {
          active_seconds: number
          book_id: string
          chapter_completions: number
          chapter_starts: number
          metric_date: string
          new_readers: number
          returning_readers: number
          sessions: number
          unique_readers: number
          updated_at: string
        }
        Insert: {
          active_seconds?: number
          book_id: string
          chapter_completions?: number
          chapter_starts?: number
          metric_date: string
          new_readers?: number
          returning_readers?: number
          sessions?: number
          unique_readers?: number
          updated_at?: string
        }
        Update: {
          active_seconds?: number
          book_id?: string
          chapter_completions?: number
          chapter_starts?: number
          metric_date?: string
          new_readers?: number
          returning_readers?: number
          sessions?: number
          unique_readers?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_engagement_daily_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
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
      book_review_helpful: {
        Row: {
          created_at: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_review_helpful_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "book_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_review_helpful_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      book_reviews: {
        Row: {
          book_id: string
          created_at: string
          helpful_count: number
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_note: string | null
          moderation_state: Database["public"]["Enums"]["moderation_state"]
          rating: number
          review_text: string
          spoiler: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          helpful_count?: number
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          rating: number
          review_text?: string
          spoiler?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          helpful_count?: number
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_note?: string | null
          moderation_state?: Database["public"]["Enums"]["moderation_state"]
          rating?: number
          review_text?: string
          spoiler?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_reviews_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          engagement_score: number
          engagement_updated_at: string | null
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
          rating_count: number
          search_text: string
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
          engagement_score?: number
          engagement_updated_at?: string | null
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
          rating_count?: number
          search_text?: string
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
          engagement_score?: number
          engagement_updated_at?: string | null
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
          rating_count?: number
          search_text?: string
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
      chapter_engagement_daily: {
        Row: {
          active_seconds: number
          book_id: string
          chapter_id: string
          chapter_number: number
          completions: number
          metric_date: string
          sessions: number
          unique_readers: number
          updated_at: string
        }
        Insert: {
          active_seconds?: number
          book_id: string
          chapter_id: string
          chapter_number: number
          completions?: number
          metric_date: string
          sessions?: number
          unique_readers?: number
          updated_at?: string
        }
        Update: {
          active_seconds?: number
          book_id?: string
          chapter_id?: string
          chapter_number?: number
          completions?: number
          metric_date?: string
          sessions?: number
          unique_readers?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_engagement_daily_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_engagement_daily_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
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
      notification_preferences: {
        Row: {
          author_earnings: boolean
          comments: boolean
          created_at: string
          in_app_enabled: boolean
          moderation: boolean
          payouts: boolean
          purchases: boolean
          push_enabled: boolean
          system: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          author_earnings?: boolean
          comments?: boolean
          created_at?: string
          in_app_enabled?: boolean
          moderation?: boolean
          payouts?: boolean
          purchases?: boolean
          push_enabled?: boolean
          system?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          author_earnings?: boolean
          comments?: boolean
          created_at?: string
          in_app_enabled?: boolean
          moderation?: boolean
          payouts?: boolean
          purchases?: boolean
          push_enabled?: boolean
          system?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_route: string | null
          body: string
          category: string
          created_at: string
          dedupe_key: string | null
          event_type: string
          expires_at: string | null
          id: string
          metadata: Json
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_route?: string | null
          body: string
          category: string
          created_at?: string
          dedupe_key?: string | null
          event_type: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_route?: string | null
          body?: string
          category?: string
          created_at?: string
          dedupe_key?: string | null
          event_type?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      push_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          device_id: string
          id: string
          locked_at: string | null
          next_attempt_at: string
          notification_id: string
          receipt_checked_at: string | null
          receipt_error_code: string | null
          receipt_error_message: string | null
          receipt_status: string | null
          sent_at: string | null
          status: string
          ticket_error_code: string | null
          ticket_error_message: string | null
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          device_id: string
          id?: string
          locked_at?: string | null
          next_attempt_at?: string
          notification_id: string
          receipt_checked_at?: string | null
          receipt_error_code?: string | null
          receipt_error_message?: string | null
          receipt_status?: string | null
          sent_at?: string | null
          status?: string
          ticket_error_code?: string | null
          ticket_error_message?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          device_id?: string
          id?: string
          locked_at?: string | null
          next_attempt_at?: string
          notification_id?: string
          receipt_checked_at?: string | null
          receipt_error_code?: string | null
          receipt_error_message?: string | null
          receipt_status?: string | null
          sent_at?: string | null
          status?: string
          ticket_error_code?: string | null
          ticket_error_message?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_deliveries_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "push_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      push_devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_key: string
          device_label: string | null
          enabled: boolean
          expo_push_token: string
          id: string
          invalidated_at: string | null
          invalidation_reason: string | null
          last_seen_at: string
          platform: string
          project_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_key: string
          device_label?: string | null
          enabled?: boolean
          expo_push_token: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          last_seen_at?: string
          platform: string
          project_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_key?: string
          device_label?: string | null
          enabled?: boolean
          expo_push_token?: string
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          last_seen_at?: string
          platform?: string
          project_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reader_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reader_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reader_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reader_book_days: {
        Row: {
          actor_hash: string
          book_id: string
          first_seen_at: string
          last_seen_at: string
          metric_date: string
        }
        Insert: {
          actor_hash: string
          book_id: string
          first_seen_at?: string
          last_seen_at?: string
          metric_date: string
        }
        Update: {
          actor_hash?: string
          book_id?: string
          first_seen_at?: string
          last_seen_at?: string
          metric_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "reader_book_days_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      reader_chapter_days: {
        Row: {
          actor_hash: string
          book_id: string
          chapter_id: string
          chapter_number: number
          first_seen_at: string
          last_seen_at: string
          metric_date: string
        }
        Insert: {
          actor_hash: string
          book_id: string
          chapter_id: string
          chapter_number: number
          first_seen_at?: string
          last_seen_at?: string
          metric_date: string
        }
        Update: {
          actor_hash?: string
          book_id?: string
          chapter_id?: string
          chapter_number?: number
          first_seen_at?: string
          last_seen_at?: string
          metric_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "reader_chapter_days_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reader_chapter_days_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      reader_engagement_sessions: {
        Row: {
          active_seconds: number
          actor_hash: string
          book_id: string
          chapter_id: string
          chapter_number: number
          completed: boolean
          completed_at: string | null
          id: string
          last_seen_at: string
          max_progress: number
          session_hash: string
          started_at: string
          started_date: string
        }
        Insert: {
          active_seconds?: number
          actor_hash: string
          book_id: string
          chapter_id: string
          chapter_number: number
          completed?: boolean
          completed_at?: string | null
          id?: string
          last_seen_at?: string
          max_progress?: number
          session_hash: string
          started_at?: string
          started_date: string
        }
        Update: {
          active_seconds?: number
          actor_hash?: string
          book_id?: string
          chapter_id?: string
          chapter_number?: number
          completed?: boolean
          completed_at?: string | null
          id?: string
          last_seen_at?: string
          max_progress?: number
          session_hash?: string
          started_at?: string
          started_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "reader_engagement_sessions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reader_engagement_sessions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      reader_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reader_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reader_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reader_mutes: {
        Row: {
          created_at: string
          muted_id: string
          muter_id: string
        }
        Insert: {
          created_at?: string
          muted_id: string
          muter_id: string
        }
        Update: {
          created_at?: string
          muted_id?: string
          muter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reader_mutes_muted_id_fkey"
            columns: ["muted_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reader_mutes_muter_id_fkey"
            columns: ["muter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reader_privacy: {
        Row: {
          allow_follows: boolean
          created_at: string
          profile_public: boolean
          show_comments: boolean
          show_reviews: boolean
          show_shelves: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_follows?: boolean
          created_at?: string
          profile_public?: boolean
          show_comments?: boolean
          show_reviews?: boolean
          show_shelves?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_follows?: boolean
          created_at?: string
          profile_public?: boolean
          show_comments?: boolean
          show_reviews?: boolean
          show_shelves?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reader_privacy_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      recommendation_feedback: {
        Row: {
          action: string
          book_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          action?: string
          book_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          action?: string
          book_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_feedback_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_feedback_user_id_fkey"
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
          review_id: string | null
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
          review_id?: string | null
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
          review_id?: string | null
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
          {
            foreignKeyName: "reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "book_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_share_policies: {
        Row: {
          active: boolean
          author_share_bps: number
          created_at: string
          created_by: string | null
          effective_at: string
          ended_at: string | null
          id: string
          note: string | null
        }
        Insert: {
          active?: boolean
          author_share_bps: number
          created_at?: string
          created_by?: string | null
          effective_at?: string
          ended_at?: string | null
          id?: string
          note?: string | null
        }
        Update: {
          active?: boolean
          author_share_bps?: number
          created_at?: string
          created_by?: string | null
          effective_at?: string
          ended_at?: string | null
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_share_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      store_products: {
        Row: {
          active: boolean
          apple_product_id: string | null
          coins: number
          created_at: string
          google_product_id: string | null
          id: string
          metadata: Json
          sku: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          apple_product_id?: string | null
          coins: number
          created_at?: string
          google_product_id?: string | null
          id?: string
          metadata?: Json
          sku: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          apple_product_id?: string | null
          coins?: number
          created_at?: string
          google_product_id?: string | null
          id?: string
          metadata?: Json
          sku?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      store_purchase_events: {
        Row: {
          created_at: string
          details: Json
          event_type: string
          id: string
          purchase_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          purchase_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          purchase_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_purchase_events_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "store_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      store_purchases: {
        Row: {
          coins_granted: number
          coins_to_balance: number
          coins_to_debt: number
          created_at: string
          credited_at: string | null
          external_transaction_id: string
          id: string
          product_id: string
          provider: Database["public"]["Enums"]["store_provider"]
          provider_payload: Json
          receipt_hash: string
          revoked_at: string | null
          state: Database["public"]["Enums"]["store_purchase_state"]
          updated_at: string
          user_id: string
          verified_at: string
        }
        Insert: {
          coins_granted?: number
          coins_to_balance?: number
          coins_to_debt?: number
          created_at?: string
          credited_at?: string | null
          external_transaction_id: string
          id?: string
          product_id: string
          provider: Database["public"]["Enums"]["store_provider"]
          provider_payload?: Json
          receipt_hash: string
          revoked_at?: string | null
          state?: Database["public"]["Enums"]["store_purchase_state"]
          updated_at?: string
          user_id: string
          verified_at?: string
        }
        Update: {
          coins_granted?: number
          coins_to_balance?: number
          coins_to_debt?: number
          created_at?: string
          credited_at?: string | null
          external_transaction_id?: string
          id?: string
          product_id?: string
          provider?: Database["public"]["Enums"]["store_provider"]
          provider_payload?: Json
          receipt_hash?: string
          revoked_at?: string | null
          state?: Database["public"]["Enums"]["store_purchase_state"]
          updated_at?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      store_webhook_events: {
        Row: {
          error_code: string | null
          event_type: string
          external_event_id: string
          id: string
          metadata: Json
          payload_hash: string
          processed_at: string | null
          provider: Database["public"]["Enums"]["store_provider"]
          purchase_id: string | null
          received_at: string
          status: string
        }
        Insert: {
          error_code?: string | null
          event_type: string
          external_event_id: string
          id?: string
          metadata?: Json
          payload_hash: string
          processed_at?: string | null
          provider: Database["public"]["Enums"]["store_provider"]
          purchase_id?: string | null
          received_at?: string
          status?: string
        }
        Update: {
          error_code?: string | null
          event_type?: string
          external_event_id?: string
          id?: string
          metadata?: Json
          payload_hash?: string
          processed_at?: string | null
          provider?: Database["public"]["Enums"]["store_provider"]
          purchase_id?: string | null
          received_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_webhook_events_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "store_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_accounts: {
        Row: {
          balance_coins: number
          debt_coins: number
          lifetime_credited: number
          lifetime_reversed: number
          lifetime_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_coins?: number
          debt_coins?: number
          lifetime_credited?: number
          lifetime_reversed?: number
          lifetime_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_coins?: number
          debt_coins?: number
          lifetime_credited?: number
          lifetime_reversed?: number
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
      admin_get_push_runtime_status: { Args: never; Returns: Json }
      admin_mark_payout_paid: {
        Args: {
          p_external_reference: string
          p_note: string
          p_payout_id: string
        }
        Returns: {
          amount_coins: number
          author_id: string
          created_at: string
          external_reference: string | null
          id: string
          idempotency_key: string | null
          note: string | null
          processed_at: string | null
          processed_by: string | null
          request_snapshot: Json
          requested_at: string
          requested_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["author_payout_status"]
        }
        SetofOptions: {
          from: "*"
          to: "author_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_record_paid_author_payout: {
        Args: {
          p_amount_coins: number
          p_author_id: string
          p_external_reference: string
          p_idempotency_key: string
          p_note: string
        }
        Returns: {
          amount_coins: number
          author_id: string
          created_at: string
          external_reference: string | null
          id: string
          idempotency_key: string | null
          note: string | null
          processed_at: string | null
          processed_by: string | null
          request_snapshot: Json
          requested_at: string
          requested_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["author_payout_status"]
        }
        SetofOptions: {
          from: "*"
          to: "author_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_refund_entitlement: {
        Args: {
          p_entitlement_id: string
          p_entitlement_type: string
          p_idempotency_key: string
          p_reason: string
        }
        Returns: {
          already_refunded: boolean
          balance_coins: number
          refund_transaction_id: string
          refunded_coins: number
        }[]
      }
      admin_review_payout_request: {
        Args: { p_action: string; p_note: string; p_payout_id: string }
        Returns: {
          amount_coins: number
          author_id: string
          created_at: string
          external_reference: string | null
          id: string
          idempotency_key: string | null
          note: string | null
          processed_at: string | null
          processed_by: string | null
          request_snapshot: Json
          requested_at: string
          requested_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["author_payout_status"]
        }
        SetofOptions: {
          from: "*"
          to: "author_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_author_payout_compliance: {
        Args: {
          p_author_id: string
          p_kyc_status: string
          p_note: string
          p_tax_status: string
        }
        Returns: {
          author_id: string
          compliance_note: string | null
          created_at: string
          destination_label: string | null
          kyc_status: string
          payout_method: string
          reviewed_at: string | null
          reviewed_by: string | null
          tax_status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "author_payout_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
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
      admin_set_revenue_share_policy: {
        Args: {
          p_activate?: boolean
          p_author_share_bps: number
          p_note?: string
        }
        Returns: {
          active: boolean
          author_share_bps: number
          created_at: string
          created_by: string | null
          effective_at: string
          ended_at: string | null
          id: string
          note: string | null
        }
        SetofOptions: {
          from: "*"
          to: "revenue_share_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_report: {
        Args: {
          p_report_id: string
          p_resolution_note?: string
          p_status: Database["public"]["Enums"]["report_status"]
        }
        Returns: undefined
      }
      author_cancel_payout_request: {
        Args: { p_payout_id: string }
        Returns: {
          amount_coins: number
          author_id: string
          created_at: string
          external_reference: string | null
          id: string
          idempotency_key: string | null
          note: string | null
          processed_at: string | null
          processed_by: string | null
          request_snapshot: Json
          requested_at: string
          requested_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["author_payout_status"]
        }
        SetofOptions: {
          from: "*"
          to: "author_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      author_request_payout: {
        Args: {
          p_amount_coins: number
          p_idempotency_key: string
          p_note: string
        }
        Returns: {
          amount_coins: number
          author_id: string
          created_at: string
          external_reference: string | null
          id: string
          idempotency_key: string | null
          note: string | null
          processed_at: string | null
          processed_by: string | null
          request_snapshot: Json
          requested_at: string
          requested_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["author_payout_status"]
        }
        SetofOptions: {
          from: "*"
          to: "author_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      author_update_payout_profile: {
        Args: { p_destination_label: string; p_payout_method: string }
        Returns: {
          author_id: string
          compliance_note: string | null
          created_at: string
          destination_label: string | null
          kyc_status: string
          payout_method: string
          reviewed_at: string | null
          reviewed_by: string | null
          tax_status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "author_payout_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_push_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          action_route: string
          attempts: number
          body: string
          category: string
          delivery_id: string
          device_id: string
          expo_push_token: string
          notification_id: string
          title: string
          user_id: string
        }[]
      }
      credit_verified_store_purchase: {
        Args: {
          p_external_transaction_id: string
          p_provider: Database["public"]["Enums"]["store_provider"]
          p_provider_payload?: Json
          p_receipt_hash: string
          p_store_product_id: string
          p_user_id: string
        }
        Returns: {
          coins_granted: number
          coins_to_balance: number
          coins_to_debt: number
          created_at: string
          credited_at: string | null
          external_transaction_id: string
          id: string
          product_id: string
          provider: Database["public"]["Enums"]["store_provider"]
          provider_payload: Json
          receipt_hash: string
          revoked_at: string | null
          state: Database["public"]["Enums"]["store_purchase_state"]
          updated_at: string
          user_id: string
          verified_at: string
        }
        SetofOptions: {
          from: "*"
          to: "store_purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_author_book_engagement: {
        Args: { p_author_id: string; p_days?: number }
        Returns: {
          active_seconds: number
          book_id: string
          chapter_completions: number
          completion_rate: number
          sessions: number
          title: string
          unique_reader_days: number
        }[]
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
      get_author_engagement_daily: {
        Args: { p_author_id: string; p_days?: number }
        Returns: {
          active_seconds: number
          chapter_completions: number
          metric_date: string
          new_readers: number
          returning_readers: number
          sessions: number
          unique_readers: number
        }[]
      }
      get_author_engagement_summary: {
        Args: { p_author_id: string; p_days?: number }
        Returns: {
          active_seconds: number
          avg_session_minutes: number
          chapter_completions: number
          chapter_starts: number
          completion_rate: number
          reader_count: number
          return_rate: number
          returning_readers: number
          sessions: number
        }[]
      }
      get_book_review_summary: {
        Args: { p_book_id: string }
        Returns: {
          average_rating: number
          my_rating: number
          my_review_id: string
          my_review_text: string
          my_spoiler: boolean
          rating_count: number
          star_1: number
          star_2: number
          star_3: number
          star_4: number
          star_5: number
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
      get_community_feed: {
        Args: { p_limit?: number }
        Returns: {
          activity_id: string
          activity_type: string
          actor_avatar_url: string
          actor_name: string
          actor_user_id: string
          body: string
          book_id: string
          book_title: string
          chapter_id: string
          created_at: string
          rating: number
        }[]
      }
      get_my_reader_privacy: {
        Args: never
        Returns: {
          allow_follows: boolean
          created_at: string
          profile_public: boolean
          show_comments: boolean
          show_reviews: boolean
          show_shelves: boolean
          updated_at: string
          user_id: string
        }[]
      }
      get_personalized_book_ids: {
        Args: { p_limit?: number }
        Returns: {
          book_id: string
          personalized: boolean
          reason_label: string
          reason_type: string
          score: number
        }[]
      }
      get_public_genre_counts: {
        Args: { p_limit?: number }
        Returns: {
          book_count: number
          genre: string
        }[]
      }
      get_public_reader_profile: {
        Args: { p_user_id: string }
        Returns: {
          allow_follows: boolean
          avatar_url: string
          bio: string
          created_at: string
          display_name: string
          follower_count: number
          following_count: number
          id: string
          profile_public: boolean
          role: Database["public"]["Enums"]["user_role"]
          show_comments: boolean
          show_reviews: boolean
          show_shelves: boolean
          username: string
          viewer_blocked: boolean
          viewer_follows: boolean
          viewer_muted: boolean
        }[]
      }
      get_public_reader_shelf: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          added_at: string
          author_name: string
          book_id: string
          book_status: Database["public"]["Enums"]["book_status"]
          cover_url: string
          genre: string
          shelf_status: Database["public"]["Enums"]["library_status"]
          title: string
        }[]
      }
      get_push_worker_secret: { Args: never; Returns: string }
      get_reader_public_activity: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          activity_id: string
          activity_type: string
          actor_user_id: string
          body: string
          book_id: string
          book_title: string
          chapter_id: string
          created_at: string
          rating: number
        }[]
      }
      get_unread_notification_count: { Args: never; Returns: number }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: {
          action_route: string | null
          body: string
          category: string
          created_at: string
          dedupe_key: string | null
          event_type: string
          expires_at: string | null
          id: string
          metadata: Json
          read_at: string | null
          title: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_reader_engagement: {
        Args: {
          p_active_seconds?: number
          p_book_id: string
          p_chapter_id: string
          p_chapter_number: number
          p_install_id: string
          p_progress?: number
          p_session_id: string
        }
        Returns: {
          accepted: boolean
          new_reader_day: boolean
          session_completed: boolean
        }[]
      }
      register_push_device: {
        Args: {
          p_app_version: string
          p_device_key: string
          p_device_label: string
          p_expo_push_token: string
          p_platform: string
          p_project_id: string
        }
        Returns: {
          app_version: string | null
          created_at: string
          device_key: string
          device_label: string | null
          enabled: boolean
          expo_push_token: string
          id: string
          invalidated_at: string | null
          invalidation_reason: string | null
          last_seen_at: string
          platform: string
          project_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "push_devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_revoked_store_purchase: {
        Args: {
          p_external_transaction_id: string
          p_provider: Database["public"]["Enums"]["store_provider"]
          p_provider_payload?: Json
          p_reason: string
        }
        Returns: {
          coins_granted: number
          coins_to_balance: number
          coins_to_debt: number
          created_at: string
          credited_at: string | null
          external_transaction_id: string
          id: string
          product_id: string
          provider: Database["public"]["Enums"]["store_provider"]
          provider_payload: Json
          receipt_hash: string
          revoked_at: string | null
          state: Database["public"]["Enums"]["store_purchase_state"]
          updated_at: string
          user_id: string
          verified_at: string
        }
        SetofOptions: {
          from: "*"
          to: "store_purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_verified_store_purchase: {
        Args: {
          p_external_transaction_id: string
          p_provider: Database["public"]["Enums"]["store_provider"]
          p_provider_payload?: Json
          p_reason: string
        }
        Returns: {
          coins_granted: number
          coins_to_balance: number
          coins_to_debt: number
          created_at: string
          credited_at: string | null
          external_transaction_id: string
          id: string
          product_id: string
          provider: Database["public"]["Enums"]["store_provider"]
          provider_payload: Json
          receipt_hash: string
          revoked_at: string | null
          state: Database["public"]["Enums"]["store_purchase_state"]
          updated_at: string
          user_id: string
          verified_at: string
        }
        SetofOptions: {
          from: "*"
          to: "store_purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_public_book_ids: {
        Args: {
          p_access?: string
          p_genre?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_sort?: string
          p_status?: string
        }
        Returns: {
          book_id: string
          relevance: number
          total_count: number
        }[]
      }
      search_public_readers: {
        Args: { p_limit?: number; p_query?: string }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          follower_count: number
          id: string
          role: Database["public"]["Enums"]["user_role"]
          username: string
          viewer_follows: boolean
        }[]
      }
      set_reader_block: {
        Args: { p_blocked?: boolean; p_target_id: string }
        Returns: boolean
      }
      set_reader_follow: {
        Args: { p_following?: boolean; p_target_id: string }
        Returns: boolean
      }
      set_reader_mute: {
        Args: { p_muted?: boolean; p_target_id: string }
        Returns: boolean
      }
      set_recommendation_hidden: {
        Args: { p_book_id: string; p_hidden?: boolean }
        Returns: boolean
      }
      sync_reading_progress: {
        Args: {
          p_book_id: string
          p_chapter_id: string
          p_chapter_number: number
          p_progress_percent: number
          p_scroll_position: number
          p_updated_at: string
        }
        Returns: {
          book_id: string
          chapter_id: string | null
          chapter_number: number
          progress_percent: number
          scroll_position: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "reading_progress"
          isOneToOne: true
          isSetofReturn: false
        }
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
      unregister_all_push_devices: { Args: never; Returns: number }
      unregister_push_device: {
        Args: { p_device_key: string }
        Returns: boolean
      }
      update_notification_preferences: {
        Args: {
          p_author_earnings: boolean
          p_comments: boolean
          p_in_app_enabled: boolean
          p_moderation: boolean
          p_payouts: boolean
          p_purchases: boolean
          p_push_enabled: boolean
          p_system: boolean
        }
        Returns: {
          author_earnings: boolean
          comments: boolean
          created_at: string
          in_app_enabled: boolean
          moderation: boolean
          payouts: boolean
          purchases: boolean
          push_enabled: boolean
          system: boolean
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notification_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_reader_privacy: {
        Args: {
          p_allow_follows: boolean
          p_profile_public: boolean
          p_show_comments: boolean
          p_show_reviews: boolean
          p_show_shelves: boolean
        }
        Returns: {
          allow_follows: boolean
          created_at: string
          profile_public: boolean
          show_comments: boolean
          show_reviews: boolean
          show_shelves: boolean
          updated_at: string
          user_id: string
        }[]
      }
    }
    Enums: {
      author_payout_status: "pending" | "approved" | "paid" | "cancelled"
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
      store_provider: "google_play" | "app_store"
      store_purchase_state: "verified" | "credited" | "revoked" | "rejected"
      user_role: "reader" | "author" | "admin"
      wallet_transaction_type:
        | "purchase_credit"
        | "unlock_debit"
        | "refund_credit"
        | "promo_credit"
        | "admin_credit"
        | "admin_debit"
        | "author_payout_debit"
        | "purchase_reversal_debit"
        | "refund_reversal_credit"
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
      author_payout_status: ["pending", "approved", "paid", "cancelled"],
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
      store_provider: ["google_play", "app_store"],
      store_purchase_state: ["verified", "credited", "revoked", "rejected"],
      user_role: ["reader", "author", "admin"],
      wallet_transaction_type: [
        "purchase_credit",
        "unlock_debit",
        "refund_credit",
        "promo_credit",
        "admin_credit",
        "admin_debit",
        "author_payout_debit",
        "purchase_reversal_debit",
        "refund_reversal_credit",
      ],
    },
  },
} as const
