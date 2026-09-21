/**
 * Database types.
 *
 * Mirrors supabase/migrations. Once the project is linked you can regenerate
 * this file instead of maintaining it by hand:
 *
 *   npx supabase gen types typescript --project-id <id> --schema public \
 *     > src/types/database.ts
 */

export type UserRole = 'user' | 'moderator' | 'admin';
export type AdKind = 'classified' | 'display';
export type PaymentStatus = 'created' | 'pending' | 'paid' | 'failed' | 'refunded';
export type ReportReason =
  | 'spam'
  | 'fraud'
  | 'incorrect'
  | 'offensive'
  | 'unavailable'
  | 'other';
export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';
export type AdStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  /** Sent back to the advertiser with a message, for correction and resubmission. */
  | 'changes_requested'
  | 'expired'
  | 'sold';

/** What a moderator can decide. Mirrors `moderate_advertisement()`. */
export type ModerationAction =
  | 'approve'
  | 'reject'
  | 'request_changes'
  | 'unpublish'
  | 'expire'
  | 'restore';
export type PriceType = 'fixed' | 'negotiable' | 'on_call' | 'free';
export type RenewalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';
export type RenewalTiming = 'early' | 'after_expiry';
export type LocationKind = 'district' | 'city' | 'area';

export interface Database {
  public: {
    Tables: {
      app_settings: {
        Row: { key: string; value: unknown; description: string | null; updated_at: string };
        Insert: { key: string; value: unknown; description?: string | null };
        Update: { value?: unknown; description?: string | null };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          email: string | null;
          role: UserRole;
          is_blocked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          phone?: string | null;
          email?: string | null;
        };
        /**
         * `role` is absent on purpose. `guard_profile_privileges()` refuses a
         * role change from anyone but an administrator or a trusted
         * connection, and there is no interface anywhere in this application
         * that grants one — promoting somebody is done in the SQL editor. A
         * type that offered the column would be an invitation to build that
         * interface.
         *
         * `is_blocked` is here because the admin users page does change it,
         * and the same trigger refuses it from anyone but an administrator.
         */
        Update: {
          full_name?: string;
          phone?: string | null;
          email?: string | null;
          is_blocked?: boolean;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          parent_id: string | null;
          slug: string;
          name: string;
          description: string | null;
          icon: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          parent_id?: string | null;
          slug: string;
          name: string;
          description?: string | null;
          icon?: string | null;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
        Relationships: [];
      };
      locations: {
        Row: {
          id: string;
          parent_id: string | null;
          slug: string;
          name: string;
          kind: LocationKind;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          parent_id?: string | null;
          slug: string;
          name: string;
          kind: LocationKind;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['locations']['Insert']>;
        Relationships: [];
      };
      ads: {
        Row: {
          id: string;
          reference: string;
          slug: string;
          kind: AdKind;
          user_id: string;
          category_id: string | null;
          location_id: string;
          title: string;
          description: string;
          price: number | null;
          price_type: PriceType;
          attributes: Record<string, unknown>;
          contact_name: string;
          contact_phone: string;
          contact_whatsapp: string | null;
          contact_email: string | null;
          show_phone: boolean;
          show_whatsapp: boolean;
          status: AdStatus;
          rejection_reason: string | null;
          is_featured: boolean;
          featured_until: string | null;
          published_at: string | null;
          expires_at: string | null;
          view_count: number;
          package_id: string | null;
          package_price_paise: number | null;
          created_at: string;
          updated_at: string;
        };
        /**
         * What a client may actually send. `reference`, `slug`, the
         * publication window, the view count and the stamped price are absent
         * because migration 0007 revokes the privilege to insert them — a
         * statement naming one of those columns is refused by Postgres before
         * any row is built, so leaving them out here is a description of the
         * schema rather than a convention.
         */
        Insert: {
          kind?: AdKind;
          user_id: string;
          category_id?: string | null;
          location_id: string;
          title: string;
          description: string;
          price?: number | null;
          price_type?: PriceType;
          attributes?: Record<string, unknown>;
          contact_name: string;
          contact_phone: string;
          contact_whatsapp?: string | null;
          contact_email?: string | null;
          show_phone?: boolean;
          show_whatsapp?: boolean;
          status?: Extract<AdStatus, 'draft' | 'pending'>;
          package_id?: string | null;
        };
        Update: Partial<
          Omit<Database['public']['Tables']['ads']['Insert'], 'user_id'>
        > & { status?: AdStatus; rejection_reason?: string | null };
        Relationships: [];
      };
      ad_images: {
        Row: {
          id: string;
          ad_id: string;
          storage_path: string;
          width: number | null;
          height: number | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          ad_id: string;
          storage_path: string;
          width?: number | null;
          height?: number | null;
          sort_order?: number;
        };
        Update: Partial<Database['public']['Tables']['ad_images']['Insert']>;
        Relationships: [];
      };
      packages: {
        Row: {
          id: string;
          name: string;
          summary: string;
          features: string[];
          price_paise: number | null;
          duration_days: number | null;
          max_images: number;
          featured_eligible: boolean;
          sort_order: number;
          is_active: boolean;
          /** Listing precedence for the paid-package phase; not used yet. */
          priority: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          summary: string;
          features?: string[];
          price_paise?: number | null;
          duration_days?: number | null;
          max_images?: number;
          featured_eligible?: boolean;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['packages']['Insert']>;
        Relationships: [];
      };
      display_ad_details: {
        Row: {
          ad_id: string;
          organisation_name: string;
          website: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          ad_id: string;
          organisation_name: string;
          website?: string | null;
          notes?: string | null;
        };
        Update: Partial<Omit<Database['public']['Tables']['display_ad_details']['Insert'], 'ad_id'>>;
        Relationships: [];
      };
      ad_artwork: {
        Row: {
          id: string;
          ad_id: string;
          storage_path: string;
          file_name: string;
          content_type: string;
          byte_size: number;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          ad_id: string;
          storage_path: string;
          file_name: string;
          content_type: string;
          byte_size: number;
          sort_order?: number;
        };
        Update: Partial<Database['public']['Tables']['ad_artwork']['Insert']>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          ad_id: string;
          user_id: string;
          package_id: string;
          amount_paise: number;
          currency: string;
          status: PaymentStatus;
          provider: string | null;
          provider_order_id: string | null;
          provider_payment_id: string | null;
          failure_reason: string | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        /**
         * `amount_paise`, `user_id` and `package_id` are overwritten by
         * `stamp_payment_amount()` from the advertisement. They are required
         * here only because the columns are NOT NULL; what is sent is ignored.
         */
        Insert: {
          ad_id: string;
          user_id: string;
          package_id: string;
          amount_paise: number;
          provider?: string | null;
          provider_order_id?: string | null;
        };
        Update: {
          provider?: string | null;
          provider_order_id?: string | null;
          provider_payment_id?: string | null;
        };
        Relationships: [];
      };
      ad_reports: {
        Row: {
          id: string;
          ad_id: string;
          reporter_id: string | null;
          reason: ReportReason;
          details: string | null;
          status: ReportStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          ad_id: string;
          reporter_id?: string | null;
          reason: ReportReason;
          details?: string | null;
        };
        Update: {
          status?: ReportStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        };
        Relationships: [];
      };
      favourites: {
        Row: { user_id: string; ad_id: string; created_at: string };
        Insert: { user_id: string; ad_id: string };
        Update: never;
        Relationships: [];
      };
      /** Written only by the lifecycle functions; read by the owner and staff. */
      ad_renewals: {
        Row: {
          id: string;
          ad_id: string;
          user_id: string;
          renewal_number: number;
          package_id: string;
          timing: RenewalTiming;
          previous_published_at: string | null;
          previous_expires_at: string | null;
          status: RenewalStatus;
          requested_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          new_published_at: string | null;
          new_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          occurred_at: string;
          actor_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          summary: string | null;
          before: Record<string, unknown> | null;
          after: Record<string, unknown> | null;
        };
        /** Written only by SECURITY DEFINER triggers; never from the client. */
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      category_ad_counts: {
        Row: {
          category_id: string;
          slug: string;
          parent_id: string | null;
          live_ad_count: number;
        };
        Relationships: [];
      };
      location_ad_counts: {
        Row: {
          location_id: string;
          slug: string;
          parent_id: string | null;
          live_ad_count: number;
        };
        Relationships: [];
      };
      /**
       * The public read path. Approved and unexpired only, with a telephone
       * number present only where the advertiser consented, and no contact
       * email at any consent level.
       */
      public_ads: {
        Row: {
          id: string;
          reference: string;
          slug: string;
          kind: AdKind;
          title: string;
          description: string;
          price: number | null;
          price_type: PriceType;
          attributes: Record<string, unknown>;
          category_id: string | null;
          category_slug: string | null;
          category_name: string | null;
          location_id: string;
          location_slug: string | null;
          location_name: string | null;
          contact_name: string;
          contact_phone: string | null;
          contact_whatsapp: string | null;
          is_featured: boolean;
          published_at: string | null;
          updated_at: string;
          expires_at: string | null;
          view_count: number;
          package_id: string | null;
          /** Computed in the view so the listing filters and sorts in SQL. */
          image_count: number;
          cover_image_path: string | null;
          format: 'line' | 'boxed' | 'photo' | 'featured';
        };
        Relationships: [];
      };
      /** Your own advertisements, in any state, with your own contact details. */
      owner_ads: {
        Row: AdRow & {
          category_slug: string | null;
          category_name: string | null;
          location_slug: string | null;
          location_name: string | null;
        };
        Relationships: [];
      };
      /** Every advertisement — empty unless the caller is staff. */
      moderation_ads: {
        Row: AdRow & {
          advertiser_name: string;
          advertiser_email: string | null;
          advertiser_phone: string | null;
          advertiser_since: string;
          advertiser_blocked: boolean;
          category_slug: string | null;
          category_name: string | null;
          location_slug: string | null;
          location_name: string | null;
          image_count: number;
          artwork_count: number;
          open_report_count: number;
          hours_waiting: number;
          /** Who made the most recent status decision, from the audit trail. */
          last_decision_at: string | null;
          last_decision_by: string | null;
          /** Approved, but past its expiry and not yet swept. Not public either way. */
          is_lapsed: boolean;
          pending_renewal_id: string | null;
          pending_renewal_timing: RenewalTiming | null;
          pending_renewal_requested_at: string | null;
          pending_renewal_package_id: string | null;
          renewal_count: number;
        };
        Relationships: [];
      };
      /** The audit trail with the actor and the advertisement resolved. */
      admin_actions: {
        Row: {
          id: number;
          occurred_at: string;
          action: string;
          entity: string;
          entity_id: string | null;
          summary: string | null;
          before: Record<string, unknown> | null;
          after: Record<string, unknown> | null;
          actor_id: string | null;
          actor_name: string | null;
          actor_role: UserRole | null;
          ad_reference: string | null;
          ad_title: string | null;
          previous_status: string | null;
          new_status: string | null;
          note: string | null;
          /** The lifecycle event name — expired_automatically, renewal_requested, … */
          event: string | null;
        };
        Relationships: [];
      };
      moderation_reports: {
        Row: {
          id: string;
          ad_id: string;
          reason: ReportReason;
          details: string | null;
          status: ReportStatus;
          created_at: string;
          reviewed_at: string | null;
          reporter_id: string | null;
          reporter_name: string | null;
          reviewer_name: string | null;
          ad_reference: string | null;
          ad_title: string | null;
          ad_slug: string | null;
          ad_status: AdStatus | null;
        };
        Relationships: [];
      };
      admin_users: {
        Row: {
          id: string;
          full_name: string;
          email: string | null;
          role: UserRole;
          is_blocked: boolean;
          created_at: string;
          ad_count: number;
          live_ad_count: number;
          last_submission_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      expire_stale_ads: { Args: Record<string, never>; Returns: number };
      /** The idempotent expiry sweep. Trusted connection or staff only. */
      expire_advertisements: { Args: Record<string, never>; Returns: number };
      package_duration_days: { Args: { p_package_id: string }; Returns: number };
      request_renewal: { Args: { p_ad_id: string; p_package_id: string }; Returns: string };
      approve_renewal: { Args: { p_renewal_id: string; p_note?: string | null }; Returns: string };
      reject_renewal: { Args: { p_renewal_id: string; p_note: string }; Returns: undefined };
      extend_advertisement_expiry: {
        Args: { p_ad_id: string; p_new_expires_at: string; p_reason: string };
        Returns: string;
      };
      expired_ad_stub: {
        Args: { p_slug: string };
        Returns: Array<{
          slug: string;
          title: string;
          category_slug: string | null;
          category_name: string | null;
          location_slug: string | null;
          ended_at: string;
        }>;
      };
      setting_int: { Args: { p_key: string; p_default: number }; Returns: number };
      slugify: { Args: { p_text: string }; Returns: string };
      record_ad_view: { Args: { p_ad_id: string }; Returns: undefined };
      is_permitted_ad_transition: {
        Args: { p_from: AdStatus; p_to: AdStatus };
        Returns: boolean;
      };
      moderate_advertisement: {
        Args: { p_ad_id: string; p_action: ModerationAction; p_note?: string | null };
        Returns: AdStatus;
      };
      resolve_ad_report: {
        Args: { p_report_id: string; p_status: ReportStatus; p_note?: string | null };
        Returns: ReportStatus;
      };
      /** A moderator's correction: title, description, category, location, and why. */
      correct_advertisement: {
        Args: {
          p_ad_id: string;
          p_title: string;
          p_description: string;
          p_category_id: string | null;
          p_location_id: string;
          p_note: string;
        };
        Returns: undefined;
      };
      admin_dashboard_counts: {
        Args: Record<string, never>;
        Returns: Array<{ metric: string; value: number }>;
      };
    };
    Enums: {
      user_role: UserRole;
      ad_kind: AdKind;
      ad_status: AdStatus;
      price_type: PriceType;
      location_kind: LocationKind;
      payment_status: PaymentStatus;
      report_reason: ReportReason;
      report_status: ReportStatus;
      renewal_status: RenewalStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}

/* Convenience aliases used across the app. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type CategoryRow = Tables<'categories'>;
export type LocationRow = Tables<'locations'>;
export type AdRow = Tables<'ads'>;
export type AdImageRow = Tables<'ad_images'>;
export type ProfileRow = Tables<'profiles'>;
export type PackageRow = Tables<'packages'>;
export type PaymentRow = Tables<'payments'>;
export type AdReportRow = Tables<'ad_reports'>;
export type AdArtworkRow = Tables<'ad_artwork'>;
export type AdRenewalRow = Tables<'ad_renewals'>;

export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row'];

export type PublicAdRow = Views<'public_ads'>;
export type OwnerAdRow = Views<'owner_ads'>;
export type ModerationAdRow = Views<'moderation_ads'>;
export type ModerationReportRow = Views<'moderation_reports'>;
export type AdminUserRow = Views<'admin_users'>;
export type AdminActionRow = Views<'admin_actions'>;
