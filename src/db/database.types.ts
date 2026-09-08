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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          lat: number
          lng: number
          postal_code: string
          profile_id: string
          street: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          lat: number
          lng: number
          postal_code: string
          profile_id: string
          street: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          lat?: number
          lng?: number
          postal_code?: string
          profile_id?: string
          street?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_profile_id_profiles_id_fk"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          changes: Json | null
          created_at: string
          id: string
          reason: string | null
          subject_id: string | null
          subject_label: string | null
          subject_type: Database["public"]["Enums"]["audit_subject"]
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name: string
          changes?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          subject_id?: string | null
          subject_label?: string | null
          subject_type: Database["public"]["Enums"]["audit_subject"]
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          changes?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          subject_id?: string | null
          subject_label?: string | null
          subject_type?: Database["public"]["Enums"]["audit_subject"]
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_profiles_id_fk"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color_token: string
          icon: string
          id: string
          name_fr: string
          short_name_fr: string
          slug: string
        }
        Insert: {
          color_token: string
          icon: string
          id?: string
          name_fr: string
          short_name_fr: string
          slug: string
        }
        Update: {
          color_token?: string
          icon?: string
          id?: string
          name_fr?: string
          short_name_fr?: string
          slug?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          customer_id: string
          id: string
          order_id: string
          redeemed_at: string
        }
        Insert: {
          coupon_id: string
          customer_id: string
          id?: string
          order_id: string
          redeemed_at?: string
        }
        Update: {
          coupon_id?: string
          customer_id?: string
          id?: string
          order_id?: string
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_coupons_id_fk"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_customer_id_profiles_id_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_orders_id_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value: number
          ends_at: string | null
          id: string
          starts_at: string | null
          usage_limit: number | null
          used_count: number
          vendor_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value: number
          ends_at?: string | null
          id?: string
          starts_at?: string | null
          usage_limit?: number | null
          used_count?: number
          vendor_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value?: number
          ends_at?: string | null
          id?: string
          starts_at?: string | null
          usage_limit?: number | null
          used_count?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_vendor_id_vendors_id_fk"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_insurance: {
        Row: {
          courier_id: string
          expiry: string
          insurer_name: string
          policy_number: string
        }
        Insert: {
          courier_id: string
          expiry: string
          insurer_name: string
          policy_number: string
        }
        Update: {
          courier_id?: string
          expiry?: string
          insurer_name?: string
          policy_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_insurance_courier_id_couriers_id_fk"
            columns: ["courier_id"]
            isOneToOne: true
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_issues: {
        Row: {
          at: string
          message: string
          order_id: string
          reason: Database["public"]["Enums"]["courier_issue_reason"]
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["courier_issue_status"]
        }
        Insert: {
          at?: string
          message: string
          order_id: string
          reason: Database["public"]["Enums"]["courier_issue_reason"]
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["courier_issue_status"]
        }
        Update: {
          at?: string
          message?: string
          order_id?: string
          reason?: Database["public"]["Enums"]["courier_issue_reason"]
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["courier_issue_status"]
        }
        Relationships: [
          {
            foreignKeyName: "courier_issues_order_id_orders_id_fk"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_issues_resolved_by_profiles_id_fk"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_locations: {
        Row: {
          courier_id: string
          heading: number | null
          id: number
          lat: number
          lng: number
          order_id: string | null
          recorded_at: string
        }
        Insert: {
          courier_id: string
          heading?: number | null
          id?: number
          lat: number
          lng: number
          order_id?: string | null
          recorded_at?: string
        }
        Update: {
          courier_id?: string
          heading?: number | null
          id?: number
          lat?: number
          lng?: number
          order_id?: string | null
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_locations_courier_id_couriers_id_fk"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_locations_order_id_orders_id_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_payouts: {
        Row: {
          courier_id: string
          created_at: string
          status: string
          stripe_connect_account_id: string | null
          updated_at: string
        }
        Insert: {
          courier_id: string
          created_at?: string
          status?: string
          stripe_connect_account_id?: string | null
          updated_at?: string
        }
        Update: {
          courier_id?: string
          created_at?: string
          status?: string
          stripe_connect_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_payouts_courier_id_couriers_id_fk"
            columns: ["courier_id"]
            isOneToOne: true
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          base_lat: number
          base_lng: number
          city: string
          delivery_count: number
          full_name: string
          id: string
          is_online: boolean
          joined_at: string
          last_seen_at: string | null
          licence_number: string | null
          phone: string
          photo_url: string | null
          plate: string | null
          postal_code: string | null
          rating: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["courier_status"]
          status_reason: string | null
          user_id: string
          vehicle: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          base_lat: number
          base_lng: number
          city: string
          delivery_count?: number
          full_name: string
          id?: string
          is_online?: boolean
          joined_at?: string
          last_seen_at?: string | null
          licence_number?: string | null
          phone: string
          photo_url?: string | null
          plate?: string | null
          postal_code?: string | null
          rating?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["courier_status"]
          status_reason?: string | null
          user_id: string
          vehicle: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          base_lat?: number
          base_lng?: number
          city?: string
          delivery_count?: number
          full_name?: string
          id?: string
          is_online?: boolean
          joined_at?: string
          last_seen_at?: string | null
          licence_number?: string | null
          phone?: string
          photo_url?: string | null
          plate?: string | null
          postal_code?: string | null
          rating?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["courier_status"]
          status_reason?: string | null
          user_id?: string
          vehicle?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: [
          {
            foreignKeyName: "couriers_reviewed_by_profiles_id_fk"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "couriers_user_id_profiles_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_proofs: {
        Row: {
          at: string
          image_path: string | null
          method: Database["public"]["Enums"]["proof_method"]
          note: string | null
          order_id: string
        }
        Insert: {
          at: string
          image_path?: string | null
          method: Database["public"]["Enums"]["proof_method"]
          note?: string | null
          order_id: string
        }
        Update: {
          at?: string
          image_path?: string | null
          method?: Database["public"]["Enums"]["proof_method"]
          note?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_proofs_order_id_order_deliveries_order_id_fk"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "order_deliveries"
            referencedColumns: ["order_id"]
          },
        ]
      }
      dispatch_offers: {
        Row: {
          courier_id: string
          distance_to_dropoff_km: number
          distance_to_pickup_km: number
          estimated_earnings_cad: number
          expires_at: string
          id: string
          offered_at: string
          order_id: string
          outcome: Database["public"]["Enums"]["dispatch_offer_outcome"] | null
          vendor_id: string
        }
        Insert: {
          courier_id: string
          distance_to_dropoff_km: number
          distance_to_pickup_km: number
          estimated_earnings_cad: number
          expires_at: string
          id?: string
          offered_at?: string
          order_id: string
          outcome?: Database["public"]["Enums"]["dispatch_offer_outcome"] | null
          vendor_id: string
        }
        Update: {
          courier_id?: string
          distance_to_dropoff_km?: number
          distance_to_pickup_km?: number
          estimated_earnings_cad?: number
          expires_at?: string
          id?: string
          offered_at?: string
          order_id?: string
          outcome?: Database["public"]["Enums"]["dispatch_offer_outcome"] | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_offers_courier_id_couriers_id_fk"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_offers_order_id_orders_id_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_offers_vendor_id_vendors_id_fk"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          answered_at: string | null
          merchant_reply: string | null
          message: string
          opened_at: string
          order_id: string
          reason: Database["public"]["Enums"]["dispute_reason"]
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["dispute_status"]
        }
        Insert: {
          answered_at?: string | null
          merchant_reply?: string | null
          message: string
          opened_at?: string
          order_id: string
          reason: Database["public"]["Enums"]["dispute_reason"]
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
        }
        Update: {
          answered_at?: string | null
          merchant_reply?: string | null
          message?: string
          opened_at?: string
          order_id?: string
          reason?: Database["public"]["Enums"]["dispute_reason"]
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
        }
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_orders_id_fk"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_resolved_by_profiles_id_fk"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_products: {
        Row: {
          created_at: string
          product_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_products_product_id_products_id_fk"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_products_profile_id_profiles_id_fk"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_vendors: {
        Row: {
          created_at: string
          profile_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_vendors_profile_id_profiles_id_fk"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorite_vendors_vendor_id_vendors_id_fk"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          customer_id: string
          expires_at: string | null
          id: string
          order_id: string | null
          points: number
          reason: Database["public"]["Enums"]["loyalty_reason"]
        }
        Insert: {
          created_at?: string
          customer_id: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          points: number
          reason: Database["public"]["Enums"]["loyalty_reason"]
        }
        Update: {
          created_at?: string
          customer_id?: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          points?: number
          reason?: Database["public"]["Enums"]["loyalty_reason"]
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_customer_id_profiles_id_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_orders_id_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_connect_account_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_connect_account_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_connect_account_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_subscriptions_vendor_id_vendors_id_fk"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      order_deliveries: {
        Row: {
          accepted_at: string
          courier_id: string
          delivered_at: string | null
          distance_km: number
          dropoff_eta_min: number
          earnings_cad: number
          order_id: string
          paid_out_at: string | null
          picked_up_at: string | null
          pickup_eta_min: number
          pin: string
          stripe_transfer_id: string | null
          tip_cad: number
        }
        Insert: {
          accepted_at: string
          courier_id: string
          delivered_at?: string | null
          distance_km: number
          dropoff_eta_min: number
          earnings_cad: number
          order_id: string
          paid_out_at?: string | null
          picked_up_at?: string | null
          pickup_eta_min: number
          pin: string
          stripe_transfer_id?: string | null
          tip_cad?: number
        }
        Update: {
          accepted_at?: string
          courier_id?: string
          delivered_at?: string | null
          distance_km?: number
          dropoff_eta_min?: number
          earnings_cad?: number
          order_id?: string
          paid_out_at?: string | null
          picked_up_at?: string | null
          pickup_eta_min?: number
          pin?: string
          stripe_transfer_id?: string | null
          tip_cad?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_deliveries_courier_id_couriers_id_fk"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_deliveries_order_id_orders_id_fk"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          name: string
          order_id: string
          product_id: string
          qty: number
          unit_price_cad: number
        }
        Insert: {
          id?: string
          name: string
          order_id: string
          product_id: string
          qty: number
          unit_price_cad: number
        }
        Update: {
          id?: string
          name?: string
          order_id?: string
          product_id?: string
          qty?: number
          unit_price_cad?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_orders_id_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_products_id_fk"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          at: string
          id: string
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          at: string
          id?: string
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          at?: string
          id?: string
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_orders_id_fk"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          coupon_code: string | null
          coupon_discount_cad: number | null
          created_at: string
          customer_id: string
          customer_name: string | null
          delivery_address_city: string
          delivery_address_label: string
          delivery_address_lat: number
          delivery_address_lng: number
          delivery_address_postal_code: string
          delivery_address_street: string
          delivery_fee_cad: number
          gst_cad: number
          id: string
          points_discount_cad: number | null
          points_redeemed: number | null
          qst_cad: number
          refund_amount_cad: number | null
          refund_reason: string | null
          refunded_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          subtotal_cad: number
          total_cad: number
          vendor_id: string
        }
        Insert: {
          coupon_code?: string | null
          coupon_discount_cad?: number | null
          created_at?: string
          customer_id: string
          customer_name?: string | null
          delivery_address_city: string
          delivery_address_label: string
          delivery_address_lat: number
          delivery_address_lng: number
          delivery_address_postal_code: string
          delivery_address_street: string
          delivery_fee_cad: number
          gst_cad: number
          id?: string
          points_discount_cad?: number | null
          points_redeemed?: number | null
          qst_cad: number
          refund_amount_cad?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          subtotal_cad: number
          total_cad: number
          vendor_id: string
        }
        Update: {
          coupon_code?: string | null
          coupon_discount_cad?: number | null
          created_at?: string
          customer_id?: string
          customer_name?: string | null
          delivery_address_city?: string
          delivery_address_label?: string
          delivery_address_lat?: number
          delivery_address_lng?: number
          delivery_address_postal_code?: string
          delivery_address_street?: string
          delivery_fee_cad?: number
          gst_cad?: number
          id?: string
          points_discount_cad?: number | null
          points_redeemed?: number | null
          qst_cad?: number
          refund_amount_cad?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          subtotal_cad?: number
          total_cad?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_profiles_id_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_vendor_id_vendors_id_fk"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          commission_rate: number
          courier_location_retention_days: number
          delivery_proof_retention_days: number
          double_points_active: boolean
          double_points_ends_at: string | null
          double_points_starts_at: string | null
          id: number
          max_redemption_share: number
          monthly_subscription_cad: number
          points_expiry_months: number
          points_per_cad: number
          points_per_cad_redeemed: number
          referral_min_first_order_cad: number
          referral_reward_points: number
          updated_at: string
        }
        Insert: {
          commission_rate?: number
          courier_location_retention_days?: number
          delivery_proof_retention_days?: number
          double_points_active?: boolean
          double_points_ends_at?: string | null
          double_points_starts_at?: string | null
          id?: number
          max_redemption_share?: number
          monthly_subscription_cad?: number
          points_expiry_months?: number
          points_per_cad?: number
          points_per_cad_redeemed?: number
          referral_min_first_order_cad?: number
          referral_reward_points?: number
          updated_at?: string
        }
        Update: {
          commission_rate?: number
          courier_location_retention_days?: number
          delivery_proof_retention_days?: number
          double_points_active?: boolean
          double_points_ends_at?: string | null
          double_points_starts_at?: string | null
          id?: number
          max_redemption_share?: number
          monthly_subscription_cad?: number
          points_expiry_months?: number
          points_per_cad?: number
          points_per_cad_redeemed?: number
          referral_min_first_order_cad?: number
          referral_reward_points?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category_id: string
          compare_at_price_cad: number | null
          created_at: string
          description: string
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          nutrition_calories: number | null
          nutrition_fat_g: number | null
          nutrition_protein_g: number | null
          nutrition_weight_g: number | null
          price_cad: number
          section_id: string
          stock_qty: number
          tags: string[]
          updated_at: string
          vendor_id: string
        }
        Insert: {
          category_id: string
          compare_at_price_cad?: number | null
          created_at?: string
          description: string
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          nutrition_calories?: number | null
          nutrition_fat_g?: number | null
          nutrition_protein_g?: number | null
          nutrition_weight_g?: number | null
          price_cad: number
          section_id: string
          stock_qty?: number
          tags?: string[]
          updated_at?: string
          vendor_id: string
        }
        Update: {
          category_id?: string
          compare_at_price_cad?: number | null
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          nutrition_calories?: number | null
          nutrition_fat_g?: number | null
          nutrition_protein_g?: number | null
          nutrition_weight_g?: number | null
          price_cad?: number
          section_id?: string
          stock_qty?: number
          tags?: string[]
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_categories_id_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_section_id_vendor_id_fk"
            columns: ["section_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_sections"
            referencedColumns: ["id", "vendor_id"]
          },
          {
            foreignKeyName: "products_vendor_id_vendors_id_fk"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          courier_id: string | null
          created_at: string
          full_name: string
          id: string
          member_since: string
          referred_by: string | null
          role: Database["public"]["Enums"]["role"] | null
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          courier_id?: string | null
          created_at?: string
          full_name: string
          id: string
          member_since?: string
          referred_by?: string | null
          role?: Database["public"]["Enums"]["role"] | null
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          courier_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          member_since?: string
          referred_by?: string | null
          role?: Database["public"]["Enums"]["role"] | null
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_courier_id_couriers_id_fk"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_profiles_id_fk"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_vendor_id_vendors_id_fk"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      support_conversations: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          status: Database["public"]["Enums"]["support_conversation_status"]
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          status?: Database["public"]["Enums"]["support_conversation_status"]
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          status?: Database["public"]["Enums"]["support_conversation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "support_conversations_customer_id_profiles_id_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["support_message_role"]
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["support_message_role"]
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["support_message_role"]
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_support_conversations_id_fk"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_categories: {
        Row: {
          category_id: string
          vendor_id: string
        }
        Insert: {
          category_id: string
          vendor_id: string
        }
        Update: {
          category_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_categories_category_id_categories_id_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_categories_vendor_id_vendors_id_fk"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_hours: {
        Row: {
          close: string
          closed: boolean
          day: number
          id: string
          open: string
          vendor_id: string
        }
        Insert: {
          close: string
          closed?: boolean
          day: number
          id?: string
          open: string
          vendor_id: string
        }
        Update: {
          close?: string
          closed?: boolean
          day?: number
          id?: string
          open?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_hours_vendor_id_vendors_id_fk"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_registrations: {
        Row: {
          business_number_document_path: string | null
          contact_name: string
          contact_phone: string
          id_document_path: string | null
          mapaq_document_path: string | null
          mapaq_number: string | null
          neq: string
          submitted_at: string
          vendor_id: string
        }
        Insert: {
          business_number_document_path?: string | null
          contact_name: string
          contact_phone: string
          id_document_path?: string | null
          mapaq_document_path?: string | null
          mapaq_number?: string | null
          neq: string
          submitted_at?: string
          vendor_id: string
        }
        Update: {
          business_number_document_path?: string | null
          contact_name?: string
          contact_phone?: string
          id_document_path?: string | null
          mapaq_document_path?: string | null
          mapaq_number?: string | null
          neq?: string
          submitted_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_registrations_vendor_id_vendors_id_fk"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_sections: {
        Row: {
          id: string
          name_fr: string
          position: number
          vendor_id: string
        }
        Insert: {
          id?: string
          name_fr: string
          position?: number
          vendor_id: string
        }
        Update: {
          id?: string
          name_fr?: string
          position?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_sections_vendor_id_vendors_id_fk"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address_lat: number
          address_lng: number
          address_postal_code: string
          address_street: string
          city: string
          cover_url: string | null
          created_at: string
          delivery_eta_min: number
          id: string
          is_halal_certified: boolean
          logo_url: string | null
          name: string
          neighborhood: string
          owner_id: string
          rating: number
          review_count: number
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          specialty_fr: string
          status: Database["public"]["Enums"]["vendor_status"]
          status_reason: string | null
          updated_at: string
          vendor_type: Database["public"]["Enums"]["vendor_type"]
        }
        Insert: {
          address_lat: number
          address_lng: number
          address_postal_code: string
          address_street: string
          city: string
          cover_url?: string | null
          created_at?: string
          delivery_eta_min: number
          id?: string
          is_halal_certified?: boolean
          logo_url?: string | null
          name: string
          neighborhood: string
          owner_id: string
          rating?: number
          review_count?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          specialty_fr: string
          status?: Database["public"]["Enums"]["vendor_status"]
          status_reason?: string | null
          updated_at?: string
          vendor_type: Database["public"]["Enums"]["vendor_type"]
        }
        Update: {
          address_lat?: number
          address_lng?: number
          address_postal_code?: string
          address_street?: string
          city?: string
          cover_url?: string | null
          created_at?: string
          delivery_eta_min?: number
          id?: string
          is_halal_certified?: boolean
          logo_url?: string | null
          name?: string
          neighborhood?: string
          owner_id?: string
          rating?: number
          review_count?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          specialty_fr?: string
          status?: Database["public"]["Enums"]["vendor_status"]
          status_reason?: string | null
          updated_at?: string
          vendor_type?: Database["public"]["Enums"]["vendor_type"]
        }
        Relationships: [
          {
            foreignKeyName: "vendors_owner_id_profiles_id_fk"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_reviewed_by_profiles_id_fk"
            columns: ["reviewed_by"]
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
      address_delete: {
        Args: { p_address_id: string; p_profile_id: string }
        Returns: boolean
      }
      address_update: {
        Args: {
          p_address_id: string
          p_city?: string
          p_is_default?: boolean
          p_label?: string
          p_lat?: number
          p_lng?: number
          p_postal_code?: string
          p_profile_id: string
          p_street?: string
        }
        Returns: {
          city: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          lat: number
          lng: number
          postal_code: string
          profile_id: string
          street: string
        }
        SetofOptions: {
          from: "*"
          to: "addresses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_auth_users: {
        Args: { p_ids: string[] }
        Returns: {
          banned_until: string
          email: string
          email_confirmed_at: string
          id: string
          last_sign_in_at: string
          phone: string
        }[]
      }
      admin_courier_stats: { Args: { p_courier_id: string }; Returns: Json }
      admin_decide_courier: {
        Args: {
          p_action: string
          p_admin_id: string
          p_courier_id: string
          p_from: string
          p_label: string
          p_reason: string
          p_to: string
        }
        Returns: {
          base_lat: number
          base_lng: number
          city: string
          delivery_count: number
          full_name: string
          id: string
          is_online: boolean
          joined_at: string
          last_seen_at: string | null
          licence_number: string | null
          phone: string
          photo_url: string | null
          plate: string | null
          postal_code: string | null
          rating: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["courier_status"]
          status_reason: string | null
          user_id: string
          vehicle: Database["public"]["Enums"]["vehicle_type"]
        }
        SetofOptions: {
          from: "*"
          to: "couriers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_decide_vendor: {
        Args: {
          p_action: string
          p_admin_id: string
          p_from: string
          p_label: string
          p_reason: string
          p_to: string
          p_vendor_id: string
        }
        Returns: {
          address_lat: number
          address_lng: number
          address_postal_code: string
          address_street: string
          city: string
          cover_url: string | null
          created_at: string
          delivery_eta_min: number
          id: string
          is_halal_certified: boolean
          logo_url: string | null
          name: string
          neighborhood: string
          owner_id: string
          rating: number
          review_count: number
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          specialty_fr: string
          status: Database["public"]["Enums"]["vendor_status"]
          status_reason: string | null
          updated_at: string
          vendor_type: Database["public"]["Enums"]["vendor_type"]
        }
        SetofOptions: {
          from: "*"
          to: "vendors"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_orders: {
        Args: {
          p_id_prefix?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
          p_vendor_id?: string
        }
        Returns: Json
      }
      admin_list_users: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_pattern?: string
          p_role?: string
        }
        Returns: Json
      }
      admin_overview: {
        Args: {
          p_cur_end: string
          p_cur_start: string
          p_day_from: string
          p_day_to: string
          p_prev_start: string
        }
        Returns: Json
      }
      admin_resolve_courier_issue: {
        Args: { p_admin_id: string; p_note: string; p_order_id: string }
        Returns: {
          at: string
          message: string
          order_id: string
          reason: Database["public"]["Enums"]["courier_issue_reason"]
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["courier_issue_status"]
        }
        SetofOptions: {
          from: "*"
          to: "courier_issues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_resolve_dispute: {
        Args: {
          p_admin_id: string
          p_changes: Json
          p_note: string
          p_order_id: string
          p_outcome: string
        }
        Returns: {
          answered_at: string | null
          merchant_reply: string | null
          message: string
          opened_at: string
          order_id: string
          reason: Database["public"]["Enums"]["dispute_reason"]
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["dispute_status"]
        }
        SetofOptions: {
          from: "*"
          to: "disputes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_search: {
        Args: { p_id_prefix?: string; p_pattern: string; p_per_type?: number }
        Returns: Json
      }
      admin_stats: { Args: never; Returns: Json }
      admin_user_activity: { Args: { p_profile_id: string }; Returns: Json }
      admin_vendor_stats: { Args: { p_vendor_id: string }; Returns: Json }
      is_open: {
        Args: { v: Database["public"]["Tables"]["vendors"]["Row"] }
        Returns: boolean
      }
      order_advance_status: {
        Args: { p_from: string; p_order_id: string; p_to: string }
        Returns: undefined
      }
      order_place: {
        Args: {
          p_addr_city: string
          p_addr_label: string
          p_addr_lat: number
          p_addr_lng: number
          p_addr_postal_code: string
          p_addr_street: string
          p_coupon_code?: string
          p_coupon_discount_cad?: number
          p_customer_id: string
          p_customer_name: string
          p_delivery_fee_cad: number
          p_gst_cad: number
          p_items: Json
          p_payment_intent_id?: string
          p_points_discount_cad?: number
          p_points_redeemed?: number
          p_qst_cad: number
          p_subtotal_cad: number
          p_total_cad: number
          p_vendor_id: string
        }
        Returns: string
      }
      product_page: {
        Args: {
          p_approved_only?: boolean
          p_category_id?: string
          p_in_stock_only?: boolean
          p_limit?: number
          p_offset?: number
          p_on_sale?: boolean
          p_price_max?: number
          p_price_min?: number
          p_q?: string
          p_section_id?: string
          p_sort?: string
          p_vendor_id?: string
        }
        Returns: Json
      }
      vendor_apply: {
        Args: {
          p_city: string
          p_contact_name: string
          p_contact_phone: string
          p_default_hours: Json
          p_default_sections: string[]
          p_delivery_eta_min: number
          p_is_halal_certified: boolean
          p_lat: number
          p_lng: number
          p_mapaq_number: string
          p_name: string
          p_neq: string
          p_owner_id: string
          p_postal_code: string
          p_slug_base: string
          p_specialty_fr: string
          p_street: string
          p_vendor_type: string
        }
        Returns: string
      }
      vendor_set_categories: {
        Args: { p_category_ids: string[]; p_vendor_id: string }
        Returns: undefined
      }
      vendor_set_hours: {
        Args: { p_vendor_id: string; p_week: Json }
        Returns: undefined
      }
    }
    Enums: {
      audit_subject:
        | "vendor"
        | "courier"
        | "order"
        | "dispute"
        | "courier_issue"
        | "settings"
      coupon_discount_type: "percentage" | "fixed"
      courier_issue_reason:
        | "customer_absent"
        | "wrong_address"
        | "access_problem"
        | "shop_not_ready"
        | "order_incomplete"
        | "other"
      courier_issue_status: "open" | "resolved"
      courier_status: "pending" | "approved" | "suspended" | "rejected"
      dispatch_offer_outcome: "accepted" | "declined" | "expired"
      dispute_reason:
        | "missing_items"
        | "wrong_order"
        | "quality"
        | "late"
        | "other"
      dispute_status: "open" | "answered" | "resolved" | "rejected"
      loyalty_reason:
        | "order_delivered"
        | "referral_referrer"
        | "referral_referred"
        | "redeemed"
        | "order_refunded"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
      proof_method: "photo" | "signature" | "pin"
      role: "customer" | "business" | "courier" | "admin"
      subscription_status: "inactive" | "active" | "past_due" | "canceled"
      support_conversation_status: "open" | "escalated" | "closed"
      support_message_role: "user" | "assistant" | "system"
      vehicle_type: "bike" | "scooter" | "car"
      vendor_status: "pending" | "approved" | "suspended" | "rejected"
      vendor_type: "grocery" | "restaurant"
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
      audit_subject: [
        "vendor",
        "courier",
        "order",
        "dispute",
        "courier_issue",
        "settings",
      ],
      coupon_discount_type: ["percentage", "fixed"],
      courier_issue_reason: [
        "customer_absent",
        "wrong_address",
        "access_problem",
        "shop_not_ready",
        "order_incomplete",
        "other",
      ],
      courier_issue_status: ["open", "resolved"],
      courier_status: ["pending", "approved", "suspended", "rejected"],
      dispatch_offer_outcome: ["accepted", "declined", "expired"],
      dispute_reason: [
        "missing_items",
        "wrong_order",
        "quality",
        "late",
        "other",
      ],
      dispute_status: ["open", "answered", "resolved", "rejected"],
      loyalty_reason: [
        "order_delivered",
        "referral_referrer",
        "referral_referred",
        "redeemed",
        "order_refunded",
      ],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      proof_method: ["photo", "signature", "pin"],
      role: ["customer", "business", "courier", "admin"],
      subscription_status: ["inactive", "active", "past_due", "canceled"],
      support_conversation_status: ["open", "escalated", "closed"],
      support_message_role: ["user", "assistant", "system"],
      vehicle_type: ["bike", "scooter", "car"],
      vendor_status: ["pending", "approved", "suspended", "rejected"],
      vendor_type: ["grocery", "restaurant"],
    },
  },
} as const
