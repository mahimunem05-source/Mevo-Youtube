export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      artists: {
        Row: {
          created_at: string;
          id: string;
          image_url: string | null;
          is_verified: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          image_url?: string | null;
          is_verified?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          image_url?: string | null;
          is_verified?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      album_songs: {
        Row: {
          album_id: string;
          created_at: string;
          id: string;
          position: number;
          song_id: string;
        };
        Insert: {
          album_id: string;
          created_at?: string;
          id?: string;
          position?: number;
          song_id: string;
        };
        Update: {
          album_id?: string;
          created_at?: string;
          id?: string;
          position?: number;
          song_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "album_songs_album_id_fkey";
            columns: ["album_id"];
            isOneToOne: false;
            referencedRelation: "custom_albums";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "album_songs_song_id_fkey";
            columns: ["song_id"];
            isOneToOne: false;
            referencedRelation: "songs";
            referencedColumns: ["id"];
          },
        ];
      };
      custom_albums: {
        Row: {
          collection: string;
          cover_image: string | null;
          cover_path: string | null;
          created_at: string;
          description: string | null;
          display_order: number | null;
          id: string;
          published: boolean;
          release_date: string | null;
          slug: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          collection?: string;
          cover_image?: string | null;
          cover_path?: string | null;
          created_at?: string;
          description?: string | null;
          display_order?: number | null;
          id?: string;
          published?: boolean;
          release_date?: string | null;
          slug: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          collection?: string;
          cover_image?: string | null;
          cover_path?: string | null;
          created_at?: string;
          description?: string | null;
          display_order?: number | null;
          id?: string;
          published?: boolean;
          release_date?: string | null;
          slug?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      song_engagement: {
        Row: {
          completed_plays: number;
          last_play_at: string | null;
          recent_valid_plays: number;
          repeat_plays: number;
          skips: number;
          song_id: string;
          total_listened_seconds: number;
          unique_sessions: number;
          updated_at: string;
          valid_plays: number;
        };
        Insert: {
          completed_plays?: number;
          last_play_at?: string | null;
          recent_valid_plays?: number;
          repeat_plays?: number;
          skips?: number;
          song_id: string;
          total_listened_seconds?: number;
          unique_sessions?: number;
          updated_at?: string;
          valid_plays?: number;
        };
        Update: {
          completed_plays?: number;
          last_play_at?: string | null;
          recent_valid_plays?: number;
          repeat_plays?: number;
          skips?: number;
          song_id?: string;
          total_listened_seconds?: number;
          unique_sessions?: number;
          updated_at?: string;
          valid_plays?: number;
        };
        Relationships: [
          {
            foreignKeyName: "song_engagement_song_id_fkey";
            columns: ["song_id"];
            isOneToOne: true;
            referencedRelation: "songs";
            referencedColumns: ["id"];
          },
        ];
      };
      song_play_events: {
        Row: {
          completed: boolean;
          created_at: string;
          event_bucket: string;
          id: string;
          is_repeat: boolean;
          is_skip: boolean;
          is_valid_play: boolean;
          listened_seconds: number;
          session_id: string;
          song_duration: number;
          song_id: string;
        };
        Insert: {
          completed?: boolean;
          created_at?: string;
          event_bucket?: string;
          id?: string;
          is_repeat?: boolean;
          is_skip?: boolean;
          is_valid_play?: boolean;
          listened_seconds?: number;
          session_id: string;
          song_duration?: number;
          song_id: string;
        };
        Update: {
          completed?: boolean;
          created_at?: string;
          event_bucket?: string;
          id?: string;
          is_repeat?: boolean;
          is_skip?: boolean;
          is_valid_play?: boolean;
          listened_seconds?: number;
          session_id?: string;
          song_duration?: number;
          song_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "song_play_events_song_id_fkey";
            columns: ["song_id"];
            isOneToOne: false;
            referencedRelation: "songs";
            referencedColumns: ["id"];
          },
        ];
      };
      songs: {
        Row: {
          admin_boost: number;
          admin_excluded: boolean;
          admin_manual_order: number | null;
          admin_pinned_position: number | null;
          album: string | null;
          artist_name: string;
          audio_file: string;
          audio_hash: string | null;
          audio_mime: string | null;
          audio_path: string | null;
          audio_size: number | null;
          cover_image: string | null;
          cover_path: string | null;
          created_at: string;
          disc_number: number | null;
          duration: number;
          genre: string | null;
          id: string;
          original_filename: string | null;
          play_count: number;
          published: boolean;
          published_at: string;
          release_date: string | null;
          section: string;
          title: string;
          track_number: number | null;
          updated_at: string;
        };
        Insert: {
          admin_boost?: number;
          admin_excluded?: boolean;
          admin_manual_order?: number | null;
          admin_pinned_position?: number | null;
          album?: string | null;
          artist_name: string;
          audio_file: string;
          audio_hash?: string | null;
          audio_mime?: string | null;
          audio_path?: string | null;
          audio_size?: number | null;
          cover_image?: string | null;
          cover_path?: string | null;
          created_at?: string;
          disc_number?: number | null;
          duration?: number;
          genre?: string | null;
          id?: string;
          original_filename?: string | null;
          play_count?: number;
          published?: boolean;
          published_at?: string;
          release_date?: string | null;
          section?: string;
          title: string;
          track_number?: number | null;
          updated_at?: string;
        };
        Update: {
          admin_boost?: number;
          admin_excluded?: boolean;
          admin_manual_order?: number | null;
          admin_pinned_position?: number | null;
          album?: string | null;
          artist_name?: string;
          audio_file?: string;
          audio_hash?: string | null;
          audio_mime?: string | null;
          audio_path?: string | null;
          audio_size?: number | null;
          cover_image?: string | null;
          cover_path?: string | null;
          created_at?: string;
          disc_number?: number | null;
          duration?: number;
          genre?: string | null;
          id?: string;
          original_filename?: string | null;
          play_count?: number;
          published?: boolean;
          published_at?: string;
          release_date?: string | null;
          section?: string;
          title?: string;
          track_number?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      trending_songs: {
        Row: {
          created_at: string;
          display_order: number | null;
          song_id: string;
        };
        Insert: {
          created_at?: string;
          display_order?: number | null;
          song_id: string;
        };
        Update: {
          created_at?: string;
          display_order?: number | null;
          song_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trending_songs_song_id_fkey";
            columns: ["song_id"];
            isOneToOne: true;
            referencedRelation: "songs";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: { Args: { _user_id: string }; Returns: boolean };
      refresh_song_engagement: {
        Args: { _song_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
