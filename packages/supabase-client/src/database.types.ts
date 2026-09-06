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
