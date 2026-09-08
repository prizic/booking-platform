export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  api_v1: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      act_on_management_link_v1: {
        Args: {
          p_action: string;
          p_application: string;
          p_expected_revision: number;
          p_hostname: string;
          p_new_start?: string;
          p_reason_public?: string;
          p_token: string;
        };
        Returns: {
          booking_id: string;
          booking_revision: number;
          contract_version: number;
          currency: string;
          ends_at: string;
          outcome: string;
          refund_eligible_minor: number;
          refund_percent_bps: number;
          starts_at: string;
          status: string;
        }[];
      };
      cancel_booking_v1: {
        Args: {
          p_booking_id: string;
          p_expected_revision: number;
          p_reason_internal?: string;
          p_reason_public?: string;
          p_request_id?: string;
          p_tenant_id: string;
        };
        Returns: {
          booking_id: string;
          booking_revision: number;
          cancelled_at: string;
          contract_version: number;
          refund_eligible_minor: number;
          refund_percent_bps: number;
          replayed: boolean;
          status: string;
        }[];
      };
      confirm_booking_v1: {
        Args: {
          p_application: string;
          p_consent_version: string;
          p_contact: Json;
          p_customer_time_zone?: string;
          p_hold_id: string;
          p_hostname: string;
          p_idempotency_key: string;
          p_intake?: Json;
          p_locale?: string;
          p_session_token: string;
        };
        Returns: {
          approval_deadline: string;
          approval_status: string;
          booking_id: string;
          booking_revision: number;
          calendar_status: string;
          consent_version: string;
          contract_version: number;
          currency: string;
          customer_time_zone: string;
          ends_at: string;
          locale: string;
          location_name: string;
          location_time_zone: string;
          notification_status: string;
          payment_status: string;
          policy_snapshot: Json;
          price_minor: number;
          public_reference: string;
          replayed: boolean;
          service_name: string;
          starts_at: string;
          status: string;
          tax_rate_bps: number;
        }[];
      };
      create_hold_v1: {
        Args: {
          p_application: string;
          p_customer_time_zone?: string;
          p_expected_cache_tag?: string;
          p_hostname: string;
          p_idempotency_key: string;
          p_location_id: string;
          p_party_size?: number;
          p_service_id: string;
          p_session_token: string;
          p_slot_start: string;
          p_staff_preference_id?: string;
        };
        Returns: {
          allocation_kind: string;
          attempts: number;
          cache_tag: string;
          contract_version: number;
          currency: string;
          expires_at: string;
          hold_id: string;
          price_minor: number;
          replayed: boolean;
          slot_end: string;
          slot_start: string;
          staff_id: string;
          state: string;
          tax_rate_bps: number;
        }[];
      };
      deactivate_resource_v1: {
        Args: {
          p_reason: string;
          p_replacement_resource_id: string;
          p_request_id: string;
          p_resolution: string;
          p_resource_id: string;
          p_tenant_id: string;
        };
        Returns: {
          outcome: string;
          remaining_allocations: number;
          resource_id: string;
        }[];
      };
      deactivate_staff_v1: {
        Args: {
          p_reason: string;
          p_replacement_staff_id: string;
          p_request_id: string;
          p_resolution: string;
          p_staff_id: string;
          p_tenant_id: string;
        };
        Returns: {
          outcome: string;
          remaining_allocations: number;
          staff_id: string;
        }[];
      };
      decide_booking_request_v1: {
        Args: {
          p_action: string;
          p_booking_id: string;
          p_expected_revision: number;
          p_proposed_start?: string;
          p_reason_internal?: string;
          p_reason_public?: string;
          p_request_id?: string;
          p_tenant_id: string;
        };
        Returns: {
          approval_status: string;
          booking_id: string;
          booking_revision: number;
          contract_version: number;
          proposal_action_token: string;
          proposal_expires_at: string;
          status: string;
        }[];
      };
      get_assignment_candidates_v1: {
        Args: { p_location_id: string; p_service_id: string };
        Returns: {
          assignment_mode: string;
          candidate_rank: number;
          resource_id: string;
          resource_name: string;
          staff_id: string;
          staff_name: string;
        }[];
      };
      get_availability_v1: {
        Args: {
          p_application: string;
          p_customer_time_zone?: string;
          p_hostname: string;
          p_location_id: string;
          p_party_size?: number;
          p_service_id: string;
          p_staff_preference_id?: string;
          p_window_end?: string;
          p_window_start?: string;
        };
        Returns: {
          advisory_as_of: string;
          advisory_until: string;
          allocation_kind: string;
          cache_tag: string;
          candidate_rank: number;
          contract_version: number;
          customer_time_zone: string;
          fold: number;
          local_start: string;
          location_time_zone: string;
          no_slot_code: string;
          provider_health_code: string;
          result_kind: string;
          slot_end: string;
          slot_start: string;
          staff_id: string;
          utc_offset_seconds: number;
        }[];
      };
      get_dashboard_context_v1: {
        Args: { p_tenant_id: string };
        Returns: {
          aal2: boolean;
          brand_id: string;
          capabilities: Json;
          config_version: number;
          dashboard_hostname: string;
          default_locale: string;
          feature_version: number;
          instance_id: string;
          location_ids: string[];
          location_scope_mode: string;
          membership_id: string;
          published_brand_revision: number;
          role_key: string;
          tenant_id: string;
          tenant_name: string;
        }[];
      };
      get_hold_form_v1: {
        Args: {
          p_application: string;
          p_hold_id: string;
          p_hostname: string;
          p_locale?: string;
          p_session_token: string;
        };
        Returns: {
          consent_text: string;
          consent_version: string;
          contract_version: number;
          currency: string;
          expires_at: string;
          hold_id: string;
          intake_schema: Json;
          location_name: string;
          location_time_zone: string;
          price_minor: number;
          service_name: string;
          slot_end: string;
          slot_start: string;
          state: string;
          tax_rate_bps: number;
        }[];
      };
      get_payment_account_status_v1: {
        Args: { p_tenant_id: string };
        Returns: {
          capabilities: Json;
          charges_enabled: boolean;
          payouts_enabled: boolean;
          provider: string;
          provider_account_reference: string;
          requirements: Json;
          status: string;
        }[];
      };
      get_public_catalog_v1: {
        Args: { p_hostname: string; p_locale?: string; p_service_key?: string };
        Returns: {
          approval_required: boolean;
          booking_mode: string;
          buffer_after_minutes: number;
          buffer_before_minutes: number;
          cache_tag: string;
          canonical_path: string;
          capacity_mode: string;
          category_key: string;
          currency: string;
          duration_minutes: number;
          locale: string;
          location_address: string;
          location_canonical_path: string;
          location_description: string;
          location_id: string;
          location_key: string;
          location_name: string;
          location_time_zone: string;
          og_image_path: string;
          payment_mode: string;
          price_minor: number;
          publication_id: string;
          publication_revision: number;
          service_description: string;
          service_id: string;
          service_key: string;
          service_name: string;
          tax_rate_bps: number;
          tenant_id: string;
        }[];
      };
      get_schedule_workspace_v1: {
        Args: { p_location_id?: string; p_tenant_id: string };
        Returns: {
          day_of_week: number;
          end_minute: number;
          ends_at: string;
          exception_kind: string;
          id: string;
          kind: string;
          local_date: string;
          location_id: string;
          policy_key: string;
          reason: string;
          resource_id: string;
          revision: number;
          scope_id: string;
          staff_id: string;
          start_minute: number;
          starts_at: string;
          time_zone: string;
          value: number;
        }[];
      };
      get_staff_resource_choices_v1: {
        Args: { p_locale: string; p_tenant_id: string };
        Returns: {
          choice_id: string;
          choice_key: string;
          choice_kind: string;
          choice_name: string;
          exclusive: boolean;
          revision: number;
        }[];
      };
      get_staff_resource_workspace_v1: {
        Args: { p_tenant_id: string };
        Returns: {
          future_allocation_count: number;
          internal_notes: string;
          item_id: string;
          item_key: string;
          item_kind: string;
          location_ids: string[];
          membership_id: string;
          name: string;
          offered_hours_per_week: number;
          public_bio: string;
          resource_type_id: string;
          resource_type_name: string;
          revision: number;
          service_ids: string[];
          status: string;
          tenant_id: string;
        }[];
      };
      list_booking_requests_v1: {
        Args: { p_tenant_id: string };
        Returns: {
          approval_deadline: string;
          booking_id: string;
          booking_revision: number;
          contract_version: number;
          currency: string;
          customer_display_name: string;
          ends_at: string;
          has_intake: boolean;
          locale: string;
          location_id: string;
          location_name: string;
          location_time_zone: string;
          price_minor: number;
          proposal_expires_at: string;
          proposal_starts_at: string;
          proposal_state: string;
          public_reference: string;
          requested_at: string;
          service_name: string;
          starts_at: string;
        }[];
      };
      list_bookings_v1: {
        Args: { p_from: string; p_tenant_id: string; p_to: string };
        Returns: {
          approval_status: string;
          booking_id: string;
          booking_revision: number;
          calendar_status: string;
          contract_version: number;
          currency: string;
          ends_at: string;
          has_intake: boolean;
          locale: string;
          location_id: string;
          location_name: string;
          location_time_zone: string;
          notification_status: string;
          payment_status: string;
          price_minor: number;
          public_reference: string;
          service_id: string;
          service_name: string;
          staff_id: string;
          starts_at: string;
          status: string;
          tax_rate_bps: number;
        }[];
      };
      list_tenant_choices_v1: {
        Args: never;
        Returns: {
          dashboard_hostname: string;
          membership_id: string;
          role_key: string;
          tenant_id: string;
          tenant_name: string;
        }[];
      };
      publish_catalog_v1: {
        Args: {
          p_category_revision_ids: string[];
          p_location_revision_ids: string[];
          p_publication_id: string;
          p_service_revision_ids: string[];
          p_tenant_id: string;
        };
        Returns: {
          cache_tag: string;
          publication_id: string;
          publication_revision: number;
        }[];
      };
      redeem_management_token_v1: {
        Args: {
          p_application: string;
          p_hostname: string;
          p_intent?: string;
          p_token: string;
        };
        Returns: {
          approval_status: string;
          booking_id: string;
          booking_revision: number;
          can_cancel: boolean;
          can_reschedule: boolean;
          consent_version: string;
          contract_version: number;
          currency: string;
          customer_time_zone: string;
          ends_at: string;
          intent: string;
          locale: string;
          location_name: string;
          location_time_zone: string;
          outcome: string;
          payment_status: string;
          policy_snapshot: Json;
          price_minor: number;
          public_reference: string;
          service_name: string;
          starts_at: string;
          status: string;
          step_up_required: boolean;
          step_up_verified: boolean;
          tax_rate_bps: number;
          token_expires_at: string;
        }[];
      };
      release_hold_v1: {
        Args: {
          p_application: string;
          p_hold_id: string;
          p_hostname: string;
          p_session_token: string;
        };
        Returns: {
          contract_version: number;
          hold_id: string;
          state: string;
        }[];
      };
      request_management_otp_v1: {
        Args: { p_application: string; p_hostname: string; p_token: string };
        Returns: {
          contract_version: number;
          expires_at: string;
          outcome: string;
        }[];
      };
      reschedule_booking_v1: {
        Args: {
          p_booking_id: string;
          p_expected_revision: number;
          p_new_start: string;
          p_reason_internal?: string;
          p_request_id?: string;
          p_tenant_id: string;
        };
        Returns: {
          booking_id: string;
          booking_revision: number;
          contract_version: number;
          ends_at: string;
          reschedule_count: number;
          starts_at: string;
          status: string;
        }[];
      };
      resolve_public_tenant_v1: {
        Args: { p_application: string; p_hostname: string };
        Returns: {
          brand_id: string;
          config_version: number;
          deployment_state: string;
          feature_version: number;
          hostname: string;
          instance_id: string;
          published_brand_revision: number;
          tenant_id: string;
        }[];
      };
      respond_to_proposal_v1: {
        Args: {
          p_action: string;
          p_action_token: string;
          p_application: string;
          p_hostname: string;
        };
        Returns: {
          approval_status: string;
          booking_id: string;
          contract_version: number;
          ends_at: string;
          proposal_state: string;
          public_reference: string;
          starts_at: string;
          status: string;
        }[];
      };
      save_resource_type_v1: {
        Args: {
          p_exclusive: boolean;
          p_expected_revision: number;
          p_key: string;
          p_name: string;
          p_reason: string;
          p_request_id: string;
          p_resource_type_id: string;
          p_tenant_id: string;
        };
        Returns: {
          resource_type_id: string;
          revision: number;
        }[];
      };
      save_resource_v1: {
        Args: {
          p_expected_revision: number;
          p_internal_notes: string;
          p_key: string;
          p_public_name: string;
          p_reason: string;
          p_request_id: string;
          p_resource_id: string;
          p_resource_type_id: string;
          p_status: string;
          p_tenant_id: string;
        };
        Returns: {
          resource_id: string;
          revision: number;
        }[];
      };
      save_schedule_config_v1: {
        Args: {
          p_expected_revision: number;
          p_operation: string;
          p_payload: Json;
          p_request_id?: string;
          p_tenant_id: string;
        };
        Returns: {
          revision: number;
          target_id: string;
        }[];
      };
      save_staff_profile_v1: {
        Args: {
          p_expected_revision: number;
          p_internal_notes: string;
          p_membership_id: string;
          p_offered_hours_per_week: number;
          p_public_bio: string;
          p_public_name: string;
          p_reason: string;
          p_request_id: string;
          p_staff_id: string;
          p_tenant_id: string;
        };
        Returns: {
          revision: number;
          staff_id: string;
        }[];
      };
      set_resource_location_eligibility_v1: {
        Args: {
          p_eligible: boolean;
          p_location_id: string;
          p_reason: string;
          p_request_id: string;
          p_resource_id: string;
          p_tenant_id: string;
        };
        Returns: {
          eligible: boolean;
          location_id: string;
          resource_id: string;
        }[];
      };
      set_resource_requirement_v1: {
        Args: {
          p_reason: string;
          p_request_id: string;
          p_required: boolean;
          p_resource_type_id: string;
          p_service_id: string;
          p_tenant_id: string;
        };
        Returns: {
          required: boolean;
          resource_type_id: string;
          service_id: string;
        }[];
      };
      set_staff_service_location_eligibility_v1: {
        Args: {
          p_eligible: boolean;
          p_location_id: string;
          p_reason: string;
          p_request_id: string;
          p_service_id: string;
          p_staff_id: string;
          p_tenant_id: string;
        };
        Returns: {
          eligible: boolean;
          location_id: string;
          service_id: string;
          staff_id: string;
        }[];
      };
      verify_management_otp_v1: {
        Args: {
          p_application: string;
          p_code: string;
          p_hostname: string;
          p_token: string;
        };
        Returns: {
          contract_version: number;
          verified: boolean;
        }[];
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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
  api_v1: {
    Enums: {},
  },
} as const;
