CREATE TYPE "public"."role" AS ENUM('customer', 'business', 'courier', 'admin');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('pending', 'approved', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."vendor_type" AS ENUM('grocery', 'restaurant');--> statement-breakpoint
CREATE TYPE "public"."courier_status" AS ENUM('pending', 'approved', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."dispatch_offer_outcome" AS ENUM('accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('bike', 'scooter', 'car');--> statement-breakpoint
CREATE TYPE "public"."courier_issue_reason" AS ENUM('customer_absent', 'wrong_address', 'access_problem', 'shop_not_ready', 'order_incomplete', 'other');--> statement-breakpoint
CREATE TYPE "public"."courier_issue_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."dispute_reason" AS ENUM('missing_items', 'wrong_order', 'quality', 'late', 'other');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'answered', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."proof_method" AS ENUM('photo', 'signature', 'pin');--> statement-breakpoint
CREATE TYPE "public"."coupon_discount_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."loyalty_reason" AS ENUM('order_delivered', 'referral_referrer', 'referral_referred', 'redeemed', 'order_refunded');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('inactive', 'active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."support_conversation_status" AS ENUM('open', 'escalated', 'closed');--> statement-breakpoint
CREATE TYPE "public"."support_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"label" text NOT NULL,
	"street" text NOT NULL,
	"city" text NOT NULL,
	"postal_code" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorite_products" (
	"profile_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_products_profile_id_product_id_pk" PRIMARY KEY("profile_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "favorite_vendors" (
	"profile_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_vendors_profile_id_vendor_id_pk" PRIMARY KEY("profile_id","vendor_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"avatar_url" text,
	"member_since" timestamp with time zone DEFAULT now() NOT NULL,
	"role" "role",
	"vendor_id" uuid,
	"courier_id" uuid,
	"referred_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_fr" text NOT NULL,
	"short_name_fr" text NOT NULL,
	"icon" text NOT NULL,
	"color_token" text NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"price_cad" numeric(10, 2) NOT NULL,
	"compare_at_price_cad" numeric(10, 2),
	"image_url" text,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"nutrition_calories" integer,
	"nutrition_protein_g" numeric(6, 2),
	"nutrition_fat_g" numeric(6, 2),
	"nutrition_weight_g" numeric(6, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_categories" (
	"vendor_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "vendor_categories_vendor_id_category_id_pk" PRIMARY KEY("vendor_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "vendor_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"day" smallint NOT NULL,
	"open" text NOT NULL,
	"close" text NOT NULL,
	"closed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_registrations" (
	"vendor_id" uuid PRIMARY KEY NOT NULL,
	"neq" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"mapaq_number" text,
	"id_document_path" text,
	"business_number_document_path" text,
	"mapaq_document_path" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name_fr" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"vendor_type" "vendor_type" NOT NULL,
	"specialty_fr" text NOT NULL,
	"logo_url" text,
	"cover_url" text,
	"city" text NOT NULL,
	"neighborhood" text NOT NULL,
	"address_street" text NOT NULL,
	"address_postal_code" text NOT NULL,
	"address_lat" double precision NOT NULL,
	"address_lng" double precision NOT NULL,
	"rating" numeric(2, 1) DEFAULT '0' NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"delivery_eta_min" integer NOT NULL,
	"is_halal_certified" boolean DEFAULT false NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "vendor_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "courier_insurance" (
	"courier_id" uuid PRIMARY KEY NOT NULL,
	"insurer_name" text NOT NULL,
	"policy_number" text NOT NULL,
	"expiry" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courier_locations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"courier_id" uuid NOT NULL,
	"order_id" uuid,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"heading" double precision,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courier_payouts" (
	"courier_id" uuid PRIMARY KEY NOT NULL,
	"stripe_connect_account_id" text,
	"status" text DEFAULT 'not_started' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "couriers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"photo_url" text,
	"phone" text NOT NULL,
	"vehicle" "vehicle_type" NOT NULL,
	"plate" text,
	"licence_number" text,
	"city" text NOT NULL,
	"postal_code" text,
	"base_lat" double precision NOT NULL,
	"base_lng" double precision NOT NULL,
	"rating" numeric(2, 1) DEFAULT '0' NOT NULL,
	"delivery_count" integer DEFAULT 0 NOT NULL,
	"status" "courier_status" DEFAULT 'pending' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"courier_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"outcome" "dispatch_offer_outcome",
	"distance_to_pickup_km" numeric(6, 2) NOT NULL,
	"distance_to_dropoff_km" numeric(6, 2) NOT NULL,
	"estimated_earnings_cad" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courier_issues" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"reason" "courier_issue_reason" NOT NULL,
	"message" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "courier_issue_status" DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "delivery_proofs" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"method" "proof_method" NOT NULL,
	"image_path" text,
	"note" text,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"reason" "dispute_reason" NOT NULL,
	"message" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"merchant_reply" text,
	"answered_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_deliveries" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"courier_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"picked_up_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"pickup_eta_min" integer NOT NULL,
	"dropoff_eta_min" integer NOT NULL,
	"distance_km" numeric(6, 2) NOT NULL,
	"pin" text NOT NULL,
	"tip_cad" numeric(10, 2) DEFAULT '0' NOT NULL,
	"earnings_cad" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_cad" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "order_status" NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"customer_name" text,
	"vendor_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"subtotal_cad" numeric(10, 2) NOT NULL,
	"gst_cad" numeric(10, 2) NOT NULL,
	"qst_cad" numeric(10, 2) NOT NULL,
	"delivery_fee_cad" numeric(10, 2) NOT NULL,
	"points_redeemed" integer,
	"points_discount_cad" numeric(10, 2),
	"total_cad" numeric(10, 2) NOT NULL,
	"delivery_address_label" text NOT NULL,
	"delivery_address_street" text NOT NULL,
	"delivery_address_city" text NOT NULL,
	"delivery_address_postal_code" text NOT NULL,
	"delivery_address_lat" double precision NOT NULL,
	"delivery_address_lng" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"discount_type" "coupon_discount_type" NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"vendor_id" uuid,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"usage_limit" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"reason" "loyalty_reason" NOT NULL,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "merchant_subscriptions" (
	"vendor_id" uuid PRIMARY KEY NOT NULL,
	"stripe_connect_account_id" text,
	"stripe_subscription_id" text,
	"status" "subscription_status" DEFAULT 'inactive' NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"points_per_cad" numeric(6, 2) DEFAULT '1' NOT NULL,
	"points_per_cad_redeemed" numeric(6, 2) DEFAULT '100' NOT NULL,
	"max_redemption_share" numeric(4, 3) DEFAULT '0.2' NOT NULL,
	"points_expiry_months" integer DEFAULT 12 NOT NULL,
	"referral_reward_points" integer DEFAULT 300 NOT NULL,
	"referral_min_first_order_cad" numeric(10, 2) DEFAULT '60' NOT NULL,
	"double_points_active" boolean DEFAULT false NOT NULL,
	"double_points_starts_at" timestamp with time zone,
	"double_points_ends_at" timestamp with time zone,
	"commission_rate" numeric(4, 3) DEFAULT '0.12' NOT NULL,
	"monthly_subscription_cad" numeric(10, 2) DEFAULT '70' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_singleton" CHECK ("platform_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "support_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "support_conversation_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "support_message_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_products" ADD CONSTRAINT "favorite_products_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_products" ADD CONSTRAINT "favorite_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_vendors" ADD CONSTRAINT "favorite_vendors_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_vendors" ADD CONSTRAINT "favorite_vendors_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_courier_id_couriers_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."couriers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_referred_by_profiles_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_section_id_vendor_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."vendor_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_categories" ADD CONSTRAINT "vendor_categories_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_categories" ADD CONSTRAINT "vendor_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_hours" ADD CONSTRAINT "vendor_hours_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_registrations" ADD CONSTRAINT "vendor_registrations_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_sections" ADD CONSTRAINT "vendor_sections_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_insurance" ADD CONSTRAINT "courier_insurance_courier_id_couriers_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."couriers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_locations" ADD CONSTRAINT "courier_locations_courier_id_couriers_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."couriers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_locations" ADD CONSTRAINT "courier_locations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_payouts" ADD CONSTRAINT "courier_payouts_courier_id_couriers_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."couriers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couriers" ADD CONSTRAINT "couriers_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_courier_id_couriers_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."couriers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_issues" ADD CONSTRAINT "courier_issues_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_issues" ADD CONSTRAINT "courier_issues_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_order_id_order_deliveries_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order_deliveries"("order_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_deliveries" ADD CONSTRAINT "order_deliveries_courier_id_couriers_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."couriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_customer_id_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_subscriptions" ADD CONSTRAINT "merchant_subscriptions_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_customer_id_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_profile_id_idx" ON "addresses" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_one_default_per_profile" ON "addresses" USING btree ("profile_id") WHERE "addresses"."is_default" = true;--> statement-breakpoint
CREATE INDEX "products_vendor_id_idx" ON "products" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_hours_vendor_day_unique" ON "vendor_hours" USING btree ("vendor_id","day");--> statement-breakpoint
CREATE INDEX "vendor_sections_vendor_id_idx" ON "vendor_sections" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendors_owner_id_idx" ON "vendors" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "vendors_status_idx" ON "vendors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vendors_type_idx" ON "vendors" USING btree ("vendor_type");--> statement-breakpoint
CREATE INDEX "courier_locations_courier_recorded_idx" ON "courier_locations" USING btree ("courier_id","recorded_at");--> statement-breakpoint
CREATE INDEX "couriers_status_idx" ON "couriers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "couriers_user_id_idx" ON "couriers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dispatch_offers_order_id_idx" ON "dispatch_offers" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "dispatch_offers_courier_id_idx" ON "dispatch_offers" USING btree ("courier_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_id_idx" ON "order_status_history" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_vendor_id_idx" ON "orders" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_coupon_order_unique" ON "coupon_redemptions" USING btree ("coupon_id","order_id");--> statement-breakpoint
CREATE INDEX "loyalty_transactions_customer_id_idx" ON "loyalty_transactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "loyalty_transactions_order_id_idx" ON "loyalty_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "support_conversations_customer_id_idx" ON "support_conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "support_messages_conversation_id_idx" ON "support_messages" USING btree ("conversation_id");