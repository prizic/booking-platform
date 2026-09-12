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
      add_booking_note_v1: {
        Args: {
          p_body: string;
          p_booking_id: string;
          p_request_id?: string;
          p_tenant_id: string;
          p_visibility: string;
        };
        Returns: {
          contract_version: number;
          note_id: string;
          visibility: string;
        }[];
      };
      advance_tenant_offboarding_v1: {
        Args: { p_phase: string; p_tenant_id: string };
        Returns: {
          blocked_reason: string;
          phase: string;
          status: string;
        }[];
      };
      attach_checkout_reference_v1: {
        Args: {
          p_checkout_reference: string;
          p_payment_attempt_id: string;
          p_tenant_id: string;
        };
        Returns: {
          payment_attempt_id: string;
          status: string;
        }[];
      };
      begin_checkout_v1: {
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
          balance_minor: number;
          contract_version: number;
          currency: string;
          due_minor: number;
          expires_at: string;
          payment_attempt_id: string;
          payment_mode: string;
          provider: string;
          provider_account_reference: string;
          replayed: boolean;
          status: string;
          tax_minor: number;
          total_minor: number;
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
      claim_refund_batch_v1: {
        Args: { p_limit?: number; p_visibility_seconds?: number };
        Returns: {
          amount_minor_units: number;
          attempt: number;
          booking_id: string;
          connected_account_reference: string;
          correlation_id: string;
          currency: string;
          provider_charge_reference: string;
          refund_id: string;
          tenant_id: string;
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
      correct_customer_v1: {
        Args: {
          p_customer_id: string;
          p_email: string;
          p_expected_revision: number;
          p_full_name: string;
          p_phone?: string;
          p_preferred_locale?: string;
          p_tags?: string[];
          p_tenant_id: string;
        };
        Returns: {
          customer_id: string;
          revision: number;
        }[];
      };
      create_booking_on_behalf_v1: {
        Args: {
          p_consent_version: string;
          p_contact: Json;
          p_customer_time_zone?: string;
          p_hold_id: string;
          p_hostname: string;
          p_idempotency_key: string;
          p_intake?: Json;
          p_locale?: string;
          p_request_id?: string;
          p_session_token: string;
          p_tenant_id: string;
        };
        Returns: {
          approval_status: string;
          booking_id: string;
          booking_revision: number;
          contract_version: number;
          ends_at: string;
          public_reference: string;
          replayed: boolean;
          starts_at: string;
          status: string;
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
      get_booking_detail_v1: {
        Args: { p_booking_id: string; p_tenant_id: string };
        Returns: {
          booking_id: string;
          booking_revision: number;
          cancelled_at: string;
          contract_version: number;
          currency: string;
          customer_email: string;
          customer_full_name: string;
          customer_phone: string;
          duration_minutes: number;
          has_intake: boolean;
          history: Json;
          location_name: string;
          location_time_zone: string;
          notes: Json;
          notification_status: string;
          payment_status: string;
          price_minor: number;
          public_reference: string;
          refund_eligible_minor: number;
          reschedule_count: number;
          service_name: string;
          starts_at: string;
          status: string;
        }[];
      };
      get_booking_report_v1: {
        Args: {
          p_from: string;
          p_location_id?: string;
          p_service_id?: string;
          p_staff_id?: string;
          p_tenant_id: string;
          p_time_zone?: string;
          p_to: string;
        };
        Returns: {
          average_lead_time_minutes: number;
          bookings_cancelled: number;
          bookings_completed: number;
          bookings_confirmed: number;
          bookings_created: number;
          bookings_no_show: number;
          bookings_requested: number;
          bookings_rescheduled: number;
          completion_rate_bps: number;
          contract_version: number;
          median_lead_time_minutes: number;
          no_show_rate_bps: number;
          outcome_denominator: number;
          report_definition_version: number;
          time_zone: string;
          window_end: string;
          window_start: string;
        }[];
      };
      get_brand_presentation_v1: {
        Args: { p_tenant_id: string };
        Returns: {
          contract_version: number;
          has_legal_links: boolean;
          has_published_brand: boolean;
          has_tenant_sender: boolean;
          has_verified_domain: boolean;
          presentation: string;
        }[];
      };
      get_checkout_intent_v1: {
        Args: { p_payment_attempt_id: string; p_tenant_id: string };
        Returns: {
          amount_minor_units: number;
          connected_account_reference: string;
          currency: string;
          customer_email: string;
          product_name: string;
        }[];
      };
      get_checkout_status_v1: {
        Args: {
          p_application: string;
          p_hold_id: string;
          p_hostname: string;
          p_session_token: string;
        };
        Returns: {
          balance_minor: number;
          booking_id: string;
          booking_status: string;
          contract_version: number;
          currency: string;
          due_minor: number;
          exception_code: string;
          hold_expires_at: string;
          payment_attempt_id: string;
          payment_status: string;
          public_reference: string;
          purpose: string;
          status: string;
        }[];
      };
      get_commerce_health_v1: {
        Args: never;
        Returns: {
          account_status: string;
          charges_enabled: boolean;
          disputes_open: number;
          open_exceptions: number;
          refunds_failed: number;
          refunds_pending: number;
          tenant_id: string;
          urgent_exceptions: number;
        }[];
      };
      get_customer_detail_v1: {
        Args: { p_customer_id: string; p_tenant_id: string };
        Returns: {
          bookings: Json;
          consents: Json;
          created_at: string;
          customer_id: string;
          email: string;
          erased: boolean;
          full_name: string;
          intake_count: number;
          legal_hold: boolean;
          phone: string;
          preferred_locale: string;
          restricted: boolean;
          restriction_reason: string;
          revision: number;
          sensitive_note_count: number;
          suppressed: boolean;
          tags: string[];
        }[];
      };
      get_customer_report_v1: {
        Args: {
          p_from: string;
          p_tenant_id: string;
          p_time_zone?: string;
          p_to: string;
        };
        Returns: {
          bookings_per_customer_bps: number;
          contract_version: number;
          customers_new: number;
          customers_returning: number;
          customers_total: number;
          erased_customers: number;
          report_definition_version: number;
          suppressed_contacts: number;
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
      get_delivery_health_v1: {
        Args: { p_tenant_id: string };
        Returns: {
          bounced: number;
          complained: number;
          contract_version: number;
          dead_lettered: number;
          delivered: number;
          failed: number;
          oldest_queued_minutes: number;
          queued: number;
          sending: number;
          suppressed: number;
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
          balance_minor: number;
          consent_text: string;
          consent_version: string;
          contract_version: number;
          currency: string;
          due_minor: number;
          expires_at: string;
          hold_id: string;
          intake_schema: Json;
          location_name: string;
          location_time_zone: string;
          payment_mode: string;
          price_minor: number;
          service_name: string;
          slot_end: string;
          slot_start: string;
          state: string;
          tax_minor: number;
          tax_rate_bps: number;
        }[];
      };
      get_lifecycle_analytics_v1: {
        Args: { p_from?: string; p_tenant_id: string; p_to?: string };
        Returns: {
          booking_count: number;
          contract_version: number;
          event_count: number;
          event_type: string;
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
      get_privacy_request_v1: {
        Args: { p_request_id: string; p_tenant_id: string };
        Returns: {
          artifact: Json;
          artifact_expires_at: string;
          blocked_reason: string;
          completed_at: string;
          created_at: string;
          customer_id: string;
          detail: Json;
          kind: string;
          offboarding_phase: string;
          request_id: string;
          status: string;
          steps: Json;
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
      get_public_navigation_v1: {
        Args: { p_application: string; p_hostname: string };
        Returns: {
          cache_tag: string;
          contract_version: number;
          default_locale: string;
          navigation: Json;
        }[];
      };
      get_published_brand_v1: {
        Args: { p_application: string; p_hostname: string };
        Returns: {
          brand_revision_id: string;
          cache_tag: string;
          config: Json;
          content: Json;
          contract_version: number;
          published_at: string;
          revision: number;
        }[];
      };
      get_report_export_v1: {
        Args: { p_export_id: string; p_tenant_id: string };
        Returns: {
          created_at: string;
          expires_at: string;
          export_id: string;
          parameters: Json;
          report_definition_version: number;
          report_key: string;
          row_count: number;
          rows_payload: Json;
          status: string;
        }[];
      };
      get_revenue_report_v1: {
        Args: {
          p_from: string;
          p_tenant_id: string;
          p_time_zone?: string;
          p_to: string;
        };
        Returns: {
          average_order_value_minor: number;
          charge_count: number;
          charged_minor: number;
          contract_version: number;
          currency: string;
          net_minor: number;
          outstanding_minor: number;
          refund_count: number;
          refunded_minor: number;
          report_definition_version: number;
          unsettled_payments: number;
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
      get_tenant_configuration_v1: {
        Args: { p_tenant_id: string };
        Returns: {
          cache_tag: string;
          config_version: number;
          contract_version: number;
          default_locale: string;
          entitlements: Json;
          feature_configuration: Json;
          feature_version: number;
          navigation: Json;
          revision: number;
          settings: Json;
        }[];
      };
      get_today_workspace_v1: {
        Args: { p_from: string; p_tenant_id: string; p_to: string };
        Returns: {
          approval_deadline: string;
          approval_status: string;
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
          notification_status: string;
          payment_status: string;
          price_minor: number;
          public_reference: string;
          queue: string;
          service_name: string;
          staff_id: string;
          starts_at: string;
          status: string;
        }[];
      };
      get_utilization_report_v1: {
        Args: {
          p_from: string;
          p_location_id?: string;
          p_tenant_id: string;
          p_time_zone?: string;
          p_to: string;
        };
        Returns: {
          booked_minutes: number;
          booking_count: number;
          contract_version: number;
          offered_minutes: number;
          report_definition_version: number;
          staff_id: string;
          staff_name: string;
          utilization_bps: number;
        }[];
      };
      issue_brand_preview_v1: {
        Args: {
          p_brand_revision_id: string;
          p_tenant_id: string;
          p_ttl_minutes?: number;
        };
        Returns: {
          expires_at: string;
          preview_token: string;
        }[];
      };
      list_booking_notifications_v1: {
        Args: { p_booking_id: string; p_tenant_id: string };
        Returns: {
          attempts: number;
          contract_version: number;
          created_at: string;
          dead_lettered: boolean;
          last_error_code: string;
          message_id: string;
          status: string;
          template_key: string;
          template_locale: string;
          updated_at: string;
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
      list_brand_revisions_v1: {
        Args: { p_limit?: number; p_tenant_id: string };
        Returns: {
          brand_id: string;
          brand_key: string;
          brand_revision_id: string;
          content_hash: string;
          created_at: string;
          notes: string;
          published_at: string;
          revision: number;
          state: string;
        }[];
      };
      list_calendar_v1: {
        Args: {
          p_from: string;
          p_location_id?: string;
          p_service_id?: string;
          p_staff_id?: string;
          p_tenant_id: string;
          p_to: string;
        };
        Returns: {
          approval_status: string;
          booking_id: string;
          booking_revision: number;
          buffer_after_minutes: number;
          buffer_before_minutes: number;
          contract_version: number;
          customer_display_name: string;
          ends_at: string;
          has_intake: boolean;
          locale: string;
          location_id: string;
          location_name: string;
          location_time_zone: string;
          notification_status: string;
          payment_status: string;
          public_reference: string;
          resource_id: string;
          service_id: string;
          service_name: string;
          staff_id: string;
          starts_at: string;
          status: string;
        }[];
      };
      list_payment_exceptions_v1: {
        Args: { p_limit?: number; p_status?: string; p_tenant_id: string };
        Returns: {
          amount_minor_units: number;
          booking_id: string;
          created_at: string;
          currency: string;
          detail_code: string;
          exception_id: string;
          kind: string;
          provider_reference: string;
          public_reference: string;
          resolution: string;
          resolved_at: string;
          severity: string;
          status: string;
          subject_id: string;
          subject_kind: string;
        }[];
      };
      list_privacy_requests_v1: {
        Args: { p_customer_id?: string; p_limit?: number; p_tenant_id: string };
        Returns: {
          blocked_reason: string;
          completed_at: string;
          created_at: string;
          customer_id: string;
          kind: string;
          offboarding_phase: string;
          pending_steps: number;
          request_id: string;
          status: string;
        }[];
      };
      list_refunds_v1: {
        Args: { p_booking_id?: string; p_limit?: number; p_tenant_id: string };
        Returns: {
          amount_minor_units: number;
          attempts: number;
          booking_id: string;
          created_at: string;
          currency: string;
          failure_code: string;
          public_reference: string;
          reason: string;
          refund_id: string;
          status: string;
          updated_at: string;
        }[];
      };
      list_report_exports_v1: {
        Args: { p_limit?: number; p_tenant_id: string };
        Returns: {
          created_at: string;
          expires_at: string;
          export_id: string;
          report_key: string;
          row_count: number;
          status: string;
        }[];
      };
      list_settings_events_v1: {
        Args: { p_limit?: number; p_tenant_id: string };
        Returns: {
          actor_membership_id: string;
          changed: string[];
          created_at: string;
          revision: number;
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
      open_privacy_request_v1: {
        Args: { p_customer_id: string; p_kind: string; p_tenant_id: string };
        Returns: string;
      };
      publish_brand_revision_v1: {
        Args: {
          p_brand_revision_id: string;
          p_expected_content_hash: string;
          p_tenant_id: string;
        };
        Returns: {
          brand_revision_id: string;
          contract_version: number;
          published_at: string;
          retired_revision: number;
          revision: number;
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
      reconcile_commerce_v1: {
        Args: { p_stale_minutes?: number; p_tenant_id?: string };
        Returns: {
          checked: number;
          opened: number;
        }[];
      };
      record_commerce_event_v1: {
        Args: {
          p_amount_minor_units?: number;
          p_currency?: string;
          p_event_type: string;
          p_object_kind: string;
          p_occurred_at?: string;
          p_outcome: string;
          p_provider: string;
          p_provider_event_reference: string;
          p_provider_object_reference: string;
          p_related_reference?: string;
          p_tenant_id: string;
        };
        Returns: {
          contract_version: number;
          detail: string;
          outcome: string;
        }[];
      };
      record_payment_event_v1: {
        Args: {
          p_amount_minor_units?: number;
          p_currency?: string;
          p_event_type: string;
          p_occurred_at?: string;
          p_outcome: string;
          p_provider: string;
          p_provider_charge_reference?: string;
          p_provider_event_reference: string;
          p_provider_object_reference: string;
          p_tenant_id: string;
        };
        Returns: {
          booking_id: string;
          contract_version: number;
          exception_code: string;
          outcome: string;
          payment_status: string;
          public_reference: string;
        }[];
      };
      record_refund_result_v1: {
        Args: {
          p_failure_code?: string;
          p_outcome: string;
          p_provider_refund_reference?: string;
          p_refund_id: string;
          p_tenant_id: string;
        };
        Returns: {
          refund_id: string;
          status: string;
        }[];
      };
      redeem_brand_preview_v1: {
        Args: { p_application: string; p_hostname: string; p_token: string };
        Returns: {
          brand_revision_id: string;
          config: Json;
          content: Json;
          contract_version: number;
          revision: number;
          state: string;
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
      replay_booking_notification_v1: {
        Args: { p_booking_id: string; p_tenant_id: string };
        Returns: {
          contract_version: number;
          status: string;
        }[];
      };
      replay_notification_v1: {
        Args: { p_message_id: string; p_tenant_id: string };
        Returns: {
          contract_version: number;
          status: string;
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
      request_refund_v1: {
        Args: {
          p_amount_minor_units?: number;
          p_booking_id: string;
          p_idempotency_key: string;
          p_reason?: string;
          p_tenant_id: string;
        };
        Returns: {
          amount_minor_units: number;
          contract_version: number;
          currency: string;
          refund_id: string;
          replayed: boolean;
          status: string;
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
      resolve_auth_mail_context_v1: {
        Args: { p_email: string };
        Returns: {
          ambiguous: boolean;
          brand_name: string;
          tenant_id: string;
        }[];
      };
      resolve_payment_exception_v1: {
        Args: {
          p_exception_id: string;
          p_note?: string;
          p_resolution: string;
          p_tenant_id: string;
        };
        Returns: {
          exception_id: string;
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
      rollback_brand_v1: {
        Args: { p_brand_id: string; p_tenant_id: string; p_to_revision: number };
        Returns: {
          brand_revision_id: string;
          contract_version: number;
          revision: number;
        }[];
      };
      run_privacy_request_v1: {
        Args: { p_request_id: string; p_tenant_id: string };
        Returns: {
          blocked_reason: string;
          status: string;
        }[];
      };
      run_report_export_v1: {
        Args: {
          p_from: string;
          p_location_id?: string;
          p_report_key: string;
          p_tenant_id: string;
          p_time_zone?: string;
          p_to: string;
        };
        Returns: {
          expires_at: string;
          export_id: string;
          row_count: number;
          status: string;
        }[];
      };
      save_brand_draft_v1: {
        Args: {
          p_brand_key: string;
          p_config: Json;
          p_content: Json;
          p_expected_revision?: number;
          p_notes?: string;
          p_tenant_id: string;
        };
        Returns: {
          brand_id: string;
          brand_revision_id: string;
          content_hash: string;
          contract_version: number;
          revision: number;
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
      save_tenant_settings_v1: {
        Args: {
          p_expected_revision?: number;
          p_feature_configuration: Json;
          p_navigation: Json;
          p_settings: Json;
          p_tenant_id: string;
        };
        Returns: {
          contract_version: number;
          ignored_features: string[];
          revision: number;
        }[];
      };
      schedule_booking_reminders_v1: {
        Args: { p_limit?: number; p_tenant_id?: string };
        Returns: {
          scheduled: number;
          superseded: number;
        }[];
      };
      search_bookings_v1: {
        Args: {
          p_from?: string;
          p_location_id?: string;
          p_query?: string;
          p_staff_id?: string;
          p_status?: string;
          p_tenant_id: string;
          p_to?: string;
        };
        Returns: {
          booking_id: string;
          booking_revision: number;
          contract_version: number;
          currency: string;
          customer_display_name: string;
          location_time_zone: string;
          note_count: number;
          notification_status: string;
          payment_status: string;
          price_minor: number;
          public_reference: string;
          service_name: string;
          starts_at: string;
          status: string;
        }[];
      };
      search_customers_v1: {
        Args: {
          p_include_erased?: boolean;
          p_limit?: number;
          p_offset?: number;
          p_query?: string;
          p_tenant_id: string;
        };
        Returns: {
          booking_count: number;
          customer_id: string;
          email: string;
          erased: boolean;
          full_name: string;
          last_booking_at: string;
          legal_hold: boolean;
          phone: string;
          preferred_locale: string;
          restricted: boolean;
          revision: number;
          suppressed: boolean;
          tags: string[];
        }[];
      };
      set_customer_restriction_v1: {
        Args: {
          p_customer_id: string;
          p_reason?: string;
          p_restricted: boolean;
          p_tenant_id: string;
        };
        Returns: {
          customer_id: string;
          restricted: boolean;
        }[];
      };
      set_legal_hold_v1: {
        Args: {
          p_customer_id: string;
          p_hold: boolean;
          p_reason: string;
          p_tenant_id: string;
        };
        Returns: {
          held: boolean;
          hold_id: string;
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
      transition_booking_v1: {
        Args: {
          p_action: string;
          p_booking_id: string;
          p_expected_revision: number;
          p_idempotency_key?: string;
          p_reason?: string;
          p_request_id?: string;
          p_tenant_id: string;
        };
        Returns: {
          booking_id: string;
          booking_revision: number;
          contract_version: number;
          replayed: boolean;
          status: string;
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
