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
      clinic_audios: {
        Row: {
          created_at: string
          id: string
          mime_type: string
          storage_path: string
          title: string
          use_when: string
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type: string
          storage_path: string
          title: string
          use_when?: string
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string
          storage_path?: string
          title?: string
          use_when?: string
        }
        Relationships: []
      }
      clinic_settings: {
        Row: {
          ai_enabled: boolean
          assistant_name: string
          clinic_name: string
          followup_audio_id: string | null
          followup_enabled: boolean
          followup_minutes: number
          followup_text: string
          handoff_message: string
          id: number
          max_ai_replies: number
          procedures: string
          questions: string
          reply_delay_seconds: number
          send_handoff_message: boolean
          test_mode: boolean
          test_numbers: string
          tone: string
          updated_at: string
        }
        Insert: {
          ai_enabled?: boolean
          assistant_name?: string
          clinic_name?: string
          followup_audio_id?: string | null
          followup_enabled?: boolean
          followup_minutes?: number
          followup_text?: string
          handoff_message?: string
          id?: number
          max_ai_replies?: number
          procedures?: string
          questions?: string
          reply_delay_seconds?: number
          send_handoff_message?: boolean
          test_mode?: boolean
          test_numbers?: string
          tone?: string
          updated_at?: string
        }
        Update: {
          ai_enabled?: boolean
          assistant_name?: string
          clinic_name?: string
          followup_audio_id?: string | null
          followup_enabled?: boolean
          followup_minutes?: number
          followup_text?: string
          handoff_message?: string
          id?: number
          max_ai_replies?: number
          procedures?: string
          questions?: string
          reply_delay_seconds?: number
          send_handoff_message?: boolean
          test_mode?: boolean
          test_numbers?: string
          tone?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          ai_replies: number
          contact_name: string | null
          created_at: string
          experience: string | null
          followup_sent_at: string | null
          goal: string | null
          handoff_at: string | null
          handoff_reason: string | null
          id: string
          last_inbound_at: string | null
          last_message_at: string
          last_message_preview: string | null
          mode: string
          notes: string | null
          procedure: string | null
          wa_phone: string
        }
        Insert: {
          ai_replies?: number
          contact_name?: string | null
          created_at?: string
          experience?: string | null
          followup_sent_at?: string | null
          goal?: string | null
          handoff_at?: string | null
          handoff_reason?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string
          last_message_preview?: string | null
          mode?: string
          notes?: string | null
          procedure?: string | null
          wa_phone: string
        }
        Update: {
          ai_replies?: number
          contact_name?: string | null
          created_at?: string
          experience?: string | null
          followup_sent_at?: string | null
          goal?: string | null
          handoff_at?: string | null
          handoff_reason?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string
          last_message_preview?: string | null
          mode?: string
          notes?: string | null
          procedure?: string | null
          wa_phone?: string
        }
        Relationships: []
      }
      message_status_events: {
        Row: {
          created_at: string
          errors: Json | null
          id: string
          status: string
          status_ts: string | null
          wa_message_id: string
        }
        Insert: {
          created_at?: string
          errors?: Json | null
          id?: string
          status: string
          status_ts?: string | null
          wa_message_id: string
        }
        Update: {
          created_at?: string
          errors?: Json | null
          id?: string
          status?: string
          status_ts?: string | null
          wa_message_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          audio_id: string | null
          body: string
          conversation_id: string
          created_at: string
          direction: string
          error: string | null
          id: string
          reply_error: string | null
          reply_started_at: string | null
          reply_state: string
          sender: string
          status: string
          status_at: string | null
          wa_message_id: string | null
        }
        Insert: {
          audio_id?: string | null
          body?: string
          conversation_id: string
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          reply_error?: string | null
          reply_started_at?: string | null
          reply_state?: string
          sender: string
          status?: string
          status_at?: string | null
          wa_message_id?: string | null
        }
        Update: {
          audio_id?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          reply_error?: string | null
          reply_started_at?: string | null
          reply_state?: string
          sender?: string
          status?: string
          status_at?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_webhook_events: {
        Row: {
          attempts: number
          delivery_id: string
          event: string
          id: string
          last_attempt_at: string | null
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          attempts?: number
          delivery_id: string
          event: string
          id?: string
          last_attempt_at?: string | null
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          attempts?: number
          delivery_id?: string
          event?: string
          id?: string
          last_attempt_at?: string | null
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "staff"
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
      app_role: ["staff"],
    },
  },
} as const
